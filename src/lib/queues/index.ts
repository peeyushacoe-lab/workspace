// Central queue registry — import queues from here, not from individual files,
// so there's one place to see every queue in the system.

export { emailQueue, EMAIL_QUEUE_NAME } from "./email.queue";
export { dlpQueue, DLP_QUEUE_NAME } from "./dlp.queue";
export { notificationQueue, NOTIFICATION_QUEUE_NAME } from "./notification.queue";
export { aiQueue, AI_QUEUE_NAME } from "./ai.queue";
export { previewQueue, PREVIEW_QUEUE_NAME } from "./preview.queue";
export { cleanupQueue, CLEANUP_QUEUE_NAME } from "./cleanup.queue";
export { indexingQueue, INDEXING_QUEUE_NAME } from "./indexing.queue";
export { securitySyncQueue, SECURITY_SYNC_QUEUE_NAME } from "./security-sync.queue";
export { importQueue, IMPORT_QUEUE_NAME } from "./import.queue";
export { exportQueue, EXPORT_QUEUE_NAME } from "./export.queue";

export type { NotificationJobData } from "./notification.queue";
export type { AIJobData } from "./ai.queue";
export type { PreviewJobData } from "./preview.queue";
export type { CleanupJobData } from "./cleanup.queue";
export type { IndexingJobData } from "./indexing.queue";
export type { SecuritySyncJobData } from "./security-sync.queue";
export type { ImportJobData } from "./import.queue";
export type { ExportJobData } from "./export.queue";

// All queue names — useful for health checks and monitoring
export const ALL_QUEUE_NAMES = [
  "outbound-email",
  "dlp-scan",
  "notifications",
  "ai-jobs",
  "file-previews",
  "cleanup",
  "search-indexing",
  "security-sync",
  "mail-import",
  "account-export",
] as const;

export type QueueName = (typeof ALL_QUEUE_NAMES)[number];
