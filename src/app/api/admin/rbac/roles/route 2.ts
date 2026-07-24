import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/rbac/can";
import { isPermissionKey } from "@/lib/rbac/catalog";
import { slugify } from "@/lib/rbac/util";
import { logAudit } from "@/lib/audit";

// GET /api/admin/rbac/roles — system roles + this org's custom roles, with their
// permission keys and holder counts.
export async function GET() {
  const auth = await requireApiPermission("rbac.manage");
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const roles = await prisma.role.findMany({
    where: {
      OR: [
        { isSystem: true },
        ...(user.organizationId ? [{ organizationId: user.organizationId }] : []),
      ],
    },
    include: {
      permissions: { select: { permission: { select: { key: true } } } },
      _count: { select: { assignments: true } },
    },
    orderBy: [{ isSystem: "desc" }, { rank: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(
    roles.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      color: r.color,
      isSystem: r.isSystem,
      isSingleton: r.isSingleton,
      rank: r.rank,
      holders: r._count.assignments,
      permissions: r.permissions.map((p) => p.permission.key),
    })),
  );
}

const createSchema = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(200).optional(),
  color: z.string().max(20).optional(),
  permissions: z.array(z.string()).optional(),
});

// POST /api/admin/rbac/roles — create an org-scoped custom role.
export async function POST(request: Request) {
  const auth = await requireApiPermission("rbac.manage");
  if ("error" in auth) return auth.error;
  const { user } = auth;

  if (!user.organizationId) {
    return NextResponse.json(
      { error: "Custom roles require an organization. Create/join an org first." },
      { status: 400 },
    );
  }

  let data: z.infer<typeof createSchema>;
  try {
    data = createSchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data", details: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const permKeys = (data.permissions ?? []).filter(isPermissionKey);
  const key = slugify(data.name);
  if (!key) return NextResponse.json({ error: "Name must contain letters or numbers" }, { status: 400 });

  try {
    const role = await prisma.role.create({
      data: {
        organizationId: user.organizationId,
        key,
        name: data.name,
        description: data.description ?? null,
        color: data.color ?? null,
        isSystem: false,
      },
    });

    if (permKeys.length) {
      const defs = await prisma.permissionDef.findMany({
        where: { key: { in: permKeys } },
        select: { id: true },
      });
      await prisma.rolePermission.createMany({
        data: defs.map((d) => ({ roleId: role.id, permissionId: d.id })),
        skipDuplicates: true,
      });
    }

    await logAudit({
      actorId: user.id,
      action: "RBAC_ROLE_CREATED",
      targetType: "Role",
      targetId: role.id,
      metadata: { name: role.name, permissions: permKeys },
    });

    return NextResponse.json({ id: role.id, key: role.key, name: role.name }, { status: 201 });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "A role with this name already exists" }, { status: 409 });
    }
    console.error("[rbac/roles POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
