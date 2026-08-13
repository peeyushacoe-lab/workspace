import { prisma } from "@/lib/prisma";
import { canAccessPath, type SessionUser } from "@/lib/auth";
import { kindFromMarker } from "@/lib/doc-access";

/**
 * Workspace retrieval for grounded AI answers.
 *
 * "What meetings do I have tomorrow?" and "summarise the emails about Sentinel"
 * were the point of Nexus AI, and neither worked: `/api/ai/chat` had no access to
 * the workspace at all, so it could only produce plausible-sounding fiction. This
 * is the retrieval half.
 *
 * ── The rule this module exists to enforce ────────────────────────────────────
 * **The AI must never be a way to read something you couldn't already open.**
 *
 * Retrieval is not a new permission surface. Every query below is scoped to the
 * asking user — their mailboxes, their tasks, events they organise or attend,
 * their own documents — using the same gates as the feature that owns the data.
 * `canAccessPath` decides whether a source is consulted at all, so a role without
 * Tasks never gets task context, exactly as on Home.
 *
 * That matters more here than elsewhere, because a leak through an LLM is
 * laundered: the model paraphrases, so the user sees an authoritative sentence
 * with no indication it came from a document they were never allowed to read.
 *
 * ── Retrieval is deliberately shallow ─────────────────────────────────────────
 * Titles, subjects, senders, times — not bodies. Enough to answer "what/when/who"
 * and to cite a link the user can open for the detail. Feeding whole email bodies
 * into the prompt would multiply both cost and the blast radius of any injection.
 */

export type ContextKind = "mail" | "event" | "task" | "meeting" | "doc" | "person";

export type ContextItem = {
  kind: ContextKind;
  /** One-line description the model reads. */
  text: string;
  /** Human label for the citation chip. */
  label: string;
  /** Deep link the user can open — every one of these has a reader. */
  href: string | null;
};

export type WorkspaceContext = {
  items: ContextItem[];
  /** Which sources were consulted, for the "grounded in" line in the UI. */
  sources: ContextKind[];
};

/** Per-source caps. The prompt has a budget; breadth beats depth for these questions. */
const LIMIT = { mail: 8, events: 10, tasks: 8, meetings: 5, docs: 6, people: 5 } as const;

function iso(d: Date): string {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

/** Strips a display name out of `Ada <ada@x.com>` for compact prompt text. */
function sender(from: string): string {
  return (from.match(/^\s*"?([^"<]+?)"?\s*</)?.[1] ?? from).trim();
}

/** Never let one failing source break the whole answer. */
async function safe<T>(label: string, work: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await work();
  } catch (err) {
    console.error(`[ai-context] ${label} failed:`, (err as Error).message);
    return fallback;
  }
}

/**
 * Gathers workspace context relevant to `question` for `user`.
 *
 * `question` is used only for keyword filtering inside already-scoped queries —
 * it never widens what is searched. A malicious question cannot reach another
 * user's data because the scope is applied before the keyword, not after.
 */
