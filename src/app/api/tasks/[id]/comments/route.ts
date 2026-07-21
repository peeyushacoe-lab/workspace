import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canAccessTask } from "@/lib/tasks";
import { createNotification } from "@/lib/notifications";

// POST /api/tasks/[id]/comments
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: taskId } = await params;

  if (!(await canAccessTask(taskId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as { body?: string };
  if (!body.body?.trim()) {
    return NextResponse.json({ error: "Comment body is required" }, { status: 400 });
  }

  const comment = await prisma.taskComment.create({
    data: { taskId, authorId: user.id, body: body.body.trim() },
    include: { author: { select: { id: true, fullName: true, avatarUrl: true } } },
  });

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignees: true },
  });

  if (task) {
    const recipients = new Set<string>([task.createdById, ...task.assignees.map((a) => a.userId)]);
    recipients.delete(user.id);
    await Promise.all(
      [...recipients].map((userId) =>
        createNotification({
          userId,
          type: "TASK_COMMENT",
          title: "New comment on a task",
          body: `${user.fullName} commented on "${task.title}"`,
          link: `/tasks?taskId=${taskId}`,
        })
      )
    );
  }

  return NextResponse.json({ comment }, { status: 201 });
}
