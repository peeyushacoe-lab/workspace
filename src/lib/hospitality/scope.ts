/**
 * Hospitality workspace scoping — pure, edge-safe (no Prisma, no Node APIs), so
 * middleware, the login route and the shells all read the same rules.
 *
 * A hospitality organisation gets its own product: its own shell, its own home
 * and a closed set of routes. It never renders inside the core Nexus shell, and
 * core users never see the hospitality module.
 */

export const HOSPITALITY_HOME = "/hospitality";

/**
 * Everything a hospitality-org user may open. Anything else that middleware
 * protects (Home, Drive, AI, Internship, Admin, …) bounces to HOSPITALITY_HOME.
 */
export const HOSPITALITY_ALLOWED_PREFIXES = [
  "/hospitality",
  // Communication — the only core apps a hotel uses.
  "/inbox",
  "/compose",
  "/connect",
  "/meet",
  "/calendar",
  "/notifications",
  // Account plumbing.
  "/settings",
  "/profile",
  "/reset-password",
  "/mfa-challenge",
  "/setup-passkey",
];

export function isHospitalityOrgType(orgType: string | null | undefined): boolean {
  return orgType === "HOSPITALITY";
}

export function hospitalityCanAccess(pathname: string): boolean {
  return HOSPITALITY_ALLOWED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

/**
 * Resolve an organisation's product type.
 *
 * `settings.orgType` is authoritative when present. Organisations created before
 * that field existed carry no tag at all — for those, owning a HotelProperty is
 * what makes them a hotel. Without this fallback, the first pilot hotels were
 * treated as core orgs and their staff landed in the full Nexus workspace.
 */
export function resolveOrgType(settings: unknown, hotelPropertyCount: number): string | null {
  const tagged =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? (settings as Record<string, unknown>).orgType
      : undefined;
  if (typeof tagged === "string" && tagged) return tagged;
  if (hotelPropertyCount > 0) return "HOSPITALITY";
  return null;
}
