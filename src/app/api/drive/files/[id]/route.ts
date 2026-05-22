import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAttachmentUrl } from "@/lib/s3";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const file = await prisma.driveFile.findUnique({ where: { id } });
  if (!file || file.ownerId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let downloadUrl: string | null = null;
  try {
    downloadUrl = await getAttachmentUrl(file.storageKey);
  } catch {
    // storage not configured
  }

  // Log view event (fire-and-forget)
  logAudit({
    actorId: user.id,
    action: "DRIVE_FILE_VIEW",
    targetType: "DriveFile",
    targetId: id,
    metadata: { fileName: file.name },
    ipAddress: request.headers.get("x-forwarded-for"),
  });

  return NextResponse.json({ ...file, size: file.size.toString(), downloadUrl });
}

export async function PUT(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { name, folderId, isStarred, isTrashed } = (await request.json()) as {
    name?: string;
    folderId?: string | null;
    isStarred?: boolean;
    isTrashed?: boolean;
  };

  const file = await prisma.driveFile.findUnique({ where: { id } });
  if (!file || file.ownerId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.driveFile.update({
    where: { id },
    data: {
      ...(name ? { name: name.trim() } : {}),
      ...(folderId !== undefined ? { folderId } : {}),
      ...(isStarred !== undefined ? { isStarred } : {}),
      ...(isTrashed !== undefined
        ? { isTrashed, trashedAt: isTrashed ? new Date() : null }
        : {}),
    },
  });

  logAudit({
    actorId: user.id,
    action: "DRIVE_FILE_EDIT",
    targetType: "DriveFile",
    targetId: id,
    metadata: { fileName: updated.name, changes: { name, isStarred, isTrashed } },
  });

  return NextResponse.json({ ...updated, size: updated.size.toString() });
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const file = await prisma.driveFile.findUnique({ where: { id } });
  if (!file || file.ownerId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  logAudit({
    actorId: user.id,
    action: "DRIVE_FILE_DELETE",
    targetType: "DriveFile",
    targetId: id,
    metadata: { fileName: file.name },
  });

  await prisma.driveFile.delete({ where: { id } });
  return new Response(null, { status: 204 });
}
