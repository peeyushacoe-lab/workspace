import { Queue } from "bullmq";
import { redisConnection } from "@/lib/redis";

export const AI_QUEUE_NAME = "ai-jobs";

export const aiQueue = new Queue(AI_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
  },
});

export type AIJobData =
  | {
      type: "EMBED_DOCUMENT";
      resourceType: "note" | "doc" | "file" | "email";
      resourceId: string;
      content: string;
      actorId: string;
    }
  | {
      type: "SUMMARIZE_FILE";
      fileId: string;
      fileName: string;
      content: string;
      actorId: string;
    }
  | {
      type: "CLASSIFY_EMAIL";
      messageId: string;
      subject: string;
      body: string;
    }
  | {
      type: "EXTRACT_ACTION_ITEMS";
      resourceType: "chat_channel" | "email_thread";
      resourceId: string;
      actorId: string;
    };
