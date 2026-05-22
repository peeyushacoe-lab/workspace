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

  try {
    const url = await getAttachmentUrl(file.storageKey);
    // Log download event (fire-and-forget)
    logAudit({
      actorId: user.id,
      action: "DRIVE_FILE_DOWNLOAD",
      targetType: "DriveFile",
      targetId: id,
      metadata: { fileName: file.name },
      ipAddress: request.headers.get("x-forwarded-for"),
    });
    // Redirect to the signed URL so the browser handles the download
    return NextResponse.redirect(url);
  } catch {
    return NextResponse.json({ error: "Storage not configured" }, { status: 503 });
  }
}
