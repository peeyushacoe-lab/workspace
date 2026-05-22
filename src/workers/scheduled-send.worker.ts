/**
 * Scheduled Send Worker
 * Runs every minute, finds due scheduled emails, sends them, marks as sent.
 * Uses Prisma directly (no BullMQ) so it works without a persistent job store.
 */
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { emitEvent } from "@/lib/events";

export async function processScheduledEmails() {
  const due = await prisma.scheduledEmail.findMany({
    where: { sentAt: null, scheduledAt: { lte: new Date() } },
    take: 50,
  });

  if (due.length === 0) return;
  logger.info({ count: due.length }, "[scheduled-send] Processing due emails");

  for (const scheduled of due) {
    try {
      for (const to of scheduled.toAddresses) {
        await sendEmail(
          scheduled.subject,
          scheduled.body,
          { name: to, email: to, status: "" },
          undefined,
          scheduled.fromEmail,
          scheduled.ccAddresses,
          scheduled.bccAddresses,
        );
      }

      await prisma.scheduledEmail.update({
        where: { id: scheduled.id },
        data: { sentAt: new Date() },
      });

      emitEvent("MAIL_SENT", {
        logId: scheduled.id,
        recipientEmail: scheduled.toAddresses.join(", "),
        subject: scheduled.subject,
        actorId: scheduled.userId,
        fromEmail: scheduled.fromEmail,
      });

      logger.info({ id: scheduled.id, to: scheduled.toAddresses }, "[scheduled-send] Sent");
    } catch (err) {
      logger.error({ id: scheduled.id, err }, "[scheduled-send] Failed to send");
    }
  }
}
