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

// Teams competing in a challenge must not see each other's mission brief,
// submissions, or scores. Mentors always see everything (they're judging);
// a non-mentor viewer only sees the full detail for team(s) they belong to.
// Scores are additionally held back from everyone until the challenge is
// marked "completed" so a team can't gauge how far ahead/behind they are.
type Redactable = {
  status: string;
  teams: Array<{
    memberIds: string[];
    leadId: string | null;
    mission: string | null;
    submissions: unknown[];
    scores: unknown[];
  }>;
};
function sanitizeForViewer<T extends Redactable>(challenge: T, userId: string, isMentor: boolean): T {
  if (isMentor) return challenge;
  const revealScores = challenge.status === "completed";
  return {
    ...challenge,
    teams: challenge.teams.map(t => {
      const isMine = t.memberIds.includes(userId) || t.leadId === userId;
      if (isMine) return t;
      return { ...t, mission: null, submissions: [], scores: revealScores ? t.scores : [] };
    }),
  };
}

const challengeInclude = {
  createdBy: { select: { id: true, fullName: true, avatarUrl: true } },
  winnerTeam: { select: { id: true, name: true, color: true } },
  teams: {
    orderBy: { createdAt: "asc" as const },
    include: {
      lead: { select: { id: true, fullName: true, avatarUrl: true } },
      scores: true,
      submissions: {
        include: { submitter: { select: { id: true, fullName: true, avatarUrl: true } } },
        orderBy: { createdAt: "desc" as const },
      },
    },
  },
};

export async function GET() {
  const session = await getCurrentUser();
  if (!session || !HUB_ROLES.includes(session.role as typeof HUB_ROLES[number])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const isMentor = await isMentorUser(session.id, session.role);

  const challenges = await prisma.challenge.findMany({
    orderBy: { createdAt: "desc" },
    include: challengeInclude,
  });

  return NextResponse.json(challenges.map(c => sanitizeForViewer(c, session.id, isMentor)));
}

const scoringCategorySchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  maxPoints: z.number().positive(),
});

const teamInputSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
  mission: z.string().optional(),
  leadId: z.string().optional(),
  memberIds: z.array(z.string()).default([]),
});

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  status: z.enum(["upcoming", "active", "judging", "completed", "cancelled"]).optional(),
  deadline: z.string().datetime().optional().or(z.literal("")).optional(),
  scoringSchema: z.array(scoringCategorySchema).min(1),
  teams: z.array(teamInputSchema).min(2, "A challenge needs at least two teams"),
});

export async function POST(request: Request) {
  const session = await getCurrentUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isMentorUser(session.id, session.role))) {
    return NextResponse.json({ error: "Only mentors can create challenges" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid challenge data", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const totalPoints = data.scoringSchema.reduce((sum, c) => sum + c.maxPoints, 0);
  if (Math.round(totalPoints) !== 100) {
    return NextResponse.json({ error: `Scoring categories must sum to 100 points (got ${totalPoints})` }, { status: 400 });
  }

  const challenge = await prisma.challenge.create({
    data: {
      title: data.title,
      description: data.description,
      status: data.status ?? "upcoming",
      deadline: data.deadline ? new Date(data.deadline) : null,
      scoringSchema: data.scoringSchema,
      createdById: session.id,
      teams: {
        create: data.teams.map(t => ({
          name: t.name,
          color: t.color,
          mission: t.mission,
          leadId: t.leadId || null,
          memberIds: t.memberIds,
        })),
      },
    },
    include: challengeInclude,
  });

  // Notify every member/lead across all teams
  const notifyIds = Array.from(new Set(challenge.teams.flatMap(t => [...t.memberIds, ...(t.leadId ? [t.leadId] : [])])));
  await Promise.all(
    notifyIds.map(userId =>
      createNotification({
        userId,
        type: "SYSTEM",
        title: `New challenge: ${challenge.title}`,
        body: `You've been placed on a team for "${challenge.title}". Check the Intern Hub for your mission brief.`,
        link: "/internship",
      }).catch(() => {}),
    ),
  );

  return NextResponse.json(challenge, { status: 201 });
}
