import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { requireHospitalityApi } from "@/lib/hospitality/access";
import { bumpUserPermEpoch } from "@/lib/rbac/session-perms";
import { HOTEL_DEPARTMENTS, cleanText } from "@/lib/hospitality/catalog";

type Params = { params: Promise<{ id: string }> };
const DEPT_KEYS = new Set<string>(HOTEL_DEPARTMENTS.map((d) => d.key));

// PATCH /api/hospitality/team/:id — managers edit a colleague:
// { department?, jobTitle?, phone?, access?: "manager"|"staff", isActive?, password? }
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireHospitalityApi("manage");
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const { id } = await params;

  const target = await prisma.user.findFirst({
    where: { id, organizationId: user.organizationId },
    select: { id: true, orgRole: true },
  });
  if (!target) return NextResponse.json({ error: "Team member not found." }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const isSelf = target.id === user.id;
  const touchesAccess = "access" in body || "isActive" in body;
  if (isSelf && touchesAccess) {
    return NextResponse.json({ error: "You can't change your own access or deactivate yourself." }, { status: 400 });
  }
  if (target.orgRole === "OWNER" && user.orgRole !== "OWNER" && (touchesAccess || "password" in body)) {
    return NextResponse.json({ error: "Only the account owner can change the owner's access." }, { status: 403 });
  }

  const data: Record<string, unknown> = {};
  let revokeSession = false;

  if ("department" in body) {
    data.department = typeof body.department === "string" && DEPT_KEYS.has(body.department) ? body.department : null;
  }
  if ("jobTitle" in body) data.jobTitle = cleanText(body.jobTitle, 120);
  if ("phone" in body) data.phone = cleanText(body.phone, 40);

  if (body.access === "manager" || body.access === "staff") {
    data.role = body.access === "manager" ? "OPS_MANAGER" : "OPERATIONS";
    // The owner stays the owner whatever their day-to-day access.
    if (target.orgRole !== "OWNER") data.orgRole = body.access === "manager" ? "ADMIN" : "MEMBER";
    revokeSession = true;
  }
  if (typeof body.isActive === "boolean") {
    data.isActive = body.isActive;
    revokeSession = true;
  }
  if ("password" in body) {
    if (typeof body.password !== "string" || body.password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }
    data.passwordHash = await bcrypt.hash(body.password, 12);
    revokeSession = true;
  }

  await prisma.user.update({ where: { id: target.id }, data });
  // Re-issues (or, for a deactivated user, ends) their session on next load.
  if (revokeSession) await bumpUserPermEpoch(target.id);

  return NextResponse.json({ ok: true });
}
