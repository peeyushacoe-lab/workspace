import { Worker, type Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { AI_QUEUE_NAME, type AIJobData } from "@/lib/queues/ai.queue";
import { logger } from "@/lib/logger";
import { getAIClient, AI_MODEL } from "@/lib/ai";
import { emitEvent } from "@/lib/events";

export function createAIWorker() {
  const worker = new Worker<AIJobData>(
    AI_QUEUE_NAME,
    async (job: Job<AIJobData>) => {
      const { type } = job.data;
      const start = Date.now();
      logger.info({ type, jobId: job.id }, "[ai-worker] Processing job");

      if (type === "SUMMARIZE_FILE") {
        const { fileId, fileName, content, actorId } = job.data;
        if (!content.trim()) return;

        const response = await getAIClient().chat.completions.create({
          model: AI_MODEL,
          messages: [
            {
              role: "system",
              content:
                "You are a document summarizer. Produce a concise 3-5 sentence summary of the document. Focus on key points, decisions, and action items.",
            },
            { role: "user", content: `Document: ${fileName}\n\n${content.slice(0, 8000)}` },
          ],
          max_tokens: 300,
          temperature: 0.3,
        });

        const summary = response.choices[0]?.message?.content ?? "";
        const tokensUsed = response.usage?.total_tokens;
        logger.info({ fileId, tokensUsed }, "[ai-worker] File summarized");

        emitEvent("AI_INTERACTION", {
          actorId,
          type: "SUMMARIZE_FILE",
          model: AI_MODEL,
          tokensUsed,
          latencyMs: Date.now() - start,
        });

        // Store summary — update file metadata when schema supports it
        logger.info({ fileId, summary: summary.slice(0, 80) }, "[ai-worker] Summary ready");
        return;
      }

      if (type === "CLASSIFY_EMAIL") {
        const { messageId, subject, body } = job.data;

        const response = await getAIClient().chat.completions.create({
          model: AI_MODEL,
          messages: [
            {
              role: "system",
              content:
                "Classify this email into one category: NEWSLETTER, NOTIFICATION, PROMOTION, PERSONAL, WORK, SECURITY, SPAM. Reply with only the category word.",
            },
            { role: "user", content: `Subject: ${subject}\n\n${body.slice(0, 2000)}` },
          ],
          max_tokens: 10,
          temperature: 0,
        });

        const category = response.choices[0]?.message?.content?.trim() ?? "WORK";
        logger.info({ messageId, category }, "[ai-worker] Email classified");
        return;
      }

      if (type === "EMBED_DOCUMENT" || type === "EXTRACT_ACTION_ITEMS") {
        // Placeholder — implement when pgvector / Brain integration is ready
        logger.info({ type, jobId: job.id }, "[ai-worker] Job type queued for Brain integration");
        return;
      }

      logger.warn({ type }, "[ai-worker] Unknown job type — skipping");
    },
    {
      connection: redisConnection,
      drainDelay: 30000,
      stalledInterval: 60000,
      lockDuration: 120000,
      concurrency: 2,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "[ai-worker] Job failed");
  });

  return worker;
}
