import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { sendEmail, renderEmailHtml } from "@/lib/email";
import { getTokensForUser, sendExpoPush } from "@/lib/expo-push";
import { indexingQueue } from "@/lib/queues/indexing.queue";

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

  const body = await request.json() as unknown;
  const parsed = composeSchema.safeParse(body);
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
      signature = {
        html: dbSig.html,
        fullName: dbSig.fullName,
        title: dbSig.title,
        phone: dbSig.phone,
        linkedinUrl: dbSig.linkedinUrl,
        website: dbSig.website,
        avatarUrl: senderProfile?.avatarUrl ?? null,
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
  const finalHtml = htmlBody ?? renderEmailHtml(subject, textBody, { email: toAddr, name: toAddr.split("@")[0], status: "Direct" }, sigTemplate);

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

    await prisma.inboxMessage.create({
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

      await prisma.inboxMessage.create({
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

      await prisma.inboxMessage.create({
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
