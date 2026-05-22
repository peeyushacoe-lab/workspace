import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

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

// ─── GET /api/calendar/events/[id] ────────────────────────────────────────────

export async function GET(_request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const event = await prisma.calendarEvent.findUnique({
    where: { id },
    include: {
      organizer: { select: { id: true, fullName: true, avatarUrl: true } },
      attendees: { include: { user: { select: { id: true, fullName: true } } } },
      reminders: true,
    },
  });

  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const canView =
    event.organizerId === user.id ||
    event.attendees.some((a) => a.userId === user.id) ||
    event.visibility === "PUBLIC";

  if (!canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json(event);
}

// ─── PUT /api/calendar/events/[id] ────────────────────────────────────────────

export async function PUT(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const event = await prisma.calendarEvent.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (event.organizerId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as Partial<{
    title: string;
    description: string | null;
    location: string | null;
    startAt: string;
    endAt: string;
    color: string;
    meetingUrl: string | null;
    status: "TENTATIVE" | "CONFIRMED" | "CANCELLED";
    visibility: "PUBLIC" | "PRIVATE" | "TEAM";
    recurrenceRule: string | null;
  }>;

  // Validate temporal ordering when either bound is being changed
  if (body.startAt || body.endAt) {
    const newStart = body.startAt ? new Date(body.startAt) : event.startAt;
    const newEnd   = body.endAt   ? new Date(body.endAt)   : event.endAt;
    if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime())) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }
    if (newEnd <= newStart) {
      return NextResponse.json({ error: "endAt must be after startAt" }, { status: 400 });
    }
  }

  // Normalise recurrenceRule if provided
  const newRule =
    body.recurrenceRule !== undefined
      ? normaliseRule(body.recurrenceRule)
      : undefined;

  const updated = await prisma.calendarEvent.update({
    where: { id },
    data: {
      ...(body.title ? { title: body.title } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.location !== undefined ? { location: body.location } : {}),
      ...(body.startAt ? { startAt: new Date(body.startAt) } : {}),
      ...(body.endAt ? { endAt: new Date(body.endAt) } : {}),
      ...(body.color ? { color: body.color } : {}),
      ...(body.meetingUrl !== undefined ? { meetingUrl: body.meetingUrl } : {}),
      ...(body.status ? { status: body.status } : {}),
      ...(body.visibility ? { visibility: body.visibility } : {}),
      ...(newRule !== undefined
        ? { recurrenceRule: newRule, isRecurring: !!newRule }
        : {}),
    },
    include: {
      organizer: { select: { id: true, fullName: true } },
      attendees: { include: { user: { select: { id: true, fullName: true } } } },
    },
  });

  return NextResponse.json(updated);
}

// ─── DELETE /api/calendar/events/[id] ────────────────────────────────────────

export async function DELETE(_request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const event = await prisma.calendarEvent.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (event.organizerId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.calendarEvent.delete({ where: { id } });
  return new Response(null, { status: 204 });
}
