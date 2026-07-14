import { NextResponse } from "next/server";
import { redisConnection } from "@/lib/redis";
import { Queue } from "bullmq";
import { ALL_QUEUE_NAMES } from "@/lib/queues";
import { runHealthCheck } from "@/lib/health-check";

async function getQueueMetrics(name: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = new Queue(name, { connection: redisConnection as any });
    const [waiting, active, failed, delayed] = await Promise.all([
      q.getWaitingCount(),
      q.getActiveCount(),
      q.getFailedCount(),
      q.getDelayedCount(),
    ]);
    await q.disconnect();
    return { waiting, active, failed, delayed };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const detailed = searchParams.get("detail") === "1";

  const { dbOk, redisOk, emailOk, overallOk: ok } = await runHealthCheck();

  if (!detailed) {
    return NextResponse.json(
      { status: ok ? "ok" : "degraded", timestamp: new Date().toISOString() },
      { status: ok ? 200 : 503 },
    );
  }

  // Detailed view — only accessible internally (add IP allowlist / internal header
  // in your ingress if this endpoint is public)
  const queueMetrics: Record<string, ReturnType<typeof getQueueMetrics> extends Promise<infer T> ? T : never> = {};
  await Promise.all(
    ALL_QUEUE_NAMES.map(async (name) => {
      queueMetrics[name] = await getQueueMetrics(name);
    }),
  );

  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      services: {
        database: dbOk ? "ok" : "down",
        redis: redisOk ? "ok" : "down",
        email: emailOk ? "ok" : "down",
      },
      queues: queueMetrics,
    },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
