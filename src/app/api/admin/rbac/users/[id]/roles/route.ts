import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/rbac/can";
import { bumpUserPermEpoch } from "@/lib/rbac/session-perms";
import { SYSTEM_ROLES } from "@/lib/rbac/system-roles";
import { logAudit } from "@/lib/audit";
import type { UserRole } from "@/generated/prisma/enums";

type Params = { params: Promise<{ id: string }> };

const KEY_TO_ENUM = new Map(SYSTEM_ROLES.map((r) => [r.key, r.enumValue]));

// GET /api/admin/rbac/users/[id]/roles — the user's assigned roles.
export async function GET(_request: Request, { params }: Params) {
  const auth = await requireApiPermission("rbac.manage");
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const assignments = await prisma.userRoleAssignment.findMany({
    where: { userId: id, scopeType: null },
    select: { roleId: true, role: { select: { name: true, key: true, isSystem: true } } },
  });

  return NextResponse.json(
    assignments.map((a) => ({
      roleId: a.roleId, name: a.role.name, key: a.role.key, isSystem: a.role.isSystem,
    })),
  );
}

const putSchema = z.object({ roleIds: z.array(z.string()) });

// PUT /api/admin/rbac/users/[id]/roles — set the user's org-wide role assignments.
export async function PUT(request: Request, { params }: Params) {
  const auth = await requireApiPermission("rbac.manage");
  if ("error" in auth) return auth.error;
  const { user: actor } = auth;
  const { id } = await params;

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  let roleIds: string[];
  try {
    roleIds = putSchema.parse(await request.json()).roleIds;
  } catch {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  // Validate the requested roles exist and are assignable (system or actor's org).
  const roles = await prisma.role.findMany({
    where: {
      id: { in: roleIds },
      OR: [
        { isSystem: true },
        ...(actor.organizationId ? [{ organizationId: actor.organizationId }] : []),
      ],
    },
    select: { id: true, key: true, isSystem: true, rank: true },
  });
  const validIds = new Set(roles.map((r) => r.id));
  const finalIds = roleIds.filter((rid) => validIds.has(rid));

  // Reconcile org-wide assignments (scopeType null) to exactly finalIds.
  const current = await prisma.userRoleAssignment.findMany({
    where: { userId: id, scopeType: null },
    select: { id: true, roleId: true },
  });
  const currentRoleIds = new Set(current.map((c) => c.roleId));

  const toAdd = finalIds.filter((rid) => !currentRoleIds.has(rid));
  const toRemove = current.filter((c) => !finalIds.includes(c.roleId)).map((c) => c.id);

  if (toAdd.length) {
    await prisma.userRoleAssignment.createMany({
      data: toAdd.map((roleId) => ({ userId: id, roleId })),
      skipDuplicates: true,
    });
  }
  if (toRemove.length) {
    await prisma.userRoleAssignment.deleteMany({ where: { id: { in: toRemove } } });
  }

  // Keep User.role (the enum used for display + fast checks) in sync: the most
  // privileged assigned SYSTEM role, else MEMBER (access comes from custom roles).
  const systemAssigned = roles
    .filter((r) => r.isSystem && finalIds.includes(r.id))
    .sort((a, b) => a.rank - b.rank);
  const newEnum = (systemAssigned[0]?.key && KEY_TO_ENUM.get(systemAssigned[0].key)) || "MEMBER";
  await prisma.user.update({ where: { id }, data: { role: newEnum as UserRole } });

  await bumpUserPermEpoch(id);

  await logAudit({
    actorId: actor.id, action: "RBAC_USER_ROLES_SET",
    targetType: "User", targetId: id, metadata: { roleIds: finalIds, role: newEnum },
  });

  return NextResponse.json({ ok: true, roleIds: finalIds, role: newEnum });
}
