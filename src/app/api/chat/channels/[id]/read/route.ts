import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: channelId } = await params;

  const membership = await prisma.chatMember.findUnique({
    where: { channelId_userId: { channelId, userId: user.id } },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const unread = await prisma.chatMessage.findMany({
    where: {
      channelId,
      deletedAt: null,
      readBy: { none: { userId: user.id } },
    },
    select: { id: true },
    take: 500,
  });

  if (unread.length > 0) {
    await prisma.chatMessageRead.createMany({
      data: unread.map(m => ({ messageId: m.id, userId: user.id, channelId })),
      skipDuplicates: true,
    });
  }

  return NextResponse.json({ ok: true, marked: unread.length });
}

export async function GET(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: channelId } = await params;
  const { searchParams } = new URL(request.url);
  const ids = searchParams.get("messageIds")?.split(",").filter(Boolean) ?? [];
  if (ids.length === 0) return NextResponse.json({ reads: {} });

  const reads = await prisma.chatMessageRead.findMany({
    where: { messageId: { in: ids }, channelId },
    select: {
      messageId: true,
      userId: true,
    },
  });

  const result: Record<string, string[]> = {};
  for (const r of reads) {
    (result[r.messageId] ??= []).push(r.userId);
  }

  return NextResponse.json({ reads: result });
}
