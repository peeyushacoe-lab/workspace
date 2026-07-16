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
  // RBAC (RFC-001): effective permission keys + epoch, embedded at login and
  // refreshed when the DB epoch advances. Optional so cookies issued before the
  // RBAC rollout still parse.
  perms?: string[];
  permEpoch?: number;
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
  HR: "HR",
  INTERNSHIP: "Internship",
  MEMBER: "Member",
};

// Leadership roles that can access management features
export const MGMT_ROLES: UserRole[] = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"];

const ALL_ROLES: UserRole[] = [
  "ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER",
  "DEVELOPER", "CYBER_SECURITY", "QA", "MARKETING",
  "RESEARCH", "FINANCE", "OPERATIONS", "SUPPORT",
  "HR", "INTERNSHIP", "MEMBER",
];

// Roles excluding interns — for features not yet ready for intern access
export const ALL_ROLES_EXCEPT_INTERN: UserRole[] = ALL_ROLES.filter((r) => r !== "INTERNSHIP");

export const portalHome = "/inbox";

// Role-specific landing page — HR goes straight to the HR dashboard
export function getPortalHome(role: string): string {
  if (role === "HR") return "/admin/hr";
  if (role === "INTERNSHIP") return "/internship/attendance";
  // MEMBER is a neutral baseline with no workspace permissions — send it to a
  // universally-accessible page so a bare member never hits a redirect loop.
  if (role === "MEMBER") return "/profile";
  return "/inbox";
}

// Key roles — only one account of each can exist in the system
export const KEY_ROLES = new Set<UserRole>(["CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"]);

// Who can create which roles:
// ADMIN → any non-ADMIN role
// Leadership → their own team roles only (can't create peers or admin-level)
export const CREATOR_PERMISSIONS: Partial<Record<UserRole, UserRole[]>> = {
  ADMIN: ["CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER",
          "DEVELOPER", "CYBER_SECURITY", "QA", "MARKETING",
          "RESEARCH", "FINANCE", "OPERATIONS", "SUPPORT",
          "HR", "INTERNSHIP"],
  CEO:        ["MARKETING", "FINANCE"],
  CISO:       ["CYBER_SECURITY"],
  R_AND_D:    ["DEVELOPER", "QA", "RESEARCH"],
  COO:        ["OPERATIONS", "FINANCE"],
  OPS_MANAGER: ["SUPPORT", "OPERATIONS"],
};

// All roles except HR — used for features the HR account should not access
const NON_HR_ROLES: UserRole[] = ALL_ROLES.filter(r => r !== "HR");

export const portalNavItems: PortalNavItem[] = [
  { href: "/inbox",     label: "Inbox",      hint: "Workspace mail",        roles: ALL_ROLES },
  { href: "/chat",      label: "Chat",       hint: "Team messaging",        roles: NON_HR_ROLES },
  { href: "/meet",      label: "Meet",       hint: "Video meetings",        roles: ALL_ROLES },
  { href: "/calendar",  label: "Calendar",   hint: "Events & scheduling",   roles: ALL_ROLES },
  { href: "/whiteboard", label: "Whiteboard", hint: "Visual canvas",         roles: NON_HR_ROLES },
  { href: "/ai",         label: "AI",         hint: "AI assistant",          roles: NON_HR_ROLES },
  { href: "/notifications", label: "Notifications", hint: "Activity & alerts",   roles: ALL_ROLES },
  { href: "/people",    label: "People",     hint: "Team directory",        roles: ALL_ROLES },
  { href: "/teams",     label: "Teams",      hint: "Team spaces",           roles: NON_HR_ROLES },
  { href: "/tasks",     label: "Tasks",      hint: "Work items",            roles: NON_HR_ROLES },
  { href: "/apps",      label: "Apps",       hint: "App marketplace",       roles: NON_HR_ROLES },
  { href: "/hr",        label: "My HR",      hint: "Leave, documents & onboarding", roles: NON_HR_ROLES },
  { href: "/dashboard", label: "Dashboard",  hint: "Executive overview",    roles: MGMT_ROLES },
  { href: "/contacts",  label: "Contacts",   hint: "Recipient book",        roles: MGMT_ROLES },
  { href: "/users",     label: "Users",      hint: "Manage team accounts",  roles: MGMT_ROLES },
  { href: "/billing",    label: "Billing",     hint: "Plans & usage",          roles: ["ADMIN"] },
  { href: "/org",       label: "Org",        hint: "Organization settings",  roles: ["ADMIN"] },
  { href: "/admin",     label: "Admin",      hint: "System administration", roles: ["ADMIN"] },
  { href: "/admin/hr",  label: "HR Console", hint: "People, leave & org",   roles: ["HR"] },
  { href: "/compliance",  label: "Compliance",  hint: "Audit logs & GDPR",         roles: ["ADMIN", "CISO"] },
  { href: "/soc",         label: "SOC",         hint: "Security operations centre", roles: ["ADMIN", "CISO", "CEO"] },
  // Developer page hidden — broken, not ready
  // { href: "/developer",   label: "Developer",   hint: "API keys & webhooks",        roles: MGMT_ROLES },
  { href: "/internship",             label: "Intern Hub",  hint: "Internship workspace",   roles: ["INTERNSHIP", ...MGMT_ROLES] },
  // Mentors get the full management hub (curriculum, attendance, HR); interns keep a simple punch-in page.
  { href: "/mentor",                 label: "Mentor",      hint: "Interns, attendance & HR", roles: MGMT_ROLES },
  { href: "/internship/attendance",  label: "Attendance",  hint: "Punch-in / timesheet",   roles: ["INTERNSHIP"] },
  // Settings is shown via the hardcoded icon in SidebarLayout (top bar + bottom of sidebar) — no need for a nav item
  // { href: "/settings",    label: "Settings",    hint: "Signature & security",       roles: ALL_ROLES },
  // Desktop App download hidden for now
  // { href: "/download",    label: "Desktop App", hint: "Download for Windows/Mac/Linux", roles: ALL_ROLES },
];

