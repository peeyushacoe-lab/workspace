import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { emitEvent } from "@/lib/events";

// ─── Recurrence helpers ───────────────────────────────────────────────────────

/**
 * Parse a recurrenceRule (either legacy simple format or FREQ= format) and
 * advance `date` by one interval. Returns the same date if the rule is unknown
 * (acts as a safety guard against infinite loops).
 */
function addInterval(date: Date, rule: string): Date {
  const d = new Date(date);

  // Normalise to the FREQ part
  const freqMatch = rule.match(/FREQ=([A-Z]+)/);
  const freq = freqMatch ? freqMatch[1] : rule.toUpperCase();

  switch (freq) {
    case "DAILY":
      d.setDate(d.getDate() + 1);
      break;
    case "WEEKLY":
      d.setDate(d.getDate() + 7);
      break;
    case "MONTHLY":
      d.setMonth(d.getMonth() + 1);
      break;
    case "YEARLY":
      d.setFullYear(d.getFullYear() + 1);
      break;
    // Unknown rule — return unchanged (infinite-loop guard)
  }
  return d;
}

/**
 * Validate and normalise an incoming recurrenceRule string.
 * Accepts both legacy ("DAILY") and RRULE-style ("FREQ=WEEKLY;BYDAY=MO,WE").
 * Returns null for empty / unrecognised rules.
 */
function normaliseRule(raw: string | null | undefined): string | null {
  if (!raw) return null;

  // Already in FREQ= format
  if (raw.startsWith("FREQ=")) {
    const freqMatch = raw.match(/FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/);
    return freqMatch ? raw : null;
  }

  // Legacy simple format
  const simple = raw.toUpperCase();
  if (["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(simple)) {
    return `FREQ=${simple}`;
  }

  return null;
}

// ─── GET /api/calendar/events ─────────────────────────────────────────────────

export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;

  const events = await prisma.calendarEvent.findMany({
    where: {
      AND: [
        {
          OR: [
            { organizerId: user.id },
            { attendees: { some: { userId: user.id } } },
          ],
        },
        { status: { not: "CANCELLED" } },
        ...(fromDate && toDate
          ? [
              {
                OR: [
                  // Non-recurring: overlaps the window
                  { isRecurring: false, startAt: { lt: toDate }, endAt: { gt: fromDate } },
                  // Recurring: started before window end (expand in memory below)
                  { isRecurring: true, startAt: { lte: toDate } },
                ],
              },
            ]
          : []),
      ],
    },
    include: {
      organizer: { select: { id: true, fullName: true, avatarUrl: true } },
      attendees: { include: { user: { select: { id: true, fullName: true } } } },
    },
    orderBy: { startAt: "asc" },
  });

  if (!fromDate || !toDate) return NextResponse.json(events);

  // Expand recurring events within [fromDate, toDate]
  type EventShape = (typeof events)[number];
  const result: Array<EventShape & { startAt: Date; endAt: Date }> = [];

  for (const event of events) {
    if (!event.isRecurring || !event.recurrenceRule) {
      result.push(event as EventShape & { startAt: Date; endAt: Date });
      continue;
    }

    const duration = event.endAt.getTime() - event.startAt.getTime();
    let current = new Date(event.startAt);
    let safety = 0;

    while (current < toDate && safety++ < 500) {
      const instanceEnd = new Date(current.getTime() + duration);
      if (instanceEnd > fromDate) {
        const isFirst = current.getTime() === event.startAt.getTime();
        result.push({
          ...event,
          id: isFirst ? event.id : `${event.id}__${current.toISOString()}`,
          startAt: new Date(current),
          endAt: instanceEnd,
        } as EventShape & { startAt: Date; endAt: Date });
      }
      const next = addInterval(current, event.recurrenceRule);
      if (next.getTime() === current.getTime()) break; // guard against infinite loop
      current = next;
    }
  }

  result.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  return NextResponse.json(result);
}

// ─── POST /api/calendar/events ────────────────────────────────────────────────

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    title: string;
    description?: string;
    location?: string;
    startAt: string;
    endAt: string;
    allDay?: boolean;
    timezone?: string;
    visibility?: "PUBLIC" | "PRIVATE" | "TEAM";
    color?: string;
    meetingUrl?: string;
    attendeeEmails?: string[];
    reminderMinutes?: number[];
    recurrenceRule?: string;
  };

  if (!body.title?.trim() || !body.startAt || !body.endAt) {
    return NextResponse.json({ error: "title, startAt, and endAt are required" }, { status: 400 });
  }

  const start = new Date(body.startAt);
  const end = new Date(body.endAt);
  if (end <= start) {
    return NextResponse.json({ error: "endAt must be after startAt" }, { status: 400 });
  }

  // Resolve attendees
  const attendeeData: Array<{ userId?: string; email: string; name?: string }> = [];
  if (body.attendeeEmails?.length) {
    const users = await prisma.user.findMany({
      where: { email: { in: body.attendeeEmails } },
      select: { id: true, email: true, fullName: true },
    });
    const userMap = new Map(users.map((u) => [u.email, u]));
    for (const email of body.attendeeEmails) {
      const u = userMap.get(email);
      attendeeData.push({ userId: u?.id, email, name: u?.fullName ?? undefined });
    }
  }

  const recurrenceRule = normaliseRule(body.recurrenceRule);

  const event = await prisma.calendarEvent.create({
    data: {
      title: body.title.trim(),
      description: body.description,
      location: body.location,
      startAt: start,
      endAt: end,
      allDay: body.allDay ?? false,
      timezone: body.timezone ?? "UTC",
      visibility: body.visibility ?? "PUBLIC",
      color: body.color ?? "#3B82F6",
      meetingUrl: body.meetingUrl,
      organizerId: user.id,
      isRecurring: !!recurrenceRule,
      recurrenceRule,
      attendees: { create: attendeeData },
      reminders: {
        create: (body.reminderMinutes ?? [15]).map((m) => ({
          minutesBefore: m,
          method: "EMAIL",
        })),
      },
    },
    include: {
      organizer: { select: { id: true, fullName: true, avatarUrl: true } },
      attendees: { include: { user: { select: { id: true, fullName: true } } } },
    },
  });

  emitEvent("CALENDAR_EVENT_CREATED", {
    eventId: event.id,
    title: event.title,
    actorId: user.id,
    startAt: event.startAt.toISOString(),
    attendeeCount: event.attendees.length,
  });

  return NextResponse.json(event, { status: 201 });
}
