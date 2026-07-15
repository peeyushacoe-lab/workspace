import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PERMISSION_CATALOG, type PermissionEntry } from "../src/lib/rbac/catalog";
import { SYSTEM_ROLES, permissionsForSystemRole } from "../src/lib/rbac/system-roles";

// ─── RBAC seed (RFC-001) ──────────────────────────────────────────────────────
// Idempotent. Seeds the permission catalog and the 16+1 system roles with their
// permission links. Safe to run repeatedly (upserts + reconciles links).
//
//   npm run seed:rbac
//
// Run AFTER `npm run prisma:migrate` has applied the RBAC tables.

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://user:password@localhost:5432/cybersage_mail?schema=public";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function seedCatalog(): Promise<Map<string, string>> {
  const keyToId = new Map<string, string>();
  for (const p of PERMISSION_CATALOG as readonly PermissionEntry[]) {
    const row = await prisma.permissionDef.upsert({
      where: { key: p.key },
      create: {
        key: p.key,
        resource: p.resource,
        action: p.action,
        label: p.label,
        description: p.description,
        category: p.category,
        isDangerous: p.isDangerous ?? false,
      },
      update: {
        resource: p.resource,
        action: p.action,
        label: p.label,
        description: p.description,
        category: p.category,
        isDangerous: p.isDangerous ?? false,
      },
    });
    keyToId.set(p.key, row.id);
  }
  console.log(`  ✓ ${keyToId.size} permissions in catalog`);
  return keyToId;
}

async function seedSystemRoles(keyToId: Map<string, string>) {
  const allKeys = PERMISSION_CATALOG.map((p) => p.key);

  for (const def of SYSTEM_ROLES) {
    // System roles are global templates: organizationId = null.
    // The @@unique([organizationId, key]) constraint can't match on null across
    // rows in Postgres, so we look up by (key, isSystem) manually and upsert.
    const existing = await prisma.role.findFirst({
      where: { key: def.key, organizationId: null, isSystem: true },
    });

    const role = existing
      ? await prisma.role.update({
          where: { id: existing.id },
          data: {
            name: def.name,
            description: def.description,
            rank: def.rank,
            isSingleton: def.isSingleton,
          },
        })
      : await prisma.role.create({
          data: {
            organizationId: null,
            key: def.key,
            name: def.name,
            description: def.description,
            rank: def.rank,
            isSingleton: def.isSingleton,
            isSystem: true,
          },
        });

    // Reconcile RolePermission links to exactly match the definition.
    const desiredKeys = permissionsForSystemRole(def.enumValue, allKeys);
    const desiredIds = new Set(
      desiredKeys.map((k) => keyToId.get(k)).filter((id): id is string => Boolean(id)),
    );

    const current = await prisma.rolePermission.findMany({
      where: { roleId: role.id },
      select: { permissionId: true },
    });
    const currentIds = new Set(current.map((c) => c.permissionId));

    const toAdd = [...desiredIds].filter((id) => !currentIds.has(id));
    const toRemove = [...currentIds].filter((id) => !desiredIds.has(id));

    if (toAdd.length) {
      await prisma.rolePermission.createMany({
        data: toAdd.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      });
    }
    if (toRemove.length) {
      await prisma.rolePermission.deleteMany({
        where: { roleId: role.id, permissionId: { in: toRemove } },
      });
    }

    const total = def.isSuper ? allKeys.length : desiredIds.size;
    console.log(`  ✓ ${def.name.padEnd(20)} → ${total} permissions${def.isSuper ? " (super)" : ""}`);
  }
}

async function main() {
  console.log("Seeding RBAC (RFC-001)…");
  const keyToId = await seedCatalog();
  await seedSystemRoles(keyToId);
  console.log("RBAC seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
