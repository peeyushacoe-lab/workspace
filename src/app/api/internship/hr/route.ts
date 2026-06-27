import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { generateEmployeeId, readEmployeeId } from "@/lib/employee-id";
import type { Prisma } from "@/generated/prisma/client";

const SYSTEM_MENTOR_ROLES = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"];

/** HR fields stored under preferences.hr (alongside employeeId). */
const HR_FIELDS = ["startDate", "endDate", "phone", "emergencyContactName", "emergencyContactPhone"] as const;
type HrField = (typeof HR_FIELDS)[number];

async function requireMentor() {
  const session = await getCurrentUser();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const me = await prisma.user.findUnique({ where: { id: session.id }, select: { role: true, preferences: true } });
  const prefs = (me?.preferences as Record<string, unknown> | null) ?? {};
  const grantedRoles: string[] = Array.isArray(prefs.grantedRoles) ? (prefs.grantedRoles as string[]) : [];
  const isMentor = !!me && (SYSTEM_MENTOR_ROLES.includes(me.role) || grantedRoles.includes("Mentor"));
  if (!isMentor) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
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

function whereForScope(scope: string | null) {
  if (scope === "staff") return { role: { not: "INTERNSHIP" as never } };
  if (scope === "all") return {};
  return { role: "INTERNSHIP" as never }; // default: interns
}

// GET /api/internship/hr?scope=interns|staff|all
export async function GET(request: Request) {
  const guard = await requireMentor();
  if (guard.error) return guard.error;

  const scope = new URL(request.url).searchParams.get("scope");
  const users = await prisma.user.findMany({
    where: whereForScope(scope),
    select: { id: true, fullName: true, email: true, role: true, avatarUrl: true, createdAt: true, preferences: true },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  const rows = users.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    role: u.role,
    avatarUrl: u.avatarUrl,
    createdAt: u.createdAt,
    employeeId: readEmployeeId(u.preferences),
    hr: readHr(u.preferences),
  }));

  return NextResponse.json(rows);
}

// PATCH /api/internship/hr  { userId, employeeId?, startDate?, endDate?, phone?, emergencyContactName?, emergencyContactPhone? }
export async function PATCH(request: Request) {
  const guard = await requireMentor();
  if (guard.error) return guard.error;

  const body = (await request.json()) as Record<string, unknown>;
  const userId = typeof body.userId === "string" ? body.userId : null;
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const prefs = (target.preferences as Record<string, unknown> | null) ?? {};
  const hr: Record<string, unknown> = { ...((prefs.hr as Record<string, unknown> | undefined) ?? {}) };

  // employeeId is editable by mentors
  if (typeof body.employeeId === "string") hr.employeeId = body.employeeId.trim();

  for (const f of HR_FIELDS) {
    if (f in body) {
      const v = body[f as HrField];
      hr[f] = typeof v === "string" ? v : "";
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { preferences: { ...prefs, hr } as Prisma.InputJsonValue },
  });
  return NextResponse.json({ ok: true, employeeId: readEmployeeId({ hr }), hr: readHr({ hr }) });
}

// POST /api/internship/hr  { action: "backfill", scope? } — assign IDs to anyone missing one
export async function POST(request: Request) {
  const guard = await requireMentor();
  if (guard.error) return guard.error;

  const body = (await request.json().catch(() => ({}))) as { action?: string; scope?: string };
  if (body.action !== "backfill") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const users = await prisma.user.findMany({
    where: whereForScope(body.scope ?? "all"),
    select: { id: true, role: true, preferences: true },
    orderBy: { createdAt: "asc" },
  });

  let assigned = 0;
  // Process sequentially so each generated ID accounts for the previous write.
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
