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

// See challenges/route.ts for why this exists — teams can't see each other's
// mission/submissions, and nobody sees scores until judging is complete.
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

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentUser();
  if (!session || !HUB_ROLES.includes(session.role as typeof HUB_ROLES[number])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const { id } = await params;
  const isMentor = await isMentorUser(session.id, session.role);

  const challenge = await prisma.challenge.findUnique({ where: { id }, include: challengeInclude });
  if (!challenge) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(sanitizeForViewer(challenge, session.id, isMentor));
}

const teamPatchSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  color: z.string().optional(),
  mission: z.string().optional(),
  leadId: z.string().nullable().optional(),
  memberIds: z.array(z.string()).optional(),
});

const patchSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(["upcoming", "active", "judging", "completed", "cancelled"]).optional(),
  deadline: z.string().datetime().nullable().optional(),
  winnerTeamId: z.string().nullable().optional(),
  teams: z.array(teamPatchSchema).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isMentorUser(session.id, session.role))) {
    return NextResponse.json({ error: "Only mentors can edit challenges" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid challenge data", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const existing = await prisma.challenge.findUnique({ where: { id }, select: { id: true, title: true, status: true, winnerTeamId: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const winnerJustAnnounced = data.winnerTeamId !== undefined && data.winnerTeamId !== null && data.winnerTeamId !== existing.winnerTeamId;
  const winnerJustCleared = data.winnerTeamId === null && existing.winnerTeamId !== null;

  // Setting a real winner locks status to "completed" (unless an explicit
  // status was also sent). Clearing a mistaken winner (winnerTeamId: null)
  // reopens the challenge back to "active" so scoring/submissions can
  // continue — again, unless the caller explicitly requested a status.
  let statusUpdate = data.status;
  if (data.winnerTeamId !== undefined) {
    if (data.winnerTeamId) statusUpdate = data.status ?? "completed";
    else if (data.status === undefined) statusUpdate = "active";
  }

  await prisma.challenge.update({
    where: { id },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(statusUpdate !== undefined ? { status: statusUpdate } : {}),
      ...(data.deadline !== undefined ? { deadline: data.deadline ? new Date(data.deadline) : null } : {}),
      ...(data.winnerTeamId !== undefined ? { winnerTeamId: data.winnerTeamId } : {}),
    },
  });

  if (data.teams) {
    for (const t of data.teams) {
      await prisma.challengeTeam.update({
        where: { id: t.id },
        data: {
          ...(t.name !== undefined ? { name: t.name } : {}),
          ...(t.color !== undefined ? { color: t.color } : {}),
          ...(t.mission !== undefined ? { mission: t.mission } : {}),
          ...(t.leadId !== undefined ? { leadId: t.leadId } : {}),
          ...(t.memberIds !== undefined ? { memberIds: t.memberIds } : {}),
        },
      });
    }
  }

  if (winnerJustAnnounced) {
    const winnerTeam = await prisma.challengeTeam.findUnique({ where: { id: data.winnerTeamId as string } });
    const allTeams = await prisma.challengeTeam.findMany({ where: { challengeId: id } });
    const allIds = Array.from(new Set(allTeams.flatMap(t => [...t.memberIds, ...(t.leadId ? [t.leadId] : [])])));
    await Promise.all(
      allIds.map(userId =>
        createNotification({
          userId,
          type: "SYSTEM",
          title: `Winner announced: ${existing.title}`,
          body: winnerTeam ? `${winnerTeam.name} won "${existing.title}"! Check the Intern Hub for final scores.` : `Results are in for "${existing.title}".`,
          link: "/internship",
        }).catch(() => {}),
      ),
    );
  }

  if (winnerJustCleared) {
    const allTeams = await prisma.challengeTeam.findMany({ where: { challengeId: id } });
    const allIds = Array.from(new Set(allTeams.flatMap(t => [...t.memberIds, ...(t.leadId ? [t.leadId] : [])])));
    await Promise.all(
      allIds.map(userId =>
        createNotification({
          userId,
          type: "SYSTEM",
          title: `Result retracted: ${existing.title}`,
          body: `The winner announcement for "${existing.title}" was undone — the challenge is active again.`,
          link: "/internship",
        }).catch(() => {}),
      ),
    );
  }

  const updated = await prisma.challenge.findUnique({ where: { id }, include: challengeInclude });
  return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isMentorUser(session.id, session.role))) {
    return NextResponse.json({ error: "Only mentors can delete challenges" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.challenge.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.challenge.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
