import type { UserRole } from "@/generated/prisma/enums";
import { verifyPayload } from "@/lib/session-crypto";

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  mustResetPassword?: boolean;
  mfaEnabled?: boolean;
  organizationId?: string | null;
  orgRole?: string | null;
};

export type PortalNavItem = {
  href: string;
  label: string;
  hint: string;
  roles: UserRole[];
};

export const roleLabels: Record<UserRole, string> = {
  ADMIN: "Admin",
  CEO: "CEO",
  CISO: "CISO",
  R_AND_D: "R&D Head",
  COO: "COO",
  OPS_MANAGER: "Operations Manager",
  DEVELOPER: "Developer",
  CYBER_SECURITY: "Cyber Security",
  QA: "QA Engineer",
  MARKETING: "Marketing",
  RESEARCH: "Research",
  FINANCE: "Finance",
  OPERATIONS: "Operations",
  SUPPORT: "Support",
  INTERNSHIP: "Internship",
};

// Leadership roles that can access management features
const MGMT_ROLES: UserRole[] = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"];

// All active roles shown in middleware validation (excludes legacy INTERNSHIP)
const ALL_ROLES: UserRole[] = [
  "ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER",
  "DEVELOPER", "CYBER_SECURITY", "QA", "MARKETING",
  "RESEARCH", "FINANCE", "OPERATIONS", "SUPPORT",
  "INTERNSHIP", // legacy, kept for DB compat
];

export const portalHome = "/inbox";

// Key roles — only one account of each can exist in the system
export const KEY_ROLES = new Set<UserRole>(["CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"]);

// Who can create which roles:
// ADMIN → any non-ADMIN role
// Leadership → their own team roles only (can't create peers or admin-level)
export const CREATOR_PERMISSIONS: Partial<Record<UserRole, UserRole[]>> = {
  ADMIN: ["CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER",
          "DEVELOPER", "CYBER_SECURITY", "QA", "MARKETING",
          "RESEARCH", "FINANCE", "OPERATIONS", "SUPPORT"],
  CEO:        ["MARKETING", "FINANCE"],
  CISO:       ["CYBER_SECURITY"],
  R_AND_D:    ["DEVELOPER", "QA", "RESEARCH"],
  COO:        ["OPERATIONS", "FINANCE"],
  OPS_MANAGER: ["SUPPORT", "OPERATIONS"],
};

export const portalNavItems: PortalNavItem[] = [
  { href: "/inbox",     label: "Inbox",      hint: "Workspace mail",        roles: ALL_ROLES },
  { href: "/chat",      label: "Chat",       hint: "Team messaging",        roles: ALL_ROLES },
  { href: "/meet",      label: "Meet",       hint: "Video meetings",        roles: ALL_ROLES },
  { href: "/drive",     label: "Drive",      hint: "Files & documents",     roles: ALL_ROLES },
  { href: "/calendar",  label: "Calendar",   hint: "Events & scheduling",   roles: ALL_ROLES },
  { href: "/notes",     label: "Notes",      hint: "Personal notes",        roles: ALL_ROLES },
  { href: "/docs",        label: "Docs",       hint: "Documents & writing",   roles: ALL_ROLES },
  { href: "/whiteboard", label: "Whiteboard", hint: "Visual canvas",         roles: ALL_ROLES },
  { href: "/ai",         label: "AI",         hint: "AI assistant",          roles: ALL_ROLES },
  { href: "/notifications", label: "Notifications", hint: "Activity & alerts",   roles: ALL_ROLES },
  { href: "/people",    label: "People",     hint: "Team directory",        roles: ALL_ROLES },
  { href: "/teams",     label: "Teams",      hint: "Team spaces",           roles: ALL_ROLES },
  { href: "/tasks",     label: "Tasks",      hint: "Work items",            roles: ALL_ROLES },
  { href: "/apps",      label: "Apps",       hint: "App marketplace",       roles: ALL_ROLES },
  { href: "/contacts",  label: "Contacts",   hint: "Recipient book",        roles: MGMT_ROLES },
  { href: "/users",     label: "Users",      hint: "Manage team accounts",  roles: MGMT_ROLES },
  { href: "/billing",    label: "Billing",     hint: "Plans & usage",          roles: ["ADMIN"] },
  { href: "/org",       label: "Org",        hint: "Organization settings",  roles: ["ADMIN"] },
  { href: "/admin",     label: "Admin",      hint: "System administration", roles: ["ADMIN"] },
  { href: "/compliance",  label: "Compliance",  hint: "Audit logs & GDPR",         roles: ["ADMIN", "CISO"] },
  { href: "/settings",    label: "Settings",    hint: "Signature & security",       roles: ALL_ROLES },
  { href: "/download",    label: "Desktop App", hint: "Download for Windows/Mac/Linux", roles: ALL_ROLES },
];

