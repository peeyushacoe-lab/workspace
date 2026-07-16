import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/rbac/can";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

// GET /api/organizations/teams/[id]/members — list a team's members.
export async function GET(_request: Request, { params }: Params) {
  const auth = await requireApiPermission("org.manage");
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const { id } = await params;

  const team = await prisma.team.findUnique({ where: { id }, select: { organizationId: true } });
  if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.organizationId && team.organizationId !== user.organizationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const members = await prisma.teamMember.findMany({
    where: { teamId: id },
    select: {
      isLead: true,
      user: { select: { id: true, fullName: true, email: true, avatarUrl: true, role: true } },
    },
    orderBy: { user: { fullName: "asc" } },
  });

  return NextResponse.json(members.map((m) => ({ ...m.user, isLead: m.isLead })));
}

const postSchema = z.object({
  userId: z.string(),
  action: z.enum(["add", "remove"]),
  isLead: z.boolean().optional(),
});

// POST /api/organizations/teams/[id]/members — add / remove a member.
export async function POST(request: Request, { params }: Params) {
  const auth = await requireApiPermission("org.manage");
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const { id } = await params;

  const team = await prisma.team.findUnique({ where: { id }, select: { organizationId: true, name: true } });
  if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.organizationId && team.organizationId !== user.organizationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: z.infer<typeof postSchema>;
  try {
    body = postSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  if (body.action === "add") {
    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: id, userId: body.userId } },
      create: { teamId: id, userId: body.userId, isLead: body.isLead ?? false },
      update: { isLead: body.isLead ?? false },
    });
  } else {
    await prisma.teamMember.deleteMany({ where: { teamId: id, userId: body.userId } });
  }

  await logAudit({
    actorId: user.id,
    action: body.action === "add" ? "ORG_TEAM_MEMBER_ADDED" : "ORG_TEAM_MEMBER_REMOVED",
    targetType: "Team", targetId: id, metadata: { userId: body.userId, team: team.name },
  });

  return NextResponse.json({ ok: true });
}
