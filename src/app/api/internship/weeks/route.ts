import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const MENTOR_ROLES = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"] as const;
const HUB_ROLES = ["INTERNSHIP", ...MENTOR_ROLES] as const;

async function isMentorUser(userId: string, role: string): Promise<boolean> {
  if (MENTOR_ROLES.includes(role as typeof MENTOR_ROLES[number])) return true;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } });
  const prefs = (user?.preferences as Record<string, unknown> | null) ?? {};
  const granted: string[] = Array.isArray(prefs.grantedRoles) ? (prefs.grantedRoles as string[]) : [];
  return granted.includes("Mentor");
}

export async function GET() {
  const session = await getCurrentUser();
  if (!session || !HUB_ROLES.includes(session.role as typeof HUB_ROLES[number])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const weeks = await prisma.internWeek.findMany({
    orderBy: { weekNumber: "asc" },
    include: {
      topics: {
        orderBy: { order: "asc" },
        include: { completions: { where: { internId: session.id }, select: { id: true, topicId: true, score: true } } },
      },
      resources: { orderBy: { order: "asc" } },
      checkpoints: { orderBy: { order: "asc" } },
      completions: { select: { internId: true } },
      mentorNotes: {
        include: { author: { select: { id: true, fullName: true, avatarUrl: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return NextResponse.json(weeks);
}

const createSchema = z.object({
  weekNumber: z.number().int().min(0),
  title: z.string().min(1),
  overview: z.string().min(1),
  isUnlocked: z.boolean().optional(),
  topics: z.array(z.object({
    title: z.string(), body: z.string(), order: z.number().optional(),
  })).optional(),
  resources: z.array(z.object({
    title: z.string(), url: z.string(), type: z.string().optional(), order: z.number().optional(),
  })).optional(),
  checkpoints: z.array(z.object({
    title: z.string(), description: z.string().optional(), linkedTaskId: z.string().optional(), order: z.number().optional(),
  })).optional(),
});

export async function POST(request: Request) {
  const session = await getCurrentUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isMentorUser(session.id, session.role))) {
    return NextResponse.json({ error: "Only mentors can create weeks" }, { status: 403 });
  }

  const body = await request.json();
  const data = createSchema.parse(body);

  const week = await prisma.internWeek.create({
    data: {
      weekNumber: data.weekNumber,
      title: data.title,
      overview: data.overview,
      isUnlocked: data.isUnlocked ?? false,
      createdById: session.id,
      topics: data.topics
        ? { create: data.topics.map((t, i) => ({ title: t.title, body: t.body, order: t.order ?? i })) }
        : undefined,
      resources: data.resources
        ? { create: data.resources.map((r, i) => ({ title: r.title, url: r.url, type: r.type ?? "link", order: r.order ?? i })) }
        : undefined,
      checkpoints: data.checkpoints
        ? { create: data.checkpoints.map((c, i) => ({ title: c.title, description: c.description, linkedTaskId: c.linkedTaskId, order: c.order ?? i })) }
        : undefined,
    },
    include: {
      topics: { orderBy: { order: "asc" } },
      resources: { orderBy: { order: "asc" } },
      checkpoints: { orderBy: { order: "asc" } },
      completions: { select: { internId: true } },
      mentorNotes: true,
    },
  });

  return NextResponse.json(week, { status: 201 });
}
