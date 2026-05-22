import { prisma } from "@/lib/prisma";
import type { MailRuleAction } from "@/generated/prisma/enums";

type RuleCondition = {
  field: "from" | "to" | "subject" | "body";
  op: "contains" | "equals" | "startsWith" | "endsWith" | "notContains";
  value: string;
};

function matchCondition(condition: RuleCondition, fields: Record<string, string>): boolean {
  const target = (fields[condition.field] ?? "").toLowerCase();
  const val = condition.value.toLowerCase();
  switch (condition.op) {
    case "contains":    return target.includes(val);
    case "equals":      return target === val;
    case "startsWith":  return target.startsWith(val);
    case "endsWith":    return target.endsWith(val);
    case "notContains": return !target.includes(val);
    default:            return false;
  }
}

/**
 * Apply active mail rules for all users with access to the given mailbox.
 * Called after a new message arrives (webhook / IMAP sync).
 */
export async function applyMailRules(threadId: string, message: {
  from: string;
  to: string;
  subject: string;
  textBody?: string | null;
}) {
  const thread = await prisma.inboxThread.findUnique({
    where: { id: threadId },
    select: {
      mailboxId: true,
      mailbox: {
        select: { accessLogs: { select: { userId: true } } },
      },
    },
  });
  if (!thread) return;

  const userIds = thread.mailbox.accessLogs.map((a) => a.userId);
  if (userIds.length === 0) return;

  const rules = await prisma.mailRule.findMany({
    where: { userId: { in: userIds }, isActive: true },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });

  const fields = {
    from:    message.from,
    to:      message.to,
    subject: message.subject,
    body:    message.textBody ?? "",
  };

  for (const rule of rules) {
    const conditions = rule.conditions as RuleCondition[];
    const allMatch = conditions.every((c) => matchCondition(c, fields));
    if (!allMatch) continue;

    const actionData = (rule.actionData ?? {}) as Record<string, string>;

    try {
      await executeRuleAction(threadId, rule.action, actionData);
    } catch (err) {
      console.error(`[mail-rules] Failed to execute rule ${rule.id}:`, err);
    }
  }
}

async function executeRuleAction(threadId: string, action: MailRuleAction, data: Record<string, string>) {
  switch (action) {
    case "LABEL":
      await prisma.inboxThread.update({
        where: { id: threadId },
        data: { labels: { push: data.label ?? "auto" } },
      });
      break;

    case "MOVE_FOLDER":
      if (data.folderId) {
        await prisma.inboxThread.update({ where: { id: threadId }, data: { folderId: data.folderId } });
      }
      break;

    case "MARK_READ":
      await prisma.inboxMessage.updateMany({ where: { threadId }, data: { isRead: true } });
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

    case "PRIORITY":
      if (["LOW", "NORMAL", "HIGH", "URGENT"].includes(data.priority ?? "")) {
        await prisma.inboxThread.update({ where: { id: threadId }, data: { priority: data.priority as never } });
      }
      break;

    case "FORWARD":
      // Forward via Resend — enqueue to email queue
      // TODO: wire to email queue when forward address is set
      break;
  }
}
