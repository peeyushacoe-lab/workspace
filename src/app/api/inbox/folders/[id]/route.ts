import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const folder = await prisma.mailFolder.findFirst({ where: { id, userId: user.id } });
  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await request.json()) as { name?: string; color?: string; icon?: string };

  if (body.name?.trim()) {
    const conflict = await prisma.mailFolder.findFirst({
      where: { userId: user.id, name: body.name.trim(), NOT: { id } },
    });
    if (conflict) return NextResponse.json({ error: "A folder with this name already exists" }, { status: 409 });
  }

  const updated = await prisma.mailFolder.update({
    where: { id },
    data: {
      ...(body.name?.trim() ? { name: body.name.trim() } : {}),
      ...(body.color !== undefined ? { color: body.color } : {}),
      ...(body.icon !== undefined ? { icon: body.icon } : {}),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const folder = await prisma.mailFolder.findFirst({ where: { id, userId: user.id } });
  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Move threads back to inbox (no folder) before deleting
  await prisma.inboxThread.updateMany({ where: { folderId: id }, data: { folderId: null } });
  await prisma.mailFolder.delete({ where: { id } });

  return NextResponse.json({ deleted: true });
}