// Explicit access control map — default-deny for anything not listed.
const pathAccess: Array<{ prefix: string; roles: UserRole[] }> = [
  { prefix: "/inbox",          roles: ALL_ROLES },
  { prefix: "/chat",           roles: ALL_ROLES },
  { prefix: "/meet",           roles: ALL_ROLES },
  { prefix: "/drive",          roles: ALL_ROLES },
  { prefix: "/calendar",       roles: ALL_ROLES },
  { prefix: "/notes",          roles: ALL_ROLES },
  { prefix: "/docs",           roles: ALL_ROLES },
  { prefix: "/whiteboard",     roles: ALL_ROLES },
  { prefix: "/ai",             roles: ALL_ROLES },
  { prefix: "/settings",        roles: ALL_ROLES },
  { prefix: "/profile",        roles: ALL_ROLES },
  { prefix: "/mfa-challenge",   roles: ALL_ROLES },
  { prefix: "/reset-password", roles: ALL_ROLES },
  { prefix: "/compose",        roles: ALL_ROLES },
  { prefix: "/dashboard",      roles: MGMT_ROLES },
  { prefix: "/contacts",       roles: MGMT_ROLES },
  { prefix: "/users",          roles: MGMT_ROLES },
  { prefix: "/billing",        roles: ["ADMIN"] },
  { prefix: "/org",            roles: ["ADMIN"] },
  { prefix: "/admin",          roles: ["ADMIN"] },
  { prefix: "/compliance",     roles: ["ADMIN", "CISO"] },
  { prefix: "/meet/intelligence", roles: ALL_ROLES },
  { prefix: "/admin/queues",   roles: ["ADMIN"] },
  { prefix: "/admin/deliverability", roles: ["ADMIN"] },
  { prefix: "/notifications",    roles: ALL_ROLES },
  { prefix: "/people",          roles: ALL_ROLES },
  { prefix: "/teams",          roles: ALL_ROLES },
  { prefix: "/tasks",          roles: ALL_ROLES },
  { prefix: "/apps",           roles: ALL_ROLES },
  { prefix: "/onboarding",     roles: ALL_ROLES },
  { prefix: "/status",         roles: ALL_ROLES },
  { prefix: "/download",       roles: ALL_ROLES },
];

const validRoles = new Set<UserRole>(ALL_ROLES);

type CookieReader = {
  get(name: string): { value: string } | undefined;
};

export function parseSessionUser(signedValue: string | undefined): SessionUser | null {
  if (!signedValue) return null;

  try {
    const payload = verifyPayload(signedValue);
    if (!payload) return null;

    const parsed = JSON.parse(payload) as Partial<SessionUser>;
    if (
      typeof parsed.id === "string" &&
      typeof parsed.email === "string" &&
      typeof parsed.fullName === "string" &&
      typeof parsed.role === "string" &&
      validRoles.has(parsed.role as UserRole)
    ) {
      return {
        id: parsed.id,
        email: parsed.email,
        fullName: parsed.fullName,
        role: parsed.role as UserRole,
        mustResetPassword: parsed.mustResetPassword === true,
        organizationId: parsed.organizationId ?? null,
        orgRole: parsed.orgRole ?? null,
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function getSessionUserFromCookieStore(cookieStore: CookieReader) {
  const sessionCookie = cookieStore.get("cybersage_session")?.value;
  if (!sessionCookie) return null;

  const userCookie = cookieStore.get("cybersage_user")?.value;
  return parseSessionUser(userCookie);
}

export function canAccessPath(user: SessionUser, pathname: string): boolean {
  // Find the most specific matching prefix
  const match = pathAccess
    .filter((item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];

  // Default-deny: unknown paths are blocked
  if (!match) return false;
  return match.roles.includes(user.role);
}

export function getPortalNavForRole(role: UserRole) {
  return portalNavItems.filter((item) => item.roles.includes(role));
}
