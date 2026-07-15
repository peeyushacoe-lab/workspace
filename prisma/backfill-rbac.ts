import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { SYSTEM_ROLES } from "../src/lib/rbac/system-roles";

// ─── RBAC backfill (RFC-001) ──────────────────────────────────────────────────
// Idempotent one-time migration of existing data into the new RBAC + org tables.
//   1. Assign every user their system role (from User.role enum).
//   2. Migrate legacy per-user Permission rows → UserPermissionOverride.
//   3. Seed Departments from distinct User.department strings (per org).
//   4. Seed Teams + TeamMembers from the static DEFAULT_TEAMS (per org).
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

// Mirror of DEFAULT_TEAMS in src/app/api/teams/route.ts (inlined to avoid importing
// a route module). Each team seeds per-organization; membership resolves by role.
const DEFAULT_TEAMS: { slug: string; name: string; icon: string; color: string; roles: string[] }[] = [
  { slug: "leadership",  name: "Leadership",   icon: "crown",       color: "#ef4444", roles: ["CEO", "ADMIN", "CISO", "COO"] },
  { slug: "engineering", name: "Engineering",  icon: "code",        color: "#3b82f6", roles: ["DEVELOPER", "R_AND_D"] },
  { slug: "security",    name: "Security",     icon: "shield",      color: "#00d2ff", roles: ["CYBER_SECURITY", "CISO"] },
  { slug: "operations",  name: "Operations",   icon: "settings",    color: "#8b5cf6", roles: ["OPS_MANAGER", "OPERATIONS", "COO"] },
  { slug: "finance",     name: "Finance",      icon: "dollar-sign", color: "#f59e0b", roles: ["FINANCE"] },
  { slug: "marketing",   name: "Marketing",    icon: "megaphone",   color: "#f97316", roles: ["MARKETING"] },
  { slug: "research",    name: "Research",     icon: "flask",       color: "#a855f7", roles: ["RESEARCH"] },
  { slug: "qa",          name: "QA & Testing", icon: "clipboard",   color: "#22c55e", roles: ["QA"] },
  { slug: "support",     name: "Support",      icon: "headphones",  color: "#06b6d4", roles: ["SUPPORT"] },
  { slug: "interns",     name: "Interns",      icon: "graduation",  color: "#ec4899", roles: ["INTERNSHIP"] },
];

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

async function seedTeams() {
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  let teamsCreated = 0;
  let membersCreated = 0;

  for (const org of orgs) {
    for (const t of DEFAULT_TEAMS) {
      let team = await prisma.team.findFirst({
        where: { organizationId: org.id, slug: t.slug },
      });
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
      }

      const members = await prisma.user.findMany({
        where: { organizationId: org.id, role: { in: t.roles as never } },
        select: { id: true },
      });
      for (const m of members) {
        const existing = await prisma.teamMember.findUnique({
          where: { teamId_userId: { teamId: team.id, userId: m.id } },
        });
        if (!existing) {
          await prisma.teamMember.create({ data: { teamId: team.id, userId: m.id } });
          membersCreated++;
        }
      }
    }
  }
  console.log(`  ✓ teams: ${teamsCreated} created, ${membersCreated} memberships added`);
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
