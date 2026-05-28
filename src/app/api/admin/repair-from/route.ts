import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/admin/repair-from
// Finds InboxMessages where `from` is a Resend bounce-tracking address
// (@send.cybersage.uk) and attempts to recover the real sender from EmailLog.
// Pass { purge: true } to delete threads that can't be repaired.
export async function POST(request: NextRequest) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({})) as { purge?: boolean };
  const purge = body.purge === true;

  // Find all messages with Resend bounce addresses as sender
  const badMessages = await prisma.inboxMessage.findMany({
    where: { from: { contains: "@send." } },
    select: { id: true, to: true, subject: true, from: true, receivedAt: true, threadId: true },
  });

  let fixed = 0;
  let purged = 0;
  let couldNotResolve = 0;
  const purgedThreadIds = new Set<string>();

  for (const msg of badMessages) {
    // Try to find matching EmailLog by recipient + subject to recover the real sender
    const log = await prisma.emailLog.findFirst({
      where: {
        recipient: msg.to ?? undefined,
        subject: msg.subject ?? undefined,
        createdAt: {
          gte: new Date((msg.receivedAt ?? new Date()).getTime() - 60_000),
          lte: new Date((msg.receivedAt ?? new Date()).getTime() + 60_000),
        },
      },
      select: { userId: true },
    });

    let resolvedFrom: string | null = null;

    if (log?.userId) {
      const sender = await prisma.user.findUnique({
        where: { id: log.userId },
        select: { email: true },
      });
      resolvedFrom = sender?.email ?? null;
    }

    if (resolvedFrom) {
      await prisma.inboxMessage.update({
        where: { id: msg.id },
        data: { from: resolvedFrom },
      });
      fixed++;
    } else if (purge) {
      await prisma.inboxMessage.delete({ where: { id: msg.id } });
      purgedThreadIds.add(msg.threadId);
      purged++;
    } else {
      couldNotResolve++;
    }
  }

  // Remove threads that are now empty after purging
  if (purgedThreadIds.size > 0) {
    for (const threadId of purgedThreadIds) {
      const remaining = await prisma.inboxMessage.count({ where: { threadId } });
      if (remaining === 0) {
        await prisma.inboxThread.delete({ where: { id: threadId } }).catch(() => {});
      }
    }
  }

  return NextResponse.json({
    ok: true,
    total: badMessages.length,
    fixed,
    purged,
    couldNotResolve,
    emptyThreadsRemoved: purgedThreadIds.size,
  });
}
