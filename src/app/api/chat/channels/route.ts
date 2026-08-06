import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ChatChannelType } from "@/generated/prisma/enums";
import { enforceChatLimit } from "@/lib/chat/limits";

/**
 * Unread count per channel for one user, in a single query.
 *
 * "Unread" means messages from *other people* since this user last read the
 * channel — own messages never light the badge, and a never-opened channel
 * falls back to `joinedAt` so an auto-joined public channel doesn't report its
 * entire history as unread. The read floor differs per channel, which is why
 * this can't be expressed as one Prisma `groupBy` and drops to SQL.
 */
async function fetchUnreadCounts(userId: string): Promise<Map<string, number>> {
  try {
    const rows = await prisma.$queryRaw<{ channelId: string; count: bigint }[]>`
      SELECT m."channelId" AS "channelId", COUNT(msg.id) AS count
      FROM "ChatMember" m
      LEFT JOIN "ChatMessage" msg
        ON msg."channelId" = m."channelId"
       AND msg."deletedAt" IS NULL
       AND msg."userId" <> m."userId"
       AND msg."createdAt" > COALESCE(m."lastReadAt", m."joinedAt")
      WHERE m."userId" = ${userId}
      GROUP BY m."channelId"
    `;
    return new Map(rows.map((r) => [r.channelId, Number(r.count)]));
  } catch (err) {
    // A badge that reads zero is far better than a conversation list that
    // fails to load, so this degrades rather than throws.
    console.error("[chat/channels] unread count query failed:", err);
    return new Map();
  }
}

type LastMessageRow = {
  channelId: string;
  content: string;
  createdAt: Date;
  userId: string;
  fullName: string;
};

/**
 * Most recent message per channel for one user, in a single query.
 * `DISTINCT ON` is Postgres-specific and this app is Postgres-only.
 */
async function fetchLastMessages(userId: string): Promise<Map<string, LastMessageRow>> {
  try {
    const rows = await prisma.$queryRaw<LastMessageRow[]>`
      SELECT DISTINCT ON (msg."channelId")
        msg."channelId" AS "channelId",
        msg.content      AS content,
        msg."createdAt"  AS "createdAt",
        msg."userId"     AS "userId",
        u."fullName"     AS "fullName"
      FROM "ChatMessage" msg
      JOIN "ChatMember" m ON m."channelId" = msg."channelId" AND m."userId" = ${userId}
      JOIN "User" u ON u.id = msg."userId"
      WHERE msg."deletedAt" IS NULL
      ORDER BY msg."channelId", msg."createdAt" DESC
    `;
    return new Map(rows.map((r) => [r.channelId, r]));
  } catch (err) {
    console.error("[chat/channels] last message query failed:", err);
    return new Map();
  }
}

