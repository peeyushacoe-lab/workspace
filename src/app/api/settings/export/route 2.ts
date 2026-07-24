import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { exportQueue } from "@/lib/queues/export.queue";

// GET /api/settings/export — list this user's export jobs (most recent first)
export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobs = await prisma.exportJob.findMany({
    where: { userId: currentUser.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true, status: true, totalItems: true, processedItems: true, currentStage: true,
      resultSize: true, errorLog: true, startedAt: true, completedAt: true, createdAt: true,
      includeMail: true, includeDrive: true, includeDocs: true, includeContacts: true, includeCalendar: true,
    },
  });

  return NextResponse.json({ jobs });
}

const startSchema = z.object({
  includeMail: z.boolean().default(true),
  includeDrive: z.boolean().default(true),
  includeDocs: z.boolean().default(true),
  includeContacts: z.boolean().default(true),
  includeCalendar: z.boolean().default(true),
});

// POST /api/settings/export — start a new account export job
export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as unknown;
  const parsed = startSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const active = await prisma.exportJob.findFirst({
    where: { userId: currentUser.id, status: { in: ["PENDING", "RUNNING"] } },
    select: { id: true },
  });
  if (active) {
    return NextResponse.json({ error: "An export is already in progress." }, { status: 409 });
  }

  const job = await prisma.exportJob.create({
    data: { userId: currentUser.id, ...parsed.data, status: "PENDING" },
  });

  await exportQueue.add("account-export", { type: "ACCOUNT_EXPORT", exportJobId: job.id }, { jobId: job.id });

  return NextResponse.json({ ok: true, jobId: job.id });
}
