import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAttachmentUrl } from "@/lib/s3";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string; versionId: string }> };

export async function POST(_request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, versionId } = await params;

  const file = await prisma.driveFile.findUnique({ where: { id } });
  if (!file || file.ownerId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const version = await prisma.driveFileVersion.findUnique({ where: { id: versionId } });
  if (!version || version.fileId !== id) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  // Get current max versionNum
  const maxVersion = await prisma.driveFileVersion.aggregate({
    where: { fileId: id },
    _max: { versionNum: true },
  });
  const nextVersionNum = (maxVersion._max.versionNum ?? 0) + 1;

  // Save current file state as a new version entry (if not already recorded as current)
  const currentVersionExists = await prisma.driveFileVersion.findFirst({
    where: { fileId: id, storageKey: file.storageKey },
  });

  if (!currentVersionExists) {
    await prisma.driveFileVersion.create({
      data: {
        fileId: id,
        versionNum: nextVersionNum,
        storageKey: file.storageKey,
        size: file.size,
        uploadedBy: user.id,
      },
    });
  }

  // Restore: point file to the selected version's storageKey and size
  const updated = await prisma.driveFile.update({
    where: { id },
    data: {
      storageKey: version.storageKey,
      size: version.size,
    },
  });

  logAudit({
    actorId: user.id,
    action: "DRIVE_FILE_RESTORE",
    targetType: "DriveFile",
    targetId: id,
    metadata: { fileName: file.name, restoredVersionNum: version.versionNum, versionId },
  });

  return NextResponse.json({ ...updated, size: updated.size.toString() });
}

export async function GET(_request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, versionId } = await params;

  const file = await prisma.driveFile.findUnique({ where: { id } });
  if (!file || file.ownerId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const version = await prisma.driveFileVersion.findUnique({ where: { id: versionId } });
  if (!version || version.fileId !== id) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  try {
    const downloadUrl = await getAttachmentUrl(version.storageKey);
    return NextResponse.json({ downloadUrl, version: { ...version, size: version.size.toString() } });
  } catch {
    return NextResponse.json({ error: "Storage not configured" }, { status: 503 });
  }
}
