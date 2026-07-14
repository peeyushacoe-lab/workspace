import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { indexingQueue } from "@/lib/queues/indexing.queue";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const note = await prisma.note.findUnique({ where: { id } });
  if (!note || note.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(note);
}

export async function PUT(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const note = await prisma.note.findUnique({ where: { id } });
  if (!note || note.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json()) as {
    title?: string;
    content?: string;
    pinned?: boolean;
    color?: string | null;
    folder?: string | null;
  };

  const updated = await prisma.note.update({
    where: { id },
    data: {
      ...(body.title !== undefined ? { title: body.title.trim() || "Untitled Note" } : {}),
      ...(body.content !== undefined ? { content: body.content } : {}),
      ...(body.pinned !== undefined ? { pinned: body.pinned } : {}),
      ...(body.color !== undefined ? { color: body.color } : {}),
      ...(body.folder !== undefined ? { folder: body.folder } : {}),
    },
  });

  indexingQueue.add("index-note", {
    type: "INDEX",
    resource: "note",
    resourceId: updated.id,
    content: `${updated.title} ${updated.content}`,
    metadata: { ownerId: user.id, title: updated.title, updatedAt: updated.updatedAt.toISOString() },
  }).catch(() => {});

  return NextResponse.json(updated);
}

// PATCH is used by the frontend for partial updates (pinned, color, folder)
export async function PATCH(request: Request, { params }: Params) {
  return PUT(request, { params });
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const note = await prisma.note.findUnique({ where: { id } });
  if (!note || note.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.note.delete({ where: { id } });
  indexingQueue.add("deindex-note", { type: "DEINDEX", resource: "note", resourceId: id }).catch(() => {});

  return NextResponse.json({ ok: true });
}
