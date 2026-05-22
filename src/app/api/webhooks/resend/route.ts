import { NextResponse } from "next/server";
import { z } from "zod";
import { Webhook } from "svix";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const resendWebhookSchema = z.object({
  type: z.string(),
  created_at: z.string().optional(),
  data: z
    .object({
      id: z.string().optional(),
      email_id: z.string().optional(),
      from: z.string().optional(),
      to: z.union([z.string(), z.array(z.string())]).optional(),
      subject: z.string().optional(),
      text: z.string().optional(),
      html: z.string().optional(),
      headers: z.record(z.string(), z.string()).optional(),
    })
    .passthrough(),
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
  if (!secret) {
    console.error("[webhook] RESEND_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const body = await request.text();
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 401 });
  }

  let payloadRaw: unknown;
  try {
    const wh = new Webhook(secret);
    payloadRaw = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
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

type InboundEmailPayload = {
  to?: string | string[];
  from?: string;
  subject?: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
};

async function handleInboundEmail(data: InboundEmailPayload) {
  const toArr = Array.isArray(data.to) ? data.to : data.to ? [data.to] : [];
  const recipientEmail = toArr[0]?.toLowerCase();
  const senderEmail = data.from?.toLowerCase();

  if (!recipientEmail || !senderEmail) {
    return NextResponse.json({ error: "Missing recipient/sender" }, { status: 400 });
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

  // Thread matching logic
  const messageId = data.headers?.["message-id"];
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

  // 2. Fallback to subject matching if no header match
  if (!thread) {
    thread = await prisma.inboxThread.findFirst({
      where: {
        mailboxId: mailbox.id,
        subject: { contains: cleanSubject, mode: "insensitive" },
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // Last 30 days
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
      textBody: data.text,
      htmlBody: data.html,
      isRead: false,
      messageId: messageId,
      inReplyTo: inReplyTo,
      references: references,
    },
  });

  // 4. Security Scan (Phase 7)
  await performSecurityScan(inboxMessage.id, data.text || "");

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
