import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import type { TaskStatus, TaskPriority } from "@/generated/prisma/enums";

const taskInclude = {
  assignees: { include: { user: { select: { id: true, fullName: true, avatarUrl: true, email: true } } } },
  createdBy: { select: { id: true, fullName: true, avatarUrl: true } },
  list: { select: { id: true, name: true, isTeamList: true } },
  comments: {
    orderBy: { createdAt: "asc" as const },
    include: { author: { select: { id: true, fullName: true, avatarUrl: true } } },
  },
  attachments: {
    orderBy: { createdAt: "asc" as const },
    include: { uploadedBy: { select: { id: true, fullName: true } } },
  },
  subTasks: { select: { id: true, title: true, status: true } },
} as const;

// GET /api/tasks/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const task = await prisma.task.findUnique({ where: { id }, include: taskInclude });
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  return NextResponse.json({ task });
}

// PATCH /api/tasks/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.task.findUnique({
    where: { id },
    include: { assignees: true },
  });
  if (!existing) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  if (existing.createdById !== user.id && !existing.assignees.some((a) => a.userId === user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    title?: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    dueDate?: string | null;
    labels?: string[];
    listId?: string | null;
    assigneeIds?: string[];
    recurrence?: string | null;
  };

  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = body.title.trim();
  if (body.description !== undefined) data.description = body.description;
  if (body.status !== undefined) data.status = body.status;
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (body.labels !== undefined) data.labels = body.labels;
  if (body.listId !== undefined) data.listId = body.listId;
  if (body.recurrence !== undefined) data.recurrence = body.recurrence;

  let newAssigneeIds: string[] = [];
  if (body.assigneeIds !== undefined) {
    const nextIds = [...new Set(body.assigneeIds)];
    const currentIds = existing.assignees.map((a) => a.userId);
    newAssigneeIds = nextIds.filter((uid) => !currentIds.includes(uid));

    data.assignees = {
      deleteMany: {},
      create: nextIds.map((userId) => ({ userId })),
    };
  }

  const task = await prisma.task.update({
    where: { id },
    data,
    include: taskInclude,
  });

  await Promise.all(
    newAssigneeIds
      .filter((uid) => uid !== user.id)
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

  return NextResponse.json({ task });
}

// DELETE /api/tasks/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.task.findUnique({ where: { id }, select: { createdById: true } });
  if (!existing) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  if (existing.createdById !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
