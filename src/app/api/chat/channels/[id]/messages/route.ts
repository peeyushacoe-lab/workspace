import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { emitEvent } from "@/lib/events";

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

  const { content, parentId } = (await request.json()) as {
    content: string;
    parentId?: string;
  };

  if (!content?.trim()) {
    return NextResponse.json({ error: "Message content is required" }, { status: 400 });
  }

  if (content.length > 10_000) {
    return NextResponse.json({ error: "Message too long (max 10,000 characters)" }, { status: 400 });
  }

  const message = await prisma.chatMessage.create({
    data: {
      channelId,
      userId: user.id,
      content: content.trim(),
      parentId: parentId ?? null,
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

  // Broadcast to SSE subscribers via Redis pub/sub
  await redis.publish(`chat:channel:${channelId}`, JSON.stringify({ type: "message", data: message }));

  emitEvent("CHAT_MESSAGE_CREATED", {
    channelId,
    messageId: message.id,
    actorId: user.id,
    hasAttachment: false,
    content: content.trim().slice(0, 200),
  });

  return NextResponse.json(message, { status: 201 });
}
