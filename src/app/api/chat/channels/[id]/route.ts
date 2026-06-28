import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/chat/channels/[id] — rename a channel/group (admin or creator only)
export async function PATCH(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: channelId } = await params;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const name = (body as { name?: unknown }).name;
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const membership = await prisma.chatMember.findUnique({
    where: { channelId_userId: { channelId, userId: user.id } },
  });
  if (!membership) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const isSystemAdmin = ["ADMIN", "CEO", "CISO"].includes(user.role);
  if (membership.role !== "ADMIN" && !isSystemAdmin) {
    return NextResponse.json({ error: "Only the channel creator can rename this channel" }, { status: 403 });
  }

  const updated = await prisma.chatChannel.update({
    where: { id: channelId },
    data: { name: name.trim() },
    select: { id: true, name: true },
  });

  return NextResponse.json(updated);
}

// DELETE /api/chat/channels/[id] — only the channel creator (ADMIN role in ChatMember) can delete
export async function DELETE(_request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: channelId } = await params;

  const membership = await prisma.chatMember.findUnique({
    where: { channelId_userId: { channelId, userId: user.id } },
  });

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  // Only channel admins (creator) or system ADMINs can delete
  const isSystemAdmin = ["ADMIN", "CEO", "CISO"].includes(user.role);
  if (membership.role !== "ADMIN" && !isSystemAdmin) {
    return NextResponse.json({ error: "Only the channel creator can delete this channel" }, { status: 403 });
  }

  // Cascade delete: messages → reactions, members, then channel
  await prisma.chatMessage.deleteMany({ where: { channelId } });
  await prisma.chatMember.deleteMany({ where: { channelId } });
  await prisma.chatChannel.delete({ where: { id: channelId } });

  return NextResponse.json({ ok: true });
}
