import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { emitEvent } from "@/lib/events";
import { getTokensForUser, sendExpoPush } from "@/lib/expo-push";
import { sendWebPush } from "@/lib/web-push";
import type { PushSubscriptionJSON } from "@/lib/web-push";
import { shouldNotify } from "@/lib/notif-prefs";
import { indexingQueue } from "@/lib/queues/indexing.queue";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: channelId } = await params;

  const membership = await prisma.chatMember.findUnique({
    where: { channelId_userId: { channelId, userId: user.id } },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const before = searchParams.get("before");
  const after = searchParams.get("after");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);
  const parentId = searchParams.get("parentId");

  // Without an `after` cursor (initial load, or "load older" via `before`) we want
  // the messages *closest to now* — fetch newest-first and take the limit, then
  // reverse to chronological order for display. Fetching ascending with no lower
  // bound (the old behavior) returned the OLDEST messages in the channel's entire
  // history instead, which is why old channels appeared stuck showing days-old
  // messages until the poller slowly crawled forward chunk by chunk.
  const fetchNewestFirst = !after;

  const messageQuery = {
    where: {
      channelId,
      parentId: parentId ?? null,
      ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      ...(after ? { createdAt: { gt: new Date(after) } } : {}),
    },
    include: {
      user: { select: { id: true, fullName: true, avatarUrl: true, role: true } },
      reactions: {
        include: { user: { select: { id: true, fullName: true } } },
      },
      replies: {
        where: { deletedAt: null },
        select: { id: true },
      },
    },
    orderBy: { createdAt: fetchNewestFirst ? ("desc" as const) : ("asc" as const) },
    take: limit,
  };

  // Fall back without deletedAt filter if the column doesn't exist in DB yet
  const rawMessages = await prisma.chatMessage.findMany(messageQuery).catch(() =>
    prisma.chatMessage.findMany({
      ...messageQuery,
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true, role: true } },
        reactions: {
          include: { user: { select: { id: true, fullName: true } } },
        },
        replies: { select: { id: true } },
      },
    })
  );

  const messages = fetchNewestFirst ? rawMessages.reverse() : rawMessages;

  // Update last-read in parallel with the response — fire-and-forget is fine here.
  prisma.chatMember.update({
    where: { channelId_userId: { channelId, userId: user.id } },
    data: { lastReadAt: new Date() },
    select: { id: true },
  }).catch(() => {});

  const response = NextResponse.json(messages);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function POST(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: channelId } = await params;

  const [membership, channel] = await Promise.all([
    prisma.chatMember.findUnique({ where: { channelId_userId: { channelId, userId: user.id } } }),
    prisma.chatChannel.findUnique({ where: { id: channelId }, select: { isBroadcast: true } }).catch(() => null),
  ]);
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // Broadcast channels: only ADMIN members (the creator) can post
  if (channel?.isBroadcast && membership.role !== "ADMIN") {
    return NextResponse.json({ error: "Only the channel owner can post in a broadcast channel" }, { status: 403 });
  }

  const { content, parentId, isUrgent, attachmentUrl, attachmentMime, attachmentName } = (await request.json()) as {
    content?: string;
    parentId?: string;
    isUrgent?: boolean;
    attachmentUrl?: string;
    attachmentMime?: string;
    attachmentName?: string;
  };

  if (!content?.trim() && !attachmentUrl) {
    return NextResponse.json({ error: "Message content is required" }, { status: 400 });
  }

  if (content && content.length > 10_000) {
    return NextResponse.json({ error: "Message too long (max 10,000 characters)" }, { status: 400 });
  }

  const message = await prisma.chatMessage.create({
    data: {
      channelId,
      userId: user.id,
      content: content?.trim() ?? "",
      parentId: parentId ?? null,
      isUrgent: isUrgent === true,
      ...(attachmentUrl ? { attachmentUrl, attachmentMime: attachmentMime ?? null, attachmentName: attachmentName ?? null } : {}),
    },
    include: {
      user: { select: { id: true, fullName: true, avatarUrl: true, role: true } },
      reactions: true,
      replies: { select: { id: true } },
    },
  });

  // Update channel timestamp for ordering — fire-and-forget, not on critical path.
  prisma.chatChannel.update({
    where: { id: channelId },
    data: { updatedAt: new Date() },
    select: { id: true },
  }).catch(() => {});

  // Broadcast to SSE subscribers via Redis pub/sub — non-fatal if Redis is unavailable
  await redis.publish(`chat:channel:${channelId}`, JSON.stringify({ type: "message", data: message })).catch((err: Error) => {
    console.error("[chat/messages] Redis publish failed:", err.message);
  });

  emitEvent("CHAT_MESSAGE_CREATED", {
    channelId,
    messageId: message.id,
    actorId: user.id,
    hasAttachment: false,
    content: (content ?? "").trim().slice(0, 200),
  });

  // Queue for full-text search indexing — fire-and-forget
  if (content?.trim()) {
    indexingQueue.add("index-chat-message", {
      type: "INDEX",
      resource: "chat_message",
      resourceId: message.id,
      content: content.trim(),
      metadata: {
        channelId,
        senderName: user.fullName,
        createdAt: message.createdAt.toISOString(),
      },
    }).catch(() => {});
  }

  // Fire push to other channel members (non-fatal)
  void (async () => {
    const [members, channel] = await Promise.all([
      prisma.chatMember.findMany({
        where: { channelId, NOT: { userId: user.id } },
        select: { userId: true },
      }).catch(() => [] as { userId: string }[]),
      prisma.chatChannel.findUnique({ where: { id: channelId }, select: { name: true, type: true } }).catch(() => null),
    ]);

    const memberIds = members.map((m) => m.userId);
    const displayContent = (content?.trim() || attachmentName || "Attachment").slice(0, 100);
    const pushTitle = `${isUrgent ? "🚨 " : ""}#${channel?.name ?? "Chat"}: ${user.fullName}`;

    // Expo mobile push
    const tokenArrays = await Promise.all(members.map((m) => getTokensForUser(m.userId)));
    const allTokens = tokenArrays.flat();
    if (allTokens.length) {
      await sendExpoPush(allTokens, {
        title: pushTitle,
        body: displayContent,
        data: { type: "chat", channelId },
      });
    }

    // Web push — always for DMs; urgent-only for group channels
    // Respects each recipient's notification preferences
    const isDM = channel?.type === "DIRECT";
    if ((isDM || isUrgent) && memberIds.length) {
      // Fetch preferences for all recipients in one query
      const memberUsers = await prisma.user.findMany({
        where: { id: { in: memberIds } },
        select: { id: true, preferences: true },
      }).catch(() => [] as { id: string; preferences: unknown }[]);
      const prefsByUserId = new Map(memberUsers.map((u) => [u.id, (u.preferences ?? {}) as Record<string, unknown>]));

      // notifType: DM → chatMentions, group channel → chatMentions (both use same key)
      const notifType = "chatMentions" as const;
      const eligibleIds = memberIds.filter((id) => shouldNotify(prefsByUserId.get(id) ?? {}, notifType, "push"));

      if (eligibleIds.length) {
        const pushLogs = await prisma.auditLog.findMany({
          where: { actorId: { in: eligibleIds }, action: "PUSH_SUBSCRIBE" },
          select: { id: true, actorId: true, metadata: true },
        }).catch(() => []);
        const stale: string[] = [];
        await Promise.all(
          pushLogs.map(async (log) => {
            const sub = log.metadata as unknown as PushSubscriptionJSON;
            if (!sub?.endpoint) return;
            try {
              await sendWebPush(sub, {
                title: isDM ? `💬 ${user.fullName}` : pushTitle,
                body: displayContent,
                url: "/chat",
                tag: `chat-${channelId}`,
              });
            } catch {
              stale.push(log.id);
            }
          })
        );
        if (stale.length) {
          await prisma.auditLog.deleteMany({ where: { id: { in: stale } } }).catch(() => {});
        }
      }
    }
  })();

  return NextResponse.json(message, { status: 201 });
}
