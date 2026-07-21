import { Queue } from "bullmq";
import { redisConnection } from "@/lib/redis";

export const CLEANUP_QUEUE_NAME = "cleanup";

export const cleanupQueue = new Queue(CLEANUP_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "fixed", delay: 10000 },
    removeOnComplete: { count: 20 },
    removeOnFail: { count: 50 },
  },
});

export type CleanupJobData =
  | { type: "EXPIRED_SESSIONS" }
  | { type: "EXPIRED_SHARE_LINKS" }
  | { type: "STALE_NOTIFICATIONS"; olderThanDays: number }
  | { type: "OLD_AUDIT_LOGS"; olderThanDays: number }
  | { type: "TRASHED_FILES"; olderThanDays: number }
  | { type: "EXPIRED_DRAFTS"; olderThanDays: number }
  | { type: "STATUS_PING" }
  | { type: "RESTORE_DRILL" }
  | { type: "UNSNOOZE_DUE_THREADS" }
  | { type: "SENTINEL_CORRELATION" }
  | { type: "TASK_RECURRENCE" }
  | { type: "TASK_DUE_SOON" };
