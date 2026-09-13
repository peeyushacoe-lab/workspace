import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHotelContext, isHotelManager } from "@/lib/hospitality/access";

type Params = { params: Promise<{ id: string }> };
const STATUSES = new Set(["TODO", "IN_PROGRESS", "DONE"]);

/** A task belongs to this hotel if it was raised here or from one of its alerts. */
async function findHotelTask(id: string, propertyId: string) {
  const task = await prisma.task.findUnique({
    where: { id },
    select: { id: true, sourceType: true, sourceId: true, createdById: true },
  });
  if (!task || !task.sourceId) return null;
  if (task.sourceType === "hotel") return task.sourceId === propertyId ? task : null;
  if (task.sourceType === "hotel_alert") {
    const alert = await prisma.hotelAlert.findFirst({ where: { id: task.sourceId, propertyId }, select: { id: true } });
    return alert ? task : null;
  }
  return null;
}

// PATCH /api/hospitality/tasks/:id — { status?, assigneeId? }
export async function PATCH(req: NextRequest, { params }: Params) {
  const ctx = await requireHotelContext();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;

  const task = await findHotelTask(id, ctx.property.id);
  if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !STATUSES.has(body.status)) {
      return NextResponse.json({ error: "Unknown status." }, { status: 400 });
    }
    await prisma.task.update({
      where: { id: task.id },
      data: { status: body.status as "TODO" | "IN_PROGRESS" | "DONE" },
    });
  }

  if ("assigneeId" in body) {
    let assigneeId: string | null = null;
    if (typeof body.assigneeId === "string" && body.assigneeId) {
      const member = await prisma.user.findFirst({
        where: { id: body.assigneeId, organizationId: ctx.user.organizationId, isActive: true },
        select: { id: true },
      });
      if (!member) return NextResponse.json({ error: "That person is not on your team." }, { status: 400 });
      assigneeId = member.id;
    }
    await prisma.$transaction([
      prisma.taskAssignee.deleteMany({ where: { taskId: task.id } }),
      ...(assigneeId ? [prisma.taskAssignee.create({ data: { taskId: task.id, userId: assigneeId } })] : []),
    ]);
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/hospitality/tasks/:id — the person who raised it, or a manager.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const ctx = await requireHotelContext();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;

  const task = await findHotelTask(id, ctx.property.id);
  if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  if (task.createdById !== ctx.user.id && !isHotelManager(ctx.user)) {
    return NextResponse.json({ error: "Only the person who raised it or a manager can delete this task." }, { status: 403 });
  }

  await prisma.task.delete({ where: { id: task.id } });
  return NextResponse.json({ ok: true });
}
