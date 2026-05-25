import { NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

export async function POST(request: Request) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { messageId, toChannelId } = await request.json() as {
    messageId: string;
    toChannelId: string;
  };

  if (!messageId || !toChannelId) {
    return NextResponse.json({ error: "messageId and toChannelId required" }, { status: 400 });
  }

  const [original, membership] = await Promise.all([
    prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { content: true, userId: true },
    }),
    prisma.chatMember.findUnique({
      where: { channelId_userId: { channelId: toChannelId, userId: user.userId } },
    }),
  ]);

  if (!original) return NextResponse.json({ error: "Message not found" }, { status: 404 });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const fwd = await prisma.chatMessage.create({
    data: {
      channelId: toChannelId,
      userId: user.userId,
      content: original.content,
      forwardedFromId: messageId,
    },
    include: {
      user: { select: { id: true, fullName: true, avatarUrl: true } },
      reactions: true,
    },
  });

  redis.publish(
    `chat:channel:${toChannelId}`,
    JSON.stringify({ type: "message", data: fwd }),
  ).catch(() => {});

  return NextResponse.json(fwd);
}
