import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export async function GET() {
  const session = await getCurrentUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      avatarUrl: true,
      preferences: true,
    },
  });

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const prefs = (user.preferences as Record<string, unknown> | null) ?? {};
  const grantedRoles: string[] = Array.isArray(prefs.grantedRoles) ? (prefs.grantedRoles as string[]) : [];

  const SYSTEM_MENTOR_ROLES = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"];
  const isMentor = SYSTEM_MENTOR_ROLES.includes(user.role) || grantedRoles.includes("Mentor");

  return NextResponse.json({
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    avatarUrl: user.avatarUrl,
    grantedRoles,
    isMentor,
  });
}
