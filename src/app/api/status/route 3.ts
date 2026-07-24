import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runHealthCheck } from "@/lib/health-check";

export const dynamic = "force-dynamic";

type ComponentStatus = "operational" | "degraded" | "outage";

function toComponentStatus(ok: boolean): ComponentStatus {
  return ok ? "operational" : "outage";
}

type StatusPingRow = {
  checkedAt: Date;
  dbOk: boolean;
  redisOk: boolean;
  emailOk: boolean;
  overallOk: boolean;
  latencyMs: number | null;
};

/**
 * Public, unauthenticated status endpoint. Intentionally excluded from
 * middleware's protectedRoutes so it's reachable without a session.
 *
 * Runs a live health check for "right now" (mirrors /api/health) and reads
 * the recurring STATUS_PING history (recorded every 5 minutes by the
 * persistent worker — see cleanup.worker.ts) to compute rolling uptime %
 * and a 90-day incident timeline, without hammering the DB/Redis on every
 * page view.
 */
export async function GET(): Promise<NextResponse> {
  const live = await runHealthCheck();

  const since90d = new Date(Date.now() - 90 * 86_400_000);
  const since24h = new Date(Date.now() - 1 * 86_400_000);

  const [pings90d, latestBackupVerification]: [StatusPingRow[], { status: string; testedAt: Date } | null] = await Promise.all([
    prisma.systemStatusPing.findMany({
      where: { checkedAt: { gte: since90d } },
      orderBy: { checkedAt: "asc" },
      select: { checkedAt: true, dbOk: true, redisOk: true, emailOk: true, overallOk: true, latencyMs: true },
    }).catch(() => [] as StatusPingRow[]),
    prisma.backupVerification.findFirst({
      orderBy: { testedAt: "desc" },
      select: { status: true, testedAt: true },
    }).catch(() => null),
  ]);

  const pings24h = pings90d.filter((p) => p.checkedAt >= since24h);

  function uptimePct(pings: StatusPingRow[], key: "dbOk" | "redisOk" | "emailOk" | "overallOk"): number {
    if (pings.length === 0) return 100;
    const upCount = pings.filter((p) => p[key]).length;
    return Math.round((upCount / pings.length) * 1000) / 10;
  }

  // Bucket into daily uptime for a simple 90-day history strip.
  const dayBuckets = new Map<string, { total: number; up: number }>();
  for (const p of pings90d) {
    const day = p.checkedAt.toISOString().slice(0, 10);
    const bucket = dayBuckets.get(day) ?? { total: 0, up: 0 };
    bucket.total += 1;
    if (p.overallOk) bucket.up += 1;
    dayBuckets.set(day, bucket);
  }
  const days: { date: string; uptimePct: number | null }[] = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    const bucket = dayBuckets.get(d);
    days.push({ date: d, uptimePct: bucket ? Math.round((bucket.up / bucket.total) * 1000) / 10 : null });
  }

  const avgLatency = pings24h.length
    ? Math.round(pings24h.reduce((sum, p) => sum + (p.latencyMs ?? 0), 0) / pings24h.length)
    : live.latencyMs;

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    overall: toComponentStatus(live.overallOk),
    components: [
      { name: "Database", status: toComponentStatus(live.dbOk) },
      { name: "Queue / cache (Redis)", status: toComponentStatus(live.redisOk) },
      { name: "Outbound email", status: toComponentStatus(live.emailOk) },
    ],
    uptime: {
      last24h: uptimePct(pings24h, "overallOk"),
      last90d: uptimePct(pings90d, "overallOk"),
    },
    latencyMs: avgLatency,
    history: days,
    backupVerification: latestBackupVerification
      ? { status: latestBackupVerification.status, testedAt: latestBackupVerification.testedAt.toISOString() }
      : null,
  });
}
