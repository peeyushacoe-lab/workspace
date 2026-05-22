import { Worker, type Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { INDEXING_QUEUE_NAME, type IndexingJobData } from "@/lib/queues/indexing.queue";
import { logger } from "@/lib/logger";

export function createIndexingWorker() {
  const worker = new Worker<IndexingJobData>(
    INDEXING_QUEUE_NAME,
    async (job: Job<IndexingJobData>) => {
      const { type } = job.data;
      logger.info({ type, jobId: job.id }, "[indexing-worker] Processing job");

      // Meilisearch / Typesense integration goes here (Phase 4).
      // For now, log the event so we have a paper trail when the engine is wired.
      if (type === "INDEX") {
        const { resource, resourceId, content } = job.data;
        logger.info(
          { resource, resourceId, contentLength: content.length },
          "[indexing-worker] INDEX job received — awaiting search engine integration",
        );
        return;
      }

      if (type === "DEINDEX") {
        const { resource, resourceId } = job.data;
        logger.info(
          { resource, resourceId },
          "[indexing-worker] DEINDEX job received — awaiting search engine integration",
        );
        return;
      }

      logger.warn({ type }, "[indexing-worker] Unknown job type — skipping");
    },
    {
      connection: redisConnection,
      drainDelay: 30000,
      stalledInterval: 30000,
      lockDuration: 60000,
      concurrency: 5,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "[indexing-worker] Job failed");
  });

  return worker;
}
