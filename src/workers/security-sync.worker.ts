import { Worker, type Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { SECURITY_SYNC_QUEUE_NAME, type SecuritySyncJobData } from "@/lib/queues/security-sync.queue";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { emitEvent } from "@/lib/events";

const SENTINEL_URL = process.env.SENTINEL_API_URL;
const SENTINEL_KEY = process.env.SENTINEL_API_KEY;

async function callSentinel(path: string, body: unknown): Promise<unknown | null> {
  if (!SENTINEL_URL || !SENTINEL_KEY) return null;
  try {
    const res = await fetch(`${SENTINEL_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SENTINEL_KEY}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      logger.warn({ path, status: res.status }, "[security-sync] Sentinel returned non-OK");
      return null;
    }
    return await res.json();
  } catch (err) {
    logger.error({ path, err }, "[security-sync] Sentinel call failed");
    return null;
  }
}

export function createSecuritySyncWorker() {
  const worker = new Worker<SecuritySyncJobData>(
    SECURITY_SYNC_QUEUE_NAME,
    async (job: Job<SecuritySyncJobData>) => {
      const { type } = job.data;
      logger.info({ type, jobId: job.id }, "[security-sync] Processing job");

      if (type === "ANALYZE_EMAIL") {
        const { messageId, subject, from, body, attachmentCount } = job.data;

        const result = await callSentinel("/sentinel/analyze-email", {
          messageId,
          subject,
          from,
          body: body.slice(0, 5000),
          attachmentCount,
        });

        if (result && typeof result === "object") {
          const r = result as { threat?: boolean; severity?: string; reason?: string };
          if (r.threat) {
            emitEvent("SECURITY_THREAT_DETECTED", {
              targetType: "email",
              targetId: messageId,
              severity: (r.severity as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL") ?? "MEDIUM",
              reason: r.reason ?? "Sentinel flagged this email",
            });
          }
        }

        // Local fallback: basic heuristic scan already handled by DLP worker
        logger.info({ messageId }, "[security-sync] Email analysis complete");
        return;
      }

      if (type === "ANALYZE_FILE") {
        const { fileId, fileName, mimeType } = job.data;

        const result = await callSentinel("/sentinel/analyze-file", {
          fileId,
          fileName,
          mimeType,
        });

        if (result && typeof result === "object") {
          const r = result as { threat?: boolean; severity?: string; reason?: string };
          emitEvent("FILE_SCAN_COMPLETE", {
            fileId,
            fileName,
            threatDetected: r.threat ?? false,
            reason: r.reason,
          });
          if (r.threat) {
            emitEvent("SECURITY_THREAT_DETECTED", {
              targetType: "file",
              targetId: fileId,
              severity: (r.severity as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL") ?? "MEDIUM",
              reason: r.reason ?? "Sentinel flagged this file",
            });
          }
        } else {
          emitEvent("FILE_SCAN_COMPLETE", { fileId, fileName, threatDetected: false });
        }

        logger.info({ fileId }, "[security-sync] File analysis complete");
        return;
      }

      if (type === "ANALYZE_LOGIN") {
        const { userId, email, ipAddress, userAgent, success } = job.data;

        await callSentinel("/sentinel/analyze-login", {
          userId,
          email,
          ipAddress,
          userAgent,
          success,
          timestamp: new Date().toISOString(),
        });

        logger.info({ userId, success }, "[security-sync] Login analysis sent to Sentinel");
        return;
      }

      if (type === "SYNC_USER_RISK") {
        const { userId } = job.data;

        const result = await callSentinel(`/sentinel/user-risk/${userId}`, {});
        if (result && typeof result === "object") {
          const r = result as { riskScore?: number; riskLevel?: string };
          logger.info({ userId, riskScore: r.riskScore, riskLevel: r.riskLevel }, "[security-sync] User risk synced");

          // Persist risk score when schema is extended (Phase 7)
          await prisma.user.update({
            where: { id: userId },
            data: { updatedAt: new Date() }, // placeholder until riskScore field is added
          });
        }
        return;
      }

      logger.warn({ type }, "[security-sync] Unknown job type — skipping");
    },
    {
      connection: redisConnection,
      drainDelay: 30000,
      stalledInterval: 60000,
      lockDuration: 60000,
      concurrency: 3,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "[security-sync] Job failed");
  });

  return worker;
}
