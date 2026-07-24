import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidate } from "@/lib/cache";
import { recordSenderFeedback } from "@/lib/sentinel/inbound-scan";

type Params = { params: Promise<{ id: string }> };

// POST /api/inbox/[id]/spam  { action: "report" | "unreport" }
// "report"   — mark the thread as spam and record a spam strike against the sender
// "unreport" — move it back to the inbox and record a "not spam" (ham) signal
export async function POST(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "report" && body.action !== "unreport") {
    return NextResponse.json({ error: "action must be 'report' or 'unreport'" }, { status: 400 });
  }

  const thread = await prisma.inboxThread.findUnique({
    where: { id },
    select: {
      id: true,
      mailboxId: true,
      mailbox: { select: { email: true, accessLogs: { where: { userId: user.id }, select: { userId: true }, take: 1 } } },
      messages: { orderBy: { receivedAt: "desc" }, take: 1, select: { from: true } },
    },
  });
  if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isPrivileged = ["ADMIN", "CEO", "CISO"].includes(user.role);
  const isOwner = thread.mailbox.email === user.email;
  const isAssigned = isOwner || thread.mailbox.accessLogs.length > 0;
  if (!isPrivileged && !isAssigned) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const senderEmail = thread.messages[0]?.from;
  const isSpamReport = body.action === "report";

  await prisma.inboxThread.update({
    where: { id },
    data: {
      isSpam: isSpamReport,
      spamReportedAt: isSpamReport ? new Date() : null,
      // Reporting spam pulls it out of the inbox view; un-reporting restores it.
      isTrashed: false,
    },
  });

  if (senderEmail) {
    await recordSenderFeedback(thread.mailboxId, senderEmail, isSpamReport).catch(() => {});
  }

  await invalidate("unread:*").catch(() => {});

  return NextResponse.json({ ok: true, isSpam: isSpamReport });
}
