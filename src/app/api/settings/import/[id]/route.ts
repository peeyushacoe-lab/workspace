import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

// GET /api/settings/import/[id] — poll a single import job's progress
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const job = await prisma.mailImportJob.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      provider: true,
      host: true,
      username: true,
      status: true,
      totalMessages: true,
      importedMessages: true,
      skippedMessages: true,
      failedMessages: true,
      currentFolder: true,
      errorLog: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
    },
  });

  if (!job || job.userId !== currentUser.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ job });
}

// POST /api/settings/import/[id] — { action: "cancel" }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { action?: string };

  const job = await prisma.mailImportJob.findUnique({ where: { id }, select: { userId: true, status: true } });
  if (!job || job.userId !== currentUser.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (body.action === "cancel") {
    if (["COMPLETED", "FAILED", "CANCELLED"].includes(job.status)) {
      return NextResponse.json({ error: "Import already finished" }, { status: 400 });
    }
    await prisma.mailImportJob.update({ where: { id }, data: { status: "CANCELLED" } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
