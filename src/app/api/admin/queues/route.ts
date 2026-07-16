import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";

const QUEUE_NAMES = [
  "outbound-email",
  "dlp-scan",
  "notifications",
  "ai-jobs",
  "file-previews",
  "cleanup",
  "search-indexing",
  "security-sync",
  "mail-rules",
] as const;

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { Queue } = await import("bullmq");
    const { redis } = await import("@/lib/redis");

    const queues = await Promise.all(
      QUEUE_NAMES.map(async (name) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const q = new Queue(name, { connection: redis as any });
        const [waiting, active, completed, failed, delayed, isPaused] = await Promise.all([
          q.getWaitingCount(),
          q.getActiveCount(),
          q.getCompletedCount(),
          q.getFailedCount(),
          q.getDelayedCount(),
          q.isPaused(),
        ]);
        await q.close();

        // Health signal: paused or a large dead-letter pile is critical; a growing
        // backlog or moderate failures is a warning. Thresholds are deliberately
        // conservative for a research-preview scale.
        const health =
          isPaused || failed > 50
            ? "critical"
            : failed > 10 || waiting > 500
              ? "warn"
              : "ok";

        return { name, waiting, active, completed, failed, delayed, paused: isPaused, health };
      })
    );

    const summary = {
      totalFailed: queues.reduce((s, q) => s + q.failed, 0),
      totalWaiting: queues.reduce((s, q) => s + q.waiting, 0),
      critical: queues.filter((q) => q.health === "critical").map((q) => q.name),
      warn: queues.filter((q) => q.health === "warn").map((q) => q.name),
    };

    return NextResponse.json({ queues, summary, collectedAt: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { queueName, action } = await request.json() as { queueName: string; action: "drain" | "clean-failed" };
  if (!QUEUE_NAMES.includes(queueName as typeof QUEUE_NAMES[number]))
    return NextResponse.json({ error: "Unknown queue" }, { status: 400 });

  const { Queue } = await import("bullmq");
  const { redis } = await import("@/lib/redis");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = new Queue(queueName, { connection: redis as any });

  if (action === "drain") await q.drain();
  if (action === "clean-failed") await q.clean(0, 1000, "failed");

  await q.close();
  return NextResponse.json({ ok: true });
}
