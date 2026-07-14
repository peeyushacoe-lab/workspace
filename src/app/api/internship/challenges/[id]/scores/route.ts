import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { createNotification } from "@/lib/notifications";

const MENTOR_ROLES = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"] as const;

async function isMentorUser(userId: string, role: string): Promise<boolean> {
  if (MENTOR_ROLES.includes(role as typeof MENTOR_ROLES[number])) return true;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } });
  const prefs = (user?.preferences as Record<string, unknown> | null) ?? {};
  const granted: string[] = Array.isArray(prefs.grantedRoles) ? (prefs.grantedRoles as string[]) : [];
  return granted.includes("Mentor");
}

// One score row per (team, category) — mentors submit/overwrite as judging progresses.
const scoreSchema = z.object({
  teamId: z.string().min(1),
  category: z.string().min(1),
  points: z.number().min(0),
  maxPoints: z.number().positive(),
  comment: z.string().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isMentorUser(session.id, session.role))) {
    return NextResponse.json({ error: "Only mentors can score challenges" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json();
  const parsed = scoreSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid score data", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  if (data.points > data.maxPoints) {
    return NextResponse.json({ error: `Points (${data.points}) cannot exceed max (${data.maxPoints})` }, { status: 400 });
  }

  const team = await prisma.challengeTeam.findUnique({ where: { id: data.teamId } });
  if (!team || team.challengeId !== id) {
    return NextResponse.json({ error: "Team does not belong to this challenge" }, { status: 400 });
  }

  const score = await prisma.challengeScore.upsert({
    where: { teamId_category: { teamId: data.teamId, category: data.category } },
    update: { points: data.points, maxPoints: data.maxPoints, comment: data.comment, scoredById: session.id },
    create: {
      challengeId: id,
      teamId: data.teamId,
      category: data.category,
      points: data.points,
      maxPoints: data.maxPoints,
      comment: data.comment,
      scoredById: session.id,
    },
  });

  // Let the team know their scorecard updated (best-effort, non-blocking)
  const notifyIds = [...team.memberIds, ...(team.leadId ? [team.leadId] : [])];
  await Promise.all(
    notifyIds.map(userId =>
      createNotification({
        userId,
        type: "SYSTEM",
        title: `Score updated: ${team.name}`,
        body: `A mentor scored your "${data.category}" category. Check the Intern Hub for details.`,
        link: "/internship",
      }).catch(() => {}),
    ),
  );

  return NextResponse.json(score, { status: 201 });
}
