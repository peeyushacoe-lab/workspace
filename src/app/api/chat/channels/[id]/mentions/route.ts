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
    take: 20,
  });

  const results = members
    .map(m => m.user)
    .filter(u => !q || u.fullName.toLowerCase().startsWith(q))
    .slice(0, 10);

  // Prepend special tokens if query matches
  const specials: { id: string; fullName: string; avatarUrl: null; role: string }[] = [];
  const specialTokens = [
    { id: "@everyone", fullName: "@everyone", role: "ALL" },
    { id: "@here",     fullName: "@here",     role: "ONLINE" },
    { id: "@team",     fullName: "@team",     role: "TEAM" },
  ];
  for (const t of specialTokens) {
    if (!q || t.fullName.startsWith("@" + q) || t.fullName.startsWith(q)) {
      specials.push({ ...t, avatarUrl: null });
    }
  }

  return NextResponse.json([...specials, ...results]);
}
