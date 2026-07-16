import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/rbac/can";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

async function loadOwned(id: string, orgId: string | null | undefined) {
  const dept = await prisma.department.findUnique({ where: { id } });
  if (!dept) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (orgId && dept.organizationId !== orgId) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { dept };
}

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  managerId: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
});

// PATCH /api/organizations/departments/[id]
export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireApiPermission("org.manage");
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const { id } = await params;

  const owned = await loadOwned(id, user.organizationId);
  if ("error" in owned) return owned.error;

  try {
    const data = patchSchema.parse(await request.json());
    if (data.parentId === id) {
      return NextResponse.json({ error: "A department cannot be its own parent" }, { status: 400 });
    }
    const updated = await prisma.department.update({ where: { id }, data });
    await logAudit({
      actorId: user.id, action: "ORG_DEPARTMENT_UPDATED",
      targetType: "Department", targetId: id, metadata: { changes: data },
    });
    return NextResponse.json({ id: updated.id, name: updated.name });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }
    console.error("[org/departments/[id] PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/organizations/departments/[id] — teams are detached (SetNull), not deleted.
export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireApiPermission("org.manage");
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const { id } = await params;

  const owned = await loadOwned(id, user.organizationId);
  if ("error" in owned) return owned.error;

  await prisma.department.delete({ where: { id } });
  await logAudit({
    actorId: user.id, action: "ORG_DEPARTMENT_DELETED",
    targetType: "Department", targetId: id, metadata: { name: owned.dept.name },
  });
  return NextResponse.json({ ok: true });
}
