/**
 * Scheduled Chat Send Worker
 *
 * Runs every minute, finds due scheduled chat messages, delivers them through
 * the same path a live send takes, marks them sent.
 *
 * Deliberately a cron poll rather than a BullMQ delayed job, matching
 * `scheduled-send.worker.ts` (email). A delayed job would put the message's
 * only durable representation inside Redis for what may be days, where the
 * user can't list it, edit it or cancel it without a job-store lookup, and
 * where an eviction loses it silently. A row in Postgres with `sentAt: null`
 * is queryable, cancellable, and survives Redis entirely.
 */
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { deliverChatMessage } from "@/lib/chat/deliver";
import { redis } from "@/lib/redis";

export async function processScheduledChatMessages() {
  const due = await prisma.chatScheduledMessage.findMany({
    where: { sentAt: null, failedAt: null, scheduledAt: { lte: new Date() } },
    take: 50,
    orderBy: { scheduledAt: "asc" },
  });

  if (due.length === 0) return;
  logger.info({ count: due.length }, "[scheduled-chat] Processing due messages");

  for (const scheduled of due) {
    try {
      // Re-check authorization at fire time, not just at schedule time. Someone
      // can be removed from a channel between writing a message and it sending;
      // delivering it anyway would be a permission leak in slow motion.
      const [membership, sender] = await Promise.all([
        prisma.chatMember.findUnique({
          where: { channelId_userId: { channelId: scheduled.channelId, userId: scheduled.userId } },
          select: { id: true, role: true },
        }),
        prisma.user.findUnique({
          where: { id: scheduled.userId },
          select: { id: true, fullName: true, isActive: true },
        }),
      ]);

      if (!sender || sender.isActive === false) {
        await fail(scheduled.id, "Sender account is no longer active");
        continue;
      }
      if (!membership) {
        await fail(scheduled.id, "You are no longer a member of this conversation");
        continue;
      }

      const channel = await prisma.chatChannel.findUnique({
        where: { id: scheduled.channelId },
        select: { isBroadcast: true },
      });
      if (!channel) {
        await fail(scheduled.id, "This conversation no longer exists");
        continue;
      }
      if (channel.isBroadcast && membership.role !== "ADMIN") {
        await fail(scheduled.id, "Only the channel owner can post in a broadcast channel");
        continue;
      }

      await deliverChatMessage(
        { id: sender.id, fullName: sender.fullName },
        {
          channelId: scheduled.channelId,
          content: scheduled.content,
          parentId: scheduled.parentId,
          quotedMessageId: scheduled.quotedMessageId,
          isUrgent: scheduled.isUrgent,
          attachmentUrl: scheduled.attachmentUrl,
          attachmentMime: scheduled.attachmentMime,
          attachmentName: scheduled.attachmentName,
        },
      );

      await prisma.chatScheduledMessage.update({
        where: { id: scheduled.id },
        data: { sentAt: new Date() },
      });

      await notifyAuthor(scheduled.userId, { id: scheduled.id, status: "sent", channelId: scheduled.channelId });

      logger.info({ id: scheduled.id, channelId: scheduled.channelId }, "[scheduled-chat] Sent");
    } catch (err) {
      logger.error({ id: scheduled.id, err }, "[scheduled-chat] Failed to send");
      await fail(scheduled.id, err instanceof Error ? err.message : "Delivery failed").catch(() => {});
    }
  }
}

async function fail(id: string, reason: string) {
  const row = await prisma.chatScheduledMessage.update({
    where: { id },
    data: { failedAt: new Date(), failureReason: reason },
    select: { userId: true, channelId: true },
  });
  logger.warn({ id, reason }, "[scheduled-chat] Marked failed");
  await notifyAuthor(row.userId, { id, status: "failed", channelId: row.channelId, reason });
}

/**
 * Tell the author's open tabs that a scheduled message fired or failed, so the
 * "1 scheduled" banner above their composer clears itself without a refresh.
 * Rides the existing per-user Redis channel the notification SSE stream uses.
 */
async function notifyAuthor(
  userId: string,
  payload: { id: string; status: "sent" | "failed"; channelId: string; reason?: string },
) {
  await redis
    .publish(`notifications:${userId}`, JSON.stringify({ type: "scheduled_chat", data: payload }))
    .catch(() => {});
}
