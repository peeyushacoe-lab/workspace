import { NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// Mark all messages in channel as read by this user
export async function POST(request: Request, { params }: Params) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: channelId } = await params;

  const membership = await prisma.chatMember.findUnique({
    where: { channelId_userId: { channelId, userId: user.userId } },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Get unread messages (not yet read by this user)
  const unread = await prisma.chatMessage.findMany({
    where: {
      channelId,
      deletedAt: null,
      readBy: { none: { userId: user.userId } },
    },
    select: { id: true },
    take: 200,
  });

  if (unread.length > 0) {
    await prisma.chatMessageRead.createMany({
      data: unread.map(m => ({
        messageId: m.id,
        userId: user.userId,
        channelId,
      })),
      skipDuplicates: true,
    });
  }

  return NextResponse.json({ ok: true, marked: unread.length });
}

// Get read status for specific messages (pass ?messageIds=id1,id2)
export async function GET(request: Request, { params }: Params) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: channelId } = await params;
  const { searchParams } = new URL(request.url);
  const ids = searchParams.get("messageIds")?.split(",").filter(Boolean) ?? [];

  if (ids.length === 0) return NextResponse.json({ reads: {} });

  const reads = await prisma.chatMessageRead.findMany({
    where: { messageId: { in: ids }, channelId },
    select: { messageId: true, userId: true },
  });

  // Group by messageId → list of userIds who read it
  const result: Record<string, string[]> = {};
  for (const r of reads) {
    (result[r.messageId] ??= []).push(r.userId);
  }

  return NextResponse.json({ reads: result });
}
