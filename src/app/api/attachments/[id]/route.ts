import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAttachmentUrl, isS3Configured } from "@/lib/s3";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/attachments/[id]
 * Generates a short-lived signed R2 URL and redirects the browser to it.
 * This avoids exposing raw R2 credentials/endpoints in the frontend and
 * also handles the case where R2_PUBLIC_URL is not configured (relative-path bug).
 */
export async function GET(_request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const attachment = await prisma.emailAttachment.findUnique({
    where: { id },
    include: {
      message: {
        include: {
          thread: {
            include: {
              mailbox: {
                include: {
                  accessLogs: { where: { userId: user.id }, select: { userId: true }, take: 1 },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!attachment) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  // Access check — user must have a MailboxAccess record (any role) or be a privileged role
  const isPrivileged = ["ADMIN", "CEO", "CISO"].includes(user.role);
  const mailbox = attachment.message.thread.mailbox;
  const hasAccess = isPrivileged || mailbox.accessLogs.length > 0;

  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // If the attachment has a valid R2 key, generate a signed URL
  if (attachment.key && isS3Configured()) {
    try {
      const signedUrl = await getAttachmentUrl(attachment.key, attachment.filename);
      return NextResponse.redirect(signedUrl, 302);
    } catch (err) {
      console.error("[attachments] Failed to generate signed URL:", err);
      return NextResponse.json({ error: "Failed to generate download link" }, { status: 500 });
    }
  }

  // Fallback: if storageUrl is a full HTTP URL (R2_PUBLIC_URL was set), redirect to it
  if (attachment.storageUrl?.startsWith("http")) {
    return NextResponse.redirect(attachment.storageUrl, 302);
  }

  return NextResponse.json(
    { error: "File content is not available for this attachment" },
    { status: 404 },
  );
}
