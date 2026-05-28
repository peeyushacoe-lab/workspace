/**
 * Sentinel 2.0 — Detection Rules Engine (Phase 23)
 * Evaluates active DetectionRules against a SIEMEvent and fires alerts.
 */
import { prisma } from "@/lib/prisma";
import { emitEvent } from "@/lib/events";

type SiemEvent = {
  id: string;
  source: string;
  eventType: string;
  severity: string;
  userId: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
};

type RuleCondition = {
  field: string;
  op: "equals" | "contains" | "gt" | "lt" | "gte" | "lte" | "matches";
  value: string | number;
};

type RuleLogic = {
  conditions: RuleCondition[];
  logic: "AND" | "OR";
};

function getFieldValue(event: SiemEvent, field: string): unknown {
  const map: Record<string, unknown> = {
    source: event.source,
    eventType: event.eventType,
    severity: event.severity,
    userId: event.userId,
    ipAddress: event.ipAddress,
    ...(event.metadata ?? {}),
  };
  return map[field];
}

function testCondition(cond: RuleCondition, event: SiemEvent): boolean {
  const val = getFieldValue(event, cond.field);
  const str = String(val ?? "").toLowerCase();
  const cmpStr = String(cond.value).toLowerCase();
  const num = Number(val);
  const cmpNum = Number(cond.value);

  switch (cond.op) {
    case "equals":  return str === cmpStr;
    case "contains": return str.includes(cmpStr);
    case "gt":      return !isNaN(num) && num > cmpNum;
    case "lt":      return !isNaN(num) && num < cmpNum;
    case "gte":     return !isNaN(num) && num >= cmpNum;
    case "lte":     return !isNaN(num) && num <= cmpNum;
    case "matches": { try { return new RegExp(cmpStr, "i").test(str); } catch { return false; } }
    default:        return false;
  }
}

export async function evaluateDetectionRules(event: SiemEvent): Promise<void> {
  const rules = await prisma.detectionRule.findMany({
    where: { isActive: true },
  });

  for (const rule of rules) {
    const logic = rule.logic as RuleLogic;
    const conditions = logic.conditions ?? [];

    const matched = logic.logic === "OR"
      ? conditions.some((c) => testCondition(c, event))
      : conditions.every((c) => testCondition(c, event));

    if (!matched) continue;

    // Fire sentinel alert
    await prisma.sentinelAlert.create({
      data: {
        alertType: rule.category ?? rule.action,
        severity: rule.severity,
        targetType: event.source,
        targetId: event.id,
        userId: event.userId,
        description: `Detection rule "${rule.name}" matched on ${event.eventType}`,
        metadata: { ruleId: rule.id, eventId: event.id, eventType: event.eventType },
      },
    });

    // Emit real-time event for SOC dashboard
    emitEvent("SECURITY_THREAT_DETECTED", {
      targetType: "email",
      targetId: event.id,
      severity: (rule.severity ?? "MEDIUM") as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      reason: `Detection rule "${rule.name}" matched on ${event.eventType}`,
      actorId: event.userId ?? undefined,
    });

    // Update rule hit count
    await prisma.detectionRule.update({
      where: { id: rule.id },
      data: { hitCount: { increment: 1 }, lastHitAt: new Date() },
    }).catch(() => {});
  }

  // Mark event as processed
  await prisma.sIEMEvent.update({
    where: { id: event.id },
    data: { processed: true },
  }).catch(() => {});
}

export async function updateBehavioralBaseline(userId: string): Promise<void> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [emailCount, fileCount, loginEvents] = await Promise.all([
    prisma.emailLog.count({ where: { userId, createdAt: { gte: thirtyDaysAgo } } }),
    prisma.driveFile.count({ where: { ownerId: userId, createdAt: { gte: thirtyDaysAgo } } }),
    prisma.loginEvent.findMany({
      where: { userId, success: true, createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
    }),
  ]);

  const avgEmailsPerDay = emailCount / 30;
  const avgFilesPerDay = fileCount / 30;

  // Calculate average login hour from timestamps
  const loginHours = loginEvents.map((e) => e.createdAt.getUTCHours());
  const avgLoginHour = loginHours.length > 0
    ? loginHours.reduce((a, b) => a + b, 0) / loginHours.length
    : 9;

  await prisma.behavioralBaseline.upsert({
    where: { userId },
    update: { avgEmailsPerDay, avgFilesPerDay, avgLoginHour, lastUpdatedAt: now },
    create: { userId, avgEmailsPerDay, avgFilesPerDay, avgLoginHour },
  });
}
