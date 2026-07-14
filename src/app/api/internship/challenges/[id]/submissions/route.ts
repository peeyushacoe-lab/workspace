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

const submitSchema = z.object({
  teamId: z.string().min(1),
  notes: z.string().optional(),
  links: z.array(z.string()).default([]),
  files: z.array(z.object({ name: z.string(), url: z.string(), type: z.string().optional(), size: z.number().optional() })).optional(),
});

// Team members submit their report/links; mentors can also submit on a team's behalf.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentUser();
  if (!session || !HUB_ROLES.includes(session.role as typeof HUB_ROLES[number])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json();
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid submission data", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const team = await prisma.challengeTeam.findUnique({ where: { id: data.teamId } });
  if (!team || team.challengeId !== id) {
    return NextResponse.json({ error: "Team does not belong to this challenge" }, { status: 400 });
  }

  const mentor = await isMentorUser(session.id, session.role);
  const isMember = team.memberIds.includes(session.id) || team.leadId === session.id;
  if (!mentor && !isMember) {
    return NextResponse.json({ error: "Only members of this team can submit" }, { status: 403 });
  }

  const submission = await prisma.challengeSubmission.create({
    data: {
      challengeId: id,
      teamId: data.teamId,
      submitterId: session.id,
      notes: data.notes,
      links: data.links,
      files: data.files,
    },
    include: { submitter: { select: { id: true, fullName: true, avatarUrl: true } } },
  });

  return NextResponse.json(submission, { status: 201 });
}
