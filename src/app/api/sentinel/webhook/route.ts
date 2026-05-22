import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

const VALID_SEVERITIES = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const VALID_TARGET_TYPES = new Set(["email", "file", "chat", "login", "user"]);

/**
 * POST /api/sentinel/webhook
 * External Sentinel callback endpoint. Authenticated via shared secret in Authorization header.
 * Payload: { alertType, severity, targetType, targetId, userId?, description, metadata? }
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.SENTINEL_WEBHOOK_SECRET;

  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { alertType, severity, targetType, targetId, userId, description, metadata } = body;

  if (!alertType || typeof alertType !== "string") {
    return NextResponse.json({ error: "alertType is required" }, { status: 400 });
  }
  if (!severity || !VALID_SEVERITIES.has(severity as string)) {
    return NextResponse.json({ error: "Invalid severity" }, { status: 400 });
  }
  if (!targetType || !VALID_TARGET_TYPES.has(targetType as string)) {
    return NextResponse.json({ error: "Invalid targetType" }, { status: 400 });
  }
  if (!targetId || typeof targetId !== "string") {
    return NextResponse.json({ error: "targetId is required" }, { status: 400 });
  }
  if (!description || typeof description !== "string") {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }

  const alert = await prisma.sentinelAlert.create({
    data: {
      alertType:   alertType as string,
      severity:    severity as string,
      targetType:  targetType as string,
      targetId:    targetId as string,
      userId:      typeof userId === "string" ? userId : null,
      description: description as string,
      metadata:    metadata && typeof metadata === "object"
        ? (metadata as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });

  // Emit audit log for high/critical alerts
  if (severity === "HIGH" || severity === "CRITICAL") {
    await prisma.auditLog.create({
      data: {
        action:     "SENTINEL_ALERT",
        targetType: targetType as string,
        targetId:   targetId as string,
        metadata:   { alertId: alert.id, alertType, severity, description } as object,
      },
    }).catch(() => {});
  }

  return NextResponse.json({ received: true, alertId: alert.id }, { status: 201 });
}
