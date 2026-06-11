import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";

const ALLOWED_NAMES = [
  "outbound-email", "dlp-scan", "notifications", "ai-jobs",
  "file-previews", "cleanup", "search-indexing", "security-sync", "mail-rules",
] as const;

type Params = { params: Promise<{ name: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name } = await params;
  if (!ALLOWED_NAMES.includes(name as typeof ALLOWED_NAMES[number]))
    return NextResponse.json({ error: "Unknown queue" }, { status: 400 });

  const sp = request.nextUrl.searchParams;
  const state = (sp.get("state") ?? "failed") as "failed" | "waiting" | "active" | "delayed" | "completed";
  const offset = Math.max(0, parseInt(sp.get("offset") ?? "0", 10));
  const limit = Math.min(Math.max(1, parseInt(sp.get("limit") ?? "20", 10)), 100);

  try {
    const { Queue } = await import("bullmq");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { redis } = await import("@/lib/redis") as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = new Queue(name, { connection: redis as any });

    const [jobs, counts] = await Promise.all([
      q.getJobs([state], offset, offset + limit - 1),
      q.getJobCounts("waiting", "active", "completed", "failed", "delayed"),
    ]);

    await q.close();

    return NextResponse.json({
      jobs: jobs.map((job) => ({
        id: job.id,
        name: job.name,
        data: job.data,
        failedReason: (job as { failedReason?: string }).failedReason ?? null,
        stacktrace: (job as { stacktrace?: string[] }).stacktrace ?? [],
        attemptsMade: job.attemptsMade,
        opts: job.opts,
        processedOn: job.processedOn ?? null,
        finishedOn: job.finishedOn ?? null,
        timestamp: job.timestamp,
      })),
      counts,
      offset,
      limit,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name } = await params;
  if (!ALLOWED_NAMES.includes(name as typeof ALLOWED_NAMES[number]))
    return NextResponse.json({ error: "Unknown queue" }, { status: 400 });

  const body = await request.json() as { action: "retry" | "retry-all" | "remove"; jobId?: string };

  try {
    const { Queue, Job } = await import("bullmq");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { redis } = await import("@/lib/redis") as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = new Queue(name, { connection: redis as any });

    if (body.action === "retry-all") {
      await q.retryJobs({ state: "failed", count: 1000 });
    } else if (body.action === "retry" && body.jobId) {
      const job = await Job.fromId(q, body.jobId);
      if (job) await job.retry("failed");
    } else if (body.action === "remove" && body.jobId) {
      const job = await Job.fromId(q, body.jobId);
      if (job) await job.remove();
    } else {
      await q.close();
      return NextResponse.json({ error: "Invalid action or missing jobId" }, { status: 400 });
    }

    await q.close();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
