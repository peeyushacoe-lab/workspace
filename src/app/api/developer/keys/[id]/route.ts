import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const key = await prisma.aPIKey.findUnique({ where: { id }, select: { userId: true } });
  if (!key) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (key.userId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.aPIKey.update({ where: { id }, data: { isActive: false } });

  return NextResponse.json({ ok: true });
}
