import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { content } = (await request.json()) as { content: string };

  if (!content?.trim()) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  const existing = await prisma.chatMessage.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await prisma.chatMessage.update({
    where: { id },
    data: { content: content.trim(), editedAt: new Date() },
    include: {
      user: { select: { id: true, fullName: true, avatarUrl: true, role: true } },
      reactions: { include: { user: { select: { id: true, fullName: true } } } },
      replies: { where: { deletedAt: null }, select: { id: true } },
    },
  });

  await redis.publish(
    `chat:channel:${existing.channelId}`,
    JSON.stringify({ type: "message_updated", data: updated })
  );

  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const existing = await prisma.chatMessage.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isAdmin = user.role === "ADMIN";
  if (existing.userId !== user.id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.chatMessage.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await redis.publish(
    `chat:channel:${existing.channelId}`,
    JSON.stringify({ type: "message_deleted", data: { id } })
  );

  return new Response(null, { status: 204 });
}
