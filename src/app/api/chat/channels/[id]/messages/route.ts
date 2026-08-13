import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { deliverChatMessage } from "@/lib/chat/deliver";
import { enforceChatLimit } from "@/lib/chat/limits";
import { readConnectSettings } from "@/lib/connect-settings";
import { policiesForUser } from "@/lib/connect-policies";

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
      quotedMessage: {
        select: {
          id: true,
          content: true,
          deletedAt: true,
          user: { select: { id: true, fullName: true } },
        },
      },
      readBy: {
        select: { userId: true, readAt: true, user: { select: { fullName: true } } },
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
        quotedMessage: {
          select: {
            id: true,
            content: true,
            deletedAt: true,
            user: { select: { id: true, fullName: true } },
          },
        },
        readBy: {
          select: { userId: true, readAt: true, user: { select: { fullName: true } } },
        },
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

  // Mark the fetched messages (from other people) as read by this user — mirrors
  // WhatsApp semantics: opening/viewing a conversation marks its messages seen.
  // Fire-and-forget; broadcast a `read` event over the same Redis channel bridge
  // used for `message`/`reactions_updated` so open clients update instantly.
  void (async () => {
    const unreadIds = messages.filter((m) => m.userId !== user.id).map((m) => m.id);
    if (!unreadIds.length) return;

    // Privacy → "Send read receipts". Enforced here rather than by hiding the
    // ticks in the reader's UI, because the sender's client is what displays
    // them: suppressing the display on the wrong machine would leave the
    // receipt fully visible to the one person it was meant to be withheld
    // from. Opting out means the row is never written and nothing is
    // published — `lastReadAt` above still updates, so the reader's own unread
    // badge keeps working.
    const reader = await prisma.user
      .findUnique({ where: { id: user.id }, select: { preferences: true } })
      .catch(() => null);
    if (!readConnectSettings(reader?.preferences).privacy.shareReadReceipts) return;

    const readAt = new Date();
    try {
      await prisma.chatMessageRead.createMany({
        data: unreadIds.map((messageId) => ({ messageId, userId: user.id, channelId, readAt })),
        skipDuplicates: true,
      });
      await redis.publish(
        `chat:channel:${channelId}`,
        JSON.stringify({
          type: "read",
          data: { channelId, userId: user.id, fullName: user.fullName, messageIds: unreadIds, readAt: readAt.toISOString() },
        })
      );
    } catch {
      // non-fatal
    }
  })();

  const response = NextResponse.json(messages);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function POST(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Each send writes a row, indexes it, and fans out push + in-app
  // notifications per recipient — the most expensive request in Connect.
  const limited = await enforceChatLimit("message.send", user.id);
  if (limited) return limited;

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

  const { content, parentId, quotedMessageId, isUrgent, attachmentUrl, attachmentMime, attachmentName } = (await request.json()) as {
    content?: string;
    parentId?: string;
    quotedMessageId?: string;
    isUrgent?: boolean;
    attachmentUrl?: string;
    attachmentMime?: string;
    attachmentName?: string;
  };

  if (!content?.trim() && !attachmentUrl) {
    return NextResponse.json({ error: "Message content is required" }, { status: 400 });
  }

  // Organisation policy. Falls back to the previous hard-coded limits when no
  // policy is set, so nothing changes until an admin deliberately changes it.
  const policies = await policiesForUser(user.id);

  if (content && content.length > policies.messaging.maxMessageLength) {
    return NextResponse.json(
      { error: `Message too long (max ${policies.messaging.maxMessageLength.toLocaleString()} characters)` },
      { status: 400 },
    );
  }
  if (attachmentUrl && !policies.messaging.allowAttachments) {
    return NextResponse.json(
      { error: "Attachments are turned off for this workspace" },
      { status: 403 },
    );
  }
  // Urgent bypasses everyone's notification preferences, which is precisely
  // why an organisation may want it off. Downgrade rather than reject — the
  // message itself is fine, only the flag isn't.
  const urgentAllowed = policies.messaging.allowUrgent && isUrgent === true;

  // Create + broadcast + index + notify. Shared with the scheduled-send worker
  // so a message delivered an hour late is indistinguishable from one sent now.
  const message = await deliverChatMessage(
    { id: user.id, fullName: user.fullName },
    {
      channelId,
      content: content ?? "",
      parentId,
      quotedMessageId,
      isUrgent: urgentAllowed,
      attachmentUrl,
      attachmentMime,
      attachmentName,
      allowBroadcast: policies.messaging.allowBroadcastMentions,
    },
  );

  return NextResponse.json(message, { status: 201 });
}
