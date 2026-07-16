import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/rbac/can";

// GET /api/organizations/analytics — headcount + structure snapshot for the org.
export async function GET() {
  const auth = await requireApiPermission("org.manage");
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const orgFilter = user.organizationId ? { organizationId: user.organizationId } : {};

  const [headcount, activeHeadcount, byRole, departments, teams] = await Promise.all([
    prisma.user.count({ where: orgFilter }),
    prisma.user.count({ where: { ...orgFilter, isActive: true } }),
    prisma.user.groupBy({ by: ["role"], where: orgFilter, _count: { _all: true } }),
    prisma.department.count({ where: orgFilter }),
    prisma.team.count({ where: orgFilter }),
  ]);

  return NextResponse.json({
    headcount,
    activeHeadcount,
    departments,
    teams,
    byRole: byRole
      .map((r) => ({ role: r.role, count: r._count._all }))
      .sort((a, b) => b.count - a.count),
  });
}
