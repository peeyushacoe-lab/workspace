import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/admin/repair-from
// Finds InboxMessages where `from` is a Resend bounce-tracking address
// (@send.cybersage.uk) and attempts to recover the real sender from EmailLog.
// For messages where no EmailLog match exists, falls back to "unknown@cybersage.uk".
export async function POST() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Find all messages with Resend bounce addresses as sender
  const badMessages = await prisma.inboxMessage.findMany({
    where: { from: { contains: "@send.cybersage.uk" } },
    select: { id: true, to: true, subject: true, from: true, receivedAt: true },
  });

  let fixed = 0;
  let couldNotResolve = 0;

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
    } else {
      couldNotResolve++;
    }
  }

  return NextResponse.json({
    ok: true,
    total: badMessages.length,
    fixed,
    couldNotResolve,
  });
}
