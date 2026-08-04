import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac/can";
import { logAudit } from "@/lib/audit";

// ─── Team membership (user-facing) ────────────────────────────────────────────
// Self-service join/leave for the /teams page. Managing *other* people's
// membership stays behind `org.manage`, same as the /org admin console — this
// route just avoids forcing an admin round-trip for someone joining a team they
// can already see.
//
// Distinct from /api/organizations/teams/[id]/members, which is the admin
// console's endpoint and requires `org.manage` for every operation including
// reads. Both write the same TeamMember rows.

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  action: z.enum(["join", "leave", "add", "remove", "set-lead"]),
  /** Target user. Omitted (or equal to the caller) means "me". */
  userId: z.string().optional(),
  isLead: z.boolean().optional(),
});

export async function POST(request: Request, { params }: Params) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  const team = await prisma.team.findFirst({
    where: {
      ...(currentUser.organizationId ? { organizationId: currentUser.organizationId } : {}),
      OR: [{ id }, { slug: id }],
    },
    select: { id: true, name: true, organizationId: true },
  });
  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const targetUserId = body.userId ?? currentUser.id;
  const isSelf = targetUserId === currentUser.id;

  // Acting on someone else — or changing a lead — is an org-management action.
  if (!isSelf || body.action === "set-lead") {
    if (!(await can(currentUser.id, "org.manage"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // A team can only contain users from its own organisation. Without this an
  // org.manage holder could add a user from another tenant by guessing an id.
  if (!isSelf) {
    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { organizationId: true },
    });
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (target.organizationId !== team.organizationId) {
      return NextResponse.json({ error: "User is not in this organisation" }, { status: 403 });
    }
  }

  const adding = body.action === "join" || body.action === "add";
  const removing = body.action === "leave" || body.action === "remove";

  if (adding) {
    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: team.id, userId: targetUserId } },
      create: { teamId: team.id, userId: targetUserId, isLead: body.isLead ?? false },
      // Do not reset isLead on a repeat join — an existing lead who re-joins
      // should not be silently demoted.
      update: {},
    });
  } else if (removing) {
    await prisma.teamMember.deleteMany({ where: { teamId: team.id, userId: targetUserId } });
  } else {
    // set-lead
    const existing = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: team.id, userId: targetUserId } },
      select: { teamId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "User is not a member of this team" }, { status: 400 });
    }
    await prisma.teamMember.update({
      where: { teamId_userId: { teamId: team.id, userId: targetUserId } },
      data: { isLead: body.isLead ?? true },
    });
  }

  await logAudit({
    actorId: currentUser.id,
    action: removing ? "ORG_TEAM_MEMBER_REMOVED" : "ORG_TEAM_MEMBER_ADDED",
    targetType: "Team",
    targetId: team.id,
    metadata: {
      team: team.name,
      userId: targetUserId,
      via: body.action,
      self: isSelf,
    },
  });

  const memberCount = await prisma.teamMember.count({ where: { teamId: team.id } });
  return NextResponse.json({ ok: true, teamId: team.id, memberCount });
}
