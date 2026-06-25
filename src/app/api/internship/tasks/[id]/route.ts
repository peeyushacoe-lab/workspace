import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const MENTOR_ROLES = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"] as const;
const HUB_ROLES = ["INTERNSHIP", ...MENTOR_ROLES] as const;

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !HUB_ROLES.includes(user.role as typeof HUB_ROLES[number])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const { id } = await params;
  const isMentor = MENTOR_ROLES.includes(user.role as typeof MENTOR_ROLES[number]);

  const task = await prisma.internTask.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, fullName: true, avatarUrl: true } },
      submissions: {
        // Interns only receive their own submissions — filter server-side so
        // other interns' work never leaves the database for this request.
        where: isMentor ? {} : { submitterId: user.id },
        include: {
          submitter: { select: { id: true, fullName: true, avatarUrl: true } },
          reviews: {
            include: { reviewer: { select: { id: true, fullName: true, avatarUrl: true } } },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      discussions: {
        where: { parentId: null },
        include: {
          author: { select: { id: true, fullName: true, avatarUrl: true, role: true } },
          replies: {
            include: { author: { select: { id: true, fullName: true, avatarUrl: true, role: true } } },
            orderBy: { createdAt: "asc" },
          },
          reactions: { include: { user: { select: { id: true, fullName: true } } } },
        },
        orderBy: [{ isPinned: "desc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(task);
}

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  deadline: z.string().datetime().optional().nullable(),
  assigneeIds: z.array(z.string()).optional(),
  attachments: z.array(z.object({ name: z.string(), url: z.string(), type: z.string() })).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !MENTOR_ROLES.includes(user.role as typeof MENTOR_ROLES[number])) {
    return NextResponse.json({ error: "Only mentors can update tasks" }, { status: 403 });
  }
  const { id } = await params;

  const body = await request.json();
  const data = patchSchema.parse(body);

  const task = await prisma.internTask.update({
    where: { id },
    data: {
      ...data,
      deadline: data.deadline !== undefined ? (data.deadline ? new Date(data.deadline) : null) : undefined,
    },
    include: {
      createdBy: { select: { id: true, fullName: true, avatarUrl: true } },
      submissions: { select: { id: true, submitterId: true, status: true, createdAt: true } },
      _count: { select: { discussions: true } },
    },
  });

  return NextResponse.json(task);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !MENTOR_ROLES.includes(user.role as typeof MENTOR_ROLES[number])) {
    return NextResponse.json({ error: "Only mentors can delete tasks" }, { status: 403 });
  }
  const { id } = await params;
  await prisma.internTask.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
