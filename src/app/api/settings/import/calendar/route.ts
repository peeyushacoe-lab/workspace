import { NextResponse } from "next/server";
import ical from "node-ical";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

// POST /api/settings/import/calendar
// Accepts a Google Takeout Calendar export (.ics, multipart/form-data field "file").
// Recurring events are imported as their first occurrence only — full RRULE
// expansion is out of scope for the initial migration wizard.
export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (15 MB max)" }, { status: 400 });
  }

  const text = await file.text();
  let parsed: ical.CalendarResponse;
  try {
    parsed = ical.sync.parseICS(text);
  } catch (err) {
    return NextResponse.json(
      { error: `Could not parse ICS file: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 400 },
    );
  }

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const key of Object.keys(parsed)) {
    const ev = parsed[key];
    if (!ev || ev.type !== "VEVENT") continue;
    if (!ev.start || !ev.end) {
      skipped++;
      continue;
    }

    try {
      const allDay = ev.datetype === "date";
      await prisma.calendarEvent.create({
        data: {
          title: ev.summary?.toString() || "(no title)",
          description: ev.description?.toString() ?? null,
          location: ev.location?.toString() ?? null,
          startAt: new Date(ev.start),
          endAt: new Date(ev.end),
          allDay,
          visibility: "PRIVATE",
          status: "CONFIRMED",
          isRecurring: !!ev.rrule,
          recurrenceRule: ev.rrule ? String(ev.rrule) : null,
          organizerId: currentUser.id,
        },
      });
      created++;
    } catch (err) {
      errors.push(`${ev.summary ?? key}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  return NextResponse.json({ ok: true, created, skipped, errors: errors.slice(0, 20) });
}
