import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { Webhook } from "svix";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { invalidate } from "@/lib/cache";
import { mailRulesQueue } from "@/lib/queues/mail-rules.queue";

const attachmentSchema = z.object({
  filename: z.string().optional(),
  mimeType: z.string().optional(),
  size: z.number().optional(),
  contentId: z.string().nullish(),
});

const resendWebhookSchema = z.object({
  type: z.string(),
  created_at: z.string().optional(),
  data: z
    .object({
      id: z.string().nullish(),
      email_id: z.string().nullish(),
      from: z.string().nullish(),
      to: z.union([z.string(), z.array(z.string())]).nullish(),
      subject: z.string().nullish(),
      text: z.string().nullish(),
      html: z.string().nullish(),
      headers: z.record(z.string(), z.string()).nullish(),
      attachments: z.array(attachmentSchema).nullish(),
      message_id: z.string().nullish(),
      cc: z.array(z.string()).nullish(),
      bcc: z.array(z.string()).nullish(),
    }).catchall(z.unknown()),
});

const statusByEvent: Record<
  string,
  "QUEUED" | "DELIVERED" | "OPENED" | "CLICKED" | "BOUNCED" | "FAILED"
> = {
  "email.queued": "QUEUED",
  "email.delivered": "DELIVERED",
  "email.opened": "OPENED",
  "email.clicked": "CLICKED",
  "email.bounced": "BOUNCED",
  "email.complained": "FAILED",
};

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const body = await request.text();
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  // Cloudflare Email Worker sends x-worker-secret instead of Svix headers
  const workerSecret = request.headers.get("x-worker-secret");
  const workerSecretEnv = process.env.CF_WORKER_SECRET;

  // Timing-safe comparison to prevent timing-based brute-force of the worker secret
  function workerSecretValid(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    const aBytes = Buffer.from(a);
    const bBytes = Buffer.from(b);
    return timingSafeEqual(aBytes, bBytes);
  }

  if (workerSecret && workerSecretEnv && workerSecretValid(workerSecret, workerSecretEnv)) {
    let payloadRaw: unknown;
    try { payloadRaw = JSON.parse(body); } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const payload = resendWebhookSchema.safeParse(payloadRaw);
    if (!payload.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    const { type, data: webhookData } = payload.data;
    if (type === "email.received") {
      return handleInboundEmail(webhookData);
    }
    return NextResponse.json({ ok: true });
  }

  let payloadRaw: unknown;

  if (svixId && svixTimestamp && svixSignature && secret) {
    try {
      const wh = new Webhook(secret);
      payloadRaw = wh.verify(body, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      });
    } catch (err) {
      console.error("[webhook] signature verification failed", err);
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else {
    // No Svix headers and no valid worker secret — reject to prevent payload forgery
    return NextResponse.json({ error: "Missing webhook signature" }, { status: 401 });
  }
  const payload = resendWebhookSchema.safeParse(payloadRaw);

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
  }

  const { type, data: webhookData } = payload.data;

  // 1. Handle Inbound Emails
  if (type === "email.received") {
    return handleInboundEmail(webhookData);
  }

  // 2. Handle Outbound Tracking
  const status = statusByEvent[type];
  if (!status) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const resendId = webhookData.email_id ?? webhookData.id;
  const recipient = Array.isArray(webhookData.to) ? webhookData.to[0] : webhookData.to;
  const jsonPayload = JSON.parse(JSON.stringify(webhookData)) as Prisma.InputJsonValue;

  const updateData: Prisma.EmailLogUpdateManyMutationInput = {
    status,
    providerMessageId: resendId ?? undefined,
    payload: jsonPayload,
  };

  if (status === "OPENED") updateData.openedAt = new Date();
  if (status === "CLICKED") updateData.clickedAt = new Date();
  if (status === "BOUNCED") {
    updateData.bouncedAt = new Date();
    if (recipient) {
      await prisma.suppressionList.upsert({
        where: { email: recipient.toLowerCase() },
        update: { reason: "BOUNCE" },
        create: { email: recipient.toLowerCase(), reason: "BOUNCE" }
      });
    }
  }

  if (resendId) {
    await prisma.emailLog.updateMany({
      where: { resendId },
      data: updateData,
    });
  } else if (recipient) {
    await prisma.emailLog.updateMany({
      where: { recipient },
      data: updateData,
    });
  }

  return NextResponse.json({ ok: true });
}

