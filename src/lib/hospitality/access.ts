import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import { isHospitalityOrgType } from "./scope";

/**
 * API guard for the hospitality module.
 *
 * Access is decided by organisation, not by the core RBAC catalogue: every
 * member of a hotel org can use the hotel workspace, and nobody outside one can
 * (the system admin included — they provision hotels from the admin console,
 * they do not operate them). Managers additionally configure the property,
 * stock and team.
 */

const HOTEL_MANAGER_ROLES = new Set<string>(["CEO", "COO", "OPS_MANAGER", "BUSINESS_MANAGER"]);

export function isHotelManager(user: Pick<SessionUser, "role" | "orgRole">): boolean {
  return user.orgRole === "OWNER" || user.orgRole === "ADMIN" || HOTEL_MANAGER_ROLES.has(user.role);
}

type Guarded = { user: SessionUser & { organizationId: string } } | { error: NextResponse };

export async function requireHospitalityApi(level: "view" | "manage" = "view"): Promise<Guarded> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!isHospitalityOrgType(user.orgType) || !user.organizationId) {
    return { error: NextResponse.json({ error: "Hospitality workspace only" }, { status: 403 }) };
  }
  if (level === "manage" && !isHotelManager(user)) {
    return { error: NextResponse.json({ error: "Managers only" }, { status: 403 }) };
  }
  return { user: { ...user, organizationId: user.organizationId } };
}

export type HotelContext = {
  user: SessionUser & { organizationId: string };
  property: { id: string; name: string; currency: string; timezone: string; totalRooms: number };
};

/**
 * Guard + the org's property. Pilot hotels have exactly one; for a chain the
 * oldest property is the default until a property switcher exists.
 */
export async function requireHotelContext(
  level: "view" | "manage" = "view",
): Promise<HotelContext | { error: NextResponse }> {
  const auth = await requireHospitalityApi(level);
  if ("error" in auth) return auth;

  const property = await prisma.hotelProperty.findFirst({
    where: { organizationId: auth.user.organizationId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, currency: true, timezone: true, totalRooms: true },
  });
  if (!property) {
    return { error: NextResponse.json({ error: "No property is set up for this organisation." }, { status: 404 }) };
  }
  return { user: auth.user, property };
}
