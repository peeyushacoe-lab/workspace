import { Queue } from "bullmq";
import { redisConnection } from "@/lib/redis";

export const IMPORT_QUEUE_NAME = "mail-import";

export const importQueue = new Queue(IMPORT_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    // Don't auto-retry a partial mailbox import — a retry would re-walk
    // already-imported folders. The user restarts explicitly from the UI.
    attempts: 1,
    removeOnComplete: { count: 20 },
    removeOnFail: { count: 50 },
  },
});

export type ImportJobData = {
  type: "IMAP_IMPORT";
  importJobId: string;
};
