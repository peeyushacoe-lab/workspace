import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const SECURITY_ROLES = ["ADMIN", "CEO", "CISO", "CYBER_SECURITY"] as const;
type SecurityRole = (typeof SECURITY_ROLES)[number];

export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!SECURITY_ROLES.includes(user.role as SecurityRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source") ?? undefined;
  const severity = searchParams.get("severity") ?? undefined;
  const unprocessed = searchParams.get("unprocessed") === "true";
  const correlationId = searchParams.get("correlationId") ?? undefined;
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = 50;

  const events = await prisma.sIEMEvent.findMany({
    where: {
      ...(source ? { source } : {}),
      ...(severity ? { severity } : {}),
      ...(unprocessed ? { processed: false } : {}),
      ...(correlationId ? { correlationId } : {}),
    },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  });

  const total = await prisma.sIEMEvent.count({
    where: {
      ...(source ? { source } : {}),
      ...(severity ? { severity } : {}),
      ...(unprocessed ? { processed: false } : {}),
    },
  });

  return NextResponse.json({ events, total, page, pages: Math.ceil(total / limit) });
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    source: string;
    eventType: string;
    severity?: string;
    ipAddress?: string;
    metadata?: Record<string, unknown>;
    rawData?: Record<string, unknown>;
    correlationId?: string;
  };

  if (!body.source || !body.eventType) {
    return NextResponse.json({ error: "source and eventType required" }, { status: 400 });
  }

  const event = await prisma.sIEMEvent.create({
    data: {
      source: body.source,
      eventType: body.eventType,
      severity: body.severity ?? "INFO",
      userId: user.id,
      ipAddress: body.ipAddress ?? null,
      metadata: (body.metadata ?? undefined) as never,
      rawData: (body.rawData ?? undefined) as never,
      correlationId: body.correlationId ?? null,
    },
  });

  // Run detection rules against this event
  await runDetectionRules(event).catch(() => {});

  return NextResponse.json(event, { status: 201 });
}

type SIEMEventRow = {
  id: string;
  source: string;
  eventType: string;
  severity: string;
  userId: string | null;
  ipAddress: string | null;
  metadata: unknown;
};

async function runDetectionRules(event: SIEMEventRow): Promise<void> {
  const rules = await prisma.detectionRule.findMany({
    where: { isActive: true },
  });

  for (const rule of rules) {
    const logic = rule.logic as { conditions: Array<{ field: string; op: string; value: string }>; logic?: string };
    const conditions = logic.conditions ?? [];
    const op = logic.logic ?? "AND";

    const results = conditions.map((cond) => {
      const fieldValue = String((event as Record<string, unknown>)[cond.field] ?? "");
      switch (cond.op) {
        case "equals": return fieldValue === cond.value;
        case "contains": return fieldValue.includes(cond.value);
        case "startsWith": return fieldValue.startsWith(cond.value);
        case "regex": try { return new RegExp(cond.value, "i").test(fieldValue); } catch { return false; }
        default: return false;
      }
    });

    const matched = op === "OR" ? results.some(Boolean) : results.every(Boolean);
    if (!matched) continue;

    await prisma.detectionRule.update({
      where: { id: rule.id },
      data: { hitCount: { increment: 1 }, lastHitAt: new Date() },
    }).catch(() => {});

    if (rule.action === "ALERT") {
      await prisma.sentinelAlert.create({
        data: {
          alertType: rule.category ?? "DETECTION_RULE",
          severity: rule.severity,
          targetType: event.source,
          targetId: event.id,
          userId: event.userId,
          description: `Detection rule "${rule.name}" triggered by ${event.source}:${event.eventType}`,
          metadata: { ruleId: rule.id, siemEventId: event.id },
        },
      }).catch(() => {});
    }
  }

  await prisma.sIEMEvent.update({ where: { id: event.id }, data: { processed: true } }).catch(() => {});
}
