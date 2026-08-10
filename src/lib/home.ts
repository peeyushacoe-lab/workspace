import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { canAccessPath, type SessionUser } from "@/lib/auth";
import { kindFromMarker } from "@/lib/doc-access";

/**
 * Nexus Home — the aggregation layer behind the command centre.
 *
 * Home is the first screen after login, so it has two hard requirements the rest
 * of the app does not:
 *
 *  1. **It must never be the reason a login fails.** Every section is fetched
 *     independently and every failure is swallowed into an empty section (see
 *     `section`). A Drive outage degrades one card; it does not 500 the page a
 *     user lands on before they can reach anything else.
 *
 *  2. **It must not become the app's slowest page.** Home reads from eight
 *     features, so the queries run in one `Promise.all` fan-out, are capped with
 *     `take`, and select only the columns the cards actually render. Nothing here
 *     loads a message body or a document's content.
 *
 * Access control reuses `canAccessPath` — the role gate middleware enforces —
 * rather than the RBAC `can()` engine. That is deliberate: `can()` reads the
 * seeded `Role`/`PermissionDef` tables, so on an environment where
 * `seed:rbac` / `backfill:rbac` has not run yet every card would silently come
 * back empty. The role gate is pure code and always correct, and Home shows
 * strictly what the user could already reach by URL.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type HomeEvent = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  location: string | null;
  meetingUrl: string | null;
  organizerName: string;
  isOrganizer: boolean;
};

export type HomeMail = {
  id: string;
  subject: string;
  from: string;
  preview: string;
  receivedAt: string;
  isStarred: boolean;
  priority: string;
  /** Sender is outside the org — Home mirrors the inbox's EXTERNAL treatment. */
  isExternal: boolean;
};

export type HomeTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  listName: string | null;
  /** Where the task came from — see lib/task-source.ts. */
  sourceType: string | null;
  /** The originating thread/channel/doc id, for the backlink chip. */
  sourceId: string | null;
};

export type HomeMeeting = {
  id: string;
  title: string;
  roomName: string;
  status: string;
  scheduledAt: string | null;
  participantCount: number;
  isOrganizer: boolean;
};

export type HomeDoc = {
  id: string;
  title: string;
  /** "doc" | "sheet" | "slide" | "note" — drives the icon and the href. */
  kind: "doc" | "sheet" | "slide" | "note";
  updatedAt: string;
  href: string;
};

export type HomeFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  updatedAt: string;
  isStarred: boolean;
};

export type HomeConversation = {
  id: string;
  name: string;
  type: string;
  isDirect: boolean;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageAuthor: string | null;
  unreadCount: number;
};

export type HomeNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
};

export type HomeResumeItem = {
  id: string;
  title: string;
  kind: "doc" | "sheet" | "slide" | "note" | "file";
  href: string;
  lastOpenedAt: string;
};

export type HomeData = {
  firstName: string;
  /** Server-rendered so the greeting is correct in the very first HTML. */
  partOfDay: "morning" | "afternoon" | "evening";
  generatedAt: string;
  sections: {
    mail: boolean;
    calendar: boolean;
    tasks: boolean;
    meet: boolean;
    docs: boolean;
    drive: boolean;
    chat: boolean;
  };
  events: HomeEvent[];
  mail: HomeMail[];
  tasks: HomeTask[];
  meetings: HomeMeeting[];
  docs: HomeDoc[];
  files: HomeFile[];
  conversations: HomeConversation[];
  notifications: HomeNotification[];
  resume: HomeResumeItem[];
  counts: {
    unreadMail: number;
    overdueTasks: number;
    tasksDueToday: number;
    unreadNotifications: number;
  };
};

// ─── Config ───────────────────────────────────────────────────────────────────

/** Mirrors ORG_DOMAINS in InboxView — a sender outside these is EXTERNAL. */
const ORG_DOMAINS = ["cybersage.uk"];

