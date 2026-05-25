import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileUser } from "@/lib/mobile-auth";

type Params = { params: Promise<{ id: string; msgId: string }> };

export async function GET(request: Request, { params }: Params) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: channelId, msgId } = await params;

  const membership = await prisma.chatMember.findUnique({
    where: { channelId_userId: { channelId, userId: user.userId } },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parent = await prisma.chatMessage.findUnique({
    where: { id: msgId, channelId, deletedAt: null },
    include: {
      user: { select: { id: true, fullName: true, avatarUrl: true } },
      reactions: { include: { user: { select: { id: true, fullName: true } } } },
      _count: { select: { replies: true } },
      saved: { where: { userId: user.userId }, select: { id: true } },
    },
  });
  if (!parent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const replies = await prisma.chatMessage.findMany({
    where: { parentId: msgId, deletedAt: null },
    include: {
      user: { select: { id: true, fullName: true, avatarUrl: true } },
      reactions: { include: { user: { select: { id: true, fullName: true } } } },
      saved: { where: { userId: user.userId }, select: { id: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const toMsg = (m: typeof parent | typeof replies[0]) => ({
    id: m.id,
    content: m.content,
    createdAt: m.createdAt,
    sender: { id: m.user.id, fullName: m.user.fullName, avatarUrl: m.user.avatarUrl },
    reactions: m.reactions.map((r) => ({ emoji: r.emoji, user: r.user.fullName })),
    isSaved: m.saved.length > 0,
  });

  return NextResponse.json({
    parent: { ...toMsg(parent), replyCount: parent._count.replies },
    replies: replies.map(toMsg),
  });
}
