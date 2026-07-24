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

  // Check access: owner OR same organization. NOTE: a prior "bothUnassigned"
  // clause treated "neither user has an organizationId yet" as implicit access,
  // which granted every user with organizationId === null access to every other
  // such user's Drive files (most users, since RFC-001 org rollout is only
  // partially backfilled). That was too broad — removed. Access is now strictly
  // owner or matching non-null organizationId (plus any admin-role bypass
  // elsewhere in this handler, if present).
  const owner = await prisma.user.findUnique({ where: { id: file.ownerId }, select: { organizationId: true } });
  const sameOrg = !!owner?.organizationId && owner.organizationId === user.organizationId;
  let hasAccess = file.ownerId === user.id || sameOrg;

  // Chat-shared files: when a file is attached to a chat message (content
  // embeds `"fileId":"<id>"` — see ChatView's [FILE_ATTACHMENT] payload),
  // anyone who is a member of the channel that message was posted in must be
  // able to load the preview/download, regardless of organizationId. Without
  // this, images sent in chat only ever render for the uploader (org check
  // above fails for the null-organizationId majority), and every other
  // channel member sees a broken image / 403.
  if (!hasAccess) {
    const sharedInChannel = await prisma.chatMessage.findFirst({
      where: {
        content: { contains: file.id },
        channel: { members: { some: { userId: user.id } } },
      },
      select: { id: true },
    });
    hasAccess = !!sharedInChannel;
  }

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

    // Stored-XSS mitigation (F-02): HTML/SVG/XML files must NEVER be rendered
    // inline on this origin, even when preview=1 is requested. Serving these
    // types with an inline disposition would let an attacker-uploaded file
    // execute script in the context of our own domain (stored XSS). Detect
    // by both the stored content-type and the filename extension, since
    // browsers/clients don't always set an accurate mimeType on upload.
    const dangerousInlineMimes = new Set([
      "text/html",
      "application/xhtml+xml",
      "image/svg+xml",
      "text/xml",
      "application/xml",
    ]);
    const dangerousInlineExtensions = new Set([".html", ".htm", ".xhtml", ".svg", ".xml"]);
    const fileExt = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
    const isDangerousInlineType =
      dangerousInlineMimes.has(mime.split(";")[0].trim()) || dangerousInlineExtensions.has(fileExt);

    if (isPreview && isDangerousInlineType) {
      logAudit({
        actorId: user.id,
        action: "DRIVE_FILE_DOWNLOAD",
        targetType: "DriveFile",
        targetId: id,
        metadata: { fileName: file.name, forcedAttachment: true },
        ipAddress: request.headers.get("x-forwarded-for"),
      });
      return NextResponse.redirect(url);
    }

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
