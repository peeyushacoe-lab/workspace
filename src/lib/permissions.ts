// ─── DEPRECATED shim (RFC-001) ────────────────────────────────────────────────
// The old resource/action permission engine has been superseded by the dynamic
// RBAC engine in `src/lib/rbac/can.ts`. This file is kept only so any lingering
// or future references to the old signatures keep working; it now delegates.
//
// New code should import from "@/lib/rbac/can" and use PermissionKey directly.
// This shim will be deleted in the RBAC cleanup PR.

import { prisma } from "@/lib/prisma";
import { can as canByKey } from "@/lib/rbac/can";
import { isPermissionKey, type PermissionKey } from "@/lib/rbac/catalog";
import { SUPER_ROLE_ENUMS, SYSTEM_ROLES } from "@/lib/rbac/system-roles";

// Legacy (resource, action) pairs → new catalog keys. The old engine used
// write/read/admin actions; the catalog uses send/upload/edit/view/manage.
const LEGACY_KEY_MAP: Record<string, PermissionKey> = {
  "email.read":     "email.read",
  "email.write":    "email.send",
  "email.send":     "email.send",
  "email.delete":   "email.delete",
  "drive.read":     "drive.read",
  "drive.write":    "drive.upload",
  "drive.upload":   "drive.upload",
  "drive.delete":   "drive.delete",
  "drive.share":    "drive.share",
  "docs.read":      "docs.read",
  "docs.write":     "docs.edit",
  "docs.edit":      "docs.edit",
  "docs.delete":    "docs.delete",
  "chat.read":      "chat.read",
  "chat.write":     "chat.create",
  "chat.create":    "chat.create",
  "sentinel.read":  "sentinel.view",
  "sentinel.write": "sentinel.manage",
  "sentinel.delete":"sentinel.manage",
  "sentinel.admin": "sentinel.manage",
  "admin.read":     "admin.manage",
  "admin.write":    "admin.manage",
  "admin.admin":    "admin.manage",
  "hr.manage":      "hr.manage",
};

function toKey(resource: string, action: string): PermissionKey | null {
  const raw = `${resource}.${action}`;
  if (LEGACY_KEY_MAP[raw]) return LEGACY_KEY_MAP[raw];
  return isPermissionKey(raw) ? (raw as PermissionKey) : null;
}

/**
 * @deprecated Use `can(userId, permissionKey)` from "@/lib/rbac/can".
 * Legacy signature preserved: resolves resource/action to a catalog key and
 * delegates to the RBAC engine. Super-roles still short-circuit on the passed role.
 */
export async function can(
  userId: string,
  role: string,
  resource: string,
  action: string,
): Promise<boolean> {
  if (SUPER_ROLE_ENUMS.has(role)) return true;
  const key = toKey(resource, action);
  if (!key) return false;
  return canByKey(userId, key);
}

/**
 * @deprecated Roles now carry their permissions. This assigns the user their
 * matching system role (idempotent) so a freshly created user has correct access
 * under the new engine. Replaces the old per-user Permission seeding.
 */
export async function seedDefaultPermissions(userId: string, role: string): Promise<void> {
  const def = SYSTEM_ROLES.find((r) => r.enumValue === role);
  if (!def) return;
  const roleRow = await prisma.role.findFirst({
    where: { key: def.key, organizationId: null, isSystem: true },
    select: { id: true },
  });
  if (!roleRow) return;
  const existing = await prisma.userRoleAssignment.findFirst({
    where: { userId, roleId: roleRow.id, scopeType: null, scopeId: null },
  });
  if (!existing) {
    await prisma.userRoleAssignment.create({ data: { userId, roleId: roleRow.id } });
  }
}
