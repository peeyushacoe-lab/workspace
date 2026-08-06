import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// ─── Connect Home summary ─────────────────────────────────────────────────────
// One request backing the Home screen, which answers a single question: what
// needs a reply from me right now?
//
// Everything here is derived from tables that already exist — ChatChannel /
// ChatMember / ChatMessage / Meeting / DrivePermission / Notification. Connect
// stores no counters of its own, so these numbers can never drift from Nexus.

export const dynamic = "force-dynamic";

export type ConnectHomeCounts = {
  unreadConversations: number;
  mentions: number;
  meetingsToday: number;
  filesShared: number;
  notifications: number;
};

export type ConnectConversation = {
  channelId: string;
  /** DM: the other person's name. Channel/group: the channel name. */
  title: string;
  kind: "DIRECT" | "GROUP" | "CHANNEL";
  preview: string;
  authorName: string;
  at: string;
  unread: boolean;
};

export type ConnectMeeting = {
  id: string;
  title: string;
  at: string | null;
  status: string;
  roomName: string;
};

export type ConnectHomeResponse = {
  greetingName: string;
  counts: ConnectHomeCounts;
  conversations: ConnectConversation[];
  upcoming: ConnectMeeting[];
};

/** Local start/end of the calendar day, used for "today's meetings". */
function dayBounds(now: Date) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The shell polls for sidebar badges and needs only the counts. Skipping the
  // conversation and meeting assembly keeps that poll cheap enough to run on
  // every Connect page, not just Home.
  const countsOnly = new URL(request.url).searchParams.get("counts") === "1";

  const userId = currentUser.id;
  const now = new Date();
  const { start: dayStart, end: dayEnd } = dayBounds(now);

  // Channel memberships carry lastReadAt, which is what makes "unread" mean
  // anything. One query, reused for both the counts and the recent list.
  const memberships = await prisma.chatMember.findMany({
    where: { userId },
    select: {
      channelId: true,
      lastReadAt: true,
      channel: {
        select: {
          id: true,
          name: true,
          type: true,
          members: {
            select: { user: { select: { id: true, fullName: true } } },
          },
          messages: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              content: true,
              createdAt: true,
              userId: true,
              user: { select: { fullName: true } },
            },
          },
        },
      },
    },
  });

  const channelIds = memberships.map((m) => m.channelId);
  const lastReadByChannel = new Map(memberships.map((m) => [m.channelId, m.lastReadAt]));

  // ── Unread conversations ──
  // Counted per channel rather than per message: the question is "how many
  // threads are waiting on me", not "how many lines have I not read". Messages
  // the user sent themselves never count as unread.
  let unreadConversations = 0;
  for (const m of memberships) {
    const latest = m.channel.messages[0];
    if (!latest) continue;
    if (latest.userId === userId) continue;
    if (!m.lastReadAt || latest.createdAt > m.lastReadAt) unreadConversations++;
  }

  // ── Mentions ──
  // An @mention is an explicit request for a reply, so it is counted separately
  // from ordinary unread traffic even though it lives in the same table.
  const mentionRows = channelIds.length
    ? await prisma.chatMessage.findMany({
        where: {
          channelId: { in: channelIds },
          mentionedUserIds: { has: userId },
          deletedAt: null,
          userId: { not: userId },
        },
        select: { channelId: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 200,
      })
    : [];

  const mentions = mentionRows.filter((row) => {
    const lastRead = lastReadByChannel.get(row.channelId);
    return !lastRead || row.createdAt > lastRead;
  }).length;

  if (countsOnly) {
    // Meetings/files/notifications still cost three cheap counts, but none of
    // the per-channel assembly below.
    const [meetingsToday, filesSharedCount, notificationCount] = await Promise.all([
      prisma.meeting.count({
        where: {
          status: { in: ["SCHEDULED", "LIVE"] },
          scheduledAt: { gte: dayStart, lt: dayEnd },
          OR: [{ organizerId: userId }, { participants: { some: { userId } } }],
        },
      }),
      prisma.drivePermission.count({
        where: {
          userId,
          fileId: { not: null },
          createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.notification.count({ where: { userId, read: false } }),
    ]);

    const counts: ConnectHomeCounts = {
      unreadConversations,
      mentions,
      meetingsToday,
      filesShared: filesSharedCount,
      notifications: notificationCount,
    };
    return NextResponse.json({
      greetingName: currentUser.fullName.split(" ")[0] ?? currentUser.fullName,
      counts,
      conversations: [],
      upcoming: [],
    } satisfies ConnectHomeResponse);
  }

  const [meetingRows, filesShared, notifications] = await Promise.all([
    // Today's meetings — organising or attending, not cancelled or finished.
    prisma.meeting.findMany({
      where: {
        status: { in: ["SCHEDULED", "LIVE"] },
        scheduledAt: { gte: dayStart, lt: dayEnd },
        OR: [{ organizerId: userId }, { participants: { some: { userId } } }],
      },
      select: { id: true, title: true, scheduledAt: true, status: true, roomName: true },
      orderBy: { scheduledAt: "asc" },
      take: 10,
    }),
    // Files someone gave this user access to in the last week. DrivePermission
    // also backs public share links, which have a userId of null — the filter
    // below keeps those out of a personal count.
    prisma.drivePermission.count({
      where: {
        userId,
        fileId: { not: null },
        createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.notification.count({ where: { userId, read: false } }),
  ]);

  // ── Recent conversations ──
  const conversations: ConnectConversation[] = memberships
    .filter((m) => m.channel.messages.length > 0)
    .map((m) => {
      const latest = m.channel.messages[0];
      const isDirect = m.channel.type === "DIRECT";

      // A DM has no meaningful name of its own — it is "the conversation with
      // X", so resolve the other member rather than showing a generated title.
      const other = isDirect
        ? m.channel.members.find((mm) => mm.user.id !== userId)?.user.fullName
        : undefined;

      return {
        channelId: m.channel.id,
        title: other ?? m.channel.name,
        kind: m.channel.type as ConnectConversation["kind"],
        preview: latest.content.slice(0, 140),
        authorName: latest.userId === userId ? "You" : latest.user.fullName,
        at: latest.createdAt.toISOString(),
        unread:
          latest.userId !== userId &&
          (!m.lastReadAt || latest.createdAt > m.lastReadAt),
      };
    })
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);

  const payload: ConnectHomeResponse = {
    greetingName: currentUser.fullName.split(" ")[0] ?? currentUser.fullName,
    counts: {
      unreadConversations,
      mentions,
      meetingsToday: meetingRows.length,
      filesShared,
      notifications,
    },
    conversations,
    upcoming: meetingRows.map((m) => ({
      id: m.id,
      title: m.title,
      at: m.scheduledAt ? m.scheduledAt.toISOString() : null,
      status: m.status,
      roomName: m.roomName,
    })),
  };

  return NextResponse.json(payload);
}
