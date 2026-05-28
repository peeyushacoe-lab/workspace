import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { searchIndex, isSearchAvailable } from "@/lib/search-engine";

export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ mail: [], chat: [], people: [] });

  const useMeilisearch = await isSearchAvailable();

  if (useMeilisearch) {
    // ── Meilisearch fast path ───────────────────────────────────────────────
    const [emailHits, chatHits, peopleResults] = await Promise.all([
      searchIndex("email", q, { limit: 8 }).catch(() => []),

      searchIndex("chat_message", q, {
        filter: `channelId EXISTS`,
        limit: 8,
      }).catch(() => []),

      prisma.user.findMany({
        where: {
          OR: [
            { fullName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true, fullName: true, email: true, role: true, avatarUrl: true },
        take: 6,
      }).catch(() => []),
    ]);

    return NextResponse.json({
      mail: emailHits.map((h) => ({
        id: h.id as string,
        subject: (h.subject as string | undefined) ?? (h.content as string | undefined)?.slice(0, 80) ?? "",
        updatedAt: h.updatedAt as string | undefined,
        priority: h.priority as string | undefined,
        url: `/inbox?thread=${h.id as string}`,
      })),
      chat: chatHits.map((h) => ({
        id: h.id as string,
        content: ((h.content as string | undefined) ?? "").slice(0, 120),
        channelId: h.channelId as string,
        channelName: (h.channelName as string | undefined) ?? "",
        sender: (h.senderName as string | undefined) ?? "",
        createdAt: h.createdAt as string | undefined,
      })),
      people: peopleResults,
    });
  }

  // ── Prisma fallback (no Meilisearch configured) ─────────────────────────
  const [mailResults, chatResults, peopleResults] = await Promise.all([
    prisma.inboxThread.findMany({
      where: {
        subject: { contains: q, mode: "insensitive" },
        isTrashed: false,
      },
      select: { id: true, subject: true, updatedAt: true, priority: true },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }).catch(() => []),

    prisma.chatMessage.findMany({
      where: {
        content: { contains: q, mode: "insensitive" },
        deletedAt: null,
        channel: { members: { some: { userId: user.id } } },
      },
      select: {
        id: true, content: true, createdAt: true,
        channel: { select: { id: true, name: true } },
        user: { select: { fullName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }).catch(() => []),

    prisma.user.findMany({
      where: {
        OR: [
          { fullName: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, fullName: true, email: true, role: true, avatarUrl: true },
      take: 6,
    }).catch(() => []),
  ]);

  return NextResponse.json({
    mail: mailResults.map((t) => ({
      id: t.id,
      subject: t.subject,
      updatedAt: t.updatedAt,
      priority: t.priority,
      url: `/inbox?thread=${t.id}`,
    })),
    chat: chatResults.map((m) => ({
      id: m.id,
      content: m.content.slice(0, 120),
      channelId: m.channel.id,
      channelName: m.channel.name,
      sender: m.user.fullName,
      createdAt: m.createdAt,
    })),
    people: peopleResults,
  });
}
