import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canAccessTask } from "@/lib/tasks";
import { getAttachmentUrl, isS3Configured } from "@/lib/s3";

type Params = { params: Promise<{ id: string; attachmentId: string }> };

// GET /api/tasks/[id]/attachments/[attachmentId] — signed-URL redirect, same
// pattern as /api/attachments/[id] for email attachments.
export async function GET(_req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: taskId, attachmentId } = await params;

  if (!(await canAccessTask(taskId, user.id)) && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const attachment = await prisma.taskAttachment.findFirst({ where: { id: attachmentId, taskId } });
  if (!attachment) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });

  if (!isS3Configured()) {
    return NextResponse.json({ error: "File storage is not configured" }, { status: 503 });
  }

  try {
    const signedUrl = await getAttachmentUrl(attachment.storageKey, attachment.fileName);
    return NextResponse.redirect(signedUrl, 302);
  } catch (err) {
    console.error("[task-attachments] Failed to generate signed URL:", err);
    return NextResponse.json({ error: "Failed to generate download link" }, { status: 500 });
  }
}

// DELETE /api/tasks/[id]/attachments/[attachmentId]
export async function DELETE(_req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: taskId, attachmentId } = await params;

  if (!(await canAccessTask(taskId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.taskAttachment.deleteMany({ where: { id: attachmentId, taskId } });
  return NextResponse.json({ ok: true });
}
