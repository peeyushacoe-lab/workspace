import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";

const SECURITY_ROLES = ["ADMIN", "CEO", "CISO", "CYBER_SECURITY"] as const;

const createSchema = z.object({
  alertType:   z.string().min(1).max(100),
  severity:    z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  targetType:  z.enum(["email", "file", "chat", "login", "user"]),
  targetId:    z.string().min(1),
  userId:      z.string().optional(),
  description: z.string().min(1).max(2000),
  metadata:    z.record(z.string(), z.unknown()).optional(),
});

/**
 * GET /api/sentinel/alerts?severity=&acknowledged=&limit=&offset=
 */
export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!SECURITY_ROLES.includes(user.role as (typeof SECURITY_ROLES)[number])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const severity     = searchParams.get("severity");
  const acknowledged = searchParams.get("acknowledged");
  const limit        = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);
  const offset       = parseInt(searchParams.get("offset") ?? "0");

  const alerts = await prisma.sentinelAlert.findMany({
    where: {
      ...(severity ? { severity } : {}),
      ...(acknowledged !== null ? { acknowledged: acknowledged === "true" } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });

  const total = await prisma.sentinelAlert.count({
    where: {
      ...(severity ? { severity } : {}),
      ...(acknowledged !== null ? { acknowledged: acknowledged === "true" } : {}),
    },
  });

  return NextResponse.json({ alerts, total });
}

/**
 * POST /api/sentinel/alerts
 * Create a new Sentinel alert (internal or from webhook).
 */
export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Validation error" }, { status: 400 });
  }

  const alert = await prisma.sentinelAlert.create({
    data: {
      alertType:   parsed.data.alertType,
      severity:    parsed.data.severity,
      targetType:  parsed.data.targetType,
      targetId:    parsed.data.targetId,
      userId:      parsed.data.userId ?? null,
      description: parsed.data.description,
      metadata:    parsed.data.metadata ? (parsed.data.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
  });

  return NextResponse.json(alert, { status: 201 });
}
