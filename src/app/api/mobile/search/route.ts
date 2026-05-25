import { NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) return NextResponse.json({ channels: [], messages: [], users: [] });

  const memberChannelIds = await prisma.chatMember.findMany({
    where: { userId: user.userId },
    select: { channelId: true },
  }).then(ms => ms.map(m => m.channelId));

  const [channels, messages, users] = await Promise.all([
    // Channels matching name
    prisma.chatChannel.findMany({
      where: {
        id: { in: memberChannelIds },
        name: { contains: q, mode: "insensitive" },
      },
      select: { id: true, name: true, type: true, isPrivate: true, description: true },
      take: 8,
    }),

    // Messages matching content in accessible channels
    prisma.chatMessage.findMany({
      where: {
        channelId: { in: memberChannelIds },
        content: { contains: q, mode: "insensitive" },
        deletedAt: null,
      },
      include: {
        user: { select: { id: true, fullName: true } },
        channel: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),

    // Users matching name or email
    prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { fullName: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, fullName: true, email: true, role: true, avatarUrl: true },
      take: 8,
    }),
  ]);

  return NextResponse.json({
    channels: channels.map(c => ({
      id: c.id, name: c.name, type: c.type,
      isPrivate: c.isPrivate, description: c.description,
    })),
    messages: messages.map(m => ({
      id: m.id,
      content: m.content,
      createdAt: m.createdAt,
      channel: { id: m.channel.id, name: m.channel.name },
      sender: { id: m.user.id, fullName: m.user.fullName },
    })),
    users: users.map(u => ({
      id: u.id, fullName: u.fullName, email: u.email,
      role: u.role, avatarUrl: u.avatarUrl,
    })),
  });
}
