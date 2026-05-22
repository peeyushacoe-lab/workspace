import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const SECURITY_ROLES = ["ADMIN", "CEO", "CISO", "CYBER_SECURITY"] as const;
type SecurityRole = (typeof SECURITY_ROLES)[number];

/**
 * GET /api/sentinel/dlp/violations
 * List DLP violations. Optionally filter by policyId, resolved, userId.
 *
 * POST /api/sentinel/dlp/violations
 * Record a new DLP violation (called by internal scanners / workers).
 */
export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!SECURITY_ROLES.includes(user.role as SecurityRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const policyId = searchParams.get("policyId") ?? undefined;
  const resolved = searchParams.get("resolved");
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = 50;

  const violations = await prisma.dLPViolation.findMany({
    where: {
      ...(policyId ? { policyId } : {}),
      ...(resolved !== null ? { resolved: resolved === "true" } : {}),
    },
    include: { policy: { select: { name: true, severity: true } } },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  });

  return NextResponse.json(violations);
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    policyId: string;
    resourceType: string;
    resourceId: string;
    snippet?: string;
    action?: string;
  };

  if (!body.policyId || !body.resourceType || !body.resourceId) {
    return NextResponse.json({ error: "policyId, resourceType, resourceId required" }, { status: 400 });
  }

  const policy = await prisma.dLPPolicy.findUnique({ where: { id: body.policyId } });
  if (!policy) return NextResponse.json({ error: "Policy not found" }, { status: 404 });

  const violation = await prisma.dLPViolation.create({
    data: {
      policyId: body.policyId,
      userId: user.id,
      resourceType: body.resourceType,
      resourceId: body.resourceId,
      snippet: body.snippet ?? null,
      action: body.action ?? policy.action,
    },
  });

  // Create a Sentinel alert for HIGH/CRITICAL policies
  if (["HIGH", "CRITICAL"].includes(policy.severity)) {
    await prisma.sentinelAlert.create({
      data: {
        alertType: "DLP_VIOLATION",
        severity: policy.severity,
        targetType: body.resourceType,
        targetId: body.resourceId,
        userId: user.id,
        description: `DLP policy "${policy.name}" violation detected in ${body.resourceType}`,
        metadata: { policyId: body.policyId, violationId: violation.id },
      },
    }).catch(() => {});
  }

  return NextResponse.json(violation, { status: 201 });
}
