import "dotenv/config";
import { Worker } from "bullmq";
import { createEmailWorker } from "../src/workers/email.worker";
import { createDLPWorker } from "../src/workers/dlp.worker";
import { createNotificationWorker } from "../src/workers/notification.worker";
import { createAIWorker } from "../src/workers/ai.worker";
import { createPreviewWorker } from "../src/workers/preview.worker";
import { createCleanupWorker } from "../src/workers/cleanup.worker";
import { createIndexingWorker } from "../src/workers/indexing.worker";
import { createSecuritySyncWorker } from "../src/workers/security-sync.worker";
import { createMailRulesWorker } from "../src/workers/mail-rules.worker";
import { processScheduledEmails } from "../src/workers/scheduled-send.worker";
import { cleanupQueue } from "../src/lib/queues/cleanup.queue";
import { logger } from "../src/lib/logger";

logger.info("CyberSage Background Workers Starting...");

// ---------------------------------------------------------------------------
// Upstash eviction policy guard — BullMQ job loss is silent when Redis evicts
// keys under memory pressure. noeviction makes Redis return errors instead of
// silently dropping jobs. Warn loudly; don't exit (Upstash managed Redis may
// not expose CONFIG GET, so a thrown error here would block all workers).
// ---------------------------------------------------------------------------
import { redis } from "../src/lib/redis";
async function checkEvictionPolicy() {
  try {
    // Upstash returns an empty array for CONFIG GET on managed plans
    const result = await redis.call("CONFIG", "GET", "maxmemory-policy") as string[];
    if (result.length >= 2) {
      const policy = result[1];
      if (policy !== "noeviction") {
        logger.warn(
          { policy },
          "⚠  Redis maxmemory-policy is not 'noeviction' — BullMQ jobs can be silently evicted under memory pressure. " +
          "Set maxmemory-policy=noeviction in your Upstash Redis config."
        );
      } else {
        logger.info("Redis eviction policy: noeviction ✔");
      }
    } else {
      logger.warn("Could not read Redis maxmemory-policy (managed Redis may not expose CONFIG GET). Verify manually in Upstash console.");
    }
  } catch {
    logger.warn("Redis CONFIG GET unavailable — verify maxmemory-policy=noeviction manually in Upstash console.");
  }
}
checkEvictionPolicy().catch(() => {});

const emailWorker        = createEmailWorker();
const dlpWorker          = createDLPWorker();
const mailRulesWorker    = createMailRulesWorker();
const notificationWorker = createNotificationWorker();
const aiWorker           = createAIWorker();
const previewWorker      = createPreviewWorker();
const cleanupWorker      = createCleanupWorker();
const indexingWorker     = createIndexingWorker();
const securitySyncWorker = createSecuritySyncWorker();

// ---------------------------------------------------------------------------
// Rate-limit backoff — pauses the worker for 5 min when Upstash quota is hit
// ---------------------------------------------------------------------------
function attachRateLimitHandler(worker: Worker, name: string) {
  let paused = false;
  worker.on("error", async (err) => {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("max requests limit exceeded")) {
      if (paused) return;
      paused = true;
      logger.warn({ worker: name }, "Upstash request limit hit — pausing worker for 5 minutes");
      try {
        await worker.pause();
        setTimeout(async () => {
          try {
            await worker.resume();
            logger.info({ worker: name }, "Worker resumed after rate-limit backoff");
          } finally {
            paused = false;
          }
        }, 5 * 60 * 1000);
      } catch {
        paused = false;
      }
    } else {
      logger.error({ worker: name, err: message }, "Worker error");
    }
  });
}

const allWorkers: [Worker, string][] = [
  [emailWorker,        "outbound-email"],
  [dlpWorker,          "dlp-scan"],
  [notificationWorker, "notifications"],
  [aiWorker,           "ai-jobs"],
  [previewWorker,      "file-previews"],
  [cleanupWorker,      "cleanup"],
  [indexingWorker,     "search-indexing"],
  [securitySyncWorker, "security-sync"],
  [mailRulesWorker,    "mail-rules"],
];