export async function GET() {
  try {
    const user = getSessionUserFromCookieStore(await cookies());
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Auto-add user to any non-private, non-team channel they're not yet a
    // member of. `teamId: null` is the load-bearing part of this filter: once
    // ChatChannel.teamId exists, a team's channels are also `isPrivate: false`
    // by default (open to the whole team, same as before), and without this
    // exclusion every user in the org would get auto-joined to every team's
    // channels the next time they loaded their chat list. Team channel
    // membership instead tracks TeamMember — see /api/teams/[id]/channels and
    // the join/leave sync in /api/teams/[id]/members.
    //
    // This used to `upsert` once per public channel in a sequential `await`
    // loop, on the single hottest read path in Connect — the client polls this
    // route every 30 s and hits it on every navigation. With 20 public
    // channels that was 20 serial round-trips per poll per user, essentially
    // all of them no-ops because the membership already existed. Read the
    // memberships once, diff in memory, and write only what's actually
    // missing: 2 queries in the steady state, and the second one usually
    // writes nothing.
    const [allPublic, existingMemberships] = await Promise.all([
      prisma.chatChannel.findMany({
        where: { isPrivate: false, teamId: null },
        select: { id: true },
      }),
      prisma.chatMember.findMany({
        where: { userId: user.id },
        select: { channelId: true },
      }),
    ]);
    const joined = new Set(existingMemberships.map((m) => m.channelId));
    const missing = allPublic.filter((ch) => !joined.has(ch.id));
    if (missing.length) {
      await prisma.chatMember.createMany({
        data: missing.map((ch) => ({ channelId: ch.id, userId: user.id, role: "MEMBER" })),
        skipDuplicates: true,
      }).catch(() => {});
    }

    const channels = await prisma.chatChannel.findMany({
      where: {
        members: { some: { userId: user.id } },
      },
      include: {
        members: {
          select: { userId: true, role: true, lastReadAt: true, joinedAt: true },
        },
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Unread counts and last-message previews were also one query *each* per
    // channel — 2N queries to render a list. Both are now a single set-based
    // query across every channel the user is in, so the cost is flat in the
    // number of conversations rather than linear.
    const [unreadByChannel, lastByChannel] = await Promise.all([
      fetchUnreadCounts(user.id),
      fetchLastMessages(user.id),
    ]);

    const channelsWithUnread = channels.map((ch) => {
      const last = lastByChannel.get(ch.id) ?? null;
      const lastMessage = last
        ? {
            content: last.content.startsWith("[FILE_ATTACHMENT] ")
              ? "📎 Attachment"
              : last.content.startsWith("[BOT_RESPONSE] ")
                ? last.content.replace("[BOT_RESPONSE] ", "").slice(0, 120)
                : last.content.startsWith("[CALL_LOG] ")
                  ? "Call"
                  : last.content,
            createdAt: last.createdAt,
            authorName: last.userId === user.id ? "You" : last.fullName.split(" ")[0],
          }
        : null;

      return { ...ch, unreadCount: unreadByChannel.get(ch.id) ?? 0, lastMessage };
    });

    return NextResponse.json(channelsWithUnread, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    console.error("[GET /api/chat/channels]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Creating a channel seeds a ChatMember row per participant, so an unbounded
  // create loop writes rows proportional to org size each time.
  const limited = await enforceChatLimit("channel.create", user.id);
  if (limited) return limited;

  let body: {
    name: string;
    description?: string;
    type?: ChatChannelType;
    isPrivate?: boolean;
    isBroadcast?: boolean;
    memberIds?: string[];
    /** Scopes the new channel under a team — see docs/rfc-003-teams-and-channels.md. */
    teamId?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Channel name is required" }, { status: 400 });
  }

  let memberIds = Array.from(new Set([user.id, ...(body.memberIds ?? [])]));
  let position = 0;

  if (body.teamId) {
    const team = await prisma.team.findFirst({
      where: { id: body.teamId },
      include: { members: { select: { userId: true } }, channels: { select: { position: true } } },
    });
    if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
    if (!team.members.some((m) => m.userId === user.id)) {
      return NextResponse.json({ error: "You are not a member of this team" }, { status: 403 });
    }
    position = team.channels.length
      ? Math.max(...team.channels.map((c) => c.position)) + 1
      : 0;
    // A non-private team channel is open to the whole team, same as a
    // non-private org-wide channel is open to the whole org — membership
    // seeds from the team roster rather than the creator's explicit picks.
    // A private team channel stays invite-only even within the team.
    if (!body.isPrivate) {
      memberIds = Array.from(new Set([...memberIds, ...team.members.map((m) => m.userId)]));
    }
  }

  // Build data without isBroadcast first — add it only if the column exists
  const baseData = {
    name: body.name.trim(),
    description: body.description,
    type: body.type ?? ("CHANNEL" as ChatChannelType),
    isPrivate: body.isPrivate ?? false,
    createdById: user.id,
    ...(body.teamId ? { teamId: body.teamId, position } : {}),
    members: {
      create: memberIds.map((id) => ({
        userId: id,
        role: id === user.id ? "ADMIN" : "MEMBER",
      })),
    },
  };

  try {
    const channel = await prisma.chatChannel.create({
      data: { ...baseData, isBroadcast: body.isBroadcast ?? false },
      include: {
        members: { select: { userId: true, role: true } },
      },
    });
    return NextResponse.json(channel, { status: 201 });
  } catch (err) {
    // isBroadcast column may not exist in DB yet — retry without it
    console.error("[POST /api/chat/channels] primary create failed, retrying without isBroadcast:", (err as Error).message);
    try {
      const channel = await prisma.chatChannel.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: baseData as any,
        include: {
          members: { select: { userId: true, role: true } },
        },
      });
      return NextResponse.json(channel, { status: 201 });
    } catch (innerErr) {
      console.error("[POST /api/chat/channels] fallback create failed:", innerErr);
      return NextResponse.json({ error: "Failed to create channel" }, { status: 500 });
    }
  }
}
