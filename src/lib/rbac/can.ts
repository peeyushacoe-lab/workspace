import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import type { SessionUser } from "@/lib/auth";
import { SUPER_ROLE_ENUMS } from "./system-roles";
import { isPermissionKey, type PermissionKey } from "./catalog";

// ─── RBAC permission engine (RFC-001) ─────────────────────────────────────────
// Single entry point for "can this user do X?". Resolution order:
//   1. Super-role (ADMIN, CEO)                → allow everything
//   2. UserPermissionOverride, granted=false  → explicit DENY wins
//   3. UserPermissionOverride, granted=true   → explicit grant
//   4. Any assigned Role holds the permission → allow
//   5. otherwise                              → deny
//
// The per-user access set is loaded once per request via React cache(), so a
// handler that checks several permissions makes a single DB round-trip.

type UserAccess = {
  isSuper: boolean;
  granted: Set<string>; // permission keys allowed via roles or grant-overrides
  denied: Set<string>;  // permission keys explicitly denied (override wins)
};

const loadUserAccess = cache(async (userId: string): Promise<UserAccess | null> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      roleAssignments: {
        select: { role: { select: { permissions: { select: { permission: { select: { key: true } } } } } } },
      },
      permissionOverrides: {
        select: { granted: true, permission: { select: { key: true } } },
      },
    },
  });
  if (!user) return null;

  const isSuper = SUPER_ROLE_ENUMS.has(user.role);

  const granted = new Set<string>();
  const denied = new Set<string>();

  for (const a of user.roleAssignments) {
    for (const rp of a.role.permissions) granted.add(rp.permission.key);
  }
  for (const o of user.permissionOverrides) {
    if (o.granted) granted.add(o.permission.key);
    else denied.add(o.permission.key);
  }

  return { isSuper, granted, denied };
});

/** True if the user (by id) holds the permission. */
export async function can(userId: string, permission: PermissionKey): Promise<boolean> {
  const access = await loadUserAccess(userId);
  if (!access) return false;
  if (access.isSuper) return true;
  if (access.denied.has(permission)) return false; // explicit deny wins
  return access.granted.has(permission);
}

/** All effective permission keys for a user — used to fill the session cookie (PR6). */
export async function getEffectivePermissions(userId: string): Promise<PermissionKey[]> {
  const access = await loadUserAccess(userId);
  if (!access) return [];
  if (access.isSuper) {
    const { PERMISSION_CATALOG } = await import("./catalog");
    return PERMISSION_CATALOG.map((p) => p.key);
  }
  return [...access.granted].filter(
    (k): k is PermissionKey => isPermissionKey(k) && !access.denied.has(k),
  );
}

export class ForbiddenError extends Error {
  status = 403 as const;
  constructor(public permission: string) {
    super(`Missing permission: ${permission}`);
    this.name = "ForbiddenError";
  }
}

/**
 * Assert the current session user holds `permission`. Returns the user, or throws
 * ForbiddenError (401 if unauthenticated). Use at the top of route handlers:
 *   const user = await requirePermission("drive.delete");
 */
export async function requirePermission(permission: PermissionKey): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new ForbiddenError(permission); // treat unauth as forbidden here
  const ok = await can(user.id, permission);
  if (!ok) throw new ForbiddenError(permission);
  return user;
}
