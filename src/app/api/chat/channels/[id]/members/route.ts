import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const channelInclude = {
  members: { select: { userId: true, role: true } },
  _count: { select: { messages: true } },
} as const;

// POST — add members to an existing channel
export async function POST(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: channelId } = await params;

  const membership = await prisma.chatMember.findUnique({
    where: { channelId_userId: { channelId, userId: user.id } },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as { userIds: string[] };
  if (!Array.isArray(body.userIds) || body.userIds.length === 0) {
    return NextResponse.json({ error: "userIds is required" }, { status: 400 });
  }

  // Skip users already in the channel
  const existing = await prisma.chatMember.findMany({
    where: { channelId, userId: { in: body.userIds } },
    select: { userId: true },
  });
  const existingIds = new Set(existing.map((m) => m.userId));
  const newIds = body.userIds.filter((id) => !existingIds.has(id));

  if (newIds.length > 0) {
    await prisma.chatMember.createMany({
      data: newIds.map((userId) => ({ channelId, userId, role: "MEMBER" })),
      skipDuplicates: true,
    });
  }

  const channel = await prisma.chatChannel.findUnique({
    where: { id: channelId },
    include: channelInclude,
  });

  return NextResponse.json({ ok: true, added: newIds.length, channel });
}

// PATCH — change a member's role (promote/demote admin)
export async function PATCH(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: channelId } = await params;

  const membership = await prisma.chatMember.findUnique({
    where: { channelId_userId: { channelId, userId: user.id } },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as { userId?: string; role?: string };
  const targetUserId = body.userId;
  const role = body.role;
  if (!targetUserId || (role !== "ADMIN" && role !== "MEMBER")) {
    return NextResponse.json({ error: "userId and a valid role are required" }, { status: 400 });
  }

  const isChannelAdmin = membership.role === "ADMIN";
  const isWorkspaceAdmin = ["ADMIN", "CEO", "CISO"].includes(user.role);
  if (!isChannelAdmin && !isWorkspaceAdmin) {
    return NextResponse.json({ error: "Only channel admins can change member roles" }, { status: 403 });
  }

  const target = await prisma.chatMember.findUnique({
    where: { channelId_userId: { channelId, userId: targetUserId } },
  });
  if (!target) return NextResponse.json({ error: "User is not a member of this channel" }, { status: 404 });

  // Prevent demoting the last remaining admin — a channel must always keep at least one admin
  if (target.role === "ADMIN" && role === "MEMBER") {
    const adminCount = await prisma.chatMember.count({ where: { channelId, role: "ADMIN" } });
    if (adminCount <= 1) {
      return NextResponse.json({ error: "Promote another member to admin first" }, { status: 400 });
    }
  }

  const updated = await prisma.chatMember.update({
    where: { channelId_userId: { channelId, userId: targetUserId } },
    data: { role },
    select: { userId: true, role: true },
  });

  return NextResponse.json({ ok: true, member: updated });
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

  const isChannelAdmin = membership.role === "ADMIN";
  const isWorkspaceAdmin = ["ADMIN", "CEO", "CISO"].includes(user.role);
  const isSelf = body.userId === user.id;

  if (!isSelf && !isChannelAdmin && !isWorkspaceAdmin) {
    return NextResponse.json({ error: "Only channel admins can remove members" }, { status: 403 });
  }

  // If the departing member is the channel's last admin, hand admin rights to
  // the longest-tenured remaining member so the channel is never orphaned.
  const target = await prisma.chatMember.findUnique({
    where: { channelId_userId: { channelId, userId: body.userId } },
  });
  if (target?.role === "ADMIN") {
    const adminCount = await prisma.chatMember.count({ where: { channelId, role: "ADMIN" } });
    if (adminCount <= 1) {
      const successor = await prisma.chatMember.findFirst({
        where: { channelId, userId: { not: body.userId } },
        orderBy: { joinedAt: "asc" },
      });
      if (successor) {
        await prisma.chatMember.update({
          where: { channelId_userId: { channelId, userId: successor.userId } },
          data: { role: "ADMIN" },
        });
      }
    }
  }

  await prisma.chatMember.deleteMany({
    where: { channelId, userId: body.userId },
  });

  return NextResponse.json({ ok: true });
}
