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
  const userId = searchParams.get("userId") ?? undefined;

  if (userId) {
    const baseline = await prisma.behavioralBaseline.findUnique({ where: { userId } });
    return NextResponse.json(baseline ?? { userId, anomalyScore: 0 });
  }

  const anomalous = await prisma.behavioralBaseline.findMany({
    where: { anomalyScore: { gte: 50 } },
    orderBy: { anomalyScore: "desc" },
    take: 20,
  });

  return NextResponse.json(anomalous);
}

/**
 * POST — Update or recalculate a user's behavioral baseline.
 * Called by the background worker after analysing recent activity.
 */
export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!SECURITY_ROLES.includes(user.role as SecurityRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json() as {
    userId: string;
    avgEmailsPerDay?: number;
    avgFilesPerDay?: number;
    avgLoginHour?: number;
    commonIPs?: string[];
    anomalyScore?: number;
  };

  if (!body.userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const baseline = await prisma.behavioralBaseline.upsert({
    where: { userId: body.userId },
    create: {
      userId: body.userId,
      avgEmailsPerDay: body.avgEmailsPerDay ?? 0,
      avgFilesPerDay: body.avgFilesPerDay ?? 0,
      avgLoginHour: body.avgLoginHour ?? 9,
      commonIPs: body.commonIPs ?? [],
      anomalyScore: body.anomalyScore ?? 0,
    },
    update: {
      ...(body.avgEmailsPerDay !== undefined && { avgEmailsPerDay: body.avgEmailsPerDay }),
      ...(body.avgFilesPerDay !== undefined && { avgFilesPerDay: body.avgFilesPerDay }),
      ...(body.avgLoginHour !== undefined && { avgLoginHour: body.avgLoginHour }),
      ...(body.commonIPs && { commonIPs: body.commonIPs }),
      ...(body.anomalyScore !== undefined && { anomalyScore: body.anomalyScore }),
      lastUpdatedAt: new Date(),
    },
  });

  // Trigger alert if anomaly score is high
  if ((body.anomalyScore ?? 0) >= 80) {
    await prisma.sentinelAlert.create({
      data: {
        alertType: "ANOMALOUS_BEHAVIOR",
        severity: "HIGH",
        targetType: "user",
        targetId: body.userId,
        userId: body.userId,
        description: `Anomalous user behavior detected. Score: ${body.anomalyScore}`,
        metadata: { baseline },
      },
    }).catch(() => {});
  }

  return NextResponse.json(baseline);
}
