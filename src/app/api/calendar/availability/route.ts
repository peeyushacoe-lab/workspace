import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/calendar/availability
 *
 * Query params:
 *   attendees  — comma-separated userId list
 *   start      — ISO date string (range start, inclusive)
 *   end        — ISO date string (range end, exclusive)
 *
 * Response:
 * {
 *   slots: string[];                              // ISO strings of each 1-hour slot checked
 *   availability: { [userId: string]: ("free" | "busy")[] }; // indexed parallel to slots[]
 *   names: { [userId: string]: string };          // display names
 * }
 */
export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const attendeesParam = searchParams.get("attendees") ?? "";
  const emailsParam = searchParams.get("emails") ?? "";
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");

  if ((!attendeesParam && !emailsParam) || !startParam || !endParam) {
    return NextResponse.json(
      { error: "attendees or emails, plus start and end are required" },
      { status: 400 },
    );
  }

  let attendeeIds = attendeesParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Resolve emails to user IDs when emails param is provided
  if (emailsParam) {
    const emailList = emailsParam.split(",").map((e) => e.trim()).filter(Boolean);
    if (emailList.length > 0) {
      const usersFromEmail = await prisma.user.findMany({
        where: { email: { in: emailList } },
        select: { id: true },
      });
      attendeeIds = [...new Set([...attendeeIds, ...usersFromEmail.map((u) => u.id)])];
    }
  }

  if (attendeeIds.length === 0) {
    return NextResponse.json({ slots: [], availability: {}, names: {} });
  }

  const rangeStart = new Date(startParam);
  const rangeEnd = new Date(endParam);

  if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime())) {
    return NextResponse.json({ error: "Invalid start or end date" }, { status: 400 });
  }

  // Clamp to at most 14 days to avoid enormous result sets
  const maxEnd = new Date(rangeStart.getTime() + 14 * 24 * 60 * 60 * 1000);
  const effectiveEnd = rangeEnd < maxEnd ? rangeEnd : maxEnd;

  // Fetch user display names
  const users = await prisma.user.findMany({
    where: { id: { in: attendeeIds } },
    select: { id: true, fullName: true },
  });
  const names: Record<string, string> = {};
  for (const u of users) names[u.id] = u.fullName;

  // Fetch all events that overlap the range and involve any of the attendees
  // An attendee can be the organizer OR listed in EventAttendee
  const events = await prisma.calendarEvent.findMany({
    where: {
      status: { not: "CANCELLED" },
      startAt: { lt: effectiveEnd },
      endAt: { gt: rangeStart },
      OR: [
        { organizerId: { in: attendeeIds } },
        { attendees: { some: { userId: { in: attendeeIds } } } },
      ],
    },
    select: {
      startAt: true,
      endAt: true,
      isRecurring: true,
      recurrenceRule: true,
      organizerId: true,
      attendees: { select: { userId: true } },
    },
  });

  // Build slots: 9 AM–5 PM for each calendar day in the range (8 slots/day)
  const slots: string[] = [];
  const cur = new Date(rangeStart);
  // Align to start of first day
  cur.setHours(9, 0, 0, 0);

  while (cur < effectiveEnd) {
    for (let h = 9; h < 17; h++) {
      const slotStart = new Date(cur);
      slotStart.setHours(h, 0, 0, 0);
      if (slotStart >= effectiveEnd) break;
      slots.push(slotStart.toISOString());
    }
    cur.setDate(cur.getDate() + 1);
  }

  // Helper: check if a recurring event instance overlaps a slot
  function addRecurringInterval(date: Date, rule: string): Date {
    const d = new Date(date);
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
    }
    return d;
  }

  // For each event expand recurring instances and collect busy intervals per user
  // busy[userId] = Array<[startMs, endMs]>
  const busy: Record<string, Array<[number, number]>> = {};
  for (const id of attendeeIds) busy[id] = [];

  for (const ev of events) {
    // Which of our attendees does this event concern?
    const involved = new Set<string>();
    if (attendeeIds.includes(ev.organizerId)) involved.add(ev.organizerId);
    for (const a of ev.attendees) {
      if (a.userId && attendeeIds.includes(a.userId)) involved.add(a.userId);
    }
    if (involved.size === 0) continue;

    // Collect intervals for this event (expand recurring within range)
    const intervals: Array<[number, number]> = [];
    const duration = ev.endAt.getTime() - ev.startAt.getTime();

    if (!ev.isRecurring || !ev.recurrenceRule) {
      intervals.push([ev.startAt.getTime(), ev.endAt.getTime()]);
    } else {
      let current = new Date(ev.startAt);
      let safety = 0;
      while (current < effectiveEnd && safety++ < 500) {
        const instanceEnd = new Date(current.getTime() + duration);
        if (instanceEnd > rangeStart) {
          intervals.push([current.getTime(), instanceEnd.getTime()]);
        }
        const next = addRecurringInterval(current, ev.recurrenceRule);
        if (next.getTime() === current.getTime()) break;
        current = next;
      }
    }

    for (const uid of involved) {
      for (const interval of intervals) {
        busy[uid].push(interval);
      }
    }
  }

  // Build availability matrix: for each user, for each slot → "free" | "busy"
  const availability: Record<string, ("free" | "busy")[]> = {};
  for (const uid of attendeeIds) {
    const userBusy = busy[uid] ?? [];
    availability[uid] = slots.map((slotIso) => {
      const slotMs = new Date(slotIso).getTime();
      const slotEndMs = slotMs + 60 * 60 * 1000; // 1-hour slot
      const isBusy = userBusy.some(
        ([evStart, evEnd]) => evStart < slotEndMs && evEnd > slotMs,
      );
      return isBusy ? "busy" : "free";
    });
  }

  return NextResponse.json({ slots, availability, names });
}
