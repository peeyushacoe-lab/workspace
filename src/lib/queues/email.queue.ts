import { Queue } from "bullmq";
import { redisConnection } from "@/lib/redis";

export const EMAIL_QUEUE_NAME = "outbound-email";

export const emailQueue = new Queue(EMAIL_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
  },
});
