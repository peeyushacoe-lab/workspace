import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/chat/channels/:id/mentions?q=prefix
 * Returns users in the channel whose name starts with the query.
 * Also supports @team, @here, @everyone as special tokens.
 */
export async function GET(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: channelId } = await params;
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").toLowerCase().trim();

  const membership = await prisma.chatMember.findUnique({
    where: { channelId_userId: { channelId, userId: user.id } },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const members = await prisma.chatMember.findMany({
    where: { channelId },
    include: { user: { select: { id: true, fullName: true, avatarUrl: true, role: true } } },
    take: 100,
  });

  const results = members
    .map(m => m.user)
    .filter(u => !q || u.fullName.toLowerCase().startsWith(q))
    .slice(0, 10);

  // Teams whose members overlap this channel.
  //
  // The overlap filter is not cosmetic. `resolveMentions` intersects a team
  // mention with the channel's own membership, so a team with nobody in this
  // conversation resolves to zero notifications. Offering it in the picker
  // anyway would let someone type "@security", see it autocomplete, and
  // reasonably believe they had just paged the security team.
  const memberIds = new Set(members.map((m) => m.userId));
  const teams = await prisma.team
    .findMany({ select: { slug: true, name: true, members: { select: { userId: true } } } })
    .catch(() => [] as { slug: string; name: string; members: { userId: string }[] }[]);

  const teamSuggestions = teams
    .map((t) => ({
      slug: t.slug,
      name: t.name,
      reach: t.members.filter((m) => memberIds.has(m.userId)).length,
    }))
    .filter((t) => t.reach > 0)
    .filter((t) => !q || t.slug.startsWith(q) || t.name.toLowerCase().startsWith(q))
    .sort((a, b) => b.reach - a.reach)
    .slice(0, 5)
    .map((t) => ({
      id: `team:${t.slug}`,
      fullName: t.slug,
      subtitle: `${t.name} · ${t.reach} here`,
      avatarUrl: null,
      role: "TEAM",
    }));

  // Special tokens. `@team` is gone — it was offered as a literal token and
  // resolved to nothing; real team slugs replace it.
  const specialTokens = [
    { id: "@everyone", fullName: "everyone", subtitle: "Notify every member", role: "ALL" },
    { id: "@here",     fullName: "here",     subtitle: "Notify members who are online", role: "ONLINE" },
    { id: "@Sage",     fullName: "Sage",     subtitle: "Ask the assistant in this conversation", role: "AI" },
  ];
  const specials = specialTokens
    .filter((t) => !q || t.fullName.toLowerCase().startsWith(q))
    .map((t) => ({ ...t, avatarUrl: null }));

  return NextResponse.json([...specials, ...teamSuggestions, ...results]);
}
