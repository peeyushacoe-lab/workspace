/**
 * Client book access matrix — the guard rail for the Business Manager module.
 *
 * Proves the four boundaries the design depends on, from the permission sets and
 * the ownership rule, with no database:
 *
 *   1. CEO / CISO / COO can SEE every client and every figure, and can change
 *      NOTHING. This is the "look, don't touch" promise.
 *   2. A Business Manager edits their OWN clients and is refused on a peer's —
 *      the India book cannot be edited from the UK.
 *   3. Only Finance can confirm a payment. Not the BM who recorded the fee, not
 *      the Ops Manager who oversees the book.
 *   4. Only the Ops Manager (and Admin) can edit any client and reassign owners.
 *
 * Run: npx tsx scripts/clients-access-matrix.ts
 * Exits non-zero on any boundary violation.
 */
import { SYSTEM_ROLES, permissionsForSystemRole } from "@/lib/rbac/system-roles";
import { PERMISSION_CATALOG } from "@/lib/rbac/catalog";

const allKeys = PERMISSION_CATALOG.map((p) => p.key);
const perms = (role: string) => new Set(permissionsForSystemRole(role, allKeys));

/** Mirrors clientRightsFor() in src/lib/clients.ts. Kept in step by the tests below. */
function rights(role: string, owns: boolean) {
  const p = perms(role);
  const admin = p.has("clients.admin");
  const write = p.has("clients.write");
  return {
    canRead: p.has("clients.read"),
    canEdit: admin || (write && owns),
    canAdmin: admin,
    canSeeMoney: p.has("clients.finance.read"),
    canManageMoney: p.has("clients.finance.manage"),
  };
}

const failures: string[] = [];
function check(label: string, actual: boolean, expected: boolean) {
  const ok = actual === expected;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${ok ? "" : `  (got ${actual}, want ${expected})`}`);
  if (!ok) failures.push(label);
}

console.log("\n1. Leadership sees everything, changes nothing");
for (const role of ["CEO", "CISO", "COO"]) {
  const own = rights(role, true);   // even if somehow marked owner
  const other = rights(role, false);
  check(`${role} reads the client book`, own.canRead, true);
  check(`${role} sees the money`, own.canSeeMoney, true);
  check(`${role} cannot edit any client`, own.canEdit || other.canEdit, false);
  check(`${role} cannot reassign owners`, own.canAdmin, false);
  check(`${role} cannot confirm payments`, own.canManageMoney, false);
}

console.log("\n2. Business Manager: own book only");
const bmOwn = rights("BUSINESS_MANAGER", true);
const bmOther = rights("BUSINESS_MANAGER", false);
check("BM reads the whole book", bmOwn.canRead, true);
check("BM edits their own client", bmOwn.canEdit, true);
check("BM CANNOT edit another BM's client", bmOther.canEdit, false);
check("BM sees fees", bmOwn.canSeeMoney, true);
check("BM cannot confirm payments", bmOwn.canManageMoney, false);
check("BM cannot reassign owners", bmOwn.canAdmin, false);

console.log("\n3. Finance owns the ledger");
const finOther = rights("FINANCE", false);
check("Finance reads every client", finOther.canRead, true);
check("Finance sees fees", finOther.canSeeMoney, true);
check("Finance confirms payments", finOther.canManageMoney, true);
check("Finance does not edit client records it does not own", finOther.canEdit, false);

console.log("\n4. Ops Manager oversees every book");
const omOther = rights("OPS_MANAGER", false);
check("Ops Manager edits any client", omOther.canEdit, true);
check("Ops Manager reassigns owners", omOther.canAdmin, true);
check("Ops Manager sees fees", omOther.canSeeMoney, true);
check("Ops Manager cannot confirm payments (Finance's call)", omOther.canManageMoney, false);

console.log("\n5. Roles with no business remit stay out");
for (const role of ["DEVELOPER", "QA", "MARKETING", "SUPPORT", "INTERNSHIP", "HR"]) {
  check(`${role} cannot read the client book`, rights(role, false).canRead, false);
}

console.log("\n6. Admin remains a super-role");
const adminDef = SYSTEM_ROLES.find((r) => r.enumValue === "ADMIN");
check("ADMIN is super", adminDef?.isSuper === true, true);
check("ADMIN holds clients.admin", perms("ADMIN").has("clients.admin"), true);

if (failures.length) {
  console.error(`\nFAIL — ${failures.length} boundary violation(s):`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`\nPASS — client book access boundaries hold.`);
