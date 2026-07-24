/**
 * Minimal RRULE-lite parser for recurring tasks (RFC-002).
 *
 * Supports the common case: `FREQ=DAILY|WEEKLY|MONTHLY;INTERVAL=n`. This is
 * intentionally not a full RFC 5545 implementation (no BYDAY/BYMONTHDAY/
 * UNTIL/COUNT handling) — good enough for "repeat this task every N days
 * /weeks/months" style recurrence. Extend here if richer scheduling is
 * needed later.
 */
export function nextRecurrenceDate(rrule: string, from: Date): Date | null {
  const parts = Object.fromEntries(
    rrule.split(";").map((p) => {
      const [k, v] = p.split("=");
      return [k?.trim().toUpperCase(), v?.trim().toUpperCase()];
    })
  );

  const freq = parts.FREQ;
  const interval = Math.max(1, parseInt(parts.INTERVAL ?? "1", 10) || 1);

  const next = new Date(from);
  switch (freq) {
    case "DAILY":
      next.setDate(next.getDate() + interval);
      return next;
    case "WEEKLY":
      next.setDate(next.getDate() + interval * 7);
      return next;
    case "MONTHLY":
      next.setMonth(next.getMonth() + interval);
      return next;
    case "YEARLY":
      next.setFullYear(next.getFullYear() + interval);
      return next;
    default:
      return null;
  }
}
