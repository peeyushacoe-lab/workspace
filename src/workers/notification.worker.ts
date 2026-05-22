import { Worker, type Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { NOTIFICATION_QUEUE_NAME, type NotificationJobData } from "@/lib/queues/notification.queue";
import { createNotification } from "@/lib/notifications";
import { logger } from "@/lib/logger";

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
        const { userId, title, body } = job.data;
        // Placeholder — wire to Web Push API / FCM when push keys are configured
        logger.info({ userId, title, body }, "[notification-worker] Push notification queued (not yet sent)");
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
