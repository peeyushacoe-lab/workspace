import { NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: channelId } = await params;

  const membership = await prisma.chatMember.findUnique({
    where: { channelId_userId: { channelId, userId: user.userId } },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { question, options, isMultiple } = await request.json() as {
    question: string;
    options: string[];
    isMultiple?: boolean;
  };

  if (!question?.trim() || !options || options.length < 2) {
    return NextResponse.json({ error: "question and at least 2 options required" }, { status: 400 });
  }

  const poll = await prisma.chatPoll.create({
    data: {
      channelId,
      createdById: user.userId,
      question: question.trim(),
      isMultiple: isMultiple ?? false,
      options: {
        create: options.map((text, i) => ({ text: text.trim(), order: i })),
      },
    },
    include: { options: { orderBy: { order: "asc" } } },
  });

  const profile = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { fullName: true, displayName: true, avatarUrl: true },
  });

  const msg = await prisma.chatMessage.create({
    data: {
      channelId,
      userId: user.userId,
      content: `📊 Poll: ${question}`,
      pollId: poll.id,
    },
    include: {
      user: { select: { id: true, fullName: true, avatarUrl: true } },
      reactions: true,
      poll: { include: { options: { include: { votes: true }, orderBy: { order: "asc" } } } },
    },
  });

  redis.publish(`chat:channel:${channelId}`, JSON.stringify({ type: "message", data: msg })).catch(() => {});

  return NextResponse.json(msg, { status: 201 });
}
