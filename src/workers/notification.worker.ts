import { Worker, type Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { NOTIFICATION_QUEUE_NAME, type NotificationJobData } from "@/lib/queues/notification.queue";
import { createNotification } from "@/lib/notifications";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { sendWebPush, type PushSubscriptionJSON } from "@/lib/web-push";

export function createNotificationWorker() {
  const worker = new Worker<NotificationJobData>(
    NOTIFICATION_QUEUE_NAME,
    async (job: Job<NotificationJobData>) => {
      const { type } = job.data;
      logger.info({ type, jobId: job.id }, "[notification-worker] Processing job");

      if (type === "IN_APP") {
        const { userId, title, body, link } = job.data;
        await createNotification({
          userId,
          type: "SYSTEM",
          title,
          body,
          link,
        });
        logger.info({ userId, title }, "[notification-worker] In-app notification created");
        return;
      }

      if (type === "EMAIL_DIGEST") {
        const { userId, email, unreadCount, period } = job.data;
        // Placeholder — wire to Resend when digest templates are ready
        logger.info({ userId, email, unreadCount, period }, "[notification-worker] Email digest queued (not yet sent)");
        return;
      }

      if (type === "PUSH") {
        const { userId, title, body, url } = job.data as { userId: string; title: string; body: string; url?: string };
        const pushLogs = await prisma.auditLog.findMany({
          where: { actorId: userId, action: "PUSH_SUBSCRIBE" },
          select: { id: true, metadata: true },
        }).catch(() => []);
        const stale: string[] = [];
        await Promise.all(
          pushLogs.map(async (log) => {
            const sub = log.metadata as unknown as PushSubscriptionJSON;
            if (!sub?.endpoint) return;
            try {
              await sendWebPush(sub, { title, body, url: url ?? "/", tag: `nexus-${userId}` });
            } catch {
              stale.push(log.id);
            }
          })
        );
        if (stale.length) {
          await prisma.auditLog.deleteMany({ where: { id: { in: stale } } }).catch(() => {});
        }
        logger.info({ userId, title, sent: pushLogs.length - stale.length }, "[notification-worker] Web push sent");
        return;
      }

      logger.warn({ type }, "[notification-worker] Unknown job type — skipping");
    },
    {
      connection: redisConnection,
      drainDelay: 30000,
      stalledInterval: 30000,
      lockDuration: 30000,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "[notification-worker] Job failed");
  });

  return worker;
}
