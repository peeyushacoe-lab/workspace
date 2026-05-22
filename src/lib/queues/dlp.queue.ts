import { Queue } from "bullmq";
import { redisConnection } from "@/lib/redis";

export const DLP_QUEUE_NAME = "dlp-scan";

export const dlpQueue = new Queue(DLP_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
  },
});
