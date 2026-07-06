import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ChatChannelType } from "@/generated/prisma/enums";

export async function GET() {
  try {
    const user = getSessionUserFromCookieStore(await cookies());
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Auto-add user to any non-private channels they're not yet a member of
    const allPublic = await prisma.chatChannel.findMany({
      where: { isPrivate: false },
      select: { id: true },
    });
    for (const ch of allPublic) {
      await prisma.chatMember.upsert({
        where: { channelId_userId: { channelId: ch.id, userId: user.id } },
        update: {},
        create: { channelId: ch.id, userId: user.id, role: "MEMBER" },
      }).catch(() => {});
    }

    const channels = await prisma.chatChannel.findMany({
      where: {
        members: { some: { userId: user.id } },
      },
      include: {
        members: {
          select: { userId: true, role: true, lastReadAt: true, joinedAt: true },
        },
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Compute unread count — fall back gracefully if deletedAt column doesn't exist yet
    const channelsWithUnread = await Promise.all(
      channels.map(async (ch) => {
        const membership = ch.members.find((m) => m.userId === user.id);
        // Unread = messages from OTHERS since the channel was last read.
        // - own messages never count as unread (sending shouldn't light the badge)
        // - never-opened channels fall back to joinedAt so auto-joined public
        //   channels don't report their entire history as unread
        const readFloor = membership?.lastReadAt ?? membership?.joinedAt ?? null;
        const unreadCount = await prisma.chatMessage.count({
          where: {
            channelId: ch.id,
            deletedAt: null,
            userId: { not: user.id },
            ...(readFloor ? { createdAt: { gt: readFloor } } : {}),
          },
        }).catch(() =>
          prisma.chatMessage.count({
            where: {
              channelId: ch.id,
              userId: { not: user.id },
              ...(readFloor ? { createdAt: { gt: readFloor } } : {}),
            },
          }).catch(() => 0)
        );
        return { ...ch, unreadCount };
      })
    );

    return NextResponse.json(channelsWithUnread, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    console.error("[GET /api/chat/channels]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    name: string;
    description?: string;
    type?: ChatChannelType;
    isPrivate?: boolean;
    isBroadcast?: boolean;
    memberIds?: string[];
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Channel name is required" }, { status: 400 });
  }

  const memberIds = Array.from(new Set([user.id, ...(body.memberIds ?? [])]));

  // Build data without isBroadcast first — add it only if the column exists
  const baseData = {
    name: body.name.trim(),
    description: body.description,
    type: body.type ?? ("CHANNEL" as ChatChannelType),
    isPrivate: body.isPrivate ?? false,
    createdById: user.id,
    members: {
      create: memberIds.map((id) => ({
        userId: id,
        role: id === user.id ? "ADMIN" : "MEMBER",
      })),
    },
  };

  try {
    const channel = await prisma.chatChannel.create({
      data: { ...baseData, isBroadcast: body.isBroadcast ?? false },
      include: {
        members: { select: { userId: true, role: true } },
      },
    });
    return NextResponse.json(channel, { status: 201 });
  } catch (err) {
    // isBroadcast column may not exist in DB yet — retry without it
    console.error("[POST /api/chat/channels] primary create failed, retrying without isBroadcast:", (err as Error).message);
    try {
      const channel = await prisma.chatChannel.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: baseData as any,
        include: {
          members: { select: { userId: true, role: true } },
        },
      });
      return NextResponse.json(channel, { status: 201 });
    } catch (innerErr) {
      console.error("[POST /api/chat/channels] fallback create failed:", innerErr);
      return NextResponse.json({ error: "Failed to create channel" }, { status: 500 });
    }
  }
}
