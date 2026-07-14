import { Worker, type Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { CLEANUP_QUEUE_NAME, type CleanupJobData } from "@/lib/queues/cleanup.queue";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { runHealthCheck } from "@/lib/health-check";
import { runAndRecordRestoreDrill } from "../../scripts/restore-drill";
import { runSentinelCorrelation } from "@/lib/sentinel/correlation-engine";

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
