import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { name, parentId } = (await request.json()) as { name?: string; parentId?: string | null };

  const folder = await prisma.driveFolder.findUnique({ where: { id } });
  if (!folder || folder.ownerId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.driveFolder.update({
    where: { id },
    data: {
      ...(name ? { name: name.trim() } : {}),
      ...(parentId !== undefined ? { parentId } : {}),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const folder = await prisma.driveFolder.findUnique({ where: { id } });
  if (!folder || folder.ownerId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.driveFolder.delete({ where: { id } });
  return new Response(null, { status: 204 });
}
