import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { sendEmail } from "@/lib/email";

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

  let signature: { html?: string | null } | null = null;
  if (signatureId) {
    signature = await prisma.signature.findFirst({
      where: { id: signatureId, userId: user.id },
      select: { html: true },
    }).catch(() => null);
  }

  const finalHtml = htmlBody ?? (signature?.html
    ? `<div>${textBody.replace(/\n/g, "<br/>")}</div>${signature.html}`
    : undefined);

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
    }

    // Subject-match fallback
    if (!thread) {
      thread = await prisma.inboxThread.findFirst({
        where: {
          mailboxId: recipientMailbox.id,
          subject: { contains: cleanSubject, mode: "insensitive" },
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { createdAt: "desc" },
      }).catch(() => null);
    }

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
      const sentThread = await prisma.inboxThread.findFirst({
        where: {
          mailboxId: senderMailbox.id,
          subject: { contains: cleanSubject, mode: "insensitive" },
        },
        orderBy: { createdAt: "desc" },
      }) ?? await prisma.inboxThread.create({
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

    return NextResponse.json({ ok: true, delivery: "internal" });
  }

  // ── External delivery via Resend ─────────────────────────────────────────
  try {
    await sendEmail(
      subject,
      textBody,
      { email: toAddr, name: toAddr.split("@")[0], status: "Direct" },
      signature ? { fullName: user.fullName, title: "", html: signature.html ?? undefined } : undefined,
      `${user.fullName} <${fromAddr}>`,
      parsed.data.cc,
      parsed.data.bcc,
    );
    return NextResponse.json({ ok: true, delivery: "external" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Send failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
