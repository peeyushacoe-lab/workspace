import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { requireHospitalityApi, isHotelManager } from "@/lib/hospitality/access";
import { HOTEL_DEPARTMENTS, cleanText } from "@/lib/hospitality/catalog";

const DEPT_KEYS = new Set<string>(HOTEL_DEPARTMENTS.map((d) => d.key));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /api/hospitality/team — everyone in the hotel organisation.
export async function GET() {
  const auth = await requireHospitalityApi();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const [members, org] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: user.organizationId },
      orderBy: [{ isActive: "desc" }, { fullName: "asc" }],
      select: {
        id: true, fullName: true, email: true, jobTitle: true, department: true,
        phone: true, role: true, orgRole: true, isActive: true, createdAt: true,
      },
    }),
    prisma.organization.findUnique({ where: { id: user.organizationId }, select: { maxUsers: true } }),
  ]);

  return NextResponse.json({
    meId: user.id,
    isManager: isHotelManager(user),
    maxUsers: org?.maxUsers ?? null,
    members: members.map(({ role, orgRole, ...m }) => ({
      ...m,
      isOwner: orgRole === "OWNER",
      access: isHotelManager({ role, orgRole }) ? "manager" : "staff",
    })),
  });
}

// POST /api/hospitality/team — a hotel manager adds a colleague.
// Managers get OPS_MANAGER + org ADMIN (they can run the property and the team);
// everyone else gets OPERATIONS, the plain workspace role for mail and meetings.
export async function POST(req: NextRequest) {
  const auth = await requireHospitalityApi("manage");
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const fullName = cleanText(body?.fullName, 120);
  const email = cleanText(body?.email, 200)?.toLowerCase() ?? null;
  const password = typeof body?.password === "string" ? body.password : "";

  if (!body || !fullName || !email) {
    return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const department = typeof body.department === "string" && DEPT_KEYS.has(body.department) ? body.department : null;
  const access = body.access === "manager" ? "manager" : "staff";

  const [org, activeCount, existing] = await Promise.all([
    prisma.organization.findUnique({ where: { id: user.organizationId }, select: { name: true, maxUsers: true } }),
    prisma.user.count({ where: { organizationId: user.organizationId, isActive: true } }),
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
  ]);
  if (!org) return NextResponse.json({ error: "Organisation not found." }, { status: 404 });
  if (existing) return NextResponse.json({ error: "That email already has an account." }, { status: 409 });
  if (activeCount >= org.maxUsers) {
    return NextResponse.json(
      { error: `Your plan allows ${org.maxUsers} active users. Deactivate someone or contact business@cybersage.uk.` },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const created = await prisma.$transaction(async (tx) => {
      const member = await tx.user.create({
        data: {
          email,
          fullName,
          passwordHash,
          role: access === "manager" ? "OPS_MANAGER" : "OPERATIONS",
          orgRole: access === "manager" ? "ADMIN" : "MEMBER",
          organizationId: user.organizationId,
          company: org.name,
          department,
          jobTitle: cleanText(body.jobTitle, 120),
          phone: cleanText(body.phone, 40),
          invitedBy: user.id,
        },
        select: { id: true, fullName: true, email: true },
      });
      await tx.mailbox.create({
        data: {
          email,
          displayName: fullName,
          organizationId: user.organizationId,
          accessLogs: { create: { userId: member.id, role: "OWNER" } },
        },
      });
      return member;
    });
    return NextResponse.json({ member: created }, { status: 201 });
  } catch (err) {
    if (typeof err === "object" && err && "code" in err && (err as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "That email is already in use." }, { status: 409 });
    }
    throw err;
  }
}
