import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

// GET /api/hr/holidays?year=2026 — visible to all authenticated users
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get("year") ?? "", 10) || new Date().getUTCFullYear();

  const holidays = await prisma.companyHoliday.findMany({
    where: { date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
    orderBy: { date: "asc" },
  });
  return NextResponse.json({ holidays, year });
}

// POST /api/hr/holidays — { name, date } (ADMIN only)
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body?.name || !body?.date) return NextResponse.json({ error: "name and date required" }, { status: 400 });

  const date = new Date(body.date + "T00:00:00.000Z");
  if (isNaN(+date)) return NextResponse.json({ error: "Invalid date" }, { status: 400 });

  const created = await prisma.companyHoliday.create({
    data: { name: String(body.name).slice(0, 120), date },
  });
  return NextResponse.json(created, { status: 201 });
}

// DELETE /api/hr/holidays?id=... (ADMIN only)
export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.companyHoliday.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
