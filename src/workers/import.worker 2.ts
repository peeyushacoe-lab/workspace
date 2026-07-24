import { Worker, type Job } from "bullmq";
import { ImapFlow, type FetchMessageObject } from "imapflow";
import { simpleParser } from "mailparser";
import { redisConnection } from "@/lib/redis";
import { IMPORT_QUEUE_NAME, type ImportJobData } from "@/lib/queues/import.queue";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { decryptSecret } from "@/lib/crypto-secret";
import { uploadToR2, isS3Configured } from "@/lib/s3";

const PROGRESS_FLUSH_INTERVAL = 10; // flush counters to DB every N messages
const MAX_ERROR_LOG = 50;
const CANCEL_CHECK_INTERVAL = 25;

type FolderMappingEntry = {
  source: string;
  target: "inbox" | "archive" | "trash" | "custom";
  label?: string | null;
};

export function createImportWorker() {
  const worker = new Worker<ImportJobData>(
    IMPORT_QUEUE_NAME,
    async (job: Job<ImportJobData>) => {
      if (job.data.type !== "IMAP_IMPORT") return;
      await runImapImport(job.data.importJobId);
    },
    { connection: redisConnection, concurrency: 1 },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "[import-worker] Job failed");
  });

  return worker;
}

async function isCancelled(importJobId: string): Promise<boolean> {
  const row = await prisma.mailImportJob.findUnique({
    where: { id: importJobId },
    select: { status: true },
  });
  return row?.status === "CANCELLED";
}

