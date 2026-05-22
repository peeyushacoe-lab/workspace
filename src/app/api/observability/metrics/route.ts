import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ADMIN_ROLES = ["ADMIN", "CEO", "CISO", "OPS_MANAGER", "COO"] as const;
type AdminRole = (typeof ADMIN_ROLES)[number];

export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes(user.role as AdminRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name") ?? undefined;
  const hours = parseInt(searchParams.get("hours") ?? "24");
  const since = new Date(Date.now() - hours * 3_600_000);

  const metrics = await prisma.metricSnapshot.findMany({
    where: {
      ...(name ? { name } : {}),
      capturedAt: { gte: since },
    },
    orderBy: { capturedAt: "asc" },
    take: 1000,
  });

  // Group by name for time-series
  const grouped = metrics.reduce<Record<string, Array<{ t: string; v: number }>>>((acc, m) => {
    acc[m.name] ??= [];
    acc[m.name].push({ t: m.capturedAt.toISOString(), v: m.value });
    return acc;
  }, {});

  return NextResponse.json({ metrics: grouped, count: metrics.length });
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes(user.role as AdminRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json() as { name: string; value: number; labels?: Record<string, unknown> };
  if (!body.name || body.value === undefined) {
    return NextResponse.json({ error: "name and value required" }, { status: 400 });
  }

  const metric = await prisma.metricSnapshot.create({
    data: { name: body.name, value: body.value, labels: (body.labels ?? undefined) as never },
  });

  return NextResponse.json(metric, { status: 201 });
}
