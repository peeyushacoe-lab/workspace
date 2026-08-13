/**
 * Event Reminder Worker
 *
 * Runs on a tick, finds `EventReminder` rows whose moment has arrived, notifies
 * the organizer and every attendee, and marks them sent.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * `EventReminder` has been in the schema for a long time with **nothing reading
 * it**: no worker, no queue job, no scheduler. Adding a reminder picker to the
 * event form without this would have persisted rows that were never delivered —
 * a control that looks like a feature and silently does nothing. This is the
 * delivery half, and it lands first.
 *
 * Follows `scheduled-send.worker.ts`: plain Prisma polling rather than BullMQ,
 * so it works without a persistent job store and survives a Redis outage.
 */
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { logger } from "@/lib/logger";

/** Per-tick cap, so a backlog can't stall the loop or flood the notification table. */
const BATCH = 100;

/**
 * How late a reminder may be and still be worth sending.
 *
 * Without this, a worker that has been down for two days comes back and fires
 * every missed reminder at once — a burst of notifications for meetings that
 * already happened. Anything older than this is marked sent and dropped.
 */
const STALE_AFTER_MS = 60 * 60 * 1000; // 1 hour

export async function processEventReminders() {
  const now = new Date();

  // `minutesBefore` is relative to the event, so "due" can't be expressed as a
  // column comparison in Prisma's query API. Instead: fetch unsent reminders for
  // events in the near future or recent past, then filter in memory. The window
  // is bounded by the largest reminder anyone can set (1 week).
  const horizon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const floor = new Date(now.getTime() - STALE_AFTER_MS);

  const candidates = await prisma.eventReminder.findMany({
    where: {
      sent: false,
      event: {
        startAt: { gte: floor, lte: horizon },
        status: { not: "CANCELLED" },
      },
    },
    select: {
      id: true,
      minutesBefore: true,
      event: {
        select: {
          id: true,
          title: true,
          startAt: true,
          organizerId: true,
          attendees: { select: { userId: true } },
        },
      },
    },
    take: BATCH * 4,
  });

  if (candidates.length === 0) return;

  const due: typeof candidates = [];
  const stale: string[] = [];

  for (const r of candidates) {
    const fireAt = new Date(r.event.startAt.getTime() - r.minutesBefore * 60_000);
    if (fireAt > now) continue;                       // not yet
    if (fireAt < floor) { stale.push(r.id); continue; } // missed while down
    due.push(r);
  }

  // Retire missed reminders without notifying — see STALE_AFTER_MS.
  if (stale.length > 0) {
    await prisma.eventReminder.updateMany({
      where: { id: { in: stale } },
      data: { sent: true },
    });
    logger.info({ count: stale.length }, "[event-reminder] Dropped stale reminders");
  }

  if (due.length === 0) return;
  logger.info({ count: due.length }, "[event-reminder] Delivering");

  for (const reminder of due.slice(0, BATCH)) {
    const { event } = reminder;
    try {
      // Organizer + attendees, deduped: an organizer who is also listed as an
      // attendee must not get the reminder twice.
      //
      // `EventAttendee.userId` is nullable — an attendee can be an external
      // invitee identified only by email address, with no user row. Those are
      // dropped here rather than coerced, because the reminder is delivered by
      // in-app notification and push, neither of which an external attendee can
      // receive.
      const recipients = new Set<string>(
        [event.organizerId, ...event.attendees.map((a) => a.userId)].filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        ),
      );

      const minutes = reminder.minutesBefore;
      const when =
        minutes >= 1440 ? `${Math.round(minutes / 1440)} day(s)`
        : minutes >= 60 ? `${Math.round(minutes / 60)} hour(s)`
        : `${minutes} minutes`;

      await Promise.all(
        [...recipients].map((userId) =>
          createNotification({
            userId,
            type: "CALENDAR_REMINDER",
            title: event.title,
            body: `Starts in ${when}.`,
            // ?invite= is not right here — this opens the calendar, which is
            // what a reminder should do.
            link: "/calendar",
            metadata: { eventId: event.id, minutesBefore: minutes },
          }),
        ),
      );

      // Marked only after delivery, so a crash mid-send retries next tick rather
      // than silently swallowing the reminder.
      await prisma.eventReminder.update({
        where: { id: reminder.id },
        data: { sent: true },
      });
    } catch (err) {
      logger.error({ id: reminder.id, err }, "[event-reminder] Failed to deliver");
    }
  }
}
