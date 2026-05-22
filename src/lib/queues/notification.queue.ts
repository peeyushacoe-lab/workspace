import { Queue } from "bullmq";
import { redisConnection } from "@/lib/redis";

export const NOTIFICATION_QUEUE_NAME = "notifications";

export const notificationQueue = new Queue(NOTIFICATION_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
});

export type NotificationJobData =
  | {
      type: "IN_APP";
      userId: string;
      title: string;
      body: string;
      link?: string;
    }
  | {
      type: "EMAIL_DIGEST";
      userId: string;
      email: string;
      unreadCount: number;
      period: "daily" | "weekly";
    }
  | {
      type: "PUSH";
      userId: string;
      title: string;
      body: string;
      url?: string;
    };
