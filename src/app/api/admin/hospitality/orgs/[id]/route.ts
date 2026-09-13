import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ─── GET /api/admin/hospitality/orgs/[id] ────────────────────────────────────
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = getSessionUserFromCookieStore(await cookies());
  if (!me || me.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      hotelProperties: true,
      users: {
        select: { id: true, email: true, fullName: true, role: true, isActive: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ org });
}

// ─── DELETE /api/admin/hospitality/orgs/[id] ─────────────────────────────────
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = getSessionUserFromCookieStore(await cookies());
  if (!me || me.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const org = await prisma.organization.findUnique({ where: { id }, select: { id: true } });
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.organization.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