type InboundAttachment = {
  filename?: string;
  mimeType?: string;
  size?: number;
  contentId?: string | null;
};

type InboundEmailPayload = {
  email_id?: string | null;
  message_id?: string | null;
  to?: string | string[] | null;
  from?: string | null;
  subject?: string | null;
  text?: string | null;
  html?: string | null;
  headers?: Record<string, string> | null;
  attachments?: InboundAttachment[] | null;
};

type ResendEmailFull = { html?: string | null; text?: string | null };

async function fetchEmailBody(emailId: string): Promise<ResendEmailFull> {
  try {
    const res = await fetch(`https://api.resend.com/emails/${emailId}`, {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    });
    const json = await res.json() as Record<string, unknown>;
    if (!res.ok) console.error("[webhook] fetchEmailBody failed:", res.status);
    if (!res.ok) return {};
    return json as ResendEmailFull;
  } catch (err) {
    console.error("[webhook] fetchEmailBody failed:", err);
    return {};
  }
}

function extractEmail(raw: string): string {
  // Parse "Display Name <email@domain.com>" or plain "email@domain.com"
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).trim().toLowerCase();
}

const BOUNCE_DOMAIN_RE = /@send\.[^.]+\.[a-z]{2,}$/i;

async function handleInboundEmail(data: InboundEmailPayload) {
  const toArr = Array.isArray(data.to) ? data.to : data.to ? [data.to] : [];
  const recipientEmail = toArr[0] ? extractEmail(toArr[0]) : undefined;
  // Prefer the message From: header over the SMTP envelope from.
  // Resend sets envelope from to a bounce-tracking address (@send.cybersage.uk);
  // the real sender is in headers["from"]. Also check x-original-from / sender.
  const rawFrom =
    data.headers?.["from"] ??
    data.headers?.["x-original-from"] ??
    data.headers?.["sender"] ??
    data.headers?.["reply-to"] ??
    data.from ??
    "";
  const senderEmail = rawFrom ? extractEmail(rawFrom) : undefined;

  if (!recipientEmail || !senderEmail) {
    return NextResponse.json({ error: "Missing recipient/sender" }, { status: 400 });
  }

  // Resend bounce/delivery tracking addresses must never appear as inbox senders.
  if (BOUNCE_DOMAIN_RE.test(senderEmail)) {
    // Drop silently — bounce-tracking sender address, not a real email
    return NextResponse.json({ ok: true, ignored: "bounce-tracking sender" });
  }

  // Fetch full body from Resend API — inbound webhook only sends metadata
  let textBody = data.text ?? null;
  let htmlBody = data.html ?? null;
  if (!textBody && !htmlBody && data.email_id) {
    const full = await fetchEmailBody(data.email_id);
    textBody = full.text ?? null;
    htmlBody = full.html ?? null;
  }

  // Find target mailbox
  const mailbox = await prisma.mailbox.findUnique({
    where: { email: recipientEmail },
  });

  if (!mailbox) {
    return NextResponse.json({ ok: true, ignored: "No mailbox found for recipient" });
  }

  const subject = data.subject || "(No Subject)";
  const cleanSubject = subject.replace(/^(Re|Fwd|Aw|Vw):\s+/i, "");

  // Thread matching logic — Resend sends message_id at top level, not in headers
  const messageId = data.message_id ?? data.headers?.["message-id"];

  // Deduplicate — Resend retries on non-200, so the same message may arrive twice
  if (messageId) {
    const exists = await prisma.inboxMessage.findUnique({ where: { messageId }, select: { id: true } }).catch(() => null);
    if (exists) return NextResponse.json({ ok: true, deduplicated: true });
  }
  const inReplyTo = data.headers?.["in-reply-to"];
  const references = data.headers?.["references"];
  
  let thread = null;

  // 1. Try matching by in-reply-to or references
  const threadReference = inReplyTo || (references ? references.split(/\s+/).pop() : null);
  
  if (threadReference) {
    const parentMessage = await prisma.inboxMessage.findUnique({
      where: { messageId: threadReference },
      select: { threadId: true }
    });
    if (parentMessage) {
      thread = await prisma.inboxThread.findUnique({
        where: { id: parentMessage.threadId }
      });
    }
  }

  // 2. Fallback to exact subject matching — only when original subject was a Re:/Fwd:
  //    (i.e. cleanSubject differs from subject, meaning a reply prefix was stripped).
  //    Using `contains` previously caused unrelated emails with similar subjects to
  //    collapse into the same thread. Exact match prevents false grouping.
  const isReply = cleanSubject !== subject;
  if (!thread && isReply) {
    thread = await prisma.inboxThread.findFirst({
      where: {
        mailboxId: mailbox.id,
        subject: { equals: cleanSubject, mode: "insensitive" },
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        isTrashed: false,
        isArchived: false,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // 3. Create new thread if still no match
  if (!thread) {
    thread = await prisma.inboxThread.create({
      data: {
        subject: cleanSubject,
        mailboxId: mailbox.id,
      },
    });
  }

  const inboxMessage = await prisma.inboxMessage.create({
    data: {
      threadId: thread.id,
      from: senderEmail,
      to: recipientEmail,
      subject: subject,
      textBody,
      htmlBody,
      isRead: false,
      messageId: messageId,
      inReplyTo: inReplyTo,
      references: references,
    },
  });

  // Persist attachment metadata from the Cloudflare Email Worker
  const inboundAttachments = data.attachments ?? [];
  if (inboundAttachments.length > 0) {
    await prisma.emailAttachment.createMany({
      data: inboundAttachments.map((a) => ({
        messageId: inboxMessage.id,
        filename: a.filename ?? "attachment",
        mimeType: a.mimeType ?? "application/octet-stream",
        size: a.size ?? 0,
        storageUrl: null,
        key: null,
        bucket: null,
      })),
    });
  }

  // Bump the thread so it surfaces at the top of the inbox (list is ordered by
  // updatedAt), and resurface trashed/archived threads on new replies — Gmail
  // behaviour. Without this, replies to older threads never appeared.
  await prisma.inboxThread.update({
    where: { id: thread.id },
    data: { isTrashed: false, isArchived: false },
  });

  // New unread mail — drop cached unread badge counts so they refresh promptly
  await invalidate("unread:*").catch(() => {});

  // 4. Security Scan (Phase 7)
  await performSecurityScan(inboxMessage.id, data.text || "");

  // 5. Mail Rules evaluation (Phase 19)
  const mailboxOwner = await prisma.mailboxAccess.findFirst({
    where: { mailboxId: mailbox.id, role: "OWNER" },
    select: { userId: true },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mailRulesQueue as any).add("evaluate", {
    messageId: inboxMessage.id,
    mailboxId: mailbox.id,
    userId: mailboxOwner?.userId ?? null,
  }).catch(() => {});

  return NextResponse.json({ ok: true, threadId: thread.id });
}

async function performSecurityScan(messageId: string, content: string) {
  const findings: string[] = [];
  let riskScore = 0;

  // Simple URL detection
  const urlRegex = /https?:\/\/[^\s]+/g;
  const urls = content.match(urlRegex) || [];
  
  if (urls.length > 0) {
    riskScore += 10;
    findings.push(`Detected ${urls.length} URLs in message body.`);
    
    // Check for suspicious domains (placeholder logic)
    const suspiciousKeywords = ["bit.ly", "tinyurl.com", "verify", "secure", "login"];
    for (const url of urls) {
      if (suspiciousKeywords.some(kw => url.toLowerCase().includes(kw))) {
        riskScore += 20;
        findings.push(`Suspicious URL detected: ${url}`);
      }
    }
  }

  // Phishing keyword check
  const phishingKeywords = ["password", "urgent", "account suspended", "bank", "invoice"];
  if (phishingKeywords.some(kw => content.toLowerCase().includes(kw))) {
    riskScore += 15;
    findings.push("Detected phishing-related keywords.");
  }

  // Save scan results
  await prisma.threatScan.create({
    data: {
      messageId,
      riskScore,
      findings: findings,
    },
  });
}
