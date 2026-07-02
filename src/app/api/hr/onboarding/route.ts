import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { DEFAULT_ONBOARDING, DEFAULT_OFFBOARDING, isHRManager } from "@/lib/hr";

// GET /api/hr/onboarding            → my checklist
// GET /api/hr/onboarding?userId=... → that user's checklist (HR managers only)
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const targetId = searchParams.get("userId");
  if (targetId && targetId !== user.id && !isHRManager(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const items = await prisma.onboardingItem.findMany({
    where: { userId: targetId ?? user.id },
    orderBy: [{ kind: "asc" }, { order: "asc" }],
  });
  return NextResponse.json({ items });
}

// POST /api/hr/onboarding — HR managers only
//   { userId, applyTemplate: "ONBOARDING" | "OFFBOARDING" }  → seed default checklist
//   { userId, title, description?, kind?, dueDate? }          → add single item
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !isHRManager(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body?.userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  if (body.applyTemplate === "ONBOARDING" || body.applyTemplate === "OFFBOARDING") {
    const template = body.applyTemplate === "ONBOARDING" ? DEFAULT_ONBOARDING : DEFAULT_OFFBOARDING;
    const existing = await prisma.onboardingItem.count({ where: { userId: body.userId, kind: body.applyTemplate } });
    if (existing > 0) return NextResponse.json({ error: "Checklist already exists for this user" }, { status: 409 });
    await prisma.onboardingItem.createMany({
      data: template.map((t, i) => ({
        userId: body.userId,
        kind: body.applyTemplate,
        title: t.title,
        description: t.description ?? null,
        order: i,
        createdById: user.id,
      })),
    });
    const items = await prisma.onboardingItem.findMany({
      where: { userId: body.userId },
      orderBy: [{ kind: "asc" }, { order: "asc" }],
    });
    return NextResponse.json({ items }, { status: 201 });
  }

  if (!body.title) return NextResponse.json({ error: "title required" }, { status: 400 });
  const maxOrder = await prisma.onboardingItem.aggregate({
    where: { userId: body.userId, kind: body.kind === "OFFBOARDING" ? "OFFBOARDING" : "ONBOARDING" },
    _max: { order: true },
  });
  const created = await prisma.onboardingItem.create({
    data: {
      userId: body.userId,
      kind: body.kind === "OFFBOARDING" ? "OFFBOARDING" : "ONBOARDING",
      title: String(body.title).slice(0, 200),
      description: typeof body.description === "string" ? body.description.slice(0, 500) : null,
      dueDate: body.dueDate ? new Date(body.dueDate + "T12:00:00.000Z") : null,
      order: (maxOrder._max.order ?? -1) + 1,
      createdById: user.id,
    },
  });
  return NextResponse.json(created, { status: 201 });
}

// PATCH /api/hr/onboarding — { id, completed: boolean } (owner or HR manager)
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.id || typeof body.completed !== "boolean") {
    return NextResponse.json({ error: "id and completed required" }, { status: 400 });
  }

  const item = await prisma.onboardingItem.findUnique({ where: { id: body.id } });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (item.userId !== user.id && !isHRManager(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await prisma.onboardingItem.update({
    where: { id: item.id },
    data: { completedAt: body.completed ? new Date() : null },
  });
  return NextResponse.json(updated);
}

// DELETE /api/hr/onboarding?id=... (HR managers only)
export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user || !isHRManager(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.onboardingItem.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
