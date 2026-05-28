import { Queue } from "bullmq";
import { redisConnection } from "@/lib/redis";

export const MAIL_RULES_QUEUE_NAME = "mail-rules";

export type MailRulesJobData = {
  messageId: string;
  mailboxId: string;
  userId: string | null;
};

export const mailRulesQueue = new Queue<MailRulesJobData>(MAIL_RULES_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: { attempts: 2, backoff: { type: "fixed", delay: 5000 }, removeOnComplete: 50, removeOnFail: 20 },
});
