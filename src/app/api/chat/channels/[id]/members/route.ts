import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// POST — add members to an existing channel
export async function POST(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: channelId } = await params;

  // Only channel admins or workspace admins can add members
  const membership = await prisma.chatMember.findUnique({
    where: { channelId_userId: { channelId, userId: user.id } },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as { userIds: string[] };
  if (!Array.isArray(body.userIds) || body.userIds.length === 0) {
    return NextResponse.json({ error: "userIds is required" }, { status: 400 });
  }

  // Upsert members — skip users already in the channel
  const existing = await prisma.chatMember.findMany({
    where: { channelId, userId: { in: body.userIds } },
    select: { userId: true },
  });
  const existingIds = new Set(existing.map((m) => m.userId));
  const newIds = body.userIds.filter((id) => !existingIds.has(id));

  if (newIds.length === 0) {
    return NextResponse.json({ ok: true, added: 0 });
  }

  await prisma.chatMember.createMany({
    data: newIds.map((userId) => ({ channelId, userId, role: "MEMBER" })),
  });

  // Return updated channel
  const channel = await prisma.chatChannel.findUnique({
    where: { id: channelId },
    include: { members: { select: { userId: true, role: true } } },
  });

  return NextResponse.json({ ok: true, added: newIds.length, channel });
}

// DELETE — remove a member from a channel
export async function DELETE(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: channelId } = await params;

  const membership = await prisma.chatMember.findUnique({
    where: { channelId_userId: { channelId, userId: user.id } },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as { userId: string };
  if (!body.userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  // Allow leaving yourself, or admin removing others
  const isChannelAdmin = membership.role === "ADMIN";
  const isWorkspaceAdmin = ["ADMIN", "CEO", "CISO"].includes(user.role);
  const isSelf = body.userId === user.id;

  if (!isSelf && !isChannelAdmin && !isWorkspaceAdmin) {
    return NextResponse.json({ error: "Only channel admins can remove members" }, { status: 403 });
  }

  await prisma.chatMember.deleteMany({
    where: { channelId, userId: body.userId },
  });

  return NextResponse.json({ ok: true });
}
