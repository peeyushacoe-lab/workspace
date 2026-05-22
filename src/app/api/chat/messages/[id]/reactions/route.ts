import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: messageId } = await params;
  const { emoji } = (await request.json()) as { emoji: string };

  if (!emoji?.trim()) {
    return NextResponse.json({ error: "Emoji is required" }, { status: 400 });
  }

  const message = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    select: { channelId: true, deletedAt: true },
  });
  if (!message || message.deletedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Verify membership
  const membership = await prisma.chatMember.findUnique({
    where: { channelId_userId: { channelId: message.channelId, userId: user.id } },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Toggle: remove if exists, add if not
  const existing = await prisma.chatReaction.findUnique({
    where: { messageId_userId_emoji: { messageId, userId: user.id, emoji } },
  });

  if (existing) {
    await prisma.chatReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.chatReaction.create({ data: { messageId, userId: user.id, emoji } });
  }

  // Fetch updated reactions for broadcast
  const reactions = await prisma.chatReaction.findMany({
    where: { messageId },
    include: { user: { select: { id: true, fullName: true } } },
  });

  await redis.publish(
    `chat:channel:${message.channelId}`,
    JSON.stringify({ type: "reactions_updated", data: { messageId, reactions } })
  );

  return NextResponse.json({ messageId, reactions });
}