for (const [worker, name] of allWorkers) {
  attachRateLimitHandler(worker, name);
  worker.on("failed", (job, err) => {
    logger.error({ worker: name, jobId: job?.id, err: err.message }, "Job failed");
  });
  worker.on("completed", (job) => {
    logger.debug({ worker: name, jobId: job.id }, "Job completed");
  });
}

// ---------------------------------------------------------------------------
// Recurring cleanup jobs — schedule on startup if not already scheduled
// ---------------------------------------------------------------------------
async function scheduleCleanupJobs() {
  const repeatOpts = { pattern: "0 3 * * *" }; // 03:00 UTC daily

  await cleanupQueue.add("expired-sessions",    { type: "EXPIRED_SESSIONS" },           { repeat: repeatOpts, jobId: "cleanup-sessions" });
  await cleanupQueue.add("expired-share-links", { type: "EXPIRED_SHARE_LINKS" },         { repeat: repeatOpts, jobId: "cleanup-share-links" });
  await cleanupQueue.add("stale-notifications", { type: "STALE_NOTIFICATIONS", olderThanDays: 30 }, { repeat: repeatOpts, jobId: "cleanup-notifications" });
  await cleanupQueue.add("old-audit-logs",      { type: "OLD_AUDIT_LOGS",      olderThanDays: 90 }, { repeat: repeatOpts, jobId: "cleanup-audit-logs" });
  await cleanupQueue.add("trashed-files",       { type: "TRASHED_FILES",       olderThanDays: 30 }, { repeat: repeatOpts, jobId: "cleanup-trashed-files" });
  await cleanupQueue.add("expired-drafts",      { type: "EXPIRED_DRAFTS",      olderThanDays: 60 }, { repeat: repeatOpts, jobId: "cleanup-drafts" });

  logger.info("Recurring cleanup jobs scheduled");
}

scheduleCleanupJobs().catch((err) => logger.error({ err }, "Failed to schedule cleanup jobs"));

// Poll for scheduled emails every 60 seconds
setInterval(() => {
  processScheduledEmails().catch((err) => logger.error({ err }, "[scheduled-send] Poll failed"));
}, 60_000);
processScheduledEmails().catch(() => {});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
const shutdown = async () => {
  logger.info("Shutting down workers...");
  await Promise.all(allWorkers.map(([w]) => w.close()));
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ---------------------------------------------------------------------------
// Process-level safety net — catch anything that slips past individual worker
// error handlers so the process doesn't silently die.
// ---------------------------------------------------------------------------
process.on("unhandledRejection", (reason) => {
  logger.error({ reason: String(reason) }, "Unhandled promise rejection in worker process");
  // Do NOT exit — BullMQ will recover the job on next poll.
});

process.on("uncaughtException", (err) => {
  logger.error({ err: err.message, stack: err.stack }, "Uncaught exception in worker process");
  // Fatal — exit so the process manager (systemd/PM2/Fly) can restart cleanly.
  process.exit(1);
});

// ---------------------------------------------------------------------------
// Redis heartbeat — ping every 30 s; if 3 consecutive pings fail, exit so the
// process manager restarts the worker (avoids silent zombie state where workers
// appear running but can't reach Redis and silently drop jobs).
// ---------------------------------------------------------------------------
let redisMisses = 0;
setInterval(async () => {
  try {
    await redis.ping();
    redisMisses = 0;
  } catch {
    redisMisses++;
    logger.warn({ misses: redisMisses }, "Redis ping failed");
    if (redisMisses >= 3) {
      logger.error("Redis unreachable for 90 s — exiting for process manager restart");
      process.exit(1);
    }
  }
}, 30_000);

logger.info(
  { workers: allWorkers.map(([, name]) => name) },
  `All ${allWorkers.length} workers running`,
);
