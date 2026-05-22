import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { isS3Configured } from "@/lib/s3";

const ADMIN_ROLES = ["ADMIN", "CEO", "CISO", "OPS_MANAGER", "COO"] as const;
type AdminRole = (typeof ADMIN_ROLES)[number];

async function checkService(
  name: string,
  check: () => Promise<void>,
): Promise<{ service: string; status: string; latencyMs: number; error: string | null }> {
  const start = Date.now();
  try {
    await check();
    const latencyMs = Date.now() - start;
    await prisma.systemHealthLog.create({ data: { service: name, status: "healthy", latencyMs } }).catch(() => {});
    return { service: name, status: "healthy", latencyMs, error: null };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const error = err instanceof Error ? err.message : "Unknown error";
    await prisma.systemHealthLog.create({ data: { service: name, status: "degraded", latencyMs, error } }).catch(() => {});
    return { service: name, status: "degraded", latencyMs, error };
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const detail = searchParams.get("detail") === "true";

  // Public health — just overall status
  if (!detail) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() });
    } catch {
      return NextResponse.json({ status: "degraded" }, { status: 503 });
    }
  }

  // Detailed — requires auth
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes(user.role as AdminRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const checks = await Promise.all([
    checkService("database", async () => { await prisma.$queryRaw`SELECT 1`; }),
    checkService("redis", async () => { await redis.ping(); }),
    checkService("s3", async () => {
      if (!isS3Configured()) throw new Error("R2 not configured");
    }),
  ]);

  // Gather live counts
  const [userCount, emailCount, fileCount, alertCount] = await Promise.all([
    prisma.user.count({ where: { isActive: true } }),
    prisma.emailLog.count(),
    prisma.driveFile.count({ where: { isTrashed: false } }),
    prisma.sentinelAlert.count({ where: { acknowledged: false } }),
  ]);

  // Recent health history
  const history = await prisma.systemHealthLog.findMany({
    orderBy: { checkedAt: "desc" },
    take: 50,
  });

  const overall = checks.every((c) => c.status === "healthy") ? "healthy" : "degraded";

  return NextResponse.json({
    overall,
    timestamp: new Date().toISOString(),
    services: checks,
    stats: { activeUsers: userCount, totalEmails: emailCount, totalFiles: fileCount, openAlerts: alertCount },
    history,
  });
}
