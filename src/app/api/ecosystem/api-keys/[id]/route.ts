import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const key = await prisma.aPIKey.findFirst({ where: { id, userId: user.id } });
  if (!key) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json() as { isActive?: boolean; name?: string };
  const updated = await prisma.aPIKey.update({
    where: { id },
    data: {
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(body.name && { name: body.name }),
    },
    select: { id: true, name: true, keyPrefix: true, scopes: true, isActive: true, lastUsedAt: true, expiresAt: true, createdAt: true },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const key = await prisma.aPIKey.findFirst({ where: { id, userId: user.id } });
  if (!key) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.aPIKey.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
