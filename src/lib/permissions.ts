import { prisma } from "@/lib/prisma";

// Roles that implicitly have full access to all resources
const SUPER_ROLES = new Set(["ADMIN", "CEO"]);

// Default role-based access (applies when no explicit Permission row exists)
const ROLE_DEFAULTS: Record<string, Record<string, string[]>> = {
  CISO:        { sentinel: ["read","write","delete","admin"], admin: ["read","write"] },
  R_AND_D:     { drive: ["read","write","delete","share"], docs: ["read","write","delete"] },
  DEVELOPER:   { drive: ["read","write"], chat: ["read","write"], email: ["read","write"] },
  CYBER_SECURITY: { sentinel: ["read","write"], drive: ["read"], email: ["read"] },
  OPS_MANAGER: { admin: ["read","write"], email: ["read","write","delete"] },
  COO:         { admin: ["read","write"], email: ["read","write"] },
  FINANCE:     { email: ["read","write"], drive: ["read"] },
  MARKETING:   { email: ["read","write"], drive: ["read","write"] },
  SUPPORT:     { email: ["read","write"] },
};

/**
 * Check whether a user can perform `action` on `resource`.
 * Explicit Permission rows (granted=true) take priority over role defaults.
 * Super-roles (ADMIN, CEO) always return true.
 */
export async function can(
  userId: string,
  role: string,
  resource: string,
  action: string,
): Promise<boolean> {
  if (SUPER_ROLES.has(role)) return true;

  // Check explicit permission row
  const explicit = await prisma.permission.findUnique({
    where: { userId_resource_action: { userId, resource, action } },
  });
  if (explicit !== null) return explicit.granted;

  // Fall back to role defaults
  const roleDefault = ROLE_DEFAULTS[role];
  if (!roleDefault) return false;
  return roleDefault[resource]?.includes(action) ?? false;
}

/**
 * Sync default permissions into the DB for a new user (called after creation).
 * Idempotent — uses upsert.
 */
export async function seedDefaultPermissions(userId: string, role: string): Promise<void> {
  if (SUPER_ROLES.has(role)) return;
  const defaults = ROLE_DEFAULTS[role];
  if (!defaults) return;

  const rows = Object.entries(defaults).flatMap(([resource, actions]) =>
    actions.map((action) => ({ userId, resource, action, granted: true })),
  );

  await Promise.all(
    rows.map((r) =>
      prisma.permission.upsert({
        where: { userId_resource_action: { userId: r.userId, resource: r.resource, action: r.action } },
        create: r,
        update: {},
      }),
    ),
  );
}
