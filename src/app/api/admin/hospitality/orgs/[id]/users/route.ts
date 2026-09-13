import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";

// ─── GET /api/admin/hospitality/orgs/[id]/users ───────────────────────────────
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = getSessionUserFromCookieStore(await cookies());
  if (!me || me.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const users = await prisma.user.findMany({
    where: { organizationId: id },
    select: { id: true, email: true, fullName: true, role: true, isActive: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ users });
}

// ─── POST /api/admin/hospitality/orgs/[id]/users ──────────────────────────────
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = getSessionUserFromCookieStore(await cookies());
  if (!me || me.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: orgId } = await params;

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true, name: true } });
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  const body = await req.json();
  const { userName, userEmail, userPassword, role } = body as {
    userName: string; userEmail: string; userPassword: string; role?: string;
  };

  if (!userName?.trim() || !userEmail?.trim() || !userPassword) {
    return NextResponse.json({ error: "userName, userEmail, userPassword are required." }, { status: 400 });
  }

  const normalizedEmail = userEmail.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } });
  if (existing) return NextResponse.json({ error: "Email already in use." }, { status: 409 });

  const validRoles = ["OPS_MANAGER", "COO", "ADMIN", "CEO", "BUSINESS_MANAGER"] as const;
  const assignedRole = (validRoles as readonly string[]).includes(role ?? "") ? role : "OPS_MANAGER";

  const [passwordHash] = await Promise.all([bcrypt.hash(userPassword, 12)]);

  const newUser = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        email: normalizedEmail,
        fullName: userName.trim(),
        passwordHash,
        role: assignedRole as "OPS_MANAGER",
        orgRole: "MEMBER",
        organizationId: orgId,
        company: org.name,
      },
    });

    await tx.mailbox.create({
      data: {
        email: normalizedEmail,
        displayName: userName.trim(),
        organizationId: orgId,
        accessLogs: { create: { userId: u.id, role: "OWNER" } },
      },
    });

    return u;
  });

  return NextResponse.json({
    user: { id: newUser.id, email: newUser.email, fullName: newUser.fullName, role: newUser.role },
  }, { status: 201 });
}
