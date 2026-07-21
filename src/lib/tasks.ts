import { prisma } from "@/lib/prisma";

// A user can act on a task's comments/attachments if they created it or are
// assigned to it. Mirrors the check in /api/tasks/[id]/route.ts PATCH.
export async function canAccessTask(taskId: string, userId: string): Promise<boolean> {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      OR: [{ createdById: userId }, { assignees: { some: { userId } } }],
    },
    select: { id: true },
  });
  return !!task;
}
