import { NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ msgId: string }> };

export async function POST(request: Request, { params }: Params) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { msgId } = await params;
  const { emoji } = await request.json() as { emoji?: string };
  if (!emoji) return NextResponse.json({ error: "emoji required" }, { status: 400 });

  const message = await prisma.chatMessage.findUnique({
    where: { id: msgId },
    select: { channelId: true },
  });
  if (!message) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = await prisma.chatMember.findUnique({
    where: { channelId_userId: { channelId: message.channelId, userId: user.userId } },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Toggle: if already reacted with this emoji, remove it
  const existing = await prisma.chatReaction.findUnique({
    where: { messageId_userId_emoji: { messageId: msgId, userId: user.userId, emoji } },
  });

  if (existing) {
    await prisma.chatReaction.delete({ where: { id: existing.id } });
    return NextResponse.json({ toggled: false });
  }

  await prisma.chatReaction.create({
    data: { messageId: msgId, userId: user.userId, emoji },
  });

  return NextResponse.json({ toggled: true });
}
