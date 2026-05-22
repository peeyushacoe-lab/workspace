// Notifications module — in-app, email digest, push
export { createNotification } from "@/lib/notifications";
export { notificationQueue, NOTIFICATION_QUEUE_NAME } from "@/lib/queues/notification.queue";
export type { NotificationJobData } from "@/lib/queues/notification.queue";
