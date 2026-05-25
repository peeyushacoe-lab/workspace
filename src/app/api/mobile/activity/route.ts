import { NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "40"), 100);

  // Get channels the user is a member of
  const memberships = await prisma.chatMember.findMany({
    where: { userId: user.userId },
    select: { channelId: true },
  });
  const channelIds = memberships.map((m) => m.channelId);

  // Fetch recent messages across all channels (excluding replies)
  const recentMessages = await prisma.chatMessage.findMany({
    where: {
      channelId: { in: channelIds },
      deletedAt: null,
      parentId: null,
      userId: { not: user.userId },
    },
    include: {
      user: { select: { id: true, fullName: true, avatarUrl: true } },
      channel: { select: { id: true, name: true, type: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  // Fetch recent reactions on messages the user sent
  const recentReactions = await prisma.chatReaction.findMany({
    where: {
      message: { userId: user.userId },
      userId: { not: user.userId },
    },
    include: {
      user: { select: { id: true, fullName: true, avatarUrl: true } },
      message: { select: { id: true, content: true, channelId: true, channel: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  // Combine and sort
  const msgEvents = recentMessages.map((m) => ({
    id: `msg-${m.id}`,
    type: "message" as const,
    actor: { id: m.user.id, fullName: m.user.fullName, avatarUrl: m.user.avatarUrl },
    channel: { id: m.channel.id, name: m.channel.name, type: m.channel.type },
    preview: m.isUrgent ? `🚨 ${m.content.slice(0, 80)}` : m.content.slice(0, 80),
    isUrgent: m.isUrgent,
    createdAt: m.createdAt.toISOString(),
  }));

  const rxnEvents = recentReactions.map((r) => ({
    id: `rxn-${r.id}`,
    type: "reaction" as const,
    actor: { id: r.user.id, fullName: r.user.fullName, avatarUrl: r.user.avatarUrl },
    channel: { id: r.message.channelId, name: r.message.channel.name, type: "CHANNEL" as const },
    preview: `${r.emoji} on "${r.message.content.slice(0, 40)}"`,
    isUrgent: false,
    createdAt: r.createdAt.toISOString(),
  }));

  const all = [...msgEvents, ...rxnEvents]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);

  return NextResponse.json(all);
}
