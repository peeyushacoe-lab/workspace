// ─── System role definitions (RFC-001) ────────────────────────────────────────
// The 16 built-in UserRole enum values become seeded system `Role` rows. This file
// is the single translation of the ENFORCED access model — the `pathAccess` arrays
// in src/lib/auth.ts — into the new permission-key model.
//
// IMPORTANT: the old ROLE_DEFAULTS map in permissions.ts was DEAD CODE (never
// imported/enforced), so it is NOT used as a source here. Only `pathAccess` (the
// real page gate) is mirrored. That is why CISO/COO/OPS_MANAGER do NOT get
// admin.manage (they never had /admin access) and CEO is NOT a super-role (it was
// excluded from /admin, /billing, /org, /compliance).
//
// The PR7 seed-parity test asserts this mapping reproduces the old per-route
// decision for all 16 original roles. Treat every change here as security-sensitive.

import type { PermissionKey } from "./catalog";

export type SystemRoleDef = {
  key: string;        // matches UserRole enum value, lowercased for Role.key slug
  enumValue: string;  // exact UserRole enum value
  name: string;
  description: string;
  rank: number;       // lower = more privileged
  isSingleton: boolean;
  isSuper?: boolean;  // super-roles implicitly hold every permission (ADMIN only)
  permissions: PermissionKey[];
};

// Everything a non-HR employee can reach today (mirrors NON_HR_ROLES page access).
const BASE_WORKSPACE: PermissionKey[] = [
  "email.read", "email.send",
  "chat.read", "chat.create",
  "meet.join", "meet.host",
  "calendar.read", "calendar.write",
  "drive.read", "drive.upload", "drive.share",
  "docs.read", "docs.edit",
  "tasks.read", "tasks.write",
  "teams.read", "apps.use",
  "ai.use",
  "people.read",
  "hr.read",
];

// The HR account is deliberately scoped away from chat/ai/teams/tasks and the
// personal /hr page (see auth.ts NON_HR_ROLES); it runs the HR console instead.
const HR_WORKSPACE: PermissionKey[] = [
  "email.read", "email.send",
  "meet.join",
  "calendar.read", "calendar.write",
  "drive.read", "drive.upload",
  "docs.read",
  "people.read",
  "hr.manage",
];

// Leadership (MGMT_ROLES) extras: dashboard, contacts, user management, mentor
// workspace and the internship hub.
const MGMT_EXTRA: PermissionKey[] = [
  "dashboard.view", "contacts.read", "users.manage",
  "mentor.manage", "internship.view",
];

const uniq = (...groups: PermissionKey[][]): PermissionKey[] =>
  Array.from(new Set(groups.flat()));

export const SYSTEM_ROLES: SystemRoleDef[] = [
  {
    key: "admin", enumValue: "ADMIN", name: "Admin",
    description: "Full system administrator.",
    rank: 0, isSingleton: false, isSuper: true, permissions: [],
  },
  {
    key: "ceo", enumValue: "CEO", name: "CEO",
    description: "Chief Executive — workspace, leadership and SOC access.",
    rank: 10, isSingleton: true,
    permissions: uniq(BASE_WORKSPACE, MGMT_EXTRA, ["soc.view", "soc.manage"]),
  },
  {
    key: "ciso", enumValue: "CISO", name: "CISO",
    description: "Chief Information Security Officer.",
    rank: 20, isSingleton: true,
    permissions: uniq(BASE_WORKSPACE, MGMT_EXTRA, [
      "sentinel.view", "sentinel.manage",
      "soc.view", "soc.manage",
      "dlp.manage", "compliance.view",
    ]),
  },
  {
    key: "coo", enumValue: "COO", name: "COO",
    description: "Chief Operating Officer.",
    rank: 20, isSingleton: true,
    permissions: uniq(BASE_WORKSPACE, MGMT_EXTRA),
  },
  {
    key: "r_and_d", enumValue: "R_AND_D", name: "R&D Head",
    description: "Head of Research & Development.",
    rank: 30, isSingleton: true,
    permissions: uniq(BASE_WORKSPACE, MGMT_EXTRA),
  },
  {
    key: "ops_manager", enumValue: "OPS_MANAGER", name: "Operations Manager",
    description: "Operations manager.",
    rank: 30, isSingleton: true,
    permissions: uniq(BASE_WORKSPACE, MGMT_EXTRA),
  },
  {
    key: "hr", enumValue: "HR", name: "HR",
    description: "Human Resources — HR console.",
    rank: 40, isSingleton: false,
    permissions: HR_WORKSPACE,
  },
  {
    key: "developer", enumValue: "DEVELOPER", name: "Developer",
    description: "Software developer.",
    rank: 100, isSingleton: false, permissions: BASE_WORKSPACE,
  },
  {
    key: "cyber_security", enumValue: "CYBER_SECURITY", name: "Cyber Security",
    description: "Security analyst.",
    rank: 100, isSingleton: false,
    permissions: uniq(BASE_WORKSPACE, ["sentinel.view", "sentinel.manage"]),
  },
  {
    key: "qa", enumValue: "QA", name: "QA Engineer",
    description: "Quality assurance.",
    rank: 100, isSingleton: false, permissions: BASE_WORKSPACE,
  },
  {
    key: "marketing", enumValue: "MARKETING", name: "Marketing",
    description: "Marketing team.",
    rank: 100, isSingleton: false, permissions: BASE_WORKSPACE,
  },
  {
    key: "research", enumValue: "RESEARCH", name: "Research",
    description: "Research team.",
    rank: 100, isSingleton: false, permissions: BASE_WORKSPACE,
  },
  {
    key: "finance", enumValue: "FINANCE", name: "Finance",
    description: "Finance team.",
    rank: 100, isSingleton: false, permissions: BASE_WORKSPACE,
  },
  {
    key: "operations", enumValue: "OPERATIONS", name: "Operations",
    description: "Operations team.",
    rank: 100, isSingleton: false, permissions: BASE_WORKSPACE,
  },
  {
    key: "support", enumValue: "SUPPORT", name: "Support",
    description: "Customer support.",
    rank: 100, isSingleton: false, permissions: BASE_WORKSPACE,
  },
  {
    key: "internship", enumValue: "INTERNSHIP", name: "Internship",
    description: "Intern — workspace access, internship hub and attendance.",
    rank: 200, isSingleton: false,
    permissions: uniq(BASE_WORKSPACE, ["internship.view"]),
  },
  {
    key: "member", enumValue: "MEMBER", name: "Member",
    description: "Neutral baseline. Grants nothing on its own; access comes from assigned custom roles.",
    rank: 300, isSingleton: false, permissions: [],
  },
];

/** Super-roles bypass every permission check. ADMIN only. */
export const SUPER_ROLE_ENUMS: ReadonlySet<string> = new Set(
  SYSTEM_ROLES.filter((r) => r.isSuper).map((r) => r.enumValue),
);

/** Effective permission keys for a system role enum value (super = whole catalog). */
export function permissionsForSystemRole(
  enumValue: string,
  allKeys: readonly PermissionKey[],
): PermissionKey[] {
  const def = SYSTEM_ROLES.find((r) => r.enumValue === enumValue);
  if (!def) return [];
  if (def.isSuper) return [...allKeys];
  return def.permissions;
}
