import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveDocAccess, canEdit } from "@/lib/doc-access";

type Params = { params: Promise<{ id: string }> };

/**
 * POST — restore a document to a previous version.
 *
 * Restoring is itself a destructive edit, so the current state is snapshotted
 * first ("Before restore"). That makes the operation reversible: undoing a
 * mistaken restore is just restoring the snapshot taken here.
 */
export async function POST(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const doc = await resolveDocAccess(id, user.id, user.role);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canEdit(doc.access)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { versionId?: string };
  if (!body.versionId) {
    return NextResponse.json({ error: "versionId is required" }, { status: 400 });
  }

  const version = await prisma.documentVersion.findFirst({
    where: { id: body.versionId, noteId: id },
  });
  if (!version) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  // Snapshot the pre-restore state so the restore can be undone.
  if (doc.content) {
    await prisma.documentVersion.create({
      data: {
        noteId: id,
        authorId: user.id,
        label: "Before restore",
        content: doc.content,
        title: doc.title,
        size: doc.content.length,
      },
    });
  }

  const updated = await prisma.note.update({
    where: { id },
    data: {
      content: version.content,
      ...(version.title ? { title: version.title } : {}),
    },
    select: { id: true, title: true, content: true, updatedAt: true },
  });

  return NextResponse.json(updated);
}
