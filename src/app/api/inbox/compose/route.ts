import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { sendEmail, renderComposeHtml } from "@/lib/email";
import { getTokensForUser, sendExpoPush } from "@/lib/expo-push";
import { indexingQueue } from "@/lib/queues/indexing.queue";
import { uploadToR2, isS3Configured } from "@/lib/s3";

const composeSchema = z.object({
  to:        z.string().email(),
  subject:   z.string().min(1).max(500),
  body:      z.string().min(1).max(100_000),
  htmlBody:  z.string().optional(),
  cc:        z.array(z.string().email()).optional(),
  bcc:       z.array(z.string().email()).optional(),
  replyToThreadId: z.string().optional(),
  signatureId: z.string().optional(),
});

const INTERNAL_DOMAIN = "cybersage.uk";

function isInternal(email: string) {
  return email.toLowerCase().endsWith(`@${INTERNAL_DOMAIN}`);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Support both JSON and multipart/form-data (when attachments are included)
  let rawBody: unknown;
  let attachmentFiles: Array<{ filename: string; content: Buffer }> = [];

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    rawBody = {
      to: formData.get("to"),
      subject: formData.get("subject"),
      body: formData.get("body"),
      htmlBody: formData.get("htmlBody") ?? undefined,
      cc: formData.get("cc") ? JSON.parse(formData.get("cc") as string) as string[] : undefined,
      bcc: formData.get("bcc") ? JSON.parse(formData.get("bcc") as string) as string[] : undefined,
      replyToThreadId: formData.get("replyToThreadId") ?? undefined,
      signatureId: formData.get("signatureId") ?? undefined,
    };
    const files = formData.getAll("attachments") as File[];
    attachmentFiles = await Promise.all(
      files.map(async (f) => ({
        filename: f.name,
        content: Buffer.from(await f.arrayBuffer()),
      }))
    );
  } else {
    rawBody = await request.json() as unknown;
  }

  const parsed = composeSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  }

  const { to, subject, htmlBody, replyToThreadId, signatureId } = parsed.data;
  const textBody = parsed.data.body;
  const toAddr = to.toLowerCase();
  const fromAddr = user.email.toLowerCase();

  let signature: { html?: string | null; fullName?: string; title?: string | null; phone?: string | null; linkedinUrl?: string | null; website?: string | null; avatarUrl?: string | null } | null = null;
  if (signatureId) {
    const dbSig = await prisma.signature.findFirst({
      where: { id: signatureId, userId: user.id },
    }).catch(() => null);
    if (dbSig) {
      const senderProfile = await prisma.user.findUnique({
        where: { id: user.id },
        select: { avatarUrl: true },
      }).catch(() => null);
      // Use the public avatar endpoint so email clients (Gmail, Outlook) can load the image.
      // Raw avatarUrl may be a base64 data URL or signed S3 URL — neither works in emails.
      const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://nexus.cybersage.uk";
      const publicAvatarUrl = senderProfile?.avatarUrl
        ? `${appUrl}/api/workspace/avatar/${user.id}`
        : null;
      signature = {
        html: dbSig.html,
        fullName: dbSig.fullName,
        title: dbSig.title,
        phone: dbSig.phone,
        linkedinUrl: dbSig.linkedinUrl,
        website: dbSig.website,
        avatarUrl: publicAvatarUrl,
      };
    }
  }

  const sigTemplate = signature ? {
    fullName: signature.fullName ?? user.fullName,
    title: signature.title ?? "",
    phone: signature.phone ?? undefined,
    linkedinUrl: signature.linkedinUrl ?? undefined,
    website: signature.website ?? undefined,
    avatarUrl: signature.avatarUrl ?? undefined,
    html: signature.html ?? undefined,
  } : undefined;
  const finalHtml = htmlBody ?? renderComposeHtml(textBody, { email: toAddr, name: toAddr.split("@")[0], status: "Direct" }, sigTemplate);

  if (isInternal(toAddr)) {
    // ── Direct internal delivery ────────────────────────────────────────────
    const recipientMailbox = await prisma.mailbox.findUnique({
      where: { email: toAddr },
    });

    if (!recipientMailbox) {
      return NextResponse.json({ error: `No mailbox found for ${toAddr}` }, { status: 404 });
    }

    const cleanSubject = subject.replace(/^(Re|Fwd|Aw|Vw):\s+/i, "");
    let thread = null;

    // Try to link to existing thread (reply flow)
    if (replyToThreadId) {
      thread = await prisma.inboxThread.findUnique({ where: { id: replyToThreadId } }).catch(() => null);
      // Subject-match fallback only when explicitly replying but thread wasn't found
      if (!thread) {
        thread = await prisma.inboxThread.findFirst({
          where: {
            mailboxId: recipientMailbox.id,
            subject: { contains: cleanSubject, mode: "insensitive" },
            createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
            isTrashed: false,
            isArchived: false,
          },
          orderBy: { createdAt: "desc" },
        }).catch(() => null);
      }
    }

    // New compose (not a reply) — always create a fresh thread
    if (!thread) {
      thread = await prisma.inboxThread.create({
        data: { subject: cleanSubject, mailboxId: recipientMailbox.id },
      });
    }

    const recipientMsg = await prisma.inboxMessage.create({
      data: {
        threadId:  thread.id,
        from:      fromAddr,
        to:        toAddr,
        subject,
        textBody,
        htmlBody:  finalHtml ?? null,
        isRead:    false,
      },
    });

    // Persist attachments to R2 and create EmailAttachment records for the recipient message
    if (attachmentFiles.length > 0) {
      void saveAttachments(recipientMsg.id, attachmentFiles);
    }

    // Also drop a copy in the sender's Sent mailbox (find or create)
    const senderMailbox = await prisma.mailbox.findUnique({ where: { email: fromAddr } });
    if (senderMailbox) {
      // Link sent copy to same thread when replying; otherwise create a fresh sent thread
      const sentThread = (replyToThreadId
        ? await prisma.inboxThread.findFirst({
            where: {
              mailboxId: senderMailbox.id,
              subject: { contains: cleanSubject, mode: "insensitive" },
              createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
            },
            orderBy: { createdAt: "desc" },
          }).catch(() => null)
        : null
      ) ?? await prisma.inboxThread.create({
        data: { subject: cleanSubject, mailboxId: senderMailbox.id },
      });

      const sentMsg = await prisma.inboxMessage.create({
        data: {
          threadId:  sentThread.id,
          from:      fromAddr,
          to:        toAddr,
          subject,
          textBody,
          htmlBody:  finalHtml ?? null,
          isRead:    true,
        },
      });

      // Also save attachment copies for the sent version
      if (attachmentFiles.length > 0) {
        void saveAttachments(sentMsg.id, attachmentFiles);
      }
    }

    // Queue email for full-text search indexing — fire-and-forget
    indexingQueue.add("index-email", {
      type: "INDEX",
      resource: "email",
      resourceId: thread.id,
      content: `${subject} ${textBody}`,
      metadata: {
        threadId: thread.id,
        subject,
        fromEmail: fromAddr,
        toEmail: toAddr,
        updatedAt: new Date().toISOString(),
      },
    }).catch(() => {});

    // Fire push notification to recipient (non-fatal)
    void prisma.mailboxAccess.findFirst({
      where: { mailboxId: recipientMailbox.id, role: "OWNER" },
      select: { userId: true },
    }).then(async (owner) => {
      if (!owner) return;
      const tokens = await getTokensForUser(owner.userId);
      if (tokens.length) {
        await sendExpoPush(tokens, {
          title: `New mail from ${user.fullName}`,
          body: subject,
          data: { type: "email", threadId: thread.id },
        });
      }
    }).catch(() => {});

    return NextResponse.json({ ok: true, delivery: "internal" });
  }

  // ── External delivery via Resend ─────────────────────────────────────────
  try {
    await sendEmail(
      subject,
      textBody,
      { email: toAddr, name: toAddr.split("@")[0], status: "Direct" },
      signature ? {
        fullName: signature.fullName ?? user.fullName,
        title: signature.title ?? "",
        phone: signature.phone ?? undefined,
        linkedinUrl: signature.linkedinUrl ?? undefined,
        website: signature.website ?? undefined,
        avatarUrl: signature.avatarUrl ?? undefined,
        html: signature.html ?? undefined,
      } : undefined,
      `${user.fullName} <${fromAddr}>`,
      parsed.data.cc,
      parsed.data.bcc,
      undefined,
      attachmentFiles.length ? attachmentFiles : undefined,
    );

    // Save a sent copy in the sender's mailbox (so it appears in the Sent folder)
    const senderMailbox = await prisma.mailbox.findUnique({ where: { email: fromAddr } }).catch(() => null);
    if (senderMailbox) {
      const cleanSubject = subject.replace(/^(Re|Fwd|Aw|Vw):\s+/i, "");
      // Reuse existing sent thread for the same subject (reply chain), else create new
      const sentThread = await prisma.inboxThread.findFirst({
        where: {
          mailboxId: senderMailbox.id,
          subject: { contains: cleanSubject, mode: "insensitive" },
          ...(replyToThreadId ? {} : { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }),
        },
        orderBy: { createdAt: "desc" },
      }).catch(() => null) ?? await prisma.inboxThread.create({
        data: { subject: cleanSubject, mailboxId: senderMailbox.id },
      });

      const externalSentMsg = await prisma.inboxMessage.create({
        data: {
          threadId: sentThread.id,
          from:     fromAddr,
          to:       toAddr,
          subject,
          textBody,
          htmlBody: finalHtml ?? null,
          isRead:   true,
        },
      });

      if (attachmentFiles.length > 0) {
        void saveAttachments(externalSentMsg.id, attachmentFiles);
      }
    }

    // Also log it in EmailLog so it shows in campaign/analytics views
    await prisma.emailLog.create({
      data: {
        recipient: toAddr,
        subject,
        status:    "DELIVERED",
        userId:    user.id,
      },
    }).catch(() => {}); // non-fatal

    return NextResponse.json({ ok: true, delivery: "external" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Send failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── Attachment helper ─────────────────────────────────────────────────────────
// Uploads files to R2 (if configured) and creates EmailAttachment records so
// the InboxView can render them. Runs fire-and-forget — never blocks the send.
async function saveAttachments(
  messageId: string,
  files: Array<{ filename: string; content: Buffer }>,
) {
  for (const file of files) {
    try {
      const ext = file.filename.split(".").pop() ?? "bin";
      const key = `attachments/${messageId}/${Date.now()}-${file.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const mime = extToMime(ext);

      let storageUrl: string | null = null;
      let savedKey: string | null = null;

      if (isS3Configured()) {
        const result = await uploadToR2(file.content, key, mime);
        storageUrl = result.url || null;
        savedKey = result.key;
      }

      await prisma.emailAttachment.create({
        data: {
          messageId,
          filename: file.filename,
          mimeType: mime,
          size: file.content.length,
          storageUrl,
          key: savedKey,
        },
      });
    } catch (err) {
      console.error("[compose] saveAttachments failed for", file.filename, err);
    }
  }
}

function extToMime(ext: string): string {
  const map: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    txt: "text/plain",
    csv: "text/csv",
    zip: "application/zip",
    mp4: "video/mp4",
    mp3: "audio/mpeg",
  };
  return map[ext.toLowerCase()] ?? "application/octet-stream";
}
