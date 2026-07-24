import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/rbac/can";
import { slugify } from "@/lib/rbac/util";
import { logAudit } from "@/lib/audit";

// GET /api/organizations/teams — teams in the org, with member counts + department.
export async function GET() {
  const auth = await requireApiPermission("org.manage");
  if ("error" in auth) return auth.error;
  const { user } = auth;
  if (!user.organizationId) {
    return NextResponse.json({ error: "No organization on this account." }, { status: 400 });
  }

  const teams = await prisma.team.findMany({
    where: { organizationId: user.organizationId },
    include: {
      _count: { select: { members: true } },
      department: { select: { id: true, name: true } },
    },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });

  return NextResponse.json(
    teams.map((t) => ({
      id: t.id, name: t.name, slug: t.slug, icon: t.icon, color: t.color,
      isSystem: t.isSystem, managerId: t.managerId,
      department: t.department, memberCount: t._count.members,
    })),
  );
}

const createSchema = z.object({
  name: z.string().min(1).max(80),
  departmentId: z.string().nullable().optional(),
  managerId: z.string().nullable().optional(),
  icon: z.string().max(40).nullable().optional(),
  color: z.string().max(20).nullable().optional(),
});

// POST /api/organizations/teams — create a team.
export async function POST(request: Request) {
  const auth = await requireApiPermission("org.manage");
  if ("error" in auth) return auth.error;
  const { user } = auth;
  if (!user.organizationId) {
    return NextResponse.json({ error: "No organization on this account." }, { status: 400 });
  }

  let data: z.infer<typeof createSchema>;
  try {
    data = createSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  const slug = slugify(data.name);
  if (!slug) return NextResponse.json({ error: "Name must contain letters or numbers" }, { status: 400 });

  try {
    const team = await prisma.team.create({
      data: {
        organizationId: user.organizationId,
        name: data.name,
        slug,
        departmentId: data.departmentId ?? null,
        managerId: data.managerId ?? null,
        icon: data.icon ?? null,
        color: data.color ?? null,
        isSystem: false,
      },
    });
    await logAudit({
      actorId: user.id, action: "ORG_TEAM_CREATED",
      targetType: "Team", targetId: team.id, metadata: { name: team.name },
    });
    return NextResponse.json({ id: team.id, name: team.name, slug: team.slug }, { status: 201 });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "A team with this name already exists" }, { status: 409 });
    }
    console.error("[org/teams POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
