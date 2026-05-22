import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const msg = await prisma.chatMessage.findUnique({ where: { id } });
  if (!msg || msg.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = await prisma.chatMember.findUnique({
    where: { channelId_userId: { channelId: msg.channelId, userId: user.id } },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const updated = await prisma.chatMessage.update({
    where: { id },
    data: { isPinned: true },
    include: { user: { select: { id: true, fullName: true } } },
  });

  await redis.publish(
    `chat:channel:${msg.channelId}`,
    JSON.stringify({ type: "message_pinned", data: updated }),
  );

  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const msg = await prisma.chatMessage.findUnique({ where: { id } });
  if (!msg || msg.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = await prisma.chatMember.findUnique({
    where: { channelId_userId: { channelId: msg.channelId, userId: user.id } },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const updated = await prisma.chatMessage.update({
    where: { id },
    data: { isPinned: false },
    include: { user: { select: { id: true, fullName: true } } },
  });

  await redis.publish(
    `chat:channel:${msg.channelId}`,
    JSON.stringify({ type: "message_unpinned", data: updated }),
  );

  return NextResponse.json(updated);
}
