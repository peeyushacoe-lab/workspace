import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ChatChannelType } from "@/generated/prisma/enums";

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const channels = await prisma.chatChannel.findMany({
    where: {
      members: { some: { userId: user.id } },
    },
    include: {
      members: {
        select: { userId: true, role: true, lastReadAt: true },
      },
      _count: { select: { messages: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Compute unread count for the current user per channel.
  // When lastReadAt is null the user has never opened the channel — count all messages.
  // When lastReadAt is set, count only messages after it.
  const channelsWithUnread = await Promise.all(
    channels.map(async (ch) => {
      const membership = ch.members.find((m) => m.userId === user.id);
      const lastReadAt = membership?.lastReadAt;
      const unreadCount = await prisma.chatMessage.count({
        where: {
          channelId: ch.id,
          deletedAt: null,
          ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
        },
      });
      return { ...ch, unreadCount };
    })
  );

  return NextResponse.json(channelsWithUnread, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    name: string;
    description?: string;
    type?: ChatChannelType;
    isPrivate?: boolean;
    memberIds?: string[];
  };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Channel name is required" }, { status: 400 });
  }

  const memberIds = Array.from(new Set([user.id, ...(body.memberIds ?? [])]));

  const channel = await prisma.chatChannel.create({
    data: {
      name: body.name.trim(),
      description: body.description,
      type: body.type ?? "CHANNEL",
      isPrivate: body.isPrivate ?? false,
      createdById: user.id,
      members: {
        create: memberIds.map((id) => ({
          userId: id,
          role: id === user.id ? "ADMIN" : "MEMBER",
        })),
      },
    },
    include: {
      members: { select: { userId: true, role: true } },
    },
  });

  return NextResponse.json(channel, { status: 201 });
}
