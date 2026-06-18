import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { createNotification } from "@/lib/notifications";

const MENTOR_ROLES = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"] as const;
const HUB_ROLES = ["INTERNSHIP", ...MENTOR_ROLES] as const;

async function isMentorUser(userId: string, role: string): Promise<boolean> {
  if (MENTOR_ROLES.includes(role as typeof MENTOR_ROLES[number])) return true;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } });
  const prefs = (user?.preferences as Record<string, unknown> | null) ?? {};
  const granted: string[] = Array.isArray(prefs.grantedRoles) ? (prefs.grantedRoles as string[]) : [];
  return granted.includes("Mentor");
}

// Mentors see every intern's module completion (to review text answers);
// interns only see their own.
function weekInclude(isMentor: boolean, userId: string) {
  return {
    topics: {
      orderBy: { order: "asc" as const },
      include: {
        completions: {
          ...(isMentor ? {} : { where: { internId: userId } }),
          include: { intern: { select: { id: true, fullName: true, avatarUrl: true } } },
        },
      },
    },
    resources: { orderBy: { order: "asc" as const } },
    checkpoints: { orderBy: { order: "asc" as const } },
    completions: { select: { internId: true } },
    mentorNotes: {
      include: { author: { select: { id: true, fullName: true, avatarUrl: true } } },
      orderBy: { createdAt: "desc" as const },
    },
  };
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentUser();
  if (!session || !HUB_ROLES.includes(session.role as typeof HUB_ROLES[number])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const { id } = await params;
  const isMentor = await isMentorUser(session.id, session.role);

  const week = await prisma.internWeek.findUnique({
    where: { id },
    include: weekInclude(isMentor, session.id),
  });

  if (!week) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(week);
}

const quizSchema = z.object({
  questions: z.array(z.object({
    id: z.string(),
    type: z.enum(["mcq", "text"]),
    prompt: z.string(),
    options: z.array(z.string()).optional(),
    answerIndex: z.number().int().optional(),
  })).default([]),
}).optional();

const patchSchema = z.object({
  // Unlock / lock
  isUnlocked: z.boolean().optional(),
  // Edit content
  title: z.string().optional(),
  overview: z.string().optional(),
  // Upsert topics (IDs preserved so per-intern quiz progress survives edits)
  topics: z.array(z.object({
    id: z.string().optional(),
    title: z.string(), body: z.string(), order: z.number().optional(),
    quiz: quizSchema,
  })).optional(),
  // Replace resources
  resources: z.array(z.object({
    id: z.string().optional(),
    title: z.string(), url: z.string(), type: z.string().optional(), order: z.number().optional(),
  })).optional(),
  // Upsert checkpoints
  checkpoints: z.array(z.object({
    id: z.string().optional(),
    title: z.string(), order: z.number().optional(),
  })).optional(),
  // Add a mentor note
  mentorNote: z.string().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isMentorUser(session.id, session.role))) {
    return NextResponse.json({ error: "Only mentors can edit weeks" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid week data", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const existing = await prisma.internWeek.findUnique({ where: { id }, select: { id: true, isUnlocked: true, weekNumber: true, title: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const wasLocked = !existing.isUnlocked;
  const nowUnlocking = data.isUnlocked === true && wasLocked;

  // Update the week meta
  await prisma.internWeek.update({
    where: { id },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.overview !== undefined ? { overview: data.overview } : {}),
      ...(data.isUnlocked !== undefined ? {
        isUnlocked: data.isUnlocked,
        unlockedAt: data.isUnlocked ? new Date() : null,
        unlockedById: data.isUnlocked ? session.id : null,
      } : {}),
    },
  });

  // Upsert topics if provided — preserve IDs so module-completion records aren't orphaned
  if (data.topics !== undefined) {
    const incoming = data.topics;
    const keepIds = incoming.filter(t => t.id).map(t => t.id as string);
    await prisma.internWeekTopic.deleteMany({
      where: { weekId: id, id: { notIn: keepIds.length ? keepIds : ["__none__"] } },
    });
    for (let i = 0; i < incoming.length; i++) {
      const t = incoming[i];
      const quiz = t.quiz !== undefined ? t.quiz : undefined;
      if (t.id) {
        await prisma.internWeekTopic.update({
          where: { id: t.id },
          data: { title: t.title, body: t.body, order: t.order ?? i, ...(quiz !== undefined ? { quiz } : {}) },
        });
      } else {
        await prisma.internWeekTopic.create({
          data: { weekId: id, title: t.title, body: t.body, order: t.order ?? i, ...(quiz !== undefined ? { quiz } : {}) },
        });
      }
    }
  }

  // Replace resources if provided (no per-intern state, safe to recreate)
  if (data.resources !== undefined) {
    await prisma.internWeekResource.deleteMany({ where: { weekId: id } });
    if (data.resources.length > 0) {
      await prisma.internWeekResource.createMany({
        data: data.resources.map((r, i) => ({
          weekId: id, title: r.title, url: r.url, type: r.type ?? "link", order: r.order ?? i,
        })),
      });
    }
  }

  // Upsert checkpoints if provided (previously dropped silently)
  if (data.checkpoints !== undefined) {
    const incoming = data.checkpoints;
    const keepIds = incoming.filter(c => c.id).map(c => c.id as string);
    await prisma.internWeekCheckpoint.deleteMany({
      where: { weekId: id, id: { notIn: keepIds.length ? keepIds : ["__none__"] } },
    });
    for (let i = 0; i < incoming.length; i++) {
      const c = incoming[i];
      if (c.id) {
        await prisma.internWeekCheckpoint.update({ where: { id: c.id }, data: { title: c.title, order: c.order ?? i } });
      } else {
        await prisma.internWeekCheckpoint.create({ data: { weekId: id, title: c.title, order: c.order ?? i } });
      }
    }
  }

  // Add mentor note
  if (data.mentorNote?.trim()) {
    await prisma.internWeekMentorNote.create({
      data: { weekId: id, authorId: session.id, body: data.mentorNote.trim() },
    });
  }

  // Fire notifications to all interns when a week is unlocked
  if (nowUnlocking) {
    const interns = await prisma.user.findMany({
      where: { role: "INTERNSHIP", isActive: true },
      select: { id: true },
    });
    await Promise.all(
      interns.map(intern =>
        createNotification({
          userId: intern.id,
          type: "SYSTEM",
          title: `Week ${existing.weekNumber} unlocked!`,
          body: `"${existing.title}" is now available in the Internship Hub.`,
          link: "/internship",
        }).catch(() => {}),
      ),
    );
  }

  const updated = await prisma.internWeek.findUnique({
    where: { id },
    include: weekInclude(true, session.id),
  });
  return NextResponse.json(updated);
}
