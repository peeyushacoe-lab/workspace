/**
 * Timezone-aware helpers for features (attendance schedule) that store plain
 * "HH:MM" wall-clock strings alongside an IANA timezone name and need to
 * compare them against real UTC instants (punch timestamps).
 *
 * Why this exists: attendance previously had three different, disagreeing
 * interpretations of the same "HH:MM" schedule string — one treated it as
 * UTC, one implicitly used the server process's timezone (Vercel runs UTC),
 * one used the intern's browser timezone. For any office not literally in
 * UTC+0 those three disagreed with each other and with reality, which is
 * what caused punch times to render hours off from what interns actually
 * clicked. Route all such comparisons through here instead.
 */

/** Offset (in minutes) such that `localWallClockMs = utcMs + offset`, evaluated
 * at `date` so DST is handled correctly for zones that observe it. */
function getTimezoneOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(map.year), Number(map.month) - 1, Number(map.day),
    Number(map.hour), Number(map.minute), Number(map.second),
  );
  return (asUtc - date.getTime()) / 60_000;
}

/** Given a wall-clock "HH:MM" on a "YYYY-MM-DD" date meant to represent a
 * moment in `timeZone`, return the actual UTC instant it refers to. */
export function zonedTimeToUtc(dateStr: string, hhmm: string, timeZone: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = hhmm.split(":").map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offsetMinutes = getTimezoneOffsetMinutes(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offsetMinutes * 60_000);
}

/** Minutes since local midnight, as the instant would read on a clock in `timeZone`. */
export function minutesSinceMidnightInZone(iso: string, timeZone: string): number {
  const d = new Date(iso);
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", hour: "2-digit", minute: "2-digit" });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(d)) if (p.type !== "literal") map[p.type] = p.value;
  return Number(map.hour) * 60 + Number(map.minute);
}

/** "HH:MM" as the instant reads on a clock in `timeZone` — for display. */
export function formatTimeInZone(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone });
}

export const COMMON_TIMEZONES = [
  "UTC",
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
] as const;
