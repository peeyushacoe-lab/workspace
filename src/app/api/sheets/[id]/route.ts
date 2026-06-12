import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { SHEET_MARKER } from "../route";

type Params = { params: Promise<{ id: string }> };

async function getAccess(docId: string, userId: string, ownerId: string, userRole: string) {
  if (ownerId === userId || ["ADMIN","CEO","CISO"].includes(userRole)) return "owner";
  const r = await redis.hget(`doc:share:sheet:${docId}`, userId).catch(() => null);
  if (r === "editor") return "editor";
  if (r === "viewer") return "viewer";
  return null;
}

export async function GET(_req: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const sheet = await prisma.note.findFirst({ where: { id, color: SHEET_MARKER } });
  if (!sheet) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const access = await getAccess(id, user.id, sheet.userId, user.role);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({ ...sheet, access });
}

export async function PUT(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const sheet = await prisma.note.findFirst({ where: { id, color: SHEET_MARKER } });
  if (!sheet) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const access = await getAccess(id, user.id, sheet.userId, user.role);
  if (!access || access === "viewer") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as { title?: string; content?: string; pinned?: boolean };

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

export async function DELETE(_req: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const sheet = await prisma.note.findFirst({ where: { id, color: SHEET_MARKER } });
  if (!sheet) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Only owner/admin can delete
  if (sheet.userId !== user.id && !["ADMIN","CEO","CISO"].includes(user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.note.delete({ where: { id } });
  await redis.del(`doc:share:sheet:${id}`).catch(() => {});
  return NextResponse.json({ ok: true });
}
