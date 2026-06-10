import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { toPrismaTemplate } from "@/lib/templates";
import type { ContactInput } from "@/lib/types";
import { canUserSendFrom, getEmailConfig } from "@/lib/email-config";
import { getCurrentUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { emitEvent } from "@/lib/events";
import { securitySyncQueue } from "@/lib/queues/security-sync.queue";

const SENSITIVE_PATTERNS = [
  { name: "AWS Key", regex: /AKIA[0-9A-Z]{16}/ },
  { name: "Private Key", regex: /-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----/ },
  { name: "Generic Secret", regex: /(password|secret|key|token)\s*[:=]\s*["']?[a-zA-Z0-9_\-]{20,}["']?/i },
];

function dlpScan(subject: string, body: string): string[] {
  const content = `${subject} ${body}`;
  return SENSITIVE_PATTERNS.filter(p => p.regex.test(content)).map(p => `Potential ${p.name} detected.`);
}

const contactSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  status: z.string().trim().min(1).optional().default("Pending"),
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  interviewDate: z.string().trim().optional(),
  customMessage: z.string().trim().optional(),
});

const sendSchema = z.object({
  title: z.string().trim().min(1).max(200),
  subject: z.string().trim().min(1).max(500),
  body: z.string().trim().min(1).max(100_000),
  template: z.enum(["accepted", "rejected", "interview", "reminder"]).optional(),
  contacts: z.array(contactSchema).min(1).max(500),
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  interviewDate: z.string().trim().optional(),
  customMessage: z.string().trim().optional(),
  signatureId: z.string().optional(),
  senderEmail: z.string().email().optional(),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
});

function buildFromAddress(requestedSender: string) {
  const config = getEmailConfig(requestedSender);
  if (config) {
    return `${config.displayName} <${config.email}>`;
  }
  if (requestedSender.includes("<") && requestedSender.includes(">")) {
    return requestedSender;
  }
  return `CyberSage <${requestedSender}>`;
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { allowed: rlOk, retryAfter } = await checkRateLimit(`send:${currentUser.id}`, 50, 60 * 60);
  if (!rlOk) {
    return NextResponse.json(
      { success: 0, failed: 0, skipped: 0, errors: ["Email rate limit reached. Try again later."], retryAfter },
      { status: 429 }
    );
  }

  const payload = sendSchema.safeParse(await request.json());
  if (!payload.success) {
    console.error("Validation failed for /api/send:", JSON.stringify(payload.error.format(), null, 2));
    return NextResponse.json(
      {
        success: 0,
        failed: 0,
        skipped: 0,
        errors: payload.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
      },
      { status: 400 },
    );
  }

  const {
    title,
    subject,
    body,
    template,
    contacts,
    firstName,
    lastName,
    interviewDate,
    customMessage,
    signatureId,
    senderEmail,
    cc,
    bcc,
  } = payload.data;

  const userRole = currentUser.role;
  const requestedSender = senderEmail || "noreply@cybersage.uk";

  if (!canUserSendFrom(userRole, requestedSender)) {
    return NextResponse.json(
      {
        success: 0,
        failed: 0,
        skipped: 0,
        errors: [`You don't have permission to send from ${requestedSender}`],
      },
      { status: 403 },
    );
  }

  const fromAddress = buildFromAddress(requestedSender);
  const useDatabase = Boolean(process.env.DATABASE_URL);
  let campaignId: string | undefined;
  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  let signature = null;
  if (signatureId && useDatabase) {
    try {
      const dbSignature = await prisma.signature.findFirst({
        where: { id: signatureId, userId: currentUser.id },
      });
      if (dbSignature) {
        // Fetch sender's profile — use public avatar endpoint URL (not raw DB value)
        // so email clients can load the image without auth.
        const senderProfile = await prisma.user.findUnique({
          where: { id: currentUser.id },
          select: { avatarUrl: true },
        });
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://nexus.cybersage.uk";
        signature = {
          fullName: dbSignature.fullName,
          title: dbSignature.title,
          phone: dbSignature.phone,
          linkedinUrl: dbSignature.linkedinUrl,
          website: dbSignature.website,
          html: dbSignature.html,
          avatarUrl: senderProfile?.avatarUrl
            ? `${appUrl}/api/workspace/avatar/${currentUser.id}`
            : null,
        };
      }
    } catch {
      // ignore signature lookup errors
    }
  }

  // Always create a Campaign so sends appear in the campaigns history
  if (useDatabase) {
    const campaign = await prisma.campaign.create({
      data: {
        title,
        template: toPrismaTemplate(template),
        recipients: contacts.length,
        status: "SENDING",
      },
    });
    campaignId = campaign.id;
  }

  // DLP check — scan once for the whole message (content is same for all recipients)
  const dlpFindings = dlpScan(subject, body);

  for (const contact of contacts) {
    const mergedContact: ContactInput = {
      ...contact,
      firstName: contact.firstName || firstName,
      lastName: contact.lastName || lastName,
      interviewDate: contact.interviewDate || interviewDate,
      customMessage: contact.customMessage || customMessage,
    };

    let savedContactId: string | undefined;
    let emailLog: { id: string } | null = null;

    if (useDatabase) {
      // Run contact upsert first (emailLog references contactId)
      const savedContact = await prisma.contact.upsert({
        where: { email: mergedContact.email },
        update: { name: mergedContact.name, status: mergedContact.status },
        create: { name: mergedContact.name, email: mergedContact.email, status: mergedContact.status },
        select: { id: true },
      });
      savedContactId = savedContact.id;

      emailLog = await prisma.emailLog.create({
        data: {
          campaignId,
          contactId: savedContactId,
          userId: currentUser.id,
          recipient: mergedContact.email,
          subject,
          status: "QUEUED",
          payload: mergedContact as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
    }

    // DLP block
    if (dlpFindings.length > 0) {
      failed += 1;
      const msg = `DLP Violation: ${dlpFindings.join(" ")}`;
      errors.push(`${mergedContact.email}: ${msg}`);
      logger.warn({ recipient: mergedContact.email }, msg);
      if (emailLog) {
        await prisma.emailLog
          .update({ where: { id: emailLog.id }, data: { status: "FAILED", error: msg } })
          .catch(() => {});
      }
      continue;
    }

    // Send directly via Resend
    try {
      const result = await sendEmail(
        subject,
        body,
        mergedContact,
        signature ?? undefined,
        fromAddress,
        cc,
        bcc,
        { isBulk: true },
      );
      success += 1;
      if (emailLog) {
        await prisma.emailLog
          .update({
            where: { id: emailLog.id },
            data: { status: result.skipped ? "QUEUED" : "SENT", resendId: result.id },
          })
          .catch(() => {});
      }
      emitEvent("MAIL_SENT", {
        logId: emailLog?.id ?? "",
        campaignId,
        recipientEmail: mergedContact.email,
        subject,
        actorId: currentUser.id,
        fromEmail: requestedSender,
      });
      securitySyncQueue.add("analyze-email", {
        type: "ANALYZE_EMAIL",
        messageId: emailLog?.id ?? "",
        subject,
        from: requestedSender,
        body,
        attachmentCount: 0,
      }).catch(() => {});
    } catch (sendError) {
      failed += 1;
      const msg = sendError instanceof Error ? sendError.message : String(sendError);
      errors.push(`${mergedContact.email}: ${msg}`);
      logger.error({ recipient: mergedContact.email, error: msg }, "Send failed");
      if (emailLog) {
        await prisma.emailLog
          .update({ where: { id: emailLog.id }, data: { status: "FAILED", error: msg } })
          .catch(() => {});
      }
    }
  }

  if (useDatabase && campaignId) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        sentCount: success,
        failCount: failed,
        status: success === 0 && failed > 0 ? "FAILED" : success > 0 ? "SENT" : "QUEUED",
      },
    });

    await logAudit({
      actorId: currentUser.id,
      action: "EMAIL_SEND",
      targetType: "CAMPAIGN",
      targetId: campaignId,
      metadata: { title, success, failed, recipientCount: contacts.length },
    });
  }

  return NextResponse.json({
    campaignId,
    success,
    failed,
    skipped: 0,
    setupHints: [],
    errors,
  });
}