export async function getWorkspaceContext(
  user: SessionUser,
  question: string,
): Promise<WorkspaceContext> {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const weekAhead = new Date(dayStart);
  weekAhead.setDate(weekAhead.getDate() + 7);
  const monthBack = new Date(dayStart);
  monthBack.setDate(monthBack.getDate() - 30);

  const email = user.email.toLowerCase();
  // Short queries make useless LIKE filters ("do", "my"), so below a threshold we
  // fall back to plain recency, which is what those questions usually want anyway.
  const q = question.trim();
  const keyword = q.length >= 4 ? q.slice(0, 80) : null;

  const allow = {
    mail: canAccessPath(user, "/inbox"),
    calendar: canAccessPath(user, "/calendar"),
    tasks: canAccessPath(user, "/tasks"),
    meet: canAccessPath(user, "/meet"),
    docs: canAccessPath(user, "/docs"),
    people: canAccessPath(user, "/people"),
  };

  const [mail, events, tasks, meetings, docs, people] = await Promise.all([
    // ── Mail: only mailboxes this user owns or is delegated ──
    !allow.mail ? Promise.resolve([]) : safe("mail", () =>
      prisma.inboxThread.findMany({
        where: {
          AND: [
            {
              OR: [
                { mailbox: { email } },
                { mailbox: { accessLogs: { some: { userId: user.id } } } },
              ],
            },
            { isTrashed: false, isSpam: false },
            keyword
              ? { OR: [
                  { subject: { contains: keyword, mode: "insensitive" } },
                  { messages: { some: { textBody: { contains: keyword, mode: "insensitive" } } } },
                ] }
              : {},
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: LIMIT.mail,
        select: {
          id: true, subject: true, updatedAt: true,
          messages: { orderBy: { receivedAt: "desc" }, take: 1, select: { from: true, isRead: true } },
        },
      }), []),

    // ── Calendar: organised by, attended by, or public ──
    // Mirrors GET /api/calendar/events exactly — no wider.
    !allow.calendar ? Promise.resolve([]) : safe("events", () =>
      prisma.calendarEvent.findMany({
        where: {
          status: { not: "CANCELLED" },
          startAt: { gte: monthBack, lte: weekAhead },
          OR: [
            { organizerId: user.id },
            { attendees: { some: { userId: user.id } } },
            { visibility: "PUBLIC" },
          ],
        },
        orderBy: { startAt: "asc" },
        take: LIMIT.events,
        select: { id: true, title: true, startAt: true, endAt: true, allDay: true, location: true },
      }), []),

    // ── Tasks: created by or assigned to this user ──
    !allow.tasks ? Promise.resolve([]) : safe("tasks", () =>
      prisma.task.findMany({
        where: {
          status: { not: "DONE" },
          OR: [{ createdById: user.id }, { assignees: { some: { userId: user.id } } }],
        },
        orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
        take: LIMIT.tasks,
        select: { id: true, title: true, status: true, priority: true, dueDate: true },
      }), []),

    // ── Meetings: organiser or participant only ──
    !allow.meet ? Promise.resolve([]) : safe("meetings", () =>
      prisma.meeting.findMany({
        where: {
          OR: [{ organizerId: user.id }, { participants: { some: { userId: user.id } } }],
          scheduledAt: { gte: monthBack, lte: weekAhead },
        },
        orderBy: { scheduledAt: "desc" },
        take: LIMIT.meetings,
        select: { id: true, title: true, scheduledAt: true, status: true },
      }), []),

    // ── Documents: the user's own only ──
    // Docs shared *to* them live in Redis share keys and would need a per-doc
    // lookup; deliberately out of scope for retrieval rather than risk a
    // half-checked shortcut. Their own docs are unambiguous.
    !allow.docs ? Promise.resolve([]) : safe("docs", () =>
      prisma.note.findMany({
        where: {
          userId: user.id,
          ...(keyword ? { title: { contains: keyword, mode: "insensitive" } } : {}),
        },
        orderBy: { updatedAt: "desc" },
        take: LIMIT.docs,
        select: { id: true, title: true, color: true, updatedAt: true },
      }), []),

    // ── People: the org directory, which /people already exposes in full ──
    !allow.people || !keyword ? Promise.resolve([]) : safe("people", () =>
      prisma.user.findMany({
        where: {
          isActive: true,
          OR: [
            { fullName: { contains: keyword, mode: "insensitive" } },
            { jobTitle: { contains: keyword, mode: "insensitive" } },
            { department: { contains: keyword, mode: "insensitive" } },
          ],
        },
        take: LIMIT.people,
        select: { id: true, fullName: true, jobTitle: true, department: true },
      }), []),
  ]);

  const items: ContextItem[] = [];

  for (const t of mail) {
    const m = t.messages[0];
    items.push({
      kind: "mail",
      text: `Email "${t.subject || "(no subject)"}" from ${sender(m?.from ?? "unknown")}${m?.isRead === false ? " (unread)" : ""}, ${iso(t.updatedAt)}`,
      label: t.subject || "(no subject)",
      href: `/inbox?thread=${t.id}`,
    });
  }

  for (const e of events) {
    items.push({
      kind: "event",
      text: `Calendar: "${e.title}" ${e.allDay ? `all day ${iso(e.startAt).slice(0, 10)}` : `${iso(e.startAt)} to ${iso(e.endAt).slice(11)}`}${e.location ? ` at ${e.location}` : ""}`,
      label: e.title,
      href: "/calendar",
    });
  }

  for (const t of tasks) {
    items.push({
      kind: "task",
      text: `Task "${t.title}" — ${t.status}, ${t.priority}${t.dueDate ? `, due ${iso(t.dueDate).slice(0, 10)}` : ", no due date"}`,
      label: t.title,
      href: `/tasks?taskId=${t.id}`,
    });
  }

  for (const m of meetings) {
    items.push({
      kind: "meeting",
      text: `Meeting "${m.title}" — ${m.status}${m.scheduledAt ? `, ${iso(m.scheduledAt)}` : ""}`,
      label: m.title,
      href: `/meetings/${m.id}`,
    });
  }

  for (const d of docs) {
    const kind = kindFromMarker(d.color);
    items.push({
      kind: "doc",
      text: `Document "${d.title || "Untitled"}" (${kind}), updated ${iso(d.updatedAt)}`,
      label: d.title || "Untitled",
      href: kind === "doc" ? `/docs?open=${d.id}`
        : kind === "sheet" ? `/apps/sheets/${d.id}`
        : kind === "slide" ? `/apps/slides/${d.id}`
        : "/notes",
    });
  }

  for (const p of people) {
    items.push({
      kind: "person",
      text: `Person: ${p.fullName}${p.jobTitle ? `, ${p.jobTitle}` : ""}${p.department ? `, ${p.department}` : ""}`,
      label: p.fullName,
      href: `/people/${p.id}`,
    });
  }

  return {
    items,
    sources: [...new Set(items.map((i) => i.kind))],
  };
}

/**
 * Renders context for the prompt.
 *
 * Numbered so the model can cite `[3]` and the caller can map it back to a real
 * href — a citation the user can click is the difference between a grounded
 * answer and a confident-sounding guess.
 */
export function renderContextForPrompt(ctx: WorkspaceContext): string {
  if (ctx.items.length === 0) return "";
  return ctx.items.map((item, i) => `[${i + 1}] ${item.text}`).join("\n");
}