async function runImapImport(importJobId: string) {
  const importJob = await prisma.mailImportJob.findUnique({ where: { id: importJobId } });
  if (!importJob) return;
  if (importJob.status === "CANCELLED") return;

  const errors: string[] = Array.isArray(importJob.errorLog)
    ? (importJob.errorLog as unknown[]).map(String)
    : [];

  await prisma.mailImportJob.update({
    where: { id: importJobId },
    data: { status: "CONNECTING", startedAt: new Date() },
  });

  let client: ImapFlow;
  try {
    const password = decryptSecret(importJob.encryptedPassword);
    client = new ImapFlow({
      host: importJob.host,
      port: importJob.port,
      secure: importJob.secure,
      auth: { user: importJob.username, pass: password },
      logger: false,
    });
    await client.connect();
  } catch (err) {
    await failJob(importJobId, errors, `Connection failed: ${(err as Error).message}`);
    return;
  }

  const mapping = (Array.isArray(importJob.folderMapping) ? importJob.folderMapping : []) as FolderMappingEntry[];

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  try {
    let total = 0;
    const resolvedFolders: (FolderMappingEntry & { count: number })[] = [];
    for (const m of mapping) {
      try {
        const status = await client.status(m.source, { messages: true });
        const count = status.messages ?? 0;
        total += count;
        resolvedFolders.push({ ...m, count });
      } catch (err) {
        errors.push(`Could not open folder "${m.source}": ${(err as Error).message}`);
      }
    }

    await prisma.mailImportJob.update({
      where: { id: importJobId },
      data: { status: "IMPORTING", totalMessages: total, errorLog: errors.slice(-MAX_ERROR_LOG) },
    });

    const customFolderCache = new Map<string, string>();
    let processedSinceFlush = 0;
    let processedTotal = 0;

    for (const folder of resolvedFolders) {
      if (await isCancelled(importJobId)) break;

      await prisma.mailImportJob.update({
        where: { id: importJobId },
        data: { currentFolder: folder.source },
      });

      let customFolderId: string | null = null;
      if (folder.target === "custom") {
        customFolderId = customFolderCache.get(folder.source) ?? null;
        if (!customFolderId) {
          const created = await prisma.mailFolder.create({
            data: {
              userId: importJob.userId,
              mailboxId: importJob.mailboxId,
              name: folder.label || folder.source,
            },
          });
          customFolderId = created.id;
          customFolderCache.set(folder.source, customFolderId);
        }
      }

      const lock = await client.getMailboxLock(folder.source).catch((err: Error) => {
        errors.push(`Could not lock folder "${folder.source}": ${err.message}`);
        return null;
      });
      if (!lock) continue;

      try {
        for await (const message of client.fetch("1:*", { source: true, uid: true }) as AsyncIterable<FetchMessageObject>) {
          processedTotal++;
          if (processedTotal % CANCEL_CHECK_INTERVAL === 0 && (await isCancelled(importJobId))) {
            break;
          }

          try {
            if (!message.source) {
              skipped++;
              continue;
            }
            const parsed = await simpleParser(message.source);
            const messageId = parsed.messageId ?? undefined;

            if (messageId) {
              const existing = await prisma.inboxMessage.findUnique({
                where: { messageId },
                select: { id: true },
              });
              if (existing) {
                skipped++;
                continue;
              }
            }

            const fromAddr = parsed.from?.value?.[0]?.address ?? parsed.from?.text ?? "unknown@unknown";
            const toObj = parsed.to;
            const toAddr = Array.isArray(toObj)
              ? toObj.map((t) => t.text).join(", ")
              : toObj?.text ?? importJob.username;
            const subject = parsed.subject || "(no subject)";
            const inReplyToRaw = parsed.inReplyTo;
            const inReplyTo = Array.isArray(inReplyToRaw) ? inReplyToRaw[0] : inReplyToRaw;
            const referencesRaw = parsed.references;
            const references = Array.isArray(referencesRaw) ? referencesRaw.join(" ") : referencesRaw;
            const receivedAt = parsed.date ?? new Date();

            // Thread matching: follow reply chain first, then fall back to an
            // exact subject match within the same target mailbox/folder.
            let threadId: string | null = null;
            const refKey = inReplyTo || (references ? references.split(/\s+/).pop() : null);
            if (refKey) {
              const parent = await prisma.inboxMessage.findUnique({
                where: { messageId: refKey },
                select: { threadId: true },
              });
              if (parent) threadId = parent.threadId;
            }
            if (!threadId) {
              const existingThread = await prisma.inboxThread.findFirst({
                where: {
                  mailboxId: importJob.mailboxId,
                  subject: { equals: subject, mode: "insensitive" },
                  folderId: customFolderId,
                },
                orderBy: { createdAt: "desc" },
              });
              threadId = existingThread?.id ?? null;
            }
            if (!threadId) {
              const created = await prisma.inboxThread.create({
                data: {
                  subject,
                  mailboxId: importJob.mailboxId,
                  folderId: customFolderId,
                  isArchived: folder.target === "archive",
                  isTrashed: folder.target === "trash",
                  createdAt: receivedAt,
                  updatedAt: receivedAt,
                },
              });
              threadId = created.id;
            }

            const inboxMessage = await prisma.inboxMessage.create({
              data: {
                threadId,
                from: fromAddr,
                to: toAddr,
                subject,
                textBody: parsed.text ?? null,
                htmlBody: typeof parsed.html === "string" ? parsed.html : null,
                isRead: true,
                messageId,
                inReplyTo: inReplyTo ?? null,
                references: references ?? null,
                receivedAt,
              },
            });

            for (const att of parsed.attachments ?? []) {
              let storageUrl: string | null = null;
              let key: string | null = null;
              try {
                if (isS3Configured() && att.content) {
                  const safeFilename = (att.filename ?? "attachment").replace(/[^a-zA-Z0-9._-]/g, "_");
                  const r2Key = `attachments/${inboxMessage.id}/${Date.now()}-${safeFilename}`;
                  const result = await uploadToR2(att.content, r2Key, att.contentType ?? "application/octet-stream");
                  storageUrl = result.url || null;
                  key = result.key;
                }
              } catch (uploadErr) {
                errors.push(`Attachment upload failed for "${subject}": ${(uploadErr as Error).message}`);
              }
              await prisma.emailAttachment.create({
                data: {
                  messageId: inboxMessage.id,
                  filename: att.filename ?? "attachment",
                  mimeType: att.contentType ?? "application/octet-stream",
                  size: att.size ?? 0,
                  storageUrl,
                  key,
                },
              });
            }

            imported++;
          } catch (err) {
            failed++;
            errors.push(`Message import failed: ${(err as Error).message}`);
          }

          processedSinceFlush++;
          if (processedSinceFlush >= PROGRESS_FLUSH_INTERVAL) {
            processedSinceFlush = 0;
            await prisma.mailImportJob.update({
              where: { id: importJobId },
              data: {
                importedMessages: imported,
                skippedMessages: skipped,
                failedMessages: failed,
                errorLog: errors.slice(-MAX_ERROR_LOG),
              },
            });
          }
        }
      } finally {
        lock.release();
      }
    }

    await client.logout().catch(() => {});

    const cancelled = await isCancelled(importJobId);
    await prisma.mailImportJob.update({
      where: { id: importJobId },
      data: {
        status: cancelled ? "CANCELLED" : "COMPLETED",
        importedMessages: imported,
        skippedMessages: skipped,
        failedMessages: failed,
        currentFolder: null,
        errorLog: errors.slice(-MAX_ERROR_LOG),
        completedAt: new Date(),
      },
    });

    logger.info({ importJobId, imported, skipped, failed }, "[import-worker] Import finished");
  } catch (err) {
    await client.logout().catch(() => {});
    await failJob(importJobId, errors, (err as Error).message, { imported, skipped, failed });
  }
}

async function failJob(
  importJobId: string,
  errors: string[],
  message: string,
  counts?: { imported: number; skipped: number; failed: number },
) {
  errors.push(message);
  await prisma.mailImportJob
    .update({
      where: { id: importJobId },
      data: {
        status: "FAILED",
        errorLog: errors.slice(-MAX_ERROR_LOG),
        completedAt: new Date(),
        ...(counts
          ? {
              importedMessages: counts.imported,
              skippedMessages: counts.skipped,
              failedMessages: counts.failed,
            }
          : {}),
      },
    })
    .catch(() => {});
  logger.error({ importJobId, message }, "[import-worker] Import failed");
}
