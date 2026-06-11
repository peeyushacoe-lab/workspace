import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const typeFilter = searchParams.get("type") ?? "all";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 50);

  if (q.length < 2) {
    return NextResponse.json({ results: [], total: 0, query: q });
  }

  const perTypeLimit = Math.ceil(limit / 6);

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
    // Mail: search by thread subject OR message body
    (typeFilter === "all" || typeFilter === "mail")
      ? prisma.inboxThread
          .findMany({
            where: {
              isTrashed: false,
              mailbox: {
                accessLogs: { some: { userId: user.id } },
              },
              OR: [
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
              ],
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

    // Chat: messages in channels the user is a member of
    (typeFilter === "all" || typeFilter === "chat")
      ? prisma.chatMessage
          .findMany({
            where: {
              content: { contains: q, mode: "insensitive" },
              deletedAt: null,
              channel: { members: { some: { userId: user.id } } },
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
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
              ],
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
              AND: {
                OR: [
                  { title: { contains: q, mode: "insensitive" } },
                  { description: { contains: q, mode: "insensitive" } },
                ],
              },
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
              AND: {
                OR: [
                  { title: { contains: q, mode: "insensitive" } },
                  { description: { contains: q, mode: "insensitive" } },
                ],
              },
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
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { content: { contains: q, mode: "insensitive" } },
              ],
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
    prisma.user
      .findMany({
        where: {
          OR: [
            { fullName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          jobTitle: true,
        },
        take: Math.min(perTypeLimit, 5),
      })
      .catch(() => []),
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
    query: q,
  });
}
