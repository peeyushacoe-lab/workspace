import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { generateEmployeeId, readEmployeeId } from "@/lib/employee-id";
import type { Prisma } from "@/generated/prisma/client";

// HR fields stored under preferences.hr (jobTitle/department are real columns).
const HR_FIELDS = [
  "startDate", "endDate", "phone", "emergencyContactName", "emergencyContactPhone",
  "reportingManager", "employmentType", "employmentStatus",
] as const;

// Staff = everyone except interns (interns are managed in Mentor → HR).
const STAFF_WHERE = { role: { not: "INTERNSHIP" as never } };

async function requireAdmin() {
  const session = await getCurrentUser();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (session.role !== "ADMIN") return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { session };
}

function readHr(preferences: unknown): Record<string, string> {
  if (!preferences || typeof preferences !== "object") return {};
  const hr = (preferences as Record<string, unknown>).hr;
  if (!hr || typeof hr !== "object") return {};
  const out: Record<string, string> = {};
  for (const f of HR_FIELDS) {
    const v = (hr as Record<string, unknown>)[f];
    if (typeof v === "string") out[f] = v;
  }
  return out;
}

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const users = await prisma.user.findMany({
    where: STAFF_WHERE,
    select: { id: true, fullName: true, email: true, role: true, avatarUrl: true, jobTitle: true, department: true, createdAt: true, preferences: true },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  const rows = users.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    role: u.role,
    avatarUrl: u.avatarUrl,
    jobTitle: u.jobTitle ?? "",
    department: u.department ?? "",
    employeeId: readEmployeeId(u.preferences),
    hr: readHr(u.preferences),
  }));

  return NextResponse.json(rows);
}

export async function PATCH(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const body = (await request.json()) as Record<string, unknown>;
  const userId = typeof body.userId === "string" ? body.userId : null;
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, preferences: true } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (target.role === "INTERNSHIP") return NextResponse.json({ error: "Interns are managed in Mentor → HR" }, { status: 400 });

  const prefs = (target.preferences as Record<string, unknown> | null) ?? {};
  const hr: Record<string, unknown> = { ...((prefs.hr as Record<string, unknown> | undefined) ?? {}) };

  if (typeof body.employeeId === "string") hr.employeeId = body.employeeId.trim();
  for (const f of HR_FIELDS) {
    if (f in body) hr[f] = typeof body[f] === "string" ? body[f] : "";
  }

  const data: Prisma.UserUpdateInput = { preferences: { ...prefs, hr } as Prisma.InputJsonValue };
  if (typeof body.jobTitle === "string") data.jobTitle = body.jobTitle;
  if (typeof body.department === "string") data.department = body.department;

  await prisma.user.update({ where: { id: userId }, data });
  return NextResponse.json({ ok: true, employeeId: readEmployeeId({ hr }), hr: readHr({ hr }) });
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const body = (await request.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "backfill") return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  const users = await prisma.user.findMany({
    where: STAFF_WHERE,
    select: { id: true, role: true, preferences: true },
    orderBy: { createdAt: "asc" },
  });

  let assigned = 0;
  for (const u of users) {
    if (readEmployeeId(u.preferences)) continue;
    const employeeId = await generateEmployeeId(u.role).catch(() => null);
    if (!employeeId) continue;
    const prefs = (u.preferences as Record<string, unknown> | null) ?? {};
    const hr = { ...((prefs.hr as Record<string, unknown> | undefined) ?? {}), employeeId };
    await prisma.user.update({
      where: { id: u.id },
      data: { preferences: { ...prefs, hr } as Prisma.InputJsonValue },
    });
    assigned++;
  }

  return NextResponse.json({ ok: true, assigned });
}
