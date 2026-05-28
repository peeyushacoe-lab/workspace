/**
 * Mobile Sync — Phase 21
 * Returns a delta bundle of changes since the client's last sync timestamp.
 * Used by the mobile app for offline-first reads.
 */
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const since = new Date(request.nextUrl.searchParams.get("since") ?? 0);

  const [threads, messages, notifications, presence] = await Promise.all([
    // Inbox threads updated since last sync
    prisma.inboxThread.findMany({
      where: {
        mailbox: { accessLogs: { some: { userId: user.id } } },
        updatedAt: { gte: since },
      },
      select: {
        id: true, subject: true, isStarred: true, isArchived: true, isTrashed: true,
        priority: true, labels: true, updatedAt: true,
        _count: { select: { messages: { where: { isRead: false } } } },
      },
      take: 200,
      orderBy: { updatedAt: "desc" },
    }),

    // New inbox messages since last sync
    prisma.inboxMessage.findMany({
      where: {
        thread: { mailbox: { accessLogs: { some: { userId: user.id } } } },
        receivedAt: { gte: since },
      },
      select: { id: true, threadId: true, from: true, subject: true, isRead: true, receivedAt: true },
      take: 200,
      orderBy: { receivedAt: "desc" },
    }),

    // Unread notifications
    prisma.notification.findMany({
      where: { userId: user.id, read: false },
      select: { id: true, type: true, title: true, body: true, link: true, createdAt: true },
      take: 50,
      orderBy: { createdAt: "desc" },
    }),

    // Own presence
    prisma.userPresence.findUnique({
      where: { userId: user.id },
      select: { status: true, statusMessage: true, lastSeenAt: true },
    }),
  ]);

  return NextResponse.json({
    syncedAt: new Date().toISOString(),
    threads,
    messages,
    notifications,
    presence,
  });
}
