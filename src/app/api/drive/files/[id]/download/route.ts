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

  // Allow file owner OR any org member to preview shared files
  const file = await prisma.driveFile.findUnique({ where: { id } });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Check access: owner OR same organization
  const owner = await prisma.user.findUnique({ where: { id: file.ownerId }, select: { organizationId: true } });
  const hasAccess = file.ownerId === user.id || (owner?.organizationId && owner.organizationId === user.organizationId);
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const isPreview = searchParams.get("preview") === "1";

  try {
    const url = await getAttachmentUrl(file.storageKey);

    if (!isPreview) {
      // Download: log and redirect with attachment disposition
      logAudit({
        actorId: user.id,
        action: "DRIVE_FILE_DOWNLOAD",
        targetType: "DriveFile",
        targetId: id,
        metadata: { fileName: file.name },
        ipAddress: request.headers.get("x-forwarded-for"),
      });
      return NextResponse.redirect(url);
    }

    // Preview: fetch the file from storage and proxy it back with inline disposition
    // so browsers display it in-page instead of triggering a download.
    const upstream = await fetch(url);
    if (!upstream.ok) throw new Error("Storage fetch failed");

    const contentType = upstream.headers.get("content-type") ?? file.mimeType ?? "application/octet-stream";
    const body = await upstream.arrayBuffer();

    const safeName = encodeURIComponent(file.name).replace(/['()]/g, escape);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Cache-Control": "private, max-age=300",
        "Content-Length": String(body.byteLength),
      },
    });
  } catch {
    return NextResponse.json({ error: "Storage not configured or unavailable" }, { status: 503 });
  }
}
