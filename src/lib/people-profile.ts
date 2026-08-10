import { prisma } from "@/lib/prisma";
import { resolveDocAccess } from "@/lib/doc-access";
import type { SessionUser } from "@/lib/auth";

/**
 * Directory profile data — the parts that aren't just columns on `User`.
 *
 * ── The rule this module exists to enforce ────────────────────────────────────
 * A profile page is read by colleagues, not by the person it describes. So the
 * activity it shows is filtered by what the **viewer** can already reach, never
 * by what the profile's owner has been doing. Concretely:
 *
 *   - documents: only ones the viewer can already open (owned, or shared to them)
 *   - calendar:  only PUBLIC events, or ones the viewer is an attendee of
 *   - channels:  only conversations both people are members of
 *
 * Every query below therefore takes the viewer as a parameter and constrains on
 * them. An "activity feed" that skipped this would turn the staff directory into
 * a surveillance tool — and would leak document titles, which in a security
 * company is often the sensitive part.
 */

export type ProfilePerson = {
  id: string;
  fullName: string;
  jobTitle: string | null;
  avatarUrl: string | null;
};

export type SharedDoc = {
  id: string;
  title: string;
  kind: "doc" | "sheet" | "slide" | "note";
  updatedAt: string;
  href: string;
};

export type SharedEvent = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  isAttendee: boolean;
};

export type SharedChannel = {
  id: string;
  name: string;
  type: string;
};

export type PersonTeam = {
  id: string;
  name: string;
  isLead: boolean;
};

export type ProfileExtras = {
  /**
   * Is the viewer looking at their own profile? Returned rather than compared
   * client-side so the page doesn't need a second request for the current user
   * just to decide whether to show "Start conversation".
   */
  isSelf: boolean;
  manager: ProfilePerson | null;
  directReports: ProfilePerson[];
  teams: PersonTeam[];
  sharedDocs: SharedDoc[];
  sharedEvents: SharedEvent[];
  sharedChannels: SharedChannel[];
};

const LIMIT = { reports: 12, teams: 8, docs: 5, events: 4, channels: 6 } as const;

const PERSON_SELECT = {
  id: true,
  fullName: true,
  jobTitle: true,
  avatarUrl: true,
} as const;

const HREF_BY_KIND: Record<SharedDoc["kind"], (id: string) => string> = {
  doc: (id) => `/docs?open=${id}`,
  sheet: (id) => `/apps/sheets/${id}`,
  slide: (id) => `/apps/slides/${id}`,
  // Plain notes are private to their owner and never shared, so this is
  // unreachable in practice — present only to keep the record total.
  note: () => `/notes`,
};

/** Never let one failing section take down a profile page. */
async function safe<T>(label: string, work: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await work();
  } catch (err) {
    console.error(`[people-profile] ${label} failed:`, (err as Error).message);
    return fallback;
  }
}

export async function getProfileExtras(
  personId: string,
  viewer: SessionUser,
): Promise<ProfileExtras> {
  const isSelf = personId === viewer.id;

  const [reportingLine, teams, docs, events, channels] = await Promise.all([
    // ── Manager + direct reports ────────────────────────────────────────────
    // Org structure, not activity: who reports to whom is directory information,
    // so it isn't viewer-filtered. Inactive accounts are excluded so a leaver
    // doesn't linger on their old manager's profile.
    safe(
      "reporting line",
      () =>
        prisma.user.findUnique({
          where: { id: personId },
          select: {
            manager: { select: PERSON_SELECT },
            directReports: {
              where: { isActive: true },
              select: PERSON_SELECT,
              orderBy: { fullName: "asc" },
              take: LIMIT.reports,
            },
          },
        }),
      null,
    ),

    // ── Teams ───────────────────────────────────────────────────────────────
    // Real TeamMember rows, not role-derived guesses — team membership is data,
    // per the single-source-of-truth rule in lib/teams.ts.
    safe(
      "teams",
      () =>
        prisma.teamMember.findMany({
          where: { userId: personId },
          select: { isLead: true, team: { select: { id: true, name: true } } },
          orderBy: { joinedAt: "asc" },
          take: LIMIT.teams,
        }),
      [],
    ),

    // ── Documents ───────────────────────────────────────────────────────────
    // Their recent docs/sheets/slides, then filtered to what the VIEWER can
    // open. Over-fetched because most candidates are typically dropped: sharing
    // lives in Redis (`doc:share:*`), so it can't be expressed as a SQL join.
    // Plain notes are excluded up front — they're never shareable.
    safe(
      "shared docs",
      () =>
        prisma.note.findMany({
          where: { userId: personId, color: { not: null } },
          select: { id: true, title: true, color: true, updatedAt: true },
          orderBy: { updatedAt: "desc" },
          take: LIMIT.docs * 6,
        }),
      [],
    ),

    // ── Calendar ────────────────────────────────────────────────────────────
    // PUBLIC events they organise, or any event the viewer also attends. Mirrors
    // what GET /api/calendar/events already discloses, so this adds no new
    // exposure — it just scopes it to one person.
    safe(
      "shared events",
      () =>
        prisma.calendarEvent.findMany({
          where: {
            organizerId: personId,
            status: { not: "CANCELLED" },
            OR: [
              { visibility: "PUBLIC" },
              { attendees: { some: { userId: viewer.id } } },
            ],
          },
          select: {
            id: true, title: true, startAt: true, endAt: true, allDay: true,
            attendees: { where: { userId: viewer.id }, select: { userId: true }, take: 1 },
          },
          orderBy: { startAt: "desc" },
          take: LIMIT.events,
        }),
      [],
    ),

    // ── Channels in common ──────────────────────────────────────────────────
    // Both-membership is the access check: `some { userId: viewer.id }` means the
    // viewer is already in every channel returned. On your own profile this would
    // just list all your channels, so it's skipped.
    isSelf
      ? Promise.resolve([])
      : safe(
          "shared channels",
          () =>
            prisma.chatChannel.findMany({
              where: {
                AND: [
                  { members: { some: { userId: personId } } },
                  { members: { some: { userId: viewer.id } } },
                ],
              },
              select: { id: true, name: true, type: true },
              orderBy: { updatedAt: "desc" },
              take: LIMIT.channels,
            }),
          [],
        ),
  ]);

  // Per-document access resolution. Sequential rather than parallel: it stops as
  // soon as the limit is filled, so the common case costs a couple of Redis
  // lookups instead of one per candidate.
  const sharedDocs: SharedDoc[] = [];
  for (const note of docs) {
    if (sharedDocs.length >= LIMIT.docs) break;
    const resolved = await safe(
      "doc access",
      () => resolveDocAccess(note.id, viewer.id, viewer.role),
      null,
    );
    if (!resolved) continue;
    sharedDocs.push({
      id: note.id,
      title: note.title || "Untitled",
      kind: resolved.kind,
      updatedAt: note.updatedAt.toISOString(),
      href: HREF_BY_KIND[resolved.kind](note.id),
    });
  }

  return {
    isSelf,
    manager: reportingLine?.manager ?? null,
    directReports: reportingLine?.directReports ?? [],
    teams: teams.map((t) => ({ id: t.team.id, name: t.team.name, isLead: t.isLead })),
    sharedDocs,
    sharedEvents: events.map((e) => ({
      id: e.id,
      title: e.title,
      startAt: e.startAt.toISOString(),
      endAt: e.endAt.toISOString(),
      allDay: e.allDay,
      isAttendee: e.attendees.length > 0,
    })),
    sharedChannels: channels.map((c) => ({ id: c.id, name: c.name, type: c.type })),
  };
}
