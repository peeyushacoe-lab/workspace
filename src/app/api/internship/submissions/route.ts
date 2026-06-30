import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const MENTOR_ROLES = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"] as const;
const HUB_ROLES = ["INTERNSHIP", ...MENTOR_ROLES] as const;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !HUB_ROLES.includes(user.role as typeof HUB_ROLES[number])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get("taskId");
  const internId = searchParams.get("internId");

  // Interns only see their own submissions; mentors see all (or filtered by internId)
  const isMentor = MENTOR_ROLES.includes(user.role as typeof MENTOR_ROLES[number]);

  const submissions = await prisma.internSubmission.findMany({
    where: {
      ...(taskId ? { taskId } : {}),
      ...(!isMentor ? { submitterId: user.id } : internId ? { submitterId: internId } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      submitter: { select: { id: true, fullName: true, avatarUrl: true } },
      task: { select: { id: true, title: true, priority: true, deadline: true } },
      reviews: {
        include: { reviewer: { select: { id: true, fullName: true, avatarUrl: true } } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  return NextResponse.json(submissions);
}

const createSchema = z.object({
  taskId: z.string().min(1),
  notes: z.string().optional(),
  files: z.array(z.object({
    name: z.string(),
    url: z.string().nullable().optional(),
    key: z.string().optional(),
    type: z.string().optional(),
    ext: z.string().optional(),
    size: z.number().optional(),
  })).optional(),
  links: z.array(z.string().min(1)).default([]),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !HUB_ROLES.includes(user.role as typeof HUB_ROLES[number])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid submission data", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  // Determine version number — how many previous submissions for this task by this user
  const prevCount = await prisma.internSubmission.count({
    where: { taskId: data.taskId, submitterId: user.id },
  });

  const submission = await prisma.internSubmission.create({
    data: {
      taskId: data.taskId,
      submitterId: user.id,
      notes: data.notes,
      files: data.files ?? [],
      links: data.links,
      status: "submitted",
      version: prevCount + 1,
    },
    include: {
      submitter: { select: { id: true, fullName: true, avatarUrl: true } },
      task: { select: { id: true, title: true } },
      reviews: true,
    },
  });

  return NextResponse.json(submission, { status: 201 });
}
