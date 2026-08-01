import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkConflict } from "@/lib/doc-conflict";
import { getDocAccessRole } from "./share/route";

const DOC_MARKER = "document";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.note.findUnique({ where: { id } });
  if (!existing || existing.color !== DOC_MARKER) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const role = await getDocAccessRole(id, existing, user);
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({ ...existing, viewerRole: role });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await request.json()) as {
    title?: string; content?: string; pinned?: boolean;
    /** updatedAt the client last saw — see src/lib/doc-conflict.ts. */
    baseUpdatedAt?: string; force?: boolean;
  };

  const existing = await prisma.note.findUnique({
    where: { id },
    select: { userId: true, color: true, updatedAt: true, content: true, title: true },
  });
  if (!existing || existing.color !== DOC_MARKER) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const role = await getDocAccessRole(id, existing, user);
  if (role !== "owner" && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Reject a save built on a stale copy rather than silently clobbering
  // whoever saved in between.
  if (body.content !== undefined) {
    const conflict = checkConflict({
      baseUpdatedAt: body.baseUpdatedAt,
      force: body.force,
      current: { updatedAt: existing.updatedAt, content: existing.content, title: existing.title },
    });
    if (!conflict.ok) return conflict.response;
  }

  const updated = await prisma.note.update({
    where: { id },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.content !== undefined && { content: body.content }),
      ...(body.pinned !== undefined && { pinned: body.pinned }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.note.findUnique({ where: { id }, select: { userId: true, color: true } });
  if (!existing || existing.userId !== user.id || existing.color !== DOC_MARKER) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.note.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
