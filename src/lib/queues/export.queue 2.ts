import { Queue } from "bullmq";
import { redisConnection } from "@/lib/redis";

export const EXPORT_QUEUE_NAME = "account-export";

export const exportQueue = new Queue(EXPORT_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 20 },
    removeOnFail: { count: 50 },
  },
});

export type ExportJobData = {
  type: "ACCOUNT_EXPORT";
  exportJobId: string;
};
