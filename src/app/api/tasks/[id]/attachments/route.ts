import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canAccessTask } from "@/lib/tasks";
import { isS3Configured, uploadToR2 } from "@/lib/s3";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB — task attachments, not Drive-scale uploads

// POST /api/tasks/[id]/attachments
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: taskId } = await params;

  if (!(await canAccessTask(taskId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isS3Configured()) {
    return NextResponse.json(
      { error: "File storage is not configured.", hint: "Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME" },
      { status: 503 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File exceeds 25 MB limit" }, { status: 413 });
  }

  const cleanMime = (file.type || "application/octet-stream").split(";")[0].trim();
  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `tasks/${taskId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  await uploadToR2(buffer, key, cleanMime);

  const attachment = await prisma.taskAttachment.create({
    data: {
      taskId,
      fileName: file.name,
      storageKey: key,
      size: file.size,
      uploadedById: user.id,
    },
    include: { uploadedBy: { select: { id: true, fullName: true } } },
  });

  return NextResponse.json({ attachment }, { status: 201 });
}