/** Per-card row caps. Home is a glance, not a list view. */
const LIMIT = {
  events: 6,
  mail: 6,
  tasks: 6,
  meetings: 4,
  docs: 6,
  files: 6,
  conversations: 5,
  notifications: 5,
  resume: 6,
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Runs one Home section: skipped if the role can't see it, and never allowed to
 * throw.
 *
 * Home fans out across eight features. Without the catch, one missing table
 * (Tasks and the RBAC tables both arrived in later migrations) turns the
 * post-login landing page into a 500 with no way to navigate out of it.
 *
 * The `allowed` gate lives in here rather than as a ternary at the call site on
 * purpose. `allowed ? query() : Promise.resolve([])` gives TypeScript
 * `Promise<Row[] | never[]>`, and calling `.map` on a union of array types is an
 * error. One generic `T` for both paths keeps every section a single type.
 */
async function section<T>(
  label: string,
  allowed: boolean,
  work: () => Promise<T>,
  fallback: T,
): Promise<T> {
  if (!allowed) return fallback;
  try {
    return await work();
  } catch (err) {
    console.error(`[home] ${label} section failed:`, (err as Error).message);
    return fallback;
  }
}

function partOfDay(now: Date): HomeData["partOfDay"] {
  const h = now.getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

function isExternalSender(from: string): boolean {
  const domain = from.split("@")[1]?.toLowerCase().replace(/>$/, "").trim();
  if (!domain) return false;
  return !ORG_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/** Collapses an email/HTML body into a one-line card preview. */
function preview(text: string | null, html: string | null): string {
  const source = text?.trim() || (html ? html.replace(/<[^>]*>/g, " ") : "");
  return source.replace(/\s+/g, " ").trim().slice(0, 140);
}

/**
 * Where each resource kind opens.
 *
 * Every param here is read by its target view: `?open=` by DocsView, `?file=` by
 * DriveView. Notes still has no per-item route, so it lands on the list — do not
 * invent a param for it without wiring NotesView first.
 */
const HREF_BY_KIND: Record<HomeResumeItem["kind"], (id: string) => string> = {
  doc: (id) => `/docs?open=${id}`,
  sheet: (id) => `/apps/sheets/${id}`,
  slide: (id) => `/apps/slides/${id}`,
  note: () => `/notes`,
  file: (id) => `/drive?file=${id}`,
};

// ─── Aggregation ──────────────────────────────────────────────────────────────

export async function getHomeData(user: SessionUser): Promise<HomeData> {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  /** Task horizon — "upcoming" on Home means the next week, not forever. */
  const weekAhead = new Date(dayStart);
  weekAhead.setDate(weekAhead.getDate() + 7);

  const userEmail = user.email.toLowerCase();

  // Which cards is this user even allowed to see? Home must not become a
  // sideways route to data a role cannot reach through its own page.
  const sections = {
    mail: canAccessPath(user, "/inbox"),
    calendar: canAccessPath(user, "/calendar"),
    tasks: canAccessPath(user, "/tasks"),
    meet: canAccessPath(user, "/meet"),
    docs: canAccessPath(user, "/docs"),
    drive: canAccessPath(user, "/drive"),
    chat: canAccessPath(user, "/connect"),
  };

  // Threads in a mailbox the user owns or has been delegated. Same shape the
  // inbox route uses, so Home can never surface a thread the inbox would hide.
  // Annotated rather than inferred: the filter is built here and used by two
  // queries, so it loses the contextual typing a `where:` literal would get.
  const mailAccess: Prisma.InboxThreadWhereInput = {
    OR: [
      { mailbox: { email: userEmail } },
      { mailbox: { accessLogs: { some: { userId: user.id } } } },
    ],
  };
  const unreadInboxWhere: Prisma.InboxThreadWhereInput = {
    AND: [
      mailAccess,
      { isTrashed: false, isArchived: false, isSpam: false },
      // Unread means unread from someone else — a thread whose only unread
      // message is your own sent copy is not waiting on you.
      { messages: { some: { from: { not: userEmail }, isRead: false } } },
      // Bounce-tracking addresses, excluded exactly as /api/inbox does.
      { messages: { none: { from: { contains: "@send." } } } },
    ],
  };

  const [
    events,
    mailThreads,
    unreadMailCount,
    tasks,
    taskCounts,
    meetings,
    docs,
    files,
    memberships,
    notifications,
    unreadNotificationCount,
    resumeRows,
  ] = await Promise.all([
    // ── Today's calendar ────────────────────────────────────────────────────
    // Overlap test, not "starts today": a meeting that began yesterday and runs
    // through this afternoon is still on today's agenda.
    section(
      "calendar",
      sections.calendar,
      () =>
        prisma.calendarEvent.findMany({
          where: {
            startAt: { lt: dayEnd },
            endAt: { gt: dayStart },
            status: { not: "CANCELLED" },
            OR: [
              { organizerId: user.id },
              { attendees: { some: { userId: user.id } } },
              { visibility: "PUBLIC" },
            ],
          },
          orderBy: { startAt: "asc" },
          take: LIMIT.events,
          select: {
            id: true, title: true, startAt: true, endAt: true, allDay: true,
            location: true, meetingUrl: true, organizerId: true,
            organizer: { select: { fullName: true } },
          },
        }),
      [],
    ),

    // ── Unread mail ─────────────────────────────────────────────────────────
    section(
      "mail",
      sections.mail,
      () =>
        prisma.inboxThread.findMany({
          where: unreadInboxWhere,
          orderBy: { updatedAt: "desc" },
          take: LIMIT.mail,
          select: {
            id: true, subject: true, isStarred: true, priority: true,
            messages: {
              where: { from: { not: userEmail } },
              orderBy: { receivedAt: "desc" },
              take: 1,
              select: { from: true, textBody: true, htmlBody: true, receivedAt: true },
            },
          },
        }),
      [],
    ),

    section(
      "mail count",
      sections.mail,
      () => prisma.inboxThread.count({ where: unreadInboxWhere }),
      0,
    ),

    // ── Tasks: assigned to me or created by me, still open ───────────────────
    section(
      "tasks",
      sections.tasks,
      () =>
        prisma.task.findMany({
          where: {
            status: { not: "DONE" },
            AND: [
              { OR: [{ assignees: { some: { userId: user.id } } }, { createdById: user.id }] },
              // Due within the week, or undated. Two ORs cannot sit as
              // siblings on one object, hence the AND wrapper.
              { OR: [{ dueDate: null }, { dueDate: { lt: weekAhead } }] },
            ],
          },
          // Postgres sorts NULLs last on ASC, so undated tasks fall below
          // everything with a real deadline without a second query.
          orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
          take: LIMIT.tasks,
          select: {
            id: true, title: true, status: true, priority: true, dueDate: true,
            sourceType: true, sourceId: true, list: { select: { name: true } },
          },
        }),
      [],
    ),

    section(
      "task counts",
      sections.tasks,
      () =>
        Promise.all([
          prisma.task.count({
            where: {
              status: { not: "DONE" },
              dueDate: { lt: dayStart },
              OR: [{ assignees: { some: { userId: user.id } } }, { createdById: user.id }],
            },
          }),
          prisma.task.count({
            where: {
              status: { not: "DONE" },
              dueDate: { gte: dayStart, lt: dayEnd },
              OR: [{ assignees: { some: { userId: user.id } } }, { createdById: user.id }],
            },
          }),
        ]).then(([overdue, dueToday]) => ({ overdue, dueToday })),
      { overdue: 0, dueToday: 0 },
    ),

    // ── Meetings: live now, or scheduled ahead ───────────────────────────────
    // LIVE rows are included regardless of `scheduledAt` so an ad-hoc room a
    // colleague just opened is joinable from Home.
    section(
      "meet",
      sections.meet,
      () =>
        prisma.meeting.findMany({
          where: {
            OR: [
              { status: "LIVE" },
              { status: "SCHEDULED", scheduledAt: { gte: now } },
            ],
            AND: [
              {
                OR: [
                  { organizerId: user.id },
                  { participants: { some: { userId: user.id } } },
                ],
              },
            ],
          },
          // Ordered by time here and re-sorted below to float LIVE rooms to
          // the top — `orderBy: status` follows enum declaration order, which
          // would put SCHEDULED ahead of a meeting happening right now.
          orderBy: { scheduledAt: "asc" },
          take: LIMIT.meetings,
          select: {
            id: true, title: true, roomName: true, status: true,
            scheduledAt: true, organizerId: true,
            _count: { select: { participants: true } },
          },
        }),
      [],
    ),

    // ── Recent documents (Docs / Sheets / Slides / Notes) ────────────────────
    section(
      "docs",
      sections.docs,
      () =>
        prisma.note.findMany({
          where: { userId: user.id },
          orderBy: { updatedAt: "desc" },
          take: LIMIT.docs,
          // `color` — not `content` — is the discriminator. Docs, Sheets, Slides
          // and Notes are all `Note` rows distinguished by a marker in `color`
          // (see doc-access.ts). Selecting `content` here would also pull whole
          // documents into memory for a card that only shows a title.
          select: { id: true, title: true, color: true, updatedAt: true },
        }),
      [],
    ),

    // ── Recent Drive files ──────────────────────────────────────────────────
    section(
      "drive",
      sections.drive,
      () =>
        prisma.driveFile.findMany({
          where: { ownerId: user.id, isTrashed: false },
          orderBy: { updatedAt: "desc" },
          take: LIMIT.files,
          select: {
            id: true, name: true, mimeType: true, size: true,
            updatedAt: true, isStarred: true,
          },
        }),
      [],
    ),

    // ── Recent conversations ────────────────────────────────────────────────
    // Driven off ChatMember (the channels the user is actually in) so Home never
    // leaks a private channel, and `lastReadAt` gives the unread count.
    section(
      "chat",
      sections.chat,
      () =>
        prisma.chatMember.findMany({
          where: { userId: user.id },
          orderBy: { channel: { updatedAt: "desc" } },
          take: LIMIT.conversations,
          select: {
            lastReadAt: true,
            channel: {
              select: {
                id: true, name: true, type: true,
                messages: {
                  where: { deletedAt: null },
                  orderBy: { createdAt: "desc" },
                  take: 1,
                  select: {
                    content: true, createdAt: true,
                    user: { select: { fullName: true } },
                  },
                },
              },
            },
          },
        }),
      [],
    ),

    // ── Notifications ───────────────────────────────────────────────────────
    // Always allowed: /notifications is an auth-only route.
    section(
      "notifications",
      true,
      () =>
        prisma.notification.findMany({
          where: { userId: user.id, read: false },
          orderBy: { createdAt: "desc" },
          take: LIMIT.notifications,
          select: { id: true, type: true, title: true, body: true, link: true, createdAt: true },
        }),
      [],
    ),

    section(
      "notification count",
      true,
      () => prisma.notification.count({ where: { userId: user.id, read: false } }),
      0,
    ),

    // ── Continue where you left off ─────────────────────────────────────────
    section(
      "resume",
      true,
      () =>
        prisma.recentItem.findMany({
          where: { userId: user.id },
          orderBy: { lastOpenedAt: "desc" },
          // Over-fetched: rows whose resource has since been deleted or gated
          // are dropped below and would otherwise short the list.
          take: LIMIT.resume * 3,
          select: { resourceType: true, resourceId: true, lastOpenedAt: true },
        }),
      [],
    ),
  ]);

  // ── Resolve "continue where you left off" titles ─────────────────────────
  // RecentItem stores only ids, and a row must never surface something the user
  // can no longer open — so titles are re-read from the source tables with the
  // same ownership filters the feature's own page applies.
  const resumeNoteIds = resumeRows.filter((r) => r.resourceType !== "file").map((r) => r.resourceId);
  const resumeFileIds = resumeRows.filter((r) => r.resourceType === "file").map((r) => r.resourceId);

  const [resumeNotes, resumeFiles] = await Promise.all([
    section(
      "resume notes",
      resumeNoteIds.length > 0 && sections.docs,
      () =>
        prisma.note.findMany({
          where: { id: { in: resumeNoteIds }, userId: user.id },
          select: { id: true, title: true },
        }),
      [],
    ),
    section(
      "resume files",
      resumeFileIds.length > 0 && sections.drive,
      () =>
        prisma.driveFile.findMany({
          where: { id: { in: resumeFileIds }, ownerId: user.id, isTrashed: false },
          select: { id: true, name: true },
        }),
      [],
    ),
  ]);

  const resumeTitles = new Map<string, string>([
    ...resumeNotes.map((n) => [n.id, n.title || "Untitled"] as const),
    ...resumeFiles.map((f) => [f.id, f.name] as const),
  ]);

  const resume: HomeResumeItem[] = resumeRows
    .filter((r) => resumeTitles.has(r.resourceId))
    .slice(0, LIMIT.resume)
    .map((r) => {
      const kind = r.resourceType as HomeResumeItem["kind"];
      return {
        id: r.resourceId,
        title: resumeTitles.get(r.resourceId) ?? "Untitled",
        kind,
        href: (HREF_BY_KIND[kind] ?? HREF_BY_KIND.file)(r.resourceId),
        lastOpenedAt: r.lastOpenedAt.toISOString(),
      };
    });

  return {
    firstName: user.fullName?.trim().split(/\s+/)[0] || "there",
    partOfDay: partOfDay(now),
    generatedAt: now.toISOString(),
    sections,

    events: events.map((e) => ({
      id: e.id,
      title: e.title,
      startAt: e.startAt.toISOString(),
      endAt: e.endAt.toISOString(),
      allDay: e.allDay,
      location: e.location,
      meetingUrl: e.meetingUrl,
      organizerName: e.organizer?.fullName ?? "Unknown",
      isOrganizer: e.organizerId === user.id,
    })),

    mail: mailThreads.map((t) => {
      const latest = t.messages[0];
      return {
        id: t.id,
        subject: t.subject || "(no subject)",
        from: latest?.from ?? "Unknown sender",
        preview: preview(latest?.textBody ?? null, latest?.htmlBody ?? null),
        receivedAt: (latest?.receivedAt ?? new Date()).toISOString(),
        isStarred: t.isStarred,
        priority: t.priority,
        isExternal: isExternalSender(latest?.from ?? ""),
      };
    }),

    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate?.toISOString() ?? null,
      listName: t.list?.name ?? null,
      sourceType: t.sourceType,
      sourceId: t.sourceId,
    })),

    meetings: meetings
      .map((m) => ({
        id: m.id,
        title: m.title,
        roomName: m.roomName,
        status: m.status,
        scheduledAt: m.scheduledAt?.toISOString() ?? null,
        participantCount: m._count.participants,
        isOrganizer: m.organizerId === user.id,
      }))
      // A room that is live right now is the single most actionable thing on
      // this card, so it outranks anything merely scheduled.
      .sort((a, b) => Number(b.status === "LIVE") - Number(a.status === "LIVE")),

    docs: docs.map((d) => {
      const kind = kindFromMarker(d.color);
      return {
        id: d.id,
        title: d.title || "Untitled",
        kind,
        updatedAt: d.updatedAt.toISOString(),
        href: HREF_BY_KIND[kind](d.id),
      };
    }),

    files: files.map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      // BigInt is not JSON-serialisable — this route is consumed by fetch().
      size: Number(f.size),
      updatedAt: f.updatedAt.toISOString(),
      isStarred: f.isStarred,
    })),

    conversations: memberships.map((m) => {
      const last = m.channel.messages[0];
      return {
        id: m.channel.id,
        name: m.channel.name,
        type: m.channel.type,
        isDirect: m.channel.type === "DIRECT",
        lastMessageAt: last?.createdAt.toISOString() ?? null,
        lastMessagePreview: last ? last.content.replace(/\s+/g, " ").slice(0, 120) : null,
        lastMessageAuthor: last?.user?.fullName ?? null,
        // Unread is "is the newest message newer than my last read", not an
        // exact tally — a per-channel count query would be N+1 on the landing
        // page for no real gain over a dot.
        unreadCount:
          last && (!m.lastReadAt || last.createdAt > m.lastReadAt) ? 1 : 0,
      };
    }),

    notifications: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      createdAt: n.createdAt.toISOString(),
    })),

    resume,

    counts: {
      unreadMail: unreadMailCount,
      overdueTasks: taskCounts.overdue,
      tasksDueToday: taskCounts.dueToday,
      unreadNotifications: unreadNotificationCount,
    },
  };
}
