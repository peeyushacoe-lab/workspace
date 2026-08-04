import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { SYSTEM_ROLES } from "../src/lib/rbac/system-roles";
import { TEAM_SEEDS } from "../src/lib/teams";

// ─── RBAC backfill (RFC-001) ──────────────────────────────────────────────────
// Idempotent one-time migration of existing data into the new RBAC + org tables.
//   1. Assign every user their system role (from User.role enum).
//   2. Migrate legacy per-user Permission rows → UserPermissionOverride.
//   3. Seed Departments from distinct User.department strings (per org).
//   4. Seed Teams + TeamMembers from TEAM_SEEDS (per org).
//
//   npm run backfill:rbac
//
// Run AFTER `npm run seed:rbac`. Safe to run repeatedly.

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://user:password@localhost:5432/cybersage_mail?schema=public";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// Team definitions now come from src/lib/teams.ts — the single source of truth
// shared with /api/teams. The list used to be duplicated here and had drifted:
// it was missing the HR and All Hands teams and still carried the pre-Atrium
// colours, so a freshly backfilled database disagreed with what /teams rendered.

async function assignSystemRoles() {
  const roles = await prisma.role.findMany({ where: { isSystem: true, organizationId: null } });
  const byEnum = new Map<string, string>(); // enumValue → roleId
  for (const def of SYSTEM_ROLES) {
    const row = roles.find((r) => r.key === def.key);
    if (row) byEnum.set(def.enumValue, row.id);
  }

  const users = await prisma.user.findMany({ select: { id: true, role: true } });
  let created = 0;
  for (const u of users) {
    const roleId = byEnum.get(u.role);
    if (!roleId) continue;
    const existing = await prisma.userRoleAssignment.findFirst({
      where: { userId: u.id, roleId, scopeType: null, scopeId: null },
    });
    if (!existing) {
      await prisma.userRoleAssignment.create({ data: { userId: u.id, roleId } });
      created++;
    }
  }
  console.log(`  ✓ role assignments: ${created} created (${users.length} users total)`);
}

async function migrateLegacyPermissions() {
  // Legacy Permission model: { userId, resource, action, granted }.
  const legacy = await prisma.permission.findMany();
  const defs = await prisma.permissionDef.findMany({ select: { id: true, key: true } });
  const keyToId = new Map(defs.map((d) => [d.key, d.id]));

  let migrated = 0;
  let skipped = 0;
  for (const p of legacy) {
    const permissionId = keyToId.get(`${p.resource}.${p.action}`);
    if (!permissionId) { skipped++; continue; }
    await prisma.userPermissionOverride.upsert({
      where: { userId_permissionId: { userId: p.userId, permissionId } },
      create: { userId: p.userId, permissionId, granted: p.granted, reason: "backfilled from legacy Permission" },
      update: { granted: p.granted },
    });
    migrated++;
  }
  console.log(`  ✓ legacy permissions: ${migrated} migrated, ${skipped} skipped (no catalog key)`);
}

async function seedDepartments() {
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  let created = 0;
  for (const org of orgs) {
    const users = await prisma.user.findMany({
      where: { organizationId: org.id, department: { not: null } },
      select: { department: true },
    });
    const names = new Set(
      users.map((u) => (u.department ?? "").trim()).filter(Boolean),
    );
    for (const name of names) {
      const slug = slugify(name);
      if (!slug) continue;
      const existing = await prisma.department.findFirst({
        where: { organizationId: org.id, slug },
      });
      if (!existing) {
        await prisma.department.create({ data: { organizationId: org.id, name, slug } });
        created++;
      }
    }
  }
  console.log(`  ✓ departments: ${created} created across ${orgs.length} org(s)`);
}

// Seed the system teams and their initial memberships, per organisation.
//
// Two properties this must hold, because it is expected to be re-run:
//   * Presentation is repaired. Name/icon/colour are rewritten from TEAM_SEEDS
//     on every run, so a database seeded by the older drifted copy of the list
//     converges instead of staying stale. Only `isSystem` teams are touched —
//     custom teams created through /org are never rewritten.
//   * Membership is additive, never subtractive. Roles decide who gets enrolled
//     the first time; after that membership is data. Someone added to
//     Engineering by hand keeps their seat even though their User.role never
//     said DEVELOPER, and someone removed from a team is not silently re-added.
async function seedTeams() {
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  let teamsCreated = 0;
  let teamsRepaired = 0;
  let membersCreated = 0;

  for (const org of orgs) {
    for (const t of TEAM_SEEDS) {
      const existingTeam = await prisma.team.findFirst({
        where: { organizationId: org.id, slug: t.slug },
      });

      let team = existingTeam;
      if (!team) {
        team = await prisma.team.create({
          data: {
            organizationId: org.id,
            slug: t.slug,
            name: t.name,
            icon: t.icon,
            color: t.color,
            isSystem: true,
          },
        });
        teamsCreated++;
      } else if (
        team.isSystem &&
        (team.name !== t.name || team.icon !== t.icon || team.color !== t.color)
      ) {
        team = await prisma.team.update({
          where: { id: team.id },
          data: { name: t.name, icon: t.icon, color: t.color },
        });
        teamsRepaired++;
      }

      // `everyone` teams enrol all active users. Note this differs from
      // `roles: []`, which would match nobody — Prisma's `in: []` returns zero
      // rows, so the distinction has to be explicit.
      const memberWhere = t.everyone
        ? { organizationId: org.id, isActive: true }
        : { organizationId: org.id, isActive: true, role: { in: t.roles as never } };

      const candidates = await prisma.user.findMany({
        where: memberWhere,
        select: { id: true },
      });
      if (candidates.length === 0) continue;

      const alreadyIn = await prisma.teamMember.findMany({
        where: { teamId: team.id, userId: { in: candidates.map((c) => c.id) } },
        select: { userId: true },
      });
      const have = new Set(alreadyIn.map((m) => m.userId));
      const missing = candidates.filter((c) => !have.has(c.id));

      if (missing.length > 0) {
        await prisma.teamMember.createMany({
          data: missing.map((m) => ({ teamId: team.id, userId: m.id })),
          skipDuplicates: true,
        });
        membersCreated += missing.length;
      }
    }
  }

  console.log(
    `  ✓ teams: ${teamsCreated} created, ${teamsRepaired} repaired, ${membersCreated} memberships added`,
  );
  if (orgs.length === 0) {
    console.log("    (no organizations exist — teams/departments skipped; run again after creating an org)");
  }
}

async function main() {
  console.log("Backfilling RBAC + org data (RFC-001)…");
  await assignSystemRoles();
  await migrateLegacyPermissions();
  await seedDepartments();
  await seedTeams();
  console.log("Backfill complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
