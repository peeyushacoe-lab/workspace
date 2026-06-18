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

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentUser();
  if (!session || !HUB_ROLES.includes(session.role as typeof HUB_ROLES[number])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const { id } = await params;

  const week = await prisma.internWeek.findUnique({
    where: { id },
    include: {
      topics: { orderBy: { order: "asc" } },
      resources: { orderBy: { order: "asc" } },
      checkpoints: { orderBy: { order: "asc" } },
      completions: { select: { internId: true } },
      mentorNotes: {
        include: { author: { select: { id: true, fullName: true, avatarUrl: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!week) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(week);
}

const patchSchema = z.object({
  // Unlock / lock
  isUnlocked: z.boolean().optional(),
  // Edit content
  title: z.string().optional(),
  overview: z.string().optional(),
  // Replace topics (full replace for simplicity)
  topics: z.array(z.object({
    id: z.string().optional(),
    title: z.string(), body: z.string(), order: z.number().optional(),
  })).optional(),
  // Replace resources
  resources: z.array(z.object({
    id: z.string().optional(),
    title: z.string(), url: z.string(), type: z.string().optional(), order: z.number().optional(),
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
  const data = patchSchema.parse(body);

  const existing = await prisma.internWeek.findUnique({ where: { id }, select: { id: true, isUnlocked: true, weekNumber: true, title: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const wasLocked = !existing.isUnlocked;
  const nowUnlocking = data.isUnlocked === true && wasLocked;

  // Update the week
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

  // Replace topics if provided
  if (data.topics !== undefined) {
    await prisma.internWeekTopic.deleteMany({ where: { weekId: id } });
    if (data.topics.length > 0) {
      await prisma.internWeekTopic.createMany({
        data: data.topics.map((t, i) => ({
          weekId: id, title: t.title, body: t.body, order: t.order ?? i,
        })),
      });
    }
  }

  // Replace resources if provided
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
    include: {
      topics: { orderBy: { order: "asc" } },
      resources: { orderBy: { order: "asc" } },
      checkpoints: { orderBy: { order: "asc" } },
      completions: { select: { internId: true } },
      mentorNotes: {
        include: { author: { select: { id: true, fullName: true, avatarUrl: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  return NextResponse.json(updated);
}
