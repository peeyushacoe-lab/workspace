import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import type { TaskStatus, TaskPriority } from "@/generated/prisma/enums";

// Shared include shape so list + detail responses match what the UI expects.
const taskInclude = {
  assignees: { include: { user: { select: { id: true, fullName: true, avatarUrl: true, email: true } } } },
  createdBy: { select: { id: true, fullName: true, avatarUrl: true } },
  list: { select: { id: true, name: true, isTeamList: true } },
  _count: { select: { comments: true, attachments: true, subTasks: true } },
} as const;

// GET /api/tasks?view=mine|assigned|all&listId=&status=&priority=&dueBefore=&search=
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view") ?? "mine";
  const listId = searchParams.get("listId");
  const status = searchParams.get("status") as TaskStatus | null;
  const priority = searchParams.get("priority") as TaskPriority | null;
  const dueBefore = searchParams.get("dueBefore");
  const search = searchParams.get("search");

  const where: Record<string, unknown> = {};

  if (view === "mine") {
    where.OR = [{ createdById: user.id }, { assignees: { some: { userId: user.id } } }];
  } else if (view === "assigned") {
    where.assignees = { some: { userId: user.id } };
  }
  // view === "all": no owner/assignee restriction (admin/team-wide lists still
  // scoped by listId below if provided)

  if (listId) where.listId = listId;
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (dueBefore) where.dueDate = { lte: new Date(dueBefore) };
  if (search) {
    where.OR = [
      ...(Array.isArray(where.OR) ? where.OR : []),
      { title: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }

  const tasks = await prisma.task.findMany({
    where,
    include: taskInclude,
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: 500,
  });

  return NextResponse.json({ tasks });
}

// POST /api/tasks — create
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    title?: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    dueDate?: string;
    labels?: string[];
    listId?: string;
    assigneeIds?: string[];
    recurrence?: string;
    parentTaskId?: string;
    sourceType?: string;
    sourceId?: string;
  };

  if (!body.title?.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const assigneeIds = Array.isArray(body.assigneeIds) ? [...new Set(body.assigneeIds)] : [];

  const task = await prisma.task.create({
    data: {
      title: body.title.trim(),
      description: body.description || null,
      status: body.status ?? "TODO",
      priority: body.priority ?? "MEDIUM",
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      labels: Array.isArray(body.labels) ? body.labels : [],
      listId: body.listId ?? null,
      createdById: user.id,
      recurrence: body.recurrence ?? null,
      parentTaskId: body.parentTaskId ?? null,
      sourceType: body.sourceType ?? null,
      sourceId: body.sourceId ?? null,
      assignees: assigneeIds.length
        ? { create: assigneeIds.map((userId) => ({ userId })) }
        : undefined,
    },
    include: taskInclude,
  });

  // Notify assignees (skip self-assignment noise)
  await Promise.all(
    assigneeIds
      .filter((id) => id !== user.id)
      .map((assigneeId) =>
        createNotification({
          userId: assigneeId,
          type: "TASK_ASSIGNED",
          title: "New task assigned",
          body: `${user.fullName} assigned you: "${task.title}"`,
          link: `/tasks?taskId=${task.id}`,
        })
      )
  );

  return NextResponse.json({ task }, { status: 201 });
}