// Explicit access control map — default-deny for anything not listed.
// Exported so the RBAC seed-parity test (scripts/rbac-parity-test.ts) can prove the
// permission-based route map reproduces these role decisions.
export const pathAccess: Array<{ prefix: string; roles: UserRole[] }> = [
  { prefix: "/inbox",          roles: ALL_ROLES },
  { prefix: "/chat",           roles: NON_HR_ROLES },
  { prefix: "/meet",           roles: ALL_ROLES },
  { prefix: "/drive",          roles: ALL_ROLES },
  { prefix: "/calendar",       roles: ALL_ROLES },
  { prefix: "/notes",          roles: ALL_ROLES },
  { prefix: "/docs",           roles: ALL_ROLES },
  { prefix: "/whiteboard",     roles: NON_HR_ROLES },
  { prefix: "/ai",             roles: NON_HR_ROLES },
  { prefix: "/settings",        roles: ALL_ROLES },
  { prefix: "/profile",        roles: ALL_ROLES },
  { prefix: "/mfa-challenge",   roles: ALL_ROLES },
  { prefix: "/reset-password", roles: ALL_ROLES },
  { prefix: "/setup-passkey",  roles: ALL_ROLES },
  { prefix: "/compose",        roles: ALL_ROLES },
  { prefix: "/dashboard",      roles: MGMT_ROLES },
  { prefix: "/contacts",       roles: MGMT_ROLES },
  { prefix: "/users",          roles: MGMT_ROLES },
  { prefix: "/billing",        roles: ["ADMIN"] },
  { prefix: "/org",            roles: ["ADMIN"] },
  { prefix: "/hr",             roles: NON_HR_ROLES },
  { prefix: "/admin/hr",       roles: ["HR"] },
  { prefix: "/admin",          roles: ["ADMIN"] },
  { prefix: "/compliance",     roles: ["ADMIN", "CISO"] },
  { prefix: "/meet/intelligence", roles: NON_HR_ROLES },
  { prefix: "/admin/queues",   roles: ["ADMIN"] },
  { prefix: "/admin/deliverability", roles: ["ADMIN"] },
  { prefix: "/notifications",    roles: ALL_ROLES },
  { prefix: "/people",          roles: ALL_ROLES },
  { prefix: "/teams",          roles: NON_HR_ROLES },
  { prefix: "/tasks",          roles: NON_HR_ROLES },
  { prefix: "/apps",           roles: NON_HR_ROLES },
  { prefix: "/onboarding",     roles: ALL_ROLES },
  { prefix: "/status",         roles: ALL_ROLES },
  { prefix: "/download",       roles: ALL_ROLES },
  { prefix: "/soc",            roles: ["ADMIN", "CISO", "CEO"] },
  { prefix: "/developer",      roles: ["ADMIN"] },
  { prefix: "/access",         roles: ["ADMIN", "CISO"] },
  { prefix: "/brain",          roles: NON_HR_ROLES },
  { prefix: "/internship",     roles: ["INTERNSHIP", "ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"] },
  { prefix: "/mentor",         roles: MGMT_ROLES },
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
        perms: Array.isArray(parsed.perms) ? parsed.perms : undefined,
        permEpoch: typeof parsed.permEpoch === "number" ? parsed.permEpoch : undefined,
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

// ─── RBAC route gating (RFC-001, PR7) ─────────────────────────────────────────
// Maps each page prefix to the single permission that gates it. `null` = the route
// only needs authentication (universal / self-service pages). This mirrors the
// `pathAccess` role arrays above; the seed-parity test proves the two agree for all
// 16 original roles (with two documented ADMIN super-role exceptions).
//
// PermissionKey is inlined as a string here so this module stays Edge-safe; the
// keys are validated against the catalog by the parity test.
export const routePermission: Array<{ prefix: string; permission: string | null }> = [
  { prefix: "/inbox",                permission: "email.read" },
  { prefix: "/chat",                 permission: "chat.read" },
  { prefix: "/meet/intelligence",    permission: "ai.use" },
  { prefix: "/meet",                 permission: "meet.join" },
  { prefix: "/drive",                permission: "drive.read" },
  { prefix: "/calendar",             permission: "calendar.read" },
  { prefix: "/notes",                permission: "docs.read" },
  { prefix: "/docs",                 permission: "docs.read" },
  { prefix: "/whiteboard",           permission: "docs.edit" },
  { prefix: "/ai",                   permission: "ai.use" },
  { prefix: "/brain",                permission: "ai.use" },
  { prefix: "/compose",              permission: "email.send" },
  { prefix: "/people",               permission: "people.read" },
  { prefix: "/teams",                permission: "teams.read" },
  { prefix: "/tasks",                permission: "tasks.read" },
  { prefix: "/apps",                 permission: "apps.use" },
  { prefix: "/hr",                   permission: "hr.read" },
  { prefix: "/dashboard",            permission: "dashboard.view" },
  { prefix: "/contacts",             permission: "contacts.read" },
  { prefix: "/users",                permission: "users.manage" },
  { prefix: "/billing",              permission: "billing.manage" },
  { prefix: "/org",                  permission: "org.manage" },
  { prefix: "/admin/hr",             permission: "hr.manage" },
  { prefix: "/admin/queues",         permission: "admin.manage" },
  { prefix: "/admin/deliverability", permission: "admin.manage" },
  { prefix: "/admin",                permission: "admin.manage" },
  { prefix: "/developer",            permission: "admin.manage" },
  { prefix: "/compliance",           permission: "compliance.view" },
  { prefix: "/access",               permission: "compliance.view" },
  { prefix: "/soc",                  permission: "soc.view" },
  { prefix: "/mentor",               permission: "mentor.manage" },
  // /internship/attendance is NOT a separate pathAccess entry — it inherits the
  // /internship gate (interns + their managers), so we deliberately do not add a
  // narrower rule here that would lock managers out.
  { prefix: "/internship",           permission: "internship.view" },
  // Universal / self-service — authentication only.
  { prefix: "/settings",       permission: null },
  { prefix: "/profile",        permission: null },
  { prefix: "/notifications",  permission: null },
  { prefix: "/mfa-challenge",  permission: null },
  { prefix: "/reset-password", permission: null },
  { prefix: "/setup-passkey",  permission: null },
  { prefix: "/onboarding",     permission: null },
  { prefix: "/status",         permission: null },
  { prefix: "/download",       permission: null },
];

/**
 * Permission-based access decision, using the permission keys embedded in the
 * session cookie. Returns `null` if the cookie has no perms yet (pre-rollout
 * cookie) so the caller can fall back to role-based gating.
 */
export function canAccessPathByPerms(
  perms: string[] | undefined,
  pathname: string,
): boolean | null {
  if (!perms) return null; // no perms in cookie — caller decides fallback

  const match = routePermission
    .filter((item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];

  // Default-deny: unknown paths are blocked.
  if (!match) return false;
  if (match.permission === null) return true; // auth-only route
  return perms.includes(match.permission);
}

export function getPortalNavForRole(role: UserRole) {
  return portalNavItems.filter((item) => item.roles.includes(role));
}
