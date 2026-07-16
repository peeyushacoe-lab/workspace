import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/rbac/can";
import { slugify } from "@/lib/rbac/util";
import { logAudit } from "@/lib/audit";

function orgOr400(orgId: string | null | undefined) {
  if (!orgId) {
    return NextResponse.json(
      { error: "No organization on this account. Create/join an org first." },
      { status: 400 },
    );
  }
  return null;
}

// GET /api/organizations/departments — departments in the org, with team counts.
export async function GET() {
  const auth = await requireApiPermission("org.manage");
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const bad = orgOr400(user.organizationId);
  if (bad) return bad;

  const departments = await prisma.department.findMany({
    where: { organizationId: user.organizationId! },
    include: { _count: { select: { teams: true } } },
    orderBy: { name: "asc" },
  });

  // Resolve manager display names in one query.
  const managerIds = departments.map((d) => d.managerId).filter((x): x is string => Boolean(x));
  const managers = managerIds.length
    ? await prisma.user.findMany({ where: { id: { in: managerIds } }, select: { id: true, fullName: true } })
    : [];
  const managerName = new Map(managers.map((m) => [m.id, m.fullName]));

  return NextResponse.json(
    departments.map((d) => ({
      id: d.id, name: d.name, slug: d.slug, parentId: d.parentId,
      managerId: d.managerId, managerName: d.managerId ? managerName.get(d.managerId) ?? null : null,
      teamCount: d._count.teams,
    })),
  );
}

const createSchema = z.object({
  name: z.string().min(1).max(80),
  parentId: z.string().nullable().optional(),
  managerId: z.string().nullable().optional(),
});

// POST /api/organizations/departments — create a department.
export async function POST(request: Request) {
  const auth = await requireApiPermission("org.manage");
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const bad = orgOr400(user.organizationId);
  if (bad) return bad;

  let data: z.infer<typeof createSchema>;
  try {
    data = createSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  const slug = slugify(data.name);
  if (!slug) return NextResponse.json({ error: "Name must contain letters or numbers" }, { status: 400 });

  try {
    const dept = await prisma.department.create({
      data: {
        organizationId: user.organizationId!,
        name: data.name,
        slug,
        parentId: data.parentId ?? null,
        managerId: data.managerId ?? null,
      },
    });
    await logAudit({
      actorId: user.id, action: "ORG_DEPARTMENT_CREATED",
      targetType: "Department", targetId: dept.id, metadata: { name: dept.name },
    });
    return NextResponse.json({ id: dept.id, name: dept.name, slug: dept.slug }, { status: 201 });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "A department with this name already exists" }, { status: 409 });
    }
    console.error("[org/departments POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
