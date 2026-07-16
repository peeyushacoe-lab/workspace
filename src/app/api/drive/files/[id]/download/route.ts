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

  // Check access: owner OR same organization. Org rollout (RFC-001) is only
  // partially backfilled, so most users still have organizationId === null —
  // treat "neither user has been assigned an org yet" as the same (sole)
  // organization rather than denying access, otherwise every shared file
  // (e.g. a screenshot posted in a chat channel) 403s for every recipient
  // except the uploader. Real multi-org separation is unaffected: two users
  // with different non-null organizationIds are still blocked from each other.
  const owner = await prisma.user.findUnique({ where: { id: file.ownerId }, select: { organizationId: true } });
  const sameOrg = !!owner?.organizationId && owner.organizationId === user.organizationId;
  const bothUnassigned = !owner?.organizationId && !user.organizationId;
  const hasAccess = file.ownerId === user.id || sameOrg || bothUnassigned;
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

    const mime = file.mimeType ?? "";
    const safeName = encodeURIComponent(file.name).replace(/['()]/g, escape);

    // For audio/video: proxy with Range passthrough so the browser's <audio>/<video>
    // element can seek. A simple redirect to R2 fails when R2 CORS isn't configured
    // for the app domain. We pass the Range header through to R2 and forward the
    // 206 Partial Content response so the browser gets proper streaming.
    if (mime.startsWith("audio/") || mime.startsWith("video/")) {
      const rangeHeader = request.headers.get("range");
      const upstreamHeaders: HeadersInit = {};
      if (rangeHeader) upstreamHeaders["Range"] = rangeHeader;

      const upstream = await fetch(url, { headers: upstreamHeaders });
      if (!upstream.ok && upstream.status !== 206) throw new Error("Storage fetch failed");

      const contentType = upstream.headers.get("content-type") ?? mime;
      const responseHeaders: Record<string, string> = {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Cache-Control": "private, max-age=300",
        "Accept-Ranges": "bytes",
      };
      // Forward range-related headers from R2
      for (const h of ["Content-Range", "Content-Length"] as const) {
        const v = upstream.headers.get(h);
        if (v) responseHeaders[h] = v;
      }

      return new NextResponse(upstream.body, {
        status: upstream.status, // 200 or 206
        headers: responseHeaders,
      });
    }

    // Preview: fetch the file from storage and proxy it back with inline disposition
    // so browsers display it in-page instead of triggering a download.
    const upstream = await fetch(url);
    if (!upstream.ok) throw new Error("Storage fetch failed");

    const contentType = upstream.headers.get("content-type") ?? (mime || "application/octet-stream");
    const body = await upstream.arrayBuffer();

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
