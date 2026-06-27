import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { readEmployeeId } from "@/lib/employee-id";
import type { Prisma } from "@/generated/prisma/client";

// Fields the user is allowed to edit about themselves. Employee number and dates
// are HR-managed and intentionally NOT self-editable.
const SELF_FIELDS = ["phone", "emergencyContactName", "emergencyContactPhone"] as const;
const READ_FIELDS = ["startDate", "endDate", "phone", "emergencyContactName", "emergencyContactPhone"] as const;

function readHr(preferences: unknown): Record<string, string> {
  if (!preferences || typeof preferences !== "object") return {};
  const hr = (preferences as Record<string, unknown>).hr;
  if (!hr || typeof hr !== "object") return {};
  const out: Record<string, string> = {};
  for (const f of READ_FIELDS) {
    const v = (hr as Record<string, unknown>)[f];
    if (typeof v === "string") out[f] = v;
  }
  return out;
}

export async function GET() {
  const session = await getCurrentUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const me = await prisma.user.findUnique({ where: { id: session.id }, select: { role: true, preferences: true } });
  return NextResponse.json({
    employeeId: readEmployeeId(me?.preferences),
    role: me?.role ?? session.role,
    hr: readHr(me?.preferences),
  });
}

export async function PATCH(request: Request) {
  const session = await getCurrentUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as Record<string, unknown>;
  const me = await prisma.user.findUnique({ where: { id: session.id }, select: { preferences: true } });
  const prefs = (me?.preferences as Record<string, unknown> | null) ?? {};
  const hr: Record<string, unknown> = { ...((prefs.hr as Record<string, unknown> | undefined) ?? {}) };

  for (const f of SELF_FIELDS) {
    if (f in body) hr[f] = typeof body[f] === "string" ? body[f] : "";
  }

  await prisma.user.update({
    where: { id: session.id },
    data: { preferences: { ...prefs, hr } as Prisma.InputJsonValue },
  });
  return NextResponse.json({ ok: true, hr: readHr({ hr }) });
}
