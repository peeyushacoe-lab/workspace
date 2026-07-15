import { prisma } from "@/lib/prisma";
import { getEffectivePermissions } from "./can";

// ─── Session permission payload (RFC-001, PR6) ────────────────────────────────
// Helpers to (a) compute the permission set + epoch embedded in the signed session
// cookie, and (b) bump a user's / org's epoch so their cookie is detected as stale
// on the next request and silently refreshed by the portal layout.

export type SessionPerms = {
  perms: string[];
  permEpoch: number;
};

/** Compute the perms[] + permEpoch to embed in a user's session cookie. */
export async function getSessionPerms(userId: string): Promise<SessionPerms> {
  const [user, perms] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { permEpoch: true } }),
    getEffectivePermissions(userId),
  ]);
  return { perms, permEpoch: user?.permEpoch ?? 0 };
}

/** Current epoch for a user (cheap PK lookup) — used by the layout staleness check. */
export async function getUserPermEpoch(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { permEpoch: true },
  });
  return user?.permEpoch ?? 0;
}

/** Invalidate one user's cookie on their next request. */
export async function bumpUserPermEpoch(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { permEpoch: { increment: 1 } },
  });
}

/** Invalidate several users at once (e.g. everyone holding a role that changed). */
export async function bumpUsersPermEpoch(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  await prisma.user.updateMany({
    where: { id: { in: userIds } },
    data: { permEpoch: { increment: 1 } },
  });
}

/** Invalidate every member of an org (org-wide role/permission edits). */
export async function bumpOrgPermEpoch(organizationId: string): Promise<void> {
  await prisma.$transaction([
    prisma.organization.update({
      where: { id: organizationId },
      data: { permEpoch: { increment: 1 } },
    }),
    prisma.user.updateMany({
      where: { organizationId },
      data: { permEpoch: { increment: 1 } },
    }),
  ]);
}

/** Bump every user assigned a given role — call after editing that role's permissions. */
export async function bumpRoleHoldersPermEpoch(roleId: string): Promise<void> {
  const holders = await prisma.userRoleAssignment.findMany({
    where: { roleId },
    select: { userId: true },
  });
  await bumpUsersPermEpoch(holders.map((h) => h.userId));
}
