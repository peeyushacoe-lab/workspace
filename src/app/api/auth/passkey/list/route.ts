import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest) {
  const cookieStore = await cookies();
  const user = getSessionUserFromCookieStore(cookieStore);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const passkeys = await prisma.passkey.findMany({
    where: { userId: user.id },
    select: { id: true, name: true, deviceType: true, backedUp: true, createdAt: true, lastUsedAt: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ passkeys });
}

export async function DELETE(req: NextRequest) {
  const cookieStore = await cookies();
  const user = getSessionUserFromCookieStore(cookieStore);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const passkey = await prisma.passkey.findUnique({ where: { id } });
  if (!passkey || passkey.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.passkey.delete({ where: { id } });

  // If no passkeys remain, disable MFA
  const remaining = await prisma.passkey.count({ where: { userId: user.id } });
  if (remaining === 0) {
    await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: false } });
  }

  return NextResponse.json({ ok: true });
}
