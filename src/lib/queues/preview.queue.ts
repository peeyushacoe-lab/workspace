import { Queue } from "bullmq";
import { redisConnection } from "@/lib/redis";

export const PREVIEW_QUEUE_NAME = "file-previews";

export const previewQueue = new Queue(PREVIEW_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "fixed", delay: 3000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },
});

export type PreviewJobData = {
  fileId: string;
  fileName: string;
  mimeType: string;
  s3Key: string;
  actorId: string;
};
