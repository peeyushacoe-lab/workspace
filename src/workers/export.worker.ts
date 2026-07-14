import { Worker, type Job } from "bullmq";
import JSZip from "jszip";
import { redisConnection } from "@/lib/redis";
import { EXPORT_QUEUE_NAME, type ExportJobData } from "@/lib/queues/export.queue";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { downloadFromR2, isS3Configured, uploadToR2 } from "@/lib/s3";

const MAX_ERROR_LOG = 50;

export function createExportWorker() {
  const worker = new Worker<ExportJobData>(
    EXPORT_QUEUE_NAME,
    async (job: Job<ExportJobData>) => {
      if (job.data.type !== "ACCOUNT_EXPORT") return;
      await runAccountExport(job.data.exportJobId);
    },
    { connection: redisConnection, concurrency: 1 },
  );
  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "[export-worker] Job failed");
  });
  return worker;
}

function mboxEscapeBody(body: string): string {
  // Standard mbox "From " quoting — lines that start with "From " in the
  // body must be escaped with a leading ">" or mbox readers mis-parse them
  // as a new message boundary.
  return body.replace(/^(>*From )/gm, ">$1");
}

function toMboxDate(d: Date): string {
  // mbox "From " line date format: "Www Mon dd hh:mm:ss yyyy"
  return d.toUTCString().replace(/^(\w+), (\d+) (\w+) (\d+) ([\d:]+) GMT$/, "$1 $3 $2 $5 $4");
}

function buildMboxEntry(msg: { from: string; to: string; subject: string; textBody: string | null; htmlBody: string | null; receivedAt: Date; messageId: string | null }): string {
  const date = toMboxDate(msg.receivedAt);
  const lines = [
    `From ${msg.from || "unknown"} ${date}`,
    `From: ${msg.from}`,
    `To: ${msg.to}`,
    `Subject: ${msg.subject}`,
    `Date: ${msg.receivedAt.toUTCString()}`,
    msg.messageId ? `Message-ID: ${msg.messageId}` : null,
    `Content-Type: text/${msg.htmlBody ? "html" : "plain"}; charset=utf-8`,
    "",
    mboxEscapeBody(msg.htmlBody || msg.textBody || ""),
    "",
  ].filter((l): l is string => l !== null);
  return lines.join("\r\n");
}

function icsEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function toIcsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

async function updateProgress(exportJobId: string, patch: Record<string, unknown>) {
  await prisma.exportJob.update({ where: { id: exportJobId }, data: patch }).catch(() => {});
}

