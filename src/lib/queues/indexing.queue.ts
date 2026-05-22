import { Queue } from "bullmq";
import { redisConnection } from "@/lib/redis";

export const INDEXING_QUEUE_NAME = "search-indexing";

export const indexingQueue = new Queue(INDEXING_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },
});

export type IndexingJobData =
  | {
      type: "INDEX";
      resource: "email" | "chat_message" | "file" | "note" | "doc" | "calendar_event";
      resourceId: string;
      content: string;
      metadata: Record<string, string | number | boolean>;
    }
  | {
      type: "DEINDEX";
      resource: "email" | "chat_message" | "file" | "note" | "doc" | "calendar_event";
      resourceId: string;
    };
