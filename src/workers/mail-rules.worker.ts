/**
 * Mail Rules Worker — Phase 19 Enterprise Mail
 * Evaluates MailRule conditions against a newly-arrived InboxMessage and
 * applies the configured action (LABEL, MOVE_FOLDER, MARK_READ, STAR,
 * ARCHIVE, TRASH, PRIORITY).
 */
import { Worker, type Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { MAIL_RULES_QUEUE_NAME, type MailRulesJobData } from "@/lib/queues/mail-rules.queue";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { MailRuleAction } from "@/generated/prisma/enums";

type Condition = {
  field: "from" | "to" | "subject" | "body";
  op: "contains" | "equals" | "startsWith" | "endsWith";
  value: string;
};

function testCondition(cond: Condition, message: { from: string; to: string; subject: string; textBody?: string | null }): boolean {
  const fieldValue = (
    cond.field === "from"    ? message.from :
    cond.field === "to"      ? message.to :
    cond.field === "subject" ? message.subject :
    message.textBody ?? ""
  ).toLowerCase();
  const testVal = cond.value.toLowerCase();

  switch (cond.op) {
    case "contains":   return fieldValue.includes(testVal);
    case "equals":     return fieldValue === testVal;
    case "startsWith": return fieldValue.startsWith(testVal);
    case "endsWith":   return fieldValue.endsWith(testVal);
    default:           return false;
  }
}

async function applyAction(
  action: MailRuleAction,
  actionData: Record<string, unknown> | null,
  threadId: string,
  message: { id: string },
) {
  switch (action) {
    case "MARK_READ":
      await prisma.inboxMessage.update({ where: { id: message.id }, data: { isRead: true } });
      break;
    case "STAR":
      await prisma.inboxThread.update({ where: { id: threadId }, data: { isStarred: true } });
      break;
    case "ARCHIVE":
      await prisma.inboxThread.update({ where: { id: threadId }, data: { isArchived: true } });
      break;
    case "TRASH":
      await prisma.inboxThread.update({ where: { id: threadId }, data: { isTrashed: true } });
      break;
    case "MOVE_FOLDER": {
      const folderId = typeof actionData?.folderId === "string" ? actionData.folderId : null;
      if (folderId) await prisma.inboxThread.update({ where: { id: threadId }, data: { folderId } });
      break;
    }
    case "LABEL": {
      const label = typeof actionData?.label === "string" ? actionData.label : null;
      if (label) {
        const thread = await prisma.inboxThread.findUnique({ where: { id: threadId }, select: { labels: true } });
        if (thread && !thread.labels.includes(label)) {
          await prisma.inboxThread.update({ where: { id: threadId }, data: { labels: { push: label } } });
        }
      }
      break;
    }
    case "PRIORITY": {
      const priority = typeof actionData?.priority === "string" ? actionData.priority : null;
      if (priority) {
        await prisma.inboxThread.update({
          where: { id: threadId },
          data: { priority: priority as "LOW" | "NORMAL" | "HIGH" | "URGENT" },
        });
      }
      break;
    }
    case "FORWARD": {
      // Forward is handled asynchronously via email queue — skipped in worker
      break;
    }
  }
}

export function createMailRulesWorker() {
  return new Worker<MailRulesJobData>(
    MAIL_RULES_QUEUE_NAME,
    async (job: Job<MailRulesJobData>) => {
      const { messageId, mailboxId: _mailboxId, userId } = job.data;

      const message = await prisma.inboxMessage.findUnique({
        where: { id: messageId },
        select: { id: true, threadId: true, from: true, to: true, subject: true, textBody: true },
      });
      if (!message) return;

      // Load active rules for this mailbox owner, ordered by priority
      const rules = await prisma.mailRule.findMany({
        where: { userId: userId ?? "__none__", isActive: true },
        orderBy: { priority: "asc" },
      });

      for (const rule of rules) {
        const conditions = rule.conditions as Condition[];
        const allMatch = conditions.every((c) => testCondition(c, message));
        if (!allMatch) continue;

        const actionData = rule.actionData as Record<string, unknown> | null;
        await applyAction(rule.action, actionData, message.threadId, message);
        logger.info({ ruleId: rule.id, messageId, action: rule.action }, "[mail-rules] Rule applied");
      }
    },
    { connection: redisConnection, concurrency: 5 },
  );
}
