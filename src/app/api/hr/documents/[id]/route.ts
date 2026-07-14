import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { getAttachmentUrl } from "@/lib/s3";
import { isHRManager, canManageLifecycle } from "@/lib/hr";

// GET /api/hr/documents/[id] — 302 redirect to a signed R2 URL
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const doc = await prisma.hRDocument.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (doc.userId !== user.id && !isHRManager(user.role)) {
    // Mentors (MGMT) may access interns' documents (lifecycle letters, NOCs)
    const owner = await prisma.user.findUnique({ where: { id: doc.userId }, select: { role: true } });
    if (!owner || !canManageLifecycle(user.role, owner.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const url = await getAttachmentUrl(doc.storageKey, doc.fileName);
  return NextResponse.redirect(url, 302);
}