async function runAccountExport(exportJobId: string) {
  const job = await prisma.exportJob.findUnique({ where: { id: exportJobId } });
  if (!job) return;

  const errors: string[] = [];
  await updateProgress(exportJobId, { status: "RUNNING", startedAt: new Date(), currentStage: "Counting items" });

  try {
    const user = await prisma.user.findUnique({ where: { id: job.userId }, select: { email: true, fullName: true } });
    if (!user) throw new Error("User not found");

    const zip = new JSZip();
    let processed = 0;
    let total = 0;

    // ── Pre-count for progress % ────────────────────────────────────────
    const mailbox = job.includeMail
      ? await prisma.mailbox.findUnique({ where: { email: user.email }, select: { id: true, email: true } })
      : null;
    const [mailCount, driveCount, notesCount, contactsCount, calendarCount] = await Promise.all([
      mailbox ? prisma.inboxMessage.count({ where: { thread: { mailboxId: mailbox.id } } }) : 0,
      job.includeDrive ? prisma.driveFile.count({ where: { ownerId: job.userId, isTrashed: false } }) : 0,
      job.includeDocs ? prisma.note.count({ where: { userId: job.userId } }) : 0,
      job.includeContacts ? prisma.contact.count() : 0,
      job.includeCalendar
        ? prisma.calendarEvent.count({ where: { OR: [{ organizerId: job.userId }, { attendees: { some: { userId: job.userId } } }] } })
        : 0,
    ]);
    total = mailCount + driveCount + notesCount + contactsCount + calendarCount;
    await updateProgress(exportJobId, { totalItems: total });

    // ── Mail → .mbox ─────────────────────────────────────────────────────
    if (mailbox) {
      await updateProgress(exportJobId, { currentStage: "Exporting mail" });
      const threads = await prisma.inboxThread.findMany({
        where: { mailboxId: mailbox.id },
        select: {
          messages: {
            orderBy: { receivedAt: "asc" },
            select: { from: true, to: true, subject: true, textBody: true, htmlBody: true, receivedAt: true, messageId: true },
          },
        },
      });
      const mboxParts: string[] = [];
      for (const thread of threads) {
        for (const msg of thread.messages) {
          mboxParts.push(buildMboxEntry(msg));
          processed++;
        }
      }
      zip.file(`mail/${mailbox.email}.mbox`, mboxParts.join("\r\n"));
      await updateProgress(exportJobId, { processedItems: processed });
    }

    // ── Drive files ──────────────────────────────────────────────────────
    if (job.includeDrive) {
      await updateProgress(exportJobId, { currentStage: "Exporting Drive files" });
      const files = await prisma.driveFile.findMany({
        where: { ownerId: job.userId, isTrashed: false },
        select: { id: true, name: true, storageKey: true, folder: { select: { name: true } } },
      });
      for (const file of files) {
        try {
          if (isS3Configured() && file.storageKey) {
            const buf = await downloadFromR2(file.storageKey);
            const folderPrefix = file.folder?.name ? `${file.folder.name.replace(/[/\\]/g, "_")}/` : "";
            zip.file(`drive/${folderPrefix}${file.name}`, buf);
          } else {
            errors.push(`Skipped "${file.name}" — file storage not configured`);
          }
        } catch (err) {
          errors.push(`Failed to export Drive file "${file.name}": ${(err as Error).message}`);
        }
        processed++;
      }
      await updateProgress(exportJobId, { processedItems: processed, errorLog: errors.slice(-MAX_ERROR_LOG) });
    }

    // ── Notes + Docs ─────────────────────────────────────────────────────
    if (job.includeDocs) {
      await updateProgress(exportJobId, { currentStage: "Exporting notes and docs" });
      const notes = await prisma.note.findMany({
        where: { userId: job.userId },
        select: { title: true, content: true, isDoc: true, updatedAt: true },
      });
      for (const note of notes) {
        const dir = note.isDoc ? "docs" : "notes";
        const safeTitle = (note.title || "untitled").replace(/[/\\:*?"<>|]/g, "_").slice(0, 120);
        zip.file(`${dir}/${safeTitle || "untitled"}-${processed}.html`, note.content || "");
        processed++;
      }
      await updateProgress(exportJobId, { processedItems: processed });
    }

    // ── Contacts → CSV ───────────────────────────────────────────────────
    if (job.includeContacts) {
      await updateProgress(exportJobId, { currentStage: "Exporting contacts" });
      const contacts = await prisma.contact.findMany({ select: { name: true, email: true, status: true, createdAt: true } });
      const csvRows = [
        "Name,Email,Status,Created",
        ...contacts.map((c) => [c.name, c.email, c.status, c.createdAt.toISOString()].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")),
      ];
      zip.file("contacts/contacts.csv", csvRows.join("\r\n"));
      processed += contacts.length;
      await updateProgress(exportJobId, { processedItems: processed });
    }

    // ── Calendar → .ics ──────────────────────────────────────────────────
    if (job.includeCalendar) {
      await updateProgress(exportJobId, { currentStage: "Exporting calendar" });
      const events = await prisma.calendarEvent.findMany({
        where: { OR: [{ organizerId: job.userId }, { attendees: { some: { userId: job.userId } } }] },
        select: { title: true, description: true, location: true, startAt: true, endAt: true, allDay: true },
      });
      const icsLines: (string | null)[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Nexus//Account Export//EN"];
      for (const ev of events) {
        icsLines.push(
          "BEGIN:VEVENT",
          `SUMMARY:${icsEscape(ev.title)}`,
          ev.description ? `DESCRIPTION:${icsEscape(ev.description)}` : null,
          ev.location ? `LOCATION:${icsEscape(ev.location)}` : null,
          `DTSTART:${toIcsDate(ev.startAt)}`,
          `DTEND:${toIcsDate(ev.endAt)}`,
          "END:VEVENT",
        );
        processed++;
      }
      icsLines.push("END:VCALENDAR");
      zip.file("calendar/calendar.ics", icsLines.filter((l): l is string => l !== null).join("\r\n"));
      await updateProgress(exportJobId, { processedItems: processed });
    }

    // ── Package + upload ─────────────────────────────────────────────────
    await updateProgress(exportJobId, { currentStage: "Packaging archive" });
    const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });

    if (!isS3Configured()) {
      throw new Error("File storage is not configured — cannot store the export archive.");
    }
    const key = `exports/${job.userId}/${exportJobId}.zip`;
    await uploadToR2(buffer, key, "application/zip");

    await prisma.exportJob.update({
      where: { id: exportJobId },
      data: {
        status: "COMPLETED",
        resultKey: key,
        resultSize: buffer.length,
        processedItems: processed,
        currentStage: null,
        errorLog: errors.slice(-MAX_ERROR_LOG),
        completedAt: new Date(),
      },
    });

    logger.info({ exportJobId, size: buffer.length, processed }, "[export-worker] Export finished");
  } catch (err) {
    errors.push((err as Error).message);
    await prisma.exportJob.update({
      where: { id: exportJobId },
      data: { status: "FAILED", errorLog: errors.slice(-MAX_ERROR_LOG), completedAt: new Date(), currentStage: null },
    }).catch(() => {});
    logger.error({ exportJobId, err }, "[export-worker] Export failed");
  }
}
