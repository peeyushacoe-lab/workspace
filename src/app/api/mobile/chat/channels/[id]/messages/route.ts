import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileUser } from "@/lib/mobile-auth";
import { getTokensForUser, sendExpoPush } from "@/lib/expo-push";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: channelId } = await params;
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);
  const before = searchParams.get("before");

  const membership = await prisma.chatMember.findUnique({
    where: { channelId_userId: { channelId, userId: user.userId } },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const messages = await prisma.chatMessage.findMany({
    where: {
      channelId,
      deletedAt: null,
      ...(before ? { createdAt: { lt: new Date(before) } } : {}),
    },
    include: {
      user: { select: { id: true, fullName: true, avatarUrl: true } },
      reactions: { include: { user: { select: { id: true, fullName: true } } } },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  // Fire-and-forget last-read update
  prisma.chatMember.update({
    where: { channelId_userId: { channelId, userId: user.userId } },
    data: { lastReadAt: new Date() },
    select: { id: true },
  }).catch(() => {});

  return NextResponse.json(messages.map((m) => ({
    id: m.id,
    content: m.content,
    createdAt: m.createdAt,
    sender: { id: m.user.id, fullName: m.user.fullName, avatarUrl: m.user.avatarUrl },
    reactions: m.reactions.map((r) => ({ emoji: r.emoji, user: r.user.fullName })),
  })));
}

export async function POST(request: Request, { params }: Params) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: channelId } = await params;

  const membership = await prisma.chatMember.findUnique({
    where: { channelId_userId: { channelId, userId: user.userId } },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { content } = await request.json() as { content?: string };
  if (!content?.trim()) return NextResponse.json({ error: "content required" }, { status: 400 });
  if (content.length > 10_000) return NextResponse.json({ error: "Message too long" }, { status: 400 });

  const sender = await prisma.user.findUnique({ where: { id: user.userId }, select: { fullName: true } });

  const message = await prisma.chatMessage.create({
    data: { channelId, userId: user.userId, content: content.trim() },
    include: {
      user: { select: { id: true, fullName: true, avatarUrl: true } },
      reactions: true,
    },
  });

  prisma.chatChannel.update({ where: { id: channelId }, data: { updatedAt: new Date() }, select: { id: true } }).catch(() => {});

  // Push to other members
  void prisma.chatMember.findMany({
    where: { channelId, NOT: { userId: user.userId } },
    select: { userId: true },
  }).then(async (members) => {
    const channel = await prisma.chatChannel.findUnique({ where: { id: channelId }, select: { name: true } }).catch(() => null);
    const tokenArrays = await Promise.all(members.map((m) => getTokensForUser(m.userId)));
    const tokens = tokenArrays.flat();
    if (tokens.length) {
      await sendExpoPush(tokens, {
        title: `#${channel?.name ?? "Chat"}: ${sender?.fullName ?? "Someone"}`,
        body: content.trim().slice(0, 100),
        data: { type: "chat", channelId },
      });
    }
  }).catch(() => {});

  return NextResponse.json({
    id: message.id,
    content: message.content,
    createdAt: message.createdAt,
    sender: { id: message.user.id, fullName: message.user.fullName, avatarUrl: message.user.avatarUrl },
    reactions: [],
  }, { status: 201 });
}
