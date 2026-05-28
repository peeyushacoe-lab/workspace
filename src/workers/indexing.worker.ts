import { Worker, type Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { INDEXING_QUEUE_NAME, type IndexingJobData } from "@/lib/queues/indexing.queue";
import { indexDocument, deindexDocument } from "@/lib/search-engine";
import { logger } from "@/lib/logger";

export function createIndexingWorker() {
  const worker = new Worker<IndexingJobData>(
    INDEXING_QUEUE_NAME,
    async (job: Job<IndexingJobData>) => {
      const { type } = job.data;

      if (type === "INDEX") {
        const { resource, resourceId, content, metadata } = job.data;
        logger.info({ resource, resourceId }, "[indexing-worker] Indexing document");
        await indexDocument(resource, resourceId, { content, ...metadata });
        return;
      }

      if (type === "DEINDEX") {
        const { resource, resourceId } = job.data;
        logger.info({ resource, resourceId }, "[indexing-worker] De-indexing document");
        await deindexDocument(resource, resourceId);
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
