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
        const [waiting, active, completed, failed, delayed] = await Promise.all([
          q.getWaitingCount(),
          q.getActiveCount(),
          q.getCompletedCount(),
          q.getFailedCount(),
          q.getDelayedCount(),
        ]);
        await q.close();
        return { name, waiting, active, completed, failed, delayed };
      })
    );

    return NextResponse.json({ queues, collectedAt: new Date().toISOString() });
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
