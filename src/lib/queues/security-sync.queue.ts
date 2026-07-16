import { Queue } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { QUEUE_DEFAULT_PRIORITY } from "./priority";

export const SECURITY_SYNC_QUEUE_NAME = "security-sync";

export const securitySyncQueue = new Queue(SECURITY_SYNC_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 3000 },
    priority: QUEUE_DEFAULT_PRIORITY["security-sync"], // HIGH
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 200 },
  },
});

// Jobs dispatched when Sentinel APIs are available.
// Until then the worker processes them locally (DLP scan, audit log write).
export type SecuritySyncJobData =
  | {
      type: "ANALYZE_EMAIL";
      messageId: string;
      subject: string;
      from: string;
      body: string;
      attachmentCount: number;
    }
  | {
      type: "ANALYZE_FILE";
      fileId: string;
      fileName: string;
      mimeType: string;
      s3Key: string;
    }
  | {
      type: "ANALYZE_LOGIN";
      userId: string;
      email: string;
      ipAddress: string;
      userAgent: string;
      success: boolean;
    }
  | {
      type: "SYNC_USER_RISK";
      userId: string;
    };
