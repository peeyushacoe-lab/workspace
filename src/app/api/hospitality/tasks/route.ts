import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHotelContext } from "@/lib/hospitality/access";
import { HOTEL_DEPARTMENTS, cleanText } from "@/lib/hospitality/catalog";

const PRIORITIES = new Set(["LOW", "MEDIUM", "HIGH", "URGENT"]);
const DEPT_KEYS = new Set<string>(HOTEL_DEPARTMENTS.map((d) => d.key));

// Hotel tasks live in the shared Task table, scoped to the property through
// sourceType/sourceId — "hotel" for tasks raised here, "hotel_alert" for tasks
// created from an alert. Department and room ride in labels ("dept:…", "room:…").
async function scopeFor(propertyId: string) {
  const alerts = await prisma.hotelAlert.findMany({ where: { propertyId }, select: { id: true } });
  return {
    OR: [
      { sourceType: "hotel", sourceId: propertyId },
      { sourceType: "hotel_alert", sourceId: { in: alerts.map((a) => a.id) } },
    ],
  };
}

export async function GET() {
  const ctx = await requireHotelContext();
  if ("error" in ctx) return ctx.error;

  const tasks = await prisma.task.findMany({
    where: await scopeFor(ctx.property.id),
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    take: 300,
    select: {
      id: true, title: true, description: true, status: true, priority: true,
      dueDate: true, labels: true, createdAt: true, sourceType: true,
      createdBy: { select: { fullName: true } },
      assignees: { select: { user: { select: { id: true, fullName: true } } } },
    },
  });

  return NextResponse.json({
    tasks: tasks.map((t) => ({
      id: t.id, title: t.title, description: t.description, status: t.status,
      priority: t.priority, dueDate: t.dueDate, createdAt: t.createdAt,
      fromAlert: t.sourceType === "hotel_alert",
      department: t.labels.find((l) => l.startsWith("dept:"))?.slice(5) ?? null,
      roomNumber: t.labels.find((l) => l.startsWith("room:"))?.slice(5) ?? null,
      createdByName: t.createdBy.fullName,
      assignees: t.assignees.map((a) => a.user),
    })),
  });
}

export async function POST(req: NextRequest) {
  const ctx = await requireHotelContext();
  if ("error" in ctx) return ctx.error;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const title = cleanText(body?.title, 200);
  if (!body || !title) return NextResponse.json({ error: "Task title is required." }, { status: 400 });

  const priority = typeof body.priority === "string" && PRIORITIES.has(body.priority) ? body.priority : "MEDIUM";
  const department = typeof body.department === "string" && DEPT_KEYS.has(body.department) ? body.department : null;
  const roomNumber = cleanText(body.roomNumber, 20);
  const dueDate = typeof body.dueDate === "string" && body.dueDate ? new Date(body.dueDate) : null;
  if (dueDate && Number.isNaN(dueDate.getTime())) {
    return NextResponse.json({ error: "Invalid due date." }, { status: 400 });
  }

  let assigneeId: string | null = null;
  if (typeof body.assigneeId === "string" && body.assigneeId) {
    const member = await prisma.user.findFirst({
      where: { id: body.assigneeId, organizationId: ctx.user.organizationId, isActive: true },
      select: { id: true },
    });
    if (!member) return NextResponse.json({ error: "That person is not on your team." }, { status: 400 });
    assigneeId = member.id;
  }

  const task = await prisma.task.create({
    data: {
      title,
      description: cleanText(body.description, 2000),
      priority: priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
      dueDate,
      createdById: ctx.user.id,
      sourceType: "hotel",
      sourceId: ctx.property.id,
      labels: [department ? `dept:${department}` : null, roomNumber ? `room:${roomNumber}` : null].filter(
        (l): l is string => !!l,
      ),
      ...(assigneeId ? { assignees: { create: { userId: assigneeId } } } : {}),
    },
    select: { id: true },
  });

  return NextResponse.json({ task }, { status: 201 });
}
