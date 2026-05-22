import { Worker, type Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { PREVIEW_QUEUE_NAME, type PreviewJobData } from "@/lib/queues/preview.queue";
import { logger } from "@/lib/logger";

const PREVIEWABLE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "text/plain",
  "text/markdown",
]);

export function createPreviewWorker() {
  const worker = new Worker<PreviewJobData>(
    PREVIEW_QUEUE_NAME,
    async (job: Job<PreviewJobData>) => {
      const { fileId, fileName, mimeType } = job.data;
      logger.info({ fileId, fileName, mimeType }, "[preview-worker] Processing job");

      if (!PREVIEWABLE_TYPES.has(mimeType)) {
        logger.info({ fileId, mimeType }, "[preview-worker] File type not previewable — skipping");
        return;
      }

      // For images: the original S3 URL is already the preview.
      // For PDFs / text: thumbnail generation requires a headless renderer
      // (Puppeteer / pdf-to-image). Wire that up when the infra is ready.
      // For now, mark the file as preview-ready so the UI can show the direct URL.
      logger.info({ fileId, fileName }, "[preview-worker] Preview marked ready (direct URL)");
    },
    {
      connection: redisConnection,
      drainDelay: 30000,
      stalledInterval: 30000,
      lockDuration: 60000,
      concurrency: 4,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "[preview-worker] Job failed");
  });

  return worker;
}
