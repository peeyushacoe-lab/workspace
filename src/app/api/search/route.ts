import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseSearchQuery, type ParsedSearchQuery } from "@/lib/search-filters";
import { isSearchAvailable, searchIndex } from "@/lib/search-engine";

// ─── Result shape expected by GlobalSearch.tsx ───────────────────────────────

type SearchResultType =
  | "mail"
  | "chat"
  | "drive"
  | "calendar"
  | "meeting"
  | "note"
  | "people";

interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  excerpt: string;
  link: string;
  createdAt: string;
  metadata?: Record<string, string>;
}

/** True when the parsed query has ONLY free text — no filter tokens.
 * Meilisearch gives us ranked/typo-tolerant results but doesn't (yet) get
 * fed our filter semantics, so anything with a filter token goes straight
 * to the Prisma path, which supports every filter precisely. */
function isPlainTextOnly(parsed: ParsedSearchQuery): boolean {
  return !parsed.from && !parsed.in && !parsed.hasAttachment && !parsed.before &&
    !parsed.after && !parsed.isUnread && !parsed.isStarred;
}

export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const rawQ = searchParams.get("q")?.trim() ?? "";
  const typeFilter = searchParams.get("type") ?? "all";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 50);

  const parsed = parseSearchQuery(rawQ);
  const q = parsed.text;

  if (q.length < 2 && isPlainTextOnly(parsed)) {
    return NextResponse.json({ results: [], total: 0, query: rawQ });
  }

  const perTypeLimit = Math.ceil(limit / 6);
  const tryMeili = isPlainTextOnly(parsed) && q.length >= 2 ? await isSearchAvailable() : false;

  // Meilisearch is attempted first for mail/chat (the two indexes that have
  // real producers today — see indexing.queue.ts callers). Any miss/error
  // falls straight through to the existing Prisma ILIKE query below.
  let meiliMailIds: string[] | null = null;
  let meiliChatIds: string[] | null = null;
  if (tryMeili) {
    const [emailHits, chatHits] = await Promise.all([
      (typeFilter === "all" || typeFilter === "mail")
        ? searchIndex("email", q, { limit: perTypeLimit }).catch(() => [])
        : Promise.resolve([]),
      (typeFilter === "all" || typeFilter === "chat")
        ? searchIndex("chat_message", q, { limit: perTypeLimit }).catch(() => [])
        : Promise.resolve([]),
    ]);
    if (emailHits.length > 0) meiliMailIds = emailHits.map((h) => String(h.threadId ?? h.id));
    if (chatHits.length > 0) meiliChatIds = chatHits.map((h) => String(h.id));
  }

  // ── Parallel search across all entity types ──────────────────────────────

  const [
    mailResults,
    chatResults,
    driveResults,
    calendarResults,
    meetingResults,
    noteResults,
    peopleResults,
  ] = await Promise.all([
    // Mail: Meilisearch thread IDs (ranked) when available, else ILIKE + filters
    (typeFilter === "all" || typeFilter === "mail")
      ? prisma.inboxThread
          .findMany({
            where: meiliMailIds
              ? { id: { in: meiliMailIds }, isTrashed: false, mailbox: { accessLogs: { some: { userId: user.id } } } }
              : {
                  isTrashed: parsed.in === "trash" ? true : false,
                  ...(parsed.in === "archive" ? { isArchived: true } : {}),
                  isStarred: parsed.isStarred ? true : undefined,
                  mailbox: { accessLogs: { some: { userId: user.id } } },
                  ...(parsed.before || parsed.after
                    ? { updatedAt: { ...(parsed.after ? { gte: parsed.after } : {}), ...(parsed.before ? { lte: parsed.before } : {}) } }
                    : {}),
                  OR: q
                    ? [
                        { subject: { contains: q, mode: "insensitive" } },
                        {
                          messages: {
                            some: {
                              OR: [
                                { textBody: { contains: q, mode: "insensitive" } },
                                { subject: { contains: q, mode: "insensitive" } },
                              ],
                            },
                          },
                        },
                      ]
                    : undefined,
                  ...(parsed.from ? { messages: { some: { from: { contains: parsed.from, mode: "insensitive" } } } } : {}),
                  ...(parsed.hasAttachment ? { messages: { some: { attachments: { some: {} } } } } : {}),
                  ...(parsed.isUnread ? { messages: { some: { isRead: false } } } : {}),
                },
            select: {
              id: true,
              subject: true,
              updatedAt: true,
              priority: true,
              messages: {
                select: { textBody: true, from: true },
                orderBy: { receivedAt: "desc" },
                take: 1,
              },
            },
            orderBy: { updatedAt: "desc" },
            take: perTypeLimit,
          })
          .catch(() => [])
      : Promise.resolve([]),

    // Chat: Meilisearch message IDs (ranked) when available, else ILIKE + filters
    (typeFilter === "all" || typeFilter === "chat")
      ? prisma.chatMessage
          .findMany({
            where: meiliChatIds
              ? { id: { in: meiliChatIds }, deletedAt: null, channel: { members: { some: { userId: user.id } } } }
              : {
                  deletedAt: null,
                  channel: { members: { some: { userId: user.id } } },
                  ...(q ? { content: { contains: q, mode: "insensitive" } } : {}),
                  ...(parsed.from ? { user: { fullName: { contains: parsed.from, mode: "insensitive" } } } : {}),
                  ...(parsed.in ? { channel: { name: { contains: parsed.in, mode: "insensitive" }, members: { some: { userId: user.id } } } } : {}),
                  ...(parsed.hasAttachment ? { attachmentUrl: { not: null } } : {}),
                  ...(parsed.before || parsed.after
                    ? { createdAt: { ...(parsed.after ? { gte: parsed.after } : {}), ...(parsed.before ? { lte: parsed.before } : {}) } }
                    : {}),
                },
            select: {
              id: true,
              content: true,
              createdAt: true,
              channel: { select: { id: true, name: true } },
              user: { select: { fullName: true } },
            },
            orderBy: { createdAt: "desc" },
            take: perTypeLimit,
          })
          .catch(() => [])
      : Promise.resolve([]),

    // Drive: files owned by the user (not trashed)
    (typeFilter === "all" || typeFilter === "drive")
      ? prisma.driveFile
          .findMany({
            where: {
              ownerId: user.id,
              isTrashed: false,
              ...(parsed.isStarred ? { isStarred: true } : {}),
              ...(parsed.before || parsed.after
                ? { createdAt: { ...(parsed.after ? { gte: parsed.after } : {}), ...(parsed.before ? { lte: parsed.before } : {}) } }
                : {}),
              ...(q
                ? {
                    OR: [
                      { name: { contains: q, mode: "insensitive" } },
                      { description: { contains: q, mode: "insensitive" } },
                    ],
                  }
                : {}),
            },
            select: {
              id: true,
              name: true,
              mimeType: true,
              description: true,
              createdAt: true,
              classification: true,
            },
            orderBy: { updatedAt: "desc" },
            take: perTypeLimit,
          })
          .catch(() => [])
      : Promise.resolve([]),

    // Calendar: events organized by user or user is attendee
    (typeFilter === "all" || typeFilter === "calendar")
      ? prisma.calendarEvent
          .findMany({
            where: {
              OR: [
                { organizerId: user.id },
                { attendees: { some: { userId: user.id } } },
              ],
              ...(parsed.before || parsed.after
                ? { startAt: { ...(parsed.after ? { gte: parsed.after } : {}), ...(parsed.before ? { lte: parsed.before } : {}) } }
                : {}),
              ...(q
                ? {
                    AND: {
                      OR: [
                        { title: { contains: q, mode: "insensitive" } },
                        { description: { contains: q, mode: "insensitive" } },
                      ],
                    },
                  }
                : {}),
            },
            select: {
              id: true,
              title: true,
              description: true,
              startAt: true,
              location: true,
            },
            orderBy: { startAt: "desc" },
            take: perTypeLimit,
          })
          .catch(() => [])
      : Promise.resolve([]),

    // Meetings: organized by user or user is participant
    (typeFilter === "all" || typeFilter === "meeting")
      ? prisma.meeting
          .findMany({
            where: {
              OR: [
                { organizerId: user.id },
                { participants: { some: { userId: user.id } } },
              ],
              ...(parsed.before || parsed.after
                ? { scheduledAt: { ...(parsed.after ? { gte: parsed.after } : {}), ...(parsed.before ? { lte: parsed.before } : {}) } }
                : {}),
              ...(q
                ? {
                    AND: {
                      OR: [
                        { title: { contains: q, mode: "insensitive" } },
                        { description: { contains: q, mode: "insensitive" } },
                      ],
                    },
                  }
                : {}),
            },
            select: {
              id: true,
              title: true,
              description: true,
              scheduledAt: true,
              status: true,
              roomName: true,
            },
            orderBy: { scheduledAt: "desc" },
            take: perTypeLimit,
          })
          .catch(() => [])
      : Promise.resolve([]),

    // Notes: owned by user (includes docs)
    (typeFilter === "all" || typeFilter === "note")
      ? prisma.note
          .findMany({
            where: {
              userId: user.id,
              ...(parsed.isStarred ? { pinned: true } : {}),
              ...(parsed.before || parsed.after
                ? { updatedAt: { ...(parsed.after ? { gte: parsed.after } : {}), ...(parsed.before ? { lte: parsed.before } : {}) } }
                : {}),
              ...(q
                ? {
                    OR: [
                      { title: { contains: q, mode: "insensitive" } },
                      { content: { contains: q, mode: "insensitive" } },
                    ],
                  }
                : {}),
            },
            select: {
              id: true,
              title: true,
              content: true,
              isDoc: true,
              updatedAt: true,
            },
            orderBy: { updatedAt: "desc" },
            take: perTypeLimit,
          })
          .catch(() => [])
      : Promise.resolve([]),

    // People: always search users by name or email
    (typeFilter === "all" || typeFilter === "people")
      ? prisma.user
          .findMany({
            where: q
              ? {
                  OR: [
                    { fullName: { contains: q, mode: "insensitive" } },
                    { email: { contains: q, mode: "insensitive" } },
                    { jobTitle: { contains: q, mode: "insensitive" } },
                    { department: { contains: q, mode: "insensitive" } },
                  ],
                }
              : {},
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
              jobTitle: true,
            },
            take: Math.min(perTypeLimit, 5),
          })
          .catch(() => [])
      : Promise.resolve([]),
  ]);

  // ── Shape into unified SearchResult[] ────────────────────────────────────

  const results: SearchResult[] = [];

  for (const t of mailResults) {
    const latestBody = t.messages[0]?.textBody ?? "";
    const snippet = latestBody
      ? latestBody.replace(/\s+/g, " ").slice(0, 120)
      : "";
    results.push({
      id: t.id,
      type: "mail",
      title: t.subject,
      excerpt: snippet,
      link: `/inbox?thread=${t.id}`,
      createdAt: t.updatedAt.toISOString(),
      metadata: {
        priority: t.priority,
        from: t.messages[0]?.from ?? "",
      },
    });
  }

  for (const m of chatResults) {
    results.push({
      id: m.id,
      type: "chat",
      title: `#${m.channel.name}`,
      excerpt: m.content.slice(0, 120),
      link: `/chat?channel=${m.channel.id}`,
      createdAt: m.createdAt.toISOString(),
      metadata: {
        sender: m.user.fullName,
        channelName: m.channel.name,
      },
    });
  }

  for (const f of driveResults) {
    results.push({
      id: f.id,
      type: "drive",
      title: f.name,
      excerpt: f.description ?? f.classification ?? f.mimeType,
      link: `/drive?file=${f.id}`,
      createdAt: f.createdAt.toISOString(),
      metadata: {
        mimeType: f.mimeType,
        classification: f.classification ?? "",
      },
    });
  }

  for (const e of calendarResults) {
    results.push({
      id: e.id,
      type: "calendar",
      title: e.title,
      excerpt: e.description ?? e.location ?? "",
      link: `/calendar?event=${e.id}`,
      createdAt: e.startAt.toISOString(),
      metadata: {
        location: e.location ?? "",
        startAt: e.startAt.toISOString(),
      },
    });
  }

  for (const mt of meetingResults) {
    results.push({
      id: mt.id,
      type: "meeting",
      title: mt.title,
      excerpt: mt.description ?? `Status: ${mt.status}`,
      link: `/meet/${mt.roomName}`,
      createdAt: (mt.scheduledAt ?? new Date(0)).toISOString(),
      metadata: {
        status: mt.status,
        roomName: mt.roomName,
      },
    });
  }

  for (const n of noteResults) {
    const plainContent = n.content
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    results.push({
      id: n.id,
      type: "note",
      title: n.title || "Untitled",
      excerpt: plainContent,
      link: n.isDoc ? `/docs/${n.id}` : `/notes/${n.id}`,
      createdAt: n.updatedAt.toISOString(),
      metadata: {
        kind: n.isDoc ? "doc" : "note",
      },
    });
  }

  for (const p of peopleResults) {
    results.push({
      id: p.id,
      type: "people",
      title: p.fullName,
      excerpt: [p.jobTitle, p.email].filter(Boolean).join(" · "),
      link: `/people/${p.id}`,
      createdAt: new Date().toISOString(),
      metadata: {
        email: p.email,
        role: p.role,
        jobTitle: p.jobTitle ?? "",
      },
    });
  }

  return NextResponse.json({
    results,
    total: results.length,
    query: rawQ,
  });
}
