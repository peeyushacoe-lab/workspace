import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/rbac/can";
import { isPermissionKey } from "@/lib/rbac/catalog";
import { bumpRoleHoldersPermEpoch } from "@/lib/rbac/session-perms";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

const putSchema = z.object({ permissions: z.array(z.string()) });

// PUT /api/admin/rbac/roles/[id]/permissions — set a custom role's permission set.
// System roles are managed in code (seed-rbac) and cannot be edited here.
export async function PUT(request: Request, { params }: Params) {
  const auth = await requireApiPermission("rbac.manage");
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const { id } = await params;

  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });
  if (role.isSystem) {
    return NextResponse.json(
      { error: "System role permissions are managed in code" },
      { status: 400 },
    );
  }
  if (user.organizationId && role.organizationId !== user.organizationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let keys: string[];
  try {
    keys = putSchema.parse(await request.json()).permissions.filter(isPermissionKey);
  } catch {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  const defs = await prisma.permissionDef.findMany({
    where: { key: { in: keys } },
    select: { id: true },
  });
  const desired = new Set(defs.map((d) => d.id));

  const current = await prisma.rolePermission.findMany({
    where: { roleId: id },
    select: { permissionId: true },
  });
  const currentIds = new Set(current.map((c) => c.permissionId));

  const toAdd = [...desired].filter((pid) => !currentIds.has(pid));
  const toRemove = [...currentIds].filter((pid) => !desired.has(pid));

  if (toAdd.length) {
    await prisma.rolePermission.createMany({
      data: toAdd.map((permissionId) => ({ roleId: id, permissionId })),
      skipDuplicates: true,
    });
  }
  if (toRemove.length) {
    await prisma.rolePermission.deleteMany({
      where: { roleId: id, permissionId: { in: toRemove } },
    });
  }

  // Everyone holding this role has new effective perms — invalidate their cookies.
  await bumpRoleHoldersPermEpoch(id);

  await logAudit({
    actorId: user.id, action: "RBAC_ROLE_PERMISSIONS_SET",
    targetType: "Role", targetId: id, metadata: { permissions: keys },
  });

  return NextResponse.json({ ok: true, permissions: keys });
}
