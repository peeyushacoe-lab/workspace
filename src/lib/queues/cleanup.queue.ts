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
  | { type: "TASK_DUE_SOON" }
  // Per-organisation chat message retention. No-op unless an admin sets a
  // window in Connect Admin → Retention.
  | { type: "CHAT_RETENTION" }
  // Flips ClientFee rows from INVOICED to OVERDUE once their due date has
  // passed with nothing paid. See src/lib/clients.ts `derivedFeeStatus` — this
  // job is what makes that derivation true in the database rather than only
  // when someone happens to PATCH the fee.
  | { type: "CLIENT_FEES_OVERDUE" };
