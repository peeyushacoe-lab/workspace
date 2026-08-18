import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { TEAM_SEEDS, seedTeamSlugsForRole } from "../src/lib/teams";

// ─── Teams migration parity test ──────────────────────────────────────────────
// Gate for moving /api/teams off the hardcoded role-derived list and onto the
// Team / TeamMember tables. Proves the database reproduces what the old route
// rendered, so nobody loses a team space in the switch.
//
//   npm run test:teams-parity
//
// Run AFTER `npm run backfill:rbac`. Read-only — it never writes.
//
// Checks:
//   1. Every seeded team exists, once per organisation.
//   2. Seeded teams carry the canonical name / icon / colour (catches a database
//      seeded by the older drifted copy of the list).
//   3. For every active user, DB membership ⊇ what their role alone would have
//      granted. Superset, not equality: hand-added members are the point of the
//      migration, so extra memberships pass and missing ones fail.
//   4. Every UserRole maps to at least one team, so no role renders an empty page.

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://user:password@localhost:5432/cybersage_mail?schema=public";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const ALL_ROLES = [
  "ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER",
  "DEVELOPER", "CYBER_SECURITY", "QA", "MARKETING", "RESEARCH",
  "FINANCE", "OPERATIONS", "SUPPORT", "BUSINESS_MANAGER", "HR", "INTERNSHIP", "MEMBER",
] as const;

const failures: string[] = [];
const warnings: string[] = [];

function fail(msg: string) {
  failures.push(msg);
  console.log(`  ✗ ${msg}`);
}

function warn(msg: string) {
  warnings.push(msg);
  console.log(`  ! ${msg}`);
}

// ── 1 + 2: seeded teams exist, per org, with canonical presentation ──────────
async function checkSeededTeams() {
  console.log("\nSeeded teams");
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });

  if (orgs.length === 0) {
    warn("no organizations exist — nothing to check. Create an org, then re-run backfill:rbac.");
    return;
  }

  for (const org of orgs) {
    for (const seed of TEAM_SEEDS) {
      const matches = await prisma.team.findMany({
        where: { organizationId: org.id, slug: seed.slug },
        select: { id: true, name: true, icon: true, color: true, isSystem: true },
      });

      if (matches.length === 0) {
        fail(`[${org.name}] missing team "${seed.slug}" — run: npm run backfill:rbac`);
        continue;
      }
      if (matches.length > 1) {
        fail(`[${org.name}] duplicate teams for slug "${seed.slug}" (${matches.length} rows)`);
        continue;
      }

      const t = matches[0];
      if (!t.isSystem) {
        warn(`[${org.name}] "${seed.slug}" is not flagged isSystem — backfill will not repair it`);
      }
      const drift: string[] = [];
      if (t.name !== seed.name) drift.push(`name ${JSON.stringify(t.name)} ≠ ${JSON.stringify(seed.name)}`);
      if (t.icon !== seed.icon) drift.push(`icon ${JSON.stringify(t.icon)} ≠ ${JSON.stringify(seed.icon)}`);
      if (t.color !== seed.color) drift.push(`color ${JSON.stringify(t.color)} ≠ ${JSON.stringify(seed.color)}`);
      if (drift.length > 0) {
        fail(`[${org.name}] "${seed.slug}" drifted: ${drift.join(", ")} — re-run: npm run backfill:rbac`);
      }
    }
  }

  if (failures.length === 0) {
    console.log(`  ✓ all ${TEAM_SEEDS.length} seeded teams present and canonical across ${orgs.length} org(s)`);
  }
}

// ── 3: DB membership is a superset of the old role-derived membership ────────
async function checkMembershipParity() {
  console.log("\nMembership parity (DB ⊇ role-derived)");

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      id: true, email: true, role: true, organizationId: true,
      teamMemberships: { select: { team: { select: { slug: true } } } },
    },
  });

  if (users.length === 0) {
    warn("no active users — nothing to compare");
    return;
  }

  let checked = 0;
  let skipped = 0;

  for (const u of users) {
    // Teams are org-scoped; a user with no org has no teams to belong to.
    if (!u.organizationId) { skipped++; continue; }

    const expected = seedTeamSlugsForRole(u.role);
    const actual = new Set(u.teamMemberships.map((m) => m.team.slug));
    const missing = expected.filter((slug) => !actual.has(slug));

    if (missing.length > 0) {
      fail(`${u.email} (${u.role}) missing: ${missing.join(", ")}`);
    }
    checked++;
  }

  if (skipped > 0) {
    warn(`${skipped} active user(s) have no organizationId and were skipped`);
  }
  console.log(`  ✓ checked ${checked} user(s)`);
}

// ── 4: no role renders an empty Teams page ───────────────────────────────────
function checkRoleCoverage() {
  console.log("\nRole coverage");
  for (const role of ALL_ROLES) {
    const slugs = seedTeamSlugsForRole(role);
    if (slugs.length === 0) {
      fail(`role ${role} maps to no team at all`);
    } else if (slugs.length === 1 && slugs[0] === "all-hands") {
      // Expected for MEMBER, which is the neutral RBAC baseline by design.
      if (role !== "MEMBER") {
        warn(`role ${role} only lands in all-hands — is that intended?`);
      }
    }
  }
  console.log(`  ✓ ${ALL_ROLES.length} roles checked`);
}

async function main() {
  console.log("Teams migration parity test");
  console.log("═".repeat(60));

  checkRoleCoverage();
  await checkSeededTeams();
  await checkMembershipParity();

  console.log("\n" + "═".repeat(60));
  if (warnings.length > 0) {
    console.log(`${warnings.length} warning(s).`);
  }
  if (failures.length > 0) {
    console.log(`FAILED — ${failures.length} problem(s). /api/teams is not safe to trust yet.`);
    process.exit(1);
  }
  console.log("PASSED — the database reproduces the role-derived team spaces.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
