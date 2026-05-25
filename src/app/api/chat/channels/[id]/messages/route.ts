import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { emitEvent } from "@/lib/events";
import { getTokensForUser, sendExpoPush } from "@/lib/expo-push";
import { sendWebPush } from "@/lib/web-push";
import type { PushSubscriptionJSON } from "@/lib/web-push";

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
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);
  const parentId = searchParams.get("parentId");

  const messages = await prisma.chatMessage.findMany({
    where: {
      channelId,
      // Include soft-deleted messages so the client can render "(message deleted)"
      parentId: parentId ?? null,
      ...(before ? { createdAt: { lt: new Date(before) } } : {}),
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
    orderBy: { createdAt: "asc" },
    take: limit,
  });

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

  const membership = await prisma.chatMember.findUnique({
    where: { channelId_userId: { channelId, userId: user.id } },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
      replies: { where: { deletedAt: null }, select: { id: true } },
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

  // Fire push to other channel members (non-fatal)
  void (async () => {
    const [members, channel] = await Promise.all([
      prisma.chatMember.findMany({
        where: { channelId, NOT: { userId: user.id } },
        select: { userId: true },
      }).catch(() => [] as { userId: string }[]),
      prisma.chatChannel.findUnique({ where: { id: channelId }, select: { name: true } }).catch(() => null),
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

    // Web push — urgent messages only (to avoid notification fatigue on web)
    if (isUrgent && memberIds.length) {
      const pushLogs = await prisma.auditLog.findMany({
        where: { actorId: { in: memberIds }, action: "PUSH_SUBSCRIBE" },
        select: { metadata: true },
      }).catch(() => []);
      for (const log of pushLogs) {
        const sub = log.metadata as unknown as PushSubscriptionJSON;
        if (sub?.endpoint) {
          sendWebPush(sub, {
            title: pushTitle,
            body: displayContent,
            url: "/chat",
            tag: `urgent-${channelId}`,
          }).catch(() => {});
        }
      }
    }
  })();

  return NextResponse.json(message, { status: 201 });
}
