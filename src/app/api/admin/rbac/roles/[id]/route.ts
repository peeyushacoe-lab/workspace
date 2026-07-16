import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/rbac/can";
import { bumpRoleHoldersPermEpoch } from "@/lib/rbac/session-perms";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  description: z.string().max(200).nullable().optional(),
  color: z.string().max(20).nullable().optional(),
});

// PATCH /api/admin/rbac/roles/[id] — rename / recolour a custom role.
export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireApiPermission("rbac.manage");
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const { id } = await params;

  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });
  if (role.isSystem) {
    return NextResponse.json({ error: "System roles cannot be edited" }, { status: 400 });
  }
  if (user.organizationId && role.organizationId !== user.organizationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const data = patchSchema.parse(await request.json());
    const updated = await prisma.role.update({ where: { id }, data });
    await logAudit({
      actorId: user.id, action: "RBAC_ROLE_UPDATED",
      targetType: "Role", targetId: id, metadata: { changes: data },
    });
    return NextResponse.json({ id: updated.id, name: updated.name });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data", details: err.issues }, { status: 400 });
    }
    console.error("[rbac/roles/[id] PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/admin/rbac/roles/[id] — delete a custom role (holders lose it).
export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireApiPermission("rbac.manage");
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const { id } = await params;

  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });
  if (role.isSystem) {
    return NextResponse.json({ error: "System roles cannot be deleted" }, { status: 400 });
  }
  if (user.organizationId && role.organizationId !== user.organizationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Invalidate holders' cookies BEFORE the cascade removes their assignments.
  await bumpRoleHoldersPermEpoch(id);
  await prisma.role.delete({ where: { id } }); // cascades RolePermission + UserRoleAssignment

  await logAudit({
    actorId: user.id, action: "RBAC_ROLE_DELETED",
    targetType: "Role", targetId: id, metadata: { name: role.name },
  });
  return NextResponse.json({ ok: true });
}
