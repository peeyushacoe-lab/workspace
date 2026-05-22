import { Worker, Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { EMAIL_QUEUE_NAME } from "@/lib/queues/email.queue";
import { sendEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { EmailStatus } from "@/generated/prisma/enums";
import { logger } from "@/lib/logger";

export function createEmailWorker() {
  const worker = new Worker(
    EMAIL_QUEUE_NAME,
    async (job: Job) => {
      const { 
        logId, 
        subject, 
        body, 
        contact, 
        signature, 
        fromEmail 
      } = job.data;

      logger.info({ email: contact.email, logId }, "Processing email job");

      // Check Suppression List
      const suppressed = await prisma.suppressionList.findUnique({
        where: { email: contact.email.toLowerCase() }
      });

      if (suppressed) {
        logger.warn({ email: contact.email, reason: suppressed.reason }, "Email suppressed. Skipping.");
        await prisma.emailLog.update({
          where: { id: logId },
          data: {
            status: EmailStatus.FAILED,
            error: `Recipient suppressed: ${suppressed.reason}`,
            updatedAt: new Date(),
          },
        });
        return;
      }

      try {
        const result = await sendEmail(subject, body, contact, signature, fromEmail);

        await prisma.emailLog.update({
          where: { id: logId },
          data: {
            status: EmailStatus.SENT,
            resendId: result.id,
            updatedAt: new Date(),
          },
        });

        logger.info({ email: contact.email, resendId: result.id }, "Successfully sent email");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ error: message, email: contact.email }, "Failed to send email");

        await prisma.emailLog.update({
          where: { id: logId },
          data: {
            status: EmailStatus.FAILED,
            error: message,
            updatedAt: new Date(),
          },
        });

        throw error;
      }
    },
    {
      connection: redisConnection,
      // Upstash has a 500k request/day limit. Default drainDelay is 5ms
      // which burns ~200 polls/sec per worker when idle. 30s delay keeps
      // idle polling at ~2 polls/min, well within free tier limits.
      drainDelay: 30000,
      stalledInterval: 30000,
      lockDuration: 60000,
    }
  );

  worker.on("failed", (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed:`, err);
  });

  return worker;
}
