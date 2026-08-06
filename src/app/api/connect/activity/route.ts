import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// ─── Connect Activity feed ────────────────────────────────────────────────────
// Everything addressed at this user across their conversations: @mentions,
// replies to their messages, and reactions to them.
//
// Distinct from /notifications, which is the workspace-wide notification hub
// (email, drive shares, HR, system alerts). This is conversation activity only —
// the things a reply would answer.

export const dynamic = "force-dynamic";

export type ActivityKind = "mention" | "reply" | "reaction";

export type ConnectActivityItem = {
  id: string;
  kind: ActivityKind;
  channelId: string;
  channelName: string;
  isDirect: boolean;
  actorName: string;
  /** Message body for mentions/replies; the emoji for reactions. */
  excerpt: string;
  at: string;
};

export type ConnectActivityResponse = { items: ConnectActivityItem[] };

const LOOKBACK_DAYS = 30;
const PER_KIND = 40;

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = currentUser.id;
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const memberships = await prisma.chatMember.findMany({
    where: { userId },
    select: { channelId: true },
  });
  const channelIds = memberships.map((m) => m.channelId);

  if (channelIds.length === 0) {
    return NextResponse.json({ items: [] } satisfies ConnectActivityResponse);
  }

  const channelSelect = {
    id: true,
    name: true,
    type: true,
    members: { select: { user: { select: { id: true, fullName: true } } } },
  } as const;

  const [mentions, replies, reactions] = await Promise.all([
    prisma.chatMessage.findMany({
      where: {
        channelId: { in: channelIds },
        mentionedUserIds: { has: userId },
        userId: { not: userId },
        deletedAt: null,
        createdAt: { gte: since },
      },
      select: {
        id: true, content: true, createdAt: true,
        user: { select: { fullName: true } },
        channel: { select: channelSelect },
      },
      orderBy: { createdAt: "desc" },
      take: PER_KIND,
    }),

    // Replies to something this user wrote — both the thread form (parentId)
    // and the inline quote form, since either is a direct response.
    prisma.chatMessage.findMany({
      where: {
        channelId: { in: channelIds },
        userId: { not: userId },
        deletedAt: null,
        createdAt: { gte: since },
        OR: [{ parent: { userId } }, { quotedMessage: { userId } }],
      },
      select: {
        id: true, content: true, createdAt: true,
        user: { select: { fullName: true } },
        channel: { select: channelSelect },
      },
      orderBy: { createdAt: "desc" },
      take: PER_KIND,
    }),

    prisma.chatReaction.findMany({
      where: {
        userId: { not: userId },
        createdAt: { gte: since },
        message: { userId, channelId: { in: channelIds }, deletedAt: null },
      },
      select: {
        id: true, emoji: true, createdAt: true,
        user: { select: { fullName: true } },
        message: { select: { channel: { select: channelSelect } } },
      },
      orderBy: { createdAt: "desc" },
      take: PER_KIND,
    }),
  ]);

  type ChannelShape = {
    id: string;
    name: string;
    type: string;
    members: { user: { id: string; fullName: string } }[];
  };

  // A DM's stored name is generated and not meaningful to read — show the other
  // participant instead, the same way the conversation list does.
  const label = (channel: ChannelShape) => {
    const isDirect = channel.type === "DIRECT";
    const other = isDirect
      ? channel.members.find((m) => m.user.id !== userId)?.user.fullName
      : undefined;
    return { name: other ?? channel.name, isDirect };
  };

  const items: ConnectActivityItem[] = [
    ...mentions.map((m) => {
      const { name, isDirect } = label(m.channel);
      return {
        id: `mention:${m.id}`,
        kind: "mention" as const,
        channelId: m.channel.id,
        channelName: name,
        isDirect,
        actorName: m.user.fullName,
        excerpt: m.content.slice(0, 160),
        at: m.createdAt.toISOString(),
      };
    }),
    ...replies.map((m) => {
      const { name, isDirect } = label(m.channel);
      return {
        id: `reply:${m.id}`,
        kind: "reply" as const,
        channelId: m.channel.id,
        channelName: name,
        isDirect,
        actorName: m.user.fullName,
        excerpt: m.content.slice(0, 160),
        at: m.createdAt.toISOString(),
      };
    }),
    ...reactions.map((r) => {
      const { name, isDirect } = label(r.message.channel);
      return {
        id: `reaction:${r.id}`,
        kind: "reaction" as const,
        channelId: r.message.channel.id,
        channelName: name,
        isDirect,
        actorName: r.user.fullName,
        excerpt: r.emoji,
        at: r.createdAt.toISOString(),
      };
    }),
  ]
    // A message that both mentions the user and replies to them appears once
    // per kind by design — they are different facts about the same event, and
    // collapsing them would hide the mention behind the reply.
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 60);

  return NextResponse.json({ items } satisfies ConnectActivityResponse);
}
