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
  const targetUserId = searchParams.get("userId") ?? undefined;

  if (targetUserId) {
    const profile = await prisma.deviceRiskProfile.findUnique({ where: { userId: targetUserId } });
    const user_ = await prisma.user.findUnique({ where: { id: targetUserId }, select: { riskScore: true, riskLevel: true, lastRiskSync: true } });
    return NextResponse.json({ profile, userRisk: user_ });
  }

  // Return top risky users
  const profiles = await prisma.deviceRiskProfile.findMany({
    orderBy: { riskScore: "desc" },
    take: 20,
  });

  return NextResponse.json(profiles);
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!SECURITY_ROLES.includes(user.role as SecurityRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json() as {
    userId: string;
    riskScore: number;
    riskFactors?: Record<string, unknown>;
    platform?: string;
    deviceId?: string;
  };

  if (!body.userId || body.riskScore === undefined) {
    return NextResponse.json({ error: "userId and riskScore required" }, { status: 400 });
  }

  const profile = await prisma.deviceRiskProfile.upsert({
    where: { userId: body.userId },
    create: {
      userId: body.userId,
      riskScore: body.riskScore,
      riskFactors: (body.riskFactors ?? undefined) as never,
      platform: body.platform ?? null,
      deviceId: body.deviceId ?? null,
    },
    update: {
      riskScore: body.riskScore,
      riskFactors: (body.riskFactors ?? undefined) as never,
      lastSeenAt: new Date(),
    },
  });

  // Mirror to user table for quick access
  const level = body.riskScore >= 80 ? "CRITICAL" : body.riskScore >= 60 ? "HIGH" : body.riskScore >= 30 ? "MEDIUM" : "LOW";
  await prisma.user.update({
    where: { id: body.userId },
    data: { riskScore: body.riskScore, riskLevel: level, lastRiskSync: new Date() },
  }).catch(() => {});

  return NextResponse.json(profile);
}
