import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ADMIN_ROLES = ["ADMIN", "CEO", "CISO"] as const;

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes(user.role as (typeof ADMIN_ROLES)[number])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    failedLogins24h,
    failedLogins7d,
    activeSessions,
    allPlacedLogs,
    allReleasedLogs,
    topFailedRaw,
    dlpTrendsRaw,
    loginAnomaliesRaw,
    noSuccessFailedRaw,
  ] = await Promise.all([
    prisma.loginEvent.count({
      where: { success: false, createdAt: { gte: oneDayAgo } },
    }),
    prisma.loginEvent.count({
      where: { success: false, createdAt: { gte: sevenDaysAgo } },
    }),
    prisma.userSession.count({
      where: { expiresAt: { gt: now } },
    }),
    prisma.auditLog.findMany({
      where: { action: "LEGAL_HOLD_PLACED" },
      select: { metadata: true, targetId: true, createdAt: true },
    }),
    prisma.auditLog.findMany({
      where: { action: "LEGAL_HOLD_RELEASED" },
      select: { metadata: true, targetId: true, createdAt: true },
    }),
    // Top 5 by failed logins last 7 days grouped by email
    prisma.$queryRaw<Array<{ email: string; count: bigint }>>`
      SELECT email, COUNT(*) as count
      FROM "LoginEvent"
      WHERE success = false AND "createdAt" >= ${sevenDaysAgo}
      GROUP BY email
      ORDER BY count DESC
      LIMIT 5
    `,
    // DLP violation trends — last 30 days, grouped by date
    prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
      SELECT
        TO_CHAR(DATE("createdAt"), 'YYYY-MM-DD') as date,
        COUNT(*) as count
      FROM "AuditLog"
      WHERE action LIKE 'DLP%'
        AND "createdAt" >= ${thirtyDaysAgo}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `,
    // Login anomalies: users with 5+ failed attempts in last 24h
    prisma.$queryRaw<Array<{
      email: string;
      count: bigint;
      first_attempt: Date;
      last_attempt: Date;
      user_id: string | null;
    }>>`
      SELECT
        email,
        COUNT(*) as count,
        MIN("createdAt") as first_attempt,
        MAX("createdAt") as last_attempt,
        MAX("userId") as user_id
      FROM "LoginEvent"
      WHERE success = false
        AND "createdAt" >= ${oneDayAgo}
      GROUP BY email
      HAVING COUNT(*) >= 5
      ORDER BY count DESC
    `,
    // Users with LOGIN_FAILED but no LOGIN_SUCCESS today — from AuditLog
    // (using LoginEvent table directly for accuracy)
    prisma.$queryRaw<Array<{ email: string; count: bigint }>>`
      SELECT email, COUNT(*) as count
      FROM "LoginEvent"
      WHERE success = false
        AND "createdAt" >= ${oneDayAgo}
        AND email NOT IN (
          SELECT DISTINCT email
          FROM "LoginEvent"
          WHERE success = true
            AND "createdAt" >= ${oneDayAgo}
        )
      GROUP BY email
      ORDER BY count DESC
      LIMIT 20
    `,
  ]);

  // Calculate users on legal hold
  const releasedMap = new Map<string, Date>();
  for (const log of allReleasedLogs) {
    const meta = log.metadata as Record<string, string> | null;
    const targetUserId = meta?.targetUserId ?? log.targetId;
    if (targetUserId) {
      const existing = releasedMap.get(targetUserId);
      if (!existing || log.createdAt > existing) {
        releasedMap.set(targetUserId, log.createdAt);
      }
    }
  }

  const latestPlaced = new Map<string, Date>();
  for (const log of allPlacedLogs) {
    const meta = log.metadata as Record<string, string> | null;
    const targetUserId = meta?.targetUserId ?? log.targetId;
    if (!targetUserId) continue;
    const existing = latestPlaced.get(targetUserId);
    if (!existing || log.createdAt > existing) {
      latestPlaced.set(targetUserId, log.createdAt);
    }
  }

  let usersOnHold = 0;
  for (const [userId, placedAt] of latestPlaced.entries()) {
    const releasedAt = releasedMap.get(userId);
    if (!releasedAt || placedAt > releasedAt) {
      usersOnHold++;
    }
  }

  const topFailedLogins = topFailedRaw.map((row) => ({
    email: row.email,
    count: Number(row.count),
  }));

  const dlpTrends = dlpTrendsRaw.map((row) => ({
    date: row.date,
    count: Number(row.count),
  }));

  const loginAnomalies = loginAnomaliesRaw.map((row) => ({
    email: row.email,
    count: Number(row.count),
    firstAttempt: row.first_attempt instanceof Date ? row.first_attempt.toISOString() : String(row.first_attempt),
    lastAttempt: row.last_attempt instanceof Date ? row.last_attempt.toISOString() : String(row.last_attempt),
    userId: row.user_id ?? null,
  }));

  const noSuccessUsers = noSuccessFailedRaw.map((row) => ({
    email: row.email,
    count: Number(row.count),
  }));

  return NextResponse.json({
    failedLogins24h,
    failedLogins7d,
    activeSessions,
    usersOnHold,
    topFailedLogins,
    dlpTrends,
    loginAnomalies,
    noSuccessUsers,
  });
}
