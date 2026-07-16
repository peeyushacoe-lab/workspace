import { Queue } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { QUEUE_DEFAULT_PRIORITY } from "./priority";

export const DLP_QUEUE_NAME = "dlp-scan";

export const dlpQueue = new Queue(DLP_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    priority: QUEUE_DEFAULT_PRIORITY["dlp-scan"], // HIGH
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
  },
});
