import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { sendRoleGrantEmail } from "@/lib/email";

const GRANTABLE_ACCESS = [
  "HR",
  "Finance",
  "Legal",
  "Marketing",
  "Security Operations",
  "Operations",
  "Executive",
  "IT",
  "R&D",
] as const;

type GrantableAccess = (typeof GRANTABLE_ACCESS)[number];

// GET — list all users with their currently granted roles (CISO + ADMIN)
export async function GET() {
  const actor = getSessionUserFromCookieStore(await cookies());
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["ADMIN", "CISO"].includes(actor.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      avatarUrl: true,
      preferences: true,
    },
    orderBy: { fullName: "asc" },
  });

  return NextResponse.json(
    users.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      role: u.role,
      avatarUrl: u.avatarUrl,
      grantedRoles: (u.preferences as Record<string, unknown> | null)?.grantedRoles ?? [],
    }))
  );
}

// POST — grant or revoke a role (CISO only)
export async function POST(request: Request) {
  const actor = getSessionUserFromCookieStore(await cookies());
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.role !== "CISO" && actor.role !== "ADMIN")
    return NextResponse.json({ error: "Only CISO or Admin can manage access roles" }, { status: 403 });

  const body = (await request.json()) as { userId: string; role: string; action: "grant" | "revoke" };
  if (!body.userId || !body.role || !["grant", "revoke"].includes(body.action)) {
    return NextResponse.json({ error: "userId, role, and action are required" }, { status: 400 });
  }

  if (!GRANTABLE_ACCESS.includes(body.role as GrantableAccess)) {
    return NextResponse.json({ error: "Invalid access role" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: body.userId },
    select: { id: true, fullName: true, email: true, preferences: true },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const prefs = (target.preferences as Record<string, unknown> | null) ?? {};
  const currentRoles: string[] = Array.isArray(prefs.grantedRoles) ? (prefs.grantedRoles as string[]) : [];

  let updatedRoles: string[];
  if (body.action === "grant") {
    updatedRoles = currentRoles.includes(body.role) ? currentRoles : [...currentRoles, body.role];
  } else {
    updatedRoles = currentRoles.filter((r) => r !== body.role);
  }

  await prisma.user.update({
    where: { id: body.userId },
    data: { preferences: { ...prefs, grantedRoles: updatedRoles } },
  });

  await logAudit({
    actorId: actor.id,
    action: body.action === "grant" ? "RBAC_GRANT" : "RBAC_REVOKE",
    targetType: "User",
    targetId: body.userId,
    metadata: { role: body.role, grantedBy: actor.fullName },
  });

  // Send email notification only on grant
  if (body.action === "grant") {
    sendRoleGrantEmail({
      toEmail: target.email,
      fullName: target.fullName,
      accessRole: body.role,
      grantedByName: actor.fullName,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, grantedRoles: updatedRoles });
}
