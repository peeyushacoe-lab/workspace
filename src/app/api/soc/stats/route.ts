import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["ADMIN", "CISO"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [incidentsByStatus, incidentsBySeverity, recentEvents, dlpViolations, threatScans] =
    await Promise.all([
      prisma.securityIncident.groupBy({ by: ["status"], _count: true }),
      prisma.securityIncident.groupBy({ by: ["severity"], _count: true }),
      prisma.securityEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.emailLog.count({
        where: { error: { contains: "DLP Violation" } },
      }),
      prisma.threatScan.count({ where: { riskScore: { gte: 50 } } }),
    ]);

  return NextResponse.json({
    incidents: { byStatus: incidentsByStatus, bySeverity: incidentsBySeverity },
    recentSecurityEvents: recentEvents,
    dlpViolations,
    highRiskThreats: threatScans,
  });
}
