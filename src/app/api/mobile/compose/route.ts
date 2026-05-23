import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getMobileUser } from "@/lib/mobile-auth";
import { sendEmail } from "@/lib/email";
import { getTokensForUser, sendExpoPush } from "@/lib/expo-push";

const composeSchema = z.object({
  to:      z.string().email(),
  subject: z.string().min(1).max(500),
  body:    z.string().min(1).max(100_000),
  replyToThreadId: z.string().optional(),
});

const INTERNAL_DOMAIN = "cybersage.uk";
const isInternal = (email: string) => email.toLowerCase().endsWith(`@${INTERNAL_DOMAIN}`);

export async function POST(request: Request) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as unknown;
  const parsed = composeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  }

  const { to, subject, replyToThreadId } = parsed.data;
  const textBody = parsed.data.body;
  const toAddr   = to.toLowerCase();

  const sender = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { email: true, fullName: true, signature: true },
  });
  if (!sender) return NextResponse.json({ error: "Sender not found" }, { status: 404 });

  const fromAddr = sender.email.toLowerCase();
  const cleanSubject = subject.replace(/^(Re|Fwd|Aw|Vw):\s+/i, "");

  // Build HTML body with signature appended if one exists
  const htmlBody = sender.signature?.html
    ? `<div>${textBody.replace(/\n/g, "<br/>")}</div>${sender.signature.html}`
    : undefined;

  if (isInternal(toAddr)) {
    const recipientMailbox = await prisma.mailbox.findUnique({ where: { email: toAddr } });
    if (!recipientMailbox) {
      return NextResponse.json({ error: `No mailbox found for ${toAddr}` }, { status: 404 });
    }

    let thread = null;
    if (replyToThreadId) {
      thread = await prisma.inboxThread.findUnique({ where: { id: replyToThreadId } }).catch(() => null);
    }
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
      data: { threadId: thread.id, from: fromAddr, to: toAddr, subject, textBody, htmlBody: htmlBody ?? null, isRead: false },
    });

    // Sender's copy in Sent
    const senderMailbox = await prisma.mailbox.findUnique({ where: { email: fromAddr } });
    if (senderMailbox) {
      const sentThread = await prisma.inboxThread.findFirst({
        where: { mailboxId: senderMailbox.id, subject: { contains: cleanSubject, mode: "insensitive" } },
        orderBy: { createdAt: "desc" },
      }) ?? await prisma.inboxThread.create({
        data: { subject: cleanSubject, mailboxId: senderMailbox.id },
      });
      await prisma.inboxMessage.create({
        data: { threadId: sentThread.id, from: fromAddr, to: toAddr, subject, textBody, htmlBody: htmlBody ?? null, isRead: true },
      });
    }

    void prisma.mailboxAccess.findFirst({
      where: { mailboxId: recipientMailbox.id, role: "OWNER" },
      select: { userId: true },
    }).then(async (owner) => {
      if (!owner) return;
      const tokens = await getTokensForUser(owner.userId);
      if (tokens.length) {
        await sendExpoPush(tokens, {
          title: `New mail from ${sender.fullName}`,
          body: subject,
          data: { type: "email", threadId: thread!.id },
        });
      }
    }).catch(() => {});

    return NextResponse.json({ ok: true, delivery: "internal" });
  }

  try {
    await sendEmail(
      subject,
      textBody,
      { email: toAddr, name: toAddr.split("@")[0], status: "Direct" },
      sender.signature ? { fullName: sender.fullName, title: sender.signature.title, html: sender.signature.html } : undefined,
      `${sender.fullName} <${fromAddr}>`,
    );
    return NextResponse.json({ ok: true, delivery: "external" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Send failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
