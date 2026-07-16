import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/rbac/can";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

async function loadOwned(id: string, orgId: string | null | undefined) {
  const team = await prisma.team.findUnique({ where: { id } });
  if (!team) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (orgId && team.organizationId !== orgId) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { team };
}

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  departmentId: z.string().nullable().optional(),
  managerId: z.string().nullable().optional(),
  icon: z.string().max(40).nullable().optional(),
  color: z.string().max(20).nullable().optional(),
});

// PATCH /api/organizations/teams/[id]
export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireApiPermission("org.manage");
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const { id } = await params;

  const owned = await loadOwned(id, user.organizationId);
  if ("error" in owned) return owned.error;

  try {
    const data = patchSchema.parse(await request.json());
    const updated = await prisma.team.update({ where: { id }, data });
    await logAudit({
      actorId: user.id, action: "ORG_TEAM_UPDATED",
      targetType: "Team", targetId: id, metadata: { changes: data },
    });
    return NextResponse.json({ id: updated.id, name: updated.name });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }
    console.error("[org/teams/[id] PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/organizations/teams/[id]
export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireApiPermission("org.manage");
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const { id } = await params;

  const owned = await loadOwned(id, user.organizationId);
  if ("error" in owned) return owned.error;

  await prisma.team.delete({ where: { id } }); // cascades TeamMember
  await logAudit({
    actorId: user.id, action: "ORG_TEAM_DELETED",
    targetType: "Team", targetId: id, metadata: { name: owned.team.name },
  });
  return NextResponse.json({ ok: true });
}
