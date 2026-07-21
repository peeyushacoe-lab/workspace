import { Worker, type Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { CLEANUP_QUEUE_NAME, type CleanupJobData } from "@/lib/queues/cleanup.queue";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { runHealthCheck } from "@/lib/health-check";
import { runAndRecordRestoreDrill } from "@/lib/restore-drill";
import { runSentinelCorrelation } from "@/lib/sentinel/correlation-engine";
import { createNotification } from "@/lib/notifications";
import { nextRecurrenceDate } from "@/lib/task-recurrence";

export function createCleanupWorker() {
  const worker = new Worker<CleanupJobData>(
    CLEANUP_QUEUE_NAME,
    async (job: Job<CleanupJobData>) => {
      const { type } = job.data;
      logger.info({ type, jobId: job.id }, "[cleanup-worker] Processing job");

      if (type === "EXPIRED_SESSIONS") {
        const result = await prisma.userSession.deleteMany({
          where: { expiresAt: { lt: new Date() } },
        });
        logger.info({ deleted: result.count }, "[cleanup-worker] Expired sessions removed");
        return;
      }

      if (type === "EXPIRED_SHARE_LINKS") {
        const result = await prisma.drivePermission.deleteMany({
          where: { expiresAt: { lt: new Date() } },
        });
        logger.info({ deleted: result.count }, "[cleanup-worker] Expired share links removed");
        return;
      }

      if (type === "STALE_NOTIFICATIONS") {
        const { olderThanDays } = job.data;
        const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
        const result = await prisma.notification.deleteMany({
          where: { read: true, createdAt: { lt: cutoff } },
        });
        logger.info({ deleted: result.count, olderThanDays }, "[cleanup-worker] Stale notifications removed");
        return;
      }

      if (type === "OLD_AUDIT_LOGS") {
        const { olderThanDays } = job.data;
        const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
        const result = await prisma.auditLog.deleteMany({
          where: { createdAt: { lt: cutoff } },
        });
        logger.info({ deleted: result.count, olderThanDays }, "[cleanup-worker] Old audit logs removed");
        return;
      }

      if (type === "TRASHED_FILES") {
        const { olderThanDays } = job.data;
        const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
        const result = await prisma.driveFile.deleteMany({
          where: { isTrashed: true, updatedAt: { lt: cutoff } },
        });
        logger.info({ deleted: result.count, olderThanDays }, "[cleanup-worker] Trashed files purged");
        return;
      }

      if (type === "EXPIRED_DRAFTS") {
        const { olderThanDays } = job.data;
        const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
        const result = await prisma.draft.deleteMany({
          where: { savedAt: { lt: cutoff } },
        });
        logger.info({ deleted: result.count, olderThanDays }, "[cleanup-worker] Old drafts removed");
        return;
      }

      if (type === "RESTORE_DRILL") {
        const result = await runAndRecordRestoreDrill().catch((err) => ({ ok: false, error: (err as Error).message }));
        logger.info({ result }, "[cleanup-worker] Restore drill complete");
        return;
      }

      if (type === "UNSNOOZE_DUE_THREADS") {
        const result = await prisma.inboxThread.updateMany({
          where: { isSnoozed: true, snoozedUntil: { lte: new Date() } },
          data: { isSnoozed: false, snoozedUntil: null },
        });
        logger.info({ unsnoozed: result.count }, "[cleanup-worker] Due threads un-snoozed");
        return;
      }

      if (type === "SENTINEL_CORRELATION") {
        const result = await runSentinelCorrelation().catch((err) => {
          logger.error({ err }, "[cleanup-worker] Sentinel correlation failed");
          return null;
        });
        logger.info({ result }, "[cleanup-worker] Sentinel Brain correlation pass complete");
        return;
      }

      if (type === "TASK_RECURRENCE") {
        // Find completed recurring tasks that haven't spawned their next
        // occurrence yet. Cloning clears `recurrence` on the original so it
        // isn't picked up again on the next daily pass.
        const dueForNext = await prisma.task.findMany({
          where: { status: "DONE", recurrence: { not: null } },
          include: { assignees: true },
        });

        let cloned = 0;
        for (const t of dueForNext) {
          const base = t.dueDate ?? t.updatedAt;
          const nextDue = nextRecurrenceDate(t.recurrence!, base);
          if (!nextDue) {
            // Unparseable recurrence string — clear it so it doesn't loop forever.
            await prisma.task.update({ where: { id: t.id }, data: { recurrence: null } });
            continue;
          }

          await prisma.$transaction([
            prisma.task.create({
              data: {
                title: t.title,
                description: t.description,
                status: "TODO",
                priority: t.priority,
                dueDate: nextDue,
                labels: t.labels,
                listId: t.listId,
                createdById: t.createdById,
                recurrence: t.recurrence,
                sourceType: t.sourceType,
                sourceId: t.sourceId,
                assignees: { create: t.assignees.map((a) => ({ userId: a.userId })) },
              },
            }),
            prisma.task.update({ where: { id: t.id }, data: { recurrence: null } }),
          ]);
          cloned++;
        }
        logger.info({ cloned }, "[cleanup-worker] Recurring tasks rolled forward");
        return;
      }

      if (type === "TASK_DUE_SOON") {
        // Notify assignees ~24h before a task's due date, once.
        const windowStart = new Date();
        const windowEnd = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const dueSoon = await prisma.task.findMany({
          where: {
            status: { not: "DONE" },
            dueDate: { gte: windowStart, lte: windowEnd },
          },
          include: { assignees: true },
        });

        let notified = 0;
        for (const t of dueSoon) {
          const recipients = new Set<string>([t.createdById, ...t.assignees.map((a) => a.userId)]);
          for (const userId of recipients) {
            // Best-effort de-dupe: skip if we already sent a due-soon notice
            // for this exact task to this user (matched by link).
            const already = await prisma.notification.findFirst({
              where: { userId, type: "TASK_DUE_SOON", link: `/tasks?taskId=${t.id}` },
              select: { id: true },
            });
            if (already) continue;
            await createNotification({
              userId,
              type: "TASK_DUE_SOON",
              title: "Task due soon",
              body: `"${t.title}" is due within 24 hours`,
              link: `/tasks?taskId=${t.id}`,
            });
            notified++;
          }
        }
        logger.info({ notified }, "[cleanup-worker] Due-soon task reminders sent");
        return;
      }

      if (type === "STATUS_PING") {
        const result = await runHealthCheck();
        await prisma.systemStatusPing.create({ data: result });
        // Keep ~90 days of history for the public status page's uptime %
        const cutoff = new Date(Date.now() - 90 * 86_400_000);
        await prisma.systemStatusPing.deleteMany({ where: { checkedAt: { lt: cutoff } } }).catch(() => {});
        logger.debug({ result }, "[cleanup-worker] Status ping recorded");
        return;
      }

      logger.warn({ type }, "[cleanup-worker] Unknown job type — skipping");
    },
    {
      connection: redisConnection,
      drainDelay: 60000,
      stalledInterval: 60000,
      lockDuration: 120000,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "[cleanup-worker] Job failed");
  });

  return worker;
}
