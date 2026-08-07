import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { enforceChatLimit } from "@/lib/chat/limits";
import { policiesForUser } from "@/lib/connect-policies";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = await enforceChatLimit("message.edit", user.id);
  if (limited) return limited;

  const { id } = await params;
  const { content } = (await request.json()) as { content: string };

  if (!content?.trim()) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }
  // The create endpoint caps length; the edit endpoint didn't, so the cap was
  // one PUT away from being meaningless. Both now read the same org policy.
  const policies = await policiesForUser(user.id);
  if (!policies.messaging.allowEditing) {
    return NextResponse.json(
      { error: "Editing messages is turned off for this workspace" },
      { status: 403 },
    );
  }
  if (content.length > policies.messaging.maxMessageLength) {
    return NextResponse.json(
      { error: `Message too long (max ${policies.messaging.maxMessageLength.toLocaleString()} characters)` },
      { status: 400 },
    );
  }

  const existing = await prisma.chatMessage.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Ownership alone isn't enough: someone removed from a channel still owns
  // every message they left behind, and could rewrite them into phishing or
  // abuse in a room they can no longer be held accountable in. Editing
  // requires still being in the conversation.
  const membership = await prisma.chatMember.findUnique({
    where: { channelId_userId: { channelId: existing.channelId, userId: user.id } },
    select: { id: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "You are no longer a member of this conversation" }, { status: 403 });
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

  // Org policy can disable self-deletion, but never blocks a workspace admin:
  // moderation has to keep working precisely when normal deletion is locked
  // down, which is usually a compliance posture rather than a UI preference.
  if (!isAdmin) {
    const policies = await policiesForUser(user.id);
    if (!policies.messaging.allowDeleting) {
      return NextResponse.json(
        { error: "Deleting messages is turned off for this workspace" },
        { status: 403 },
      );
    }
  }

  // Same reasoning as PUT — a removed member shouldn't be able to reach back
  // into a channel and delete their side of a conversation. Workspace ADMINs
  // are exempt: moderation is the whole point of that exception.
  if (!isAdmin) {
    const membership = await prisma.chatMember.findUnique({
      where: { channelId_userId: { channelId: existing.channelId, userId: user.id } },
      select: { id: true },
    });
    if (!membership) {
      return NextResponse.json({ error: "You are no longer a member of this conversation" }, { status: 403 });
    }
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
