import type { Worker, Job } from "bullmq";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";

// ─── Failed-job alerting (Phase 2b) ───────────────────────────────────────────
// The worker's existing `failed` handler logs EVERY attempt failure, including
// intermediate retries. This monitor fires only on TERMINAL failure (all retries
// exhausted), persists it to the audit log, and escalates a single alert when a
// queue exceeds a failure threshold within a rolling window — so a spike (bad
// deploy, downstream outage) surfaces instead of scrolling past in the logs.

const ALERT_WINDOW_SEC = 300; // 5-minute rolling window
const ALERT_THRESHOLD = 5;    // >= this many terminal failures in the window → escalate

function isTerminal(job?: Job): boolean {
  if (!job) return true;
  const maxAttempts = job.opts?.attempts ?? 1;
  return job.attemptsMade >= maxAttempts;
}

async function handleFailure(queueName: string, job: Job | undefined, err: Error): Promise<void> {
  // Still has retries left — BullMQ will re-attempt; not an alert yet.
  if (!isTerminal(job)) return;

  const detail = {
    queue: queueName,
    jobId: job?.id ?? null,
    jobName: job?.name ?? null,
    attemptsMade: job?.attemptsMade ?? null,
    reason: err?.message?.slice(0, 500) ?? "unknown",
  };
  logger.error(detail, "Job failed terminally (retries exhausted)");

  await prisma.auditLog
    .create({
      data: {
        action: "QUEUE_JOB_FAILED",
        targetType: "QueueJob",
        targetId: job?.id ?? null,
        metadata: detail,
      },
    })
    .catch((e) => logger.error({ err: String(e) }, "failed to persist QUEUE_JOB_FAILED"));

  // Rolling per-queue failure counter. First failure in a window sets the TTL.
  const countKey = `queue:failcount:${queueName}`;
  const count = await redis.incr(countKey);
  if (count === 1) await redis.expire(countKey, ALERT_WINDOW_SEC);

  if (count >= ALERT_THRESHOLD) {
    // Escalate at most once per window (NX + TTL dedupes).
    const alerted = await redis.set(`queue:alerted:${queueName}`, "1", "EX", ALERT_WINDOW_SEC, "NX");
    if (alerted === "OK") {
      logger.error(
        { queue: queueName, failures: count, windowSec: ALERT_WINDOW_SEC },
        "🚨 Queue failure spike — escalating alert",
      );
      await prisma.auditLog
        .create({
          data: {
            action: "QUEUE_ALERT",
            targetType: "Queue",
            targetId: queueName,
            metadata: { failures: count, windowSec: ALERT_WINDOW_SEC },
          },
        })
        .catch(() => {});
    }
  }
}

/** Attach terminal-failure alerting to a worker. Call once per worker at startup. */
export function attachFailedJobAlerts(worker: Worker, queueName: string): void {
  worker.on("failed", (job, err) => {
    void handleFailure(queueName, job, err instanceof Error ? err : new Error(String(err)));
  });
}
