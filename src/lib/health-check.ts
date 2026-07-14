import { prisma } from "@/lib/prisma";
import { redisConnection } from "@/lib/redis";

export type HealthCheckResult = {
  dbOk: boolean;
  redisOk: boolean;
  emailOk: boolean;
  overallOk: boolean;
  latencyMs: number;
};

/** Shared core health check — used by both /api/health (live, on-demand) and
 * the recurring STATUS_PING cleanup job (persisted, for the public status page). */
export async function runHealthCheck(): Promise<HealthCheckResult> {
  const start = Date.now();

  const [dbResult, redisResult] = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    redisConnection.ping(),
  ]);

  const dbOk = dbResult.status === "fulfilled";
  const redisOk = redisResult.status === "fulfilled";
  // Outbound email is "ok" if the provider is configured — we don't send a
  // real test email on every check, that would spam sending reputation.
  const emailOk = !!process.env.RESEND_API_KEY;

  return {
    dbOk,
    redisOk,
    emailOk,
    overallOk: dbOk && redisOk && emailOk,
    latencyMs: Date.now() - start,
  };
}
