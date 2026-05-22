import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import type { UserRole } from "@/generated/prisma/enums";

const ALL_VALID_ROLES: UserRole[] = [
  "ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER",
  "DEVELOPER", "CYBER_SECURITY", "QA", "MARKETING",
  "RESEARCH", "FINANCE", "OPERATIONS", "SUPPORT", "INTERNSHIP",
];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = getSessionUserFromCookieStore(await cookies());
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = (await request.json()) as { role?: string; isActive?: boolean };

  const updateData: { role?: UserRole; isActive?: boolean } = {};
  const validRoles: UserRole[] = ALL_VALID_ROLES;

  if (body.role !== undefined) {
    if (!validRoles.includes(body.role as UserRole)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    updateData.role = body.role as UserRole;
  }

  if (body.isActive !== undefined) {
    updateData.isActive = body.isActive;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, isActive: true },
  });
  if (!existing) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (id === actor.id && updateData.isActive === false) {
    return NextResponse.json({ error: "Cannot deactivate your own account" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  await logAudit({
    actorId: actor.id,
    action: "ADMIN_USER_UPDATE",
    targetType: "USER",
    targetId: id,
    metadata: {
      changes: updateData,
      previousRole: existing.role,
      previousIsActive: existing.isActive,
    },
  });

  return NextResponse.json({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
  });
}
