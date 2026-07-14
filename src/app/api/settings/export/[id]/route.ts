import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { getAttachmentUrl, isS3Configured } from "@/lib/s3";

type Params = { params: Promise<{ id: string }> };

// GET /api/settings/export/[id] — poll status; includes a freshly-signed
// download URL once the archive is ready.
export async function GET(request: Request, { params }: Params) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const job = await prisma.exportJob.findUnique({
    where: { id },
    select: {
      id: true, userId: true, status: true, totalItems: true, processedItems: true, currentStage: true,
      resultKey: true, resultSize: true, errorLog: true, startedAt: true, completedAt: true, createdAt: true,
    },
  });
  if (!job || job.userId !== currentUser.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let downloadUrl: string | null = null;
  if (job.status === "COMPLETED" && job.resultKey && isS3Configured()) {
    downloadUrl = await getAttachmentUrl(job.resultKey, `nexus-export-${job.id}.zip`).catch(() => null);
  }

  return NextResponse.json({ job: { ...job, resultKey: undefined }, downloadUrl });
}
