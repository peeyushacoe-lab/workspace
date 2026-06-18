import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const INTERN_ROLES = ["INTERNSHIP"] as const;
const MENTOR_ROLES = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"] as const;
const HUB_ROLES = [...INTERN_ROLES, ...MENTOR_ROLES] as const;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !HUB_ROLES.includes(user.role as typeof HUB_ROLES[number])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const assigneeId = searchParams.get("assigneeId");

  const tasks = await prisma.internTask.findMany({
    where: assigneeId ? { assigneeIds: { has: assigneeId } } : undefined,
    orderBy: [{ deadline: "asc" }, { createdAt: "desc" }],
    include: {
      createdBy: { select: { id: true, fullName: true, avatarUrl: true } },
      submissions: {
        select: { id: true, submitterId: true, status: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
      _count: { select: { discussions: true } },
    },
  });

  return NextResponse.json(tasks);
}

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  deadline: z.string().datetime().optional().nullable(),
  assigneeIds: z.array(z.string()).default([]),
  attachments: z.array(z.object({ name: z.string(), url: z.string(), type: z.string() })).optional(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !MENTOR_ROLES.includes(user.role as typeof MENTOR_ROLES[number])) {
    return NextResponse.json({ error: "Only mentors can create tasks" }, { status: 403 });
  }

  const body = await request.json();
  const data = createSchema.parse(body);

  const task = await prisma.internTask.create({
    data: {
      title: data.title,
      description: data.description,
      priority: data.priority,
      deadline: data.deadline ? new Date(data.deadline) : null,
      assigneeIds: data.assigneeIds,
      attachments: data.attachments ?? [],
      createdById: user.id,
    },
    include: {
      createdBy: { select: { id: true, fullName: true, avatarUrl: true } },
      submissions: { select: { id: true, submitterId: true, status: true, createdAt: true } },
      _count: { select: { discussions: true } },
    },
  });

  return NextResponse.json(task, { status: 201 });
}
