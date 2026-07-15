// ─── System role definitions (RFC-001) ────────────────────────────────────────
// The 16 built-in UserRole enum values become seeded system `Role` rows. This file
// is the single translation of the OLD access model (pathAccess arrays in auth.ts +
// ROLE_DEFAULTS in permissions.ts) into the NEW permission-key model.
//
// The PR7 seed-parity test asserts that the access decision produced from these
// sets equals the old role-based decision for every route. Treat every change here
// as security-sensitive.

import type { PermissionKey } from "./catalog";

export type SystemRoleDef = {
  key: string;        // matches UserRole enum value (lowercased for the Role.key slug)
  enumValue: string;  // exact UserRole enum value
  name: string;
  description: string;
  rank: number;       // lower = more privileged
  isSingleton: boolean;
  isSuper?: boolean;  // super-roles implicitly hold every permission
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
  "ai.use",
  "people.read",
  "hr.read",
];

// The HR account is deliberately scoped away from chat/ai/teams/tasks (see auth.ts
// NON_HR_ROLES) and instead runs the HR console.
const HR_WORKSPACE: PermissionKey[] = [
  "email.read", "email.send",
  "meet.join",
  "calendar.read", "calendar.write",
  "drive.read", "drive.upload",
  "docs.read",
  "people.read",
  "hr.manage",
];

// Extra grants for leadership (MGMT_ROLES) — dashboard, contacts, user management.
const MGMT_EXTRA: PermissionKey[] = ["dashboard.view", "contacts.read", "users.manage"];

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
    description: "Chief Executive — full access.",
    rank: 10, isSingleton: true, isSuper: true, permissions: [],
  },
  {
    key: "ciso", enumValue: "CISO", name: "CISO",
    description: "Chief Information Security Officer.",
    rank: 20, isSingleton: true,
    permissions: uniq(BASE_WORKSPACE, MGMT_EXTRA, [
      "sentinel.view", "sentinel.manage",
      "soc.view", "soc.manage",
      "dlp.manage", "compliance.view",
      "admin.manage",
    ]),
  },
  {
    key: "coo", enumValue: "COO", name: "COO",
    description: "Chief Operating Officer.",
    rank: 20, isSingleton: true,
    permissions: uniq(BASE_WORKSPACE, MGMT_EXTRA, ["admin.manage", "email.delete"]),
  },
  {
    key: "r_and_d", enumValue: "R_AND_D", name: "R&D Head",
    description: "Head of Research & Development.",
    rank: 30, isSingleton: true,
    permissions: uniq(BASE_WORKSPACE, MGMT_EXTRA, ["drive.delete", "docs.delete"]),
  },
  {
    key: "ops_manager", enumValue: "OPS_MANAGER", name: "Operations Manager",
    description: "Operations manager.",
    rank: 30, isSingleton: true,
    permissions: uniq(BASE_WORKSPACE, MGMT_EXTRA, ["admin.manage", "email.delete"]),
  },
  {
    key: "hr", enumValue: "HR", name: "HR",
    description: "Human Resources.",
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
    description: "Intern — workspace access, internship hub.",
    rank: 200, isSingleton: false, permissions: BASE_WORKSPACE,
  },
  {
    key: "member", enumValue: "MEMBER", name: "Member",
    description: "Neutral baseline. Grants nothing on its own; access comes from assigned custom roles.",
    rank: 300, isSingleton: false, permissions: [],
  },
];

/** Super-roles bypass every permission check (kept in sync with permissions.ts). */
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
