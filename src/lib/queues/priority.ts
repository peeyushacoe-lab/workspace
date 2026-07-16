// ─── Job priority tiers (Phase 2b) ────────────────────────────────────────────
// BullMQ semantics: a LOWER `priority` number is processed SOONER. Priority only
// orders jobs WITHIN a single queue's waiting set — it does not reorder across
// queues (each queue has its own worker). Cross-concern prioritization in Nexus is
// therefore achieved two ways:
//   1. Per-queue default priority below (documents intent + orders mixed job types
//      within a queue, e.g. an urgent security re-sync ahead of a routine one).
//   2. Worker concurrency / dedicated workers per queue (a slow AI job never blocks
//      an email because they run in separate workers).
//
// Use `JOB_PRIORITY.URGENT` as a per-job override when enqueuing something that must
// jump the queue (e.g. a password-reset email):
//   emailQueue.add("password-reset", data, { priority: JOB_PRIORITY.URGENT });

export const JOB_PRIORITY = {
  URGENT: 1, // password reset, security alerts — must not wait behind bulk work
  HIGH: 2,   // security sync, DLP scans
  NORMAL: 5, // transactional email, notifications
  LOW: 10,   // AI summaries, search indexing, previews, cleanup, bulk import/export
} as const;

export type JobPriority = (typeof JOB_PRIORITY)[keyof typeof JOB_PRIORITY];

// Default priority per queue, by roadmap tier. Referenced from each queue's
// `defaultJobOptions` so the tiering lives in one place.
export const QUEUE_DEFAULT_PRIORITY = {
  "security-sync": JOB_PRIORITY.HIGH,
  "dlp-scan": JOB_PRIORITY.HIGH,
  "outbound-email": JOB_PRIORITY.NORMAL,
  "notifications": JOB_PRIORITY.NORMAL,
  "mail-rules": JOB_PRIORITY.NORMAL,
  "ai-jobs": JOB_PRIORITY.LOW,
  "search-indexing": JOB_PRIORITY.LOW,
  "file-previews": JOB_PRIORITY.LOW,
  "cleanup": JOB_PRIORITY.LOW,
  "mail-import": JOB_PRIORITY.LOW,
  "account-export": JOB_PRIORITY.LOW,
} as const;
