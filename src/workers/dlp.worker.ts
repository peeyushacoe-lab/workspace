import { Worker, Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { DLP_QUEUE_NAME } from "@/lib/queues/dlp.queue";
import { emailQueue } from "@/lib/queues/email.queue";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const SENSITIVE_PATTERNS = [
  { name: "AWS Key", regex: /AKIA[0-9A-Z]{16}/ },
  { name: "Private Key", regex: /-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----/ },
  { name: "Generic Secret", regex: /(password|secret|key|token)\s*[:=]\s*["']?[a-zA-Z0-9_\-]{20,}["']?/i },
];

export function createDLPWorker() {
  const worker = new Worker(
    DLP_QUEUE_NAME,
    async (job: Job) => {
      const { subject, body, contact, logId } = job.data;
      const content = `${subject} ${body}`;

      logger.info({ email: contact.email, logId }, "DLP Scan starting");

      const findings: string[] = [];

      for (const pattern of SENSITIVE_PATTERNS) {
        if (pattern.regex.test(content)) {
          findings.push(`Potential ${pattern.name} detected.`);
        }
      }

      if (findings.length > 0) {
        logger.warn({ email: contact.email, logId, findings }, "DLP violation detected! Quarantining email.");
        
        await prisma.emailLog.update({
          where: { id: logId },
          data: {
            status: "FAILED",
            error: `DLP Violation: ${findings.join(" ")}`,
            updatedAt: new Date(),
          },
        });

        // Optional: Send alert to CISO/Admin
        return;
      }

      logger.info({ email: contact.email, logId }, "DLP Scan clean. Forwarding to Email Queue.");

      // Forward to email queue
      await emailQueue.add(`email-${logId}`, job.data);
    },
    {
      connection: redisConnection,
      drainDelay: 30000,
      stalledInterval: 30000,
      lockDuration: 60000,
    }
  );

  return worker;
}
