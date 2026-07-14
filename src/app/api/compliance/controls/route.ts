import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SOC2_DEFAULTS, GDPR_DEFAULTS, PENTEST_DEFAULTS, type DefaultControl } from "@/lib/compliance-defaults";

const CATEGORY_DEFAULTS: Record<string, DefaultControl[]> = {
  SOC2: SOC2_DEFAULTS,
  GDPR: GDPR_DEFAULTS,
  PENTEST: PENTEST_DEFAULTS,
};

export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["ADMIN", "CISO", "CEO"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const categories = category ? [category] : Object.keys(CATEGORY_DEFAULTS);

  for (const cat of categories) {
    const defaults = CATEGORY_DEFAULTS[cat];
    if (!defaults) continue;
    const existingCount = await prisma.complianceControl.count({ where: { category: cat } });
    if (existingCount === 0) {
      await prisma.complianceControl.createMany({
        data: defaults.map((d) => ({ category: cat, key: d.key, label: d.label, description: d.description })),
        skipDuplicates: true,
      });
    }
  }

  const controls = await prisma.complianceControl.findMany({
    where: category ? { category } : { category: { in: Object.keys(CATEGORY_DEFAULTS) } },
    orderBy: [{ category: "asc" }, { key: "asc" }],
  });

  return NextResponse.json(controls);
}

export async function PATCH(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["ADMIN", "CISO", "CEO"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    id?: string;
    status?: string;
    notes?: string;
    owner?: string;
    dueDate?: string | null;
  };
  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updated = await prisma.complianceControl.update({
    where: { id: body.id },
    data: {
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.owner !== undefined ? { owner: body.owner } : {}),
      ...(body.dueDate !== undefined ? { dueDate: body.dueDate ? new Date(body.dueDate) : null } : {}),
    },
  });

  return NextResponse.json(updated);
}
