/**
 * RBAC seed-parity test (RFC-001, PR7) — the go/no-go gate for the middleware cutover.
 *
 * Proves that the NEW permission-based route gate (routePermission + system-role
 * permission sets) reproduces the OLD role-based decision (pathAccess) for every one
 * of the 16 original roles, on every gated route — except a small, explicit allowlist
 * of intentional deviations (ADMIN super-role seeing a role-exclusive page).
 *
 * No database required — pure logic. Run:  npx tsx scripts/rbac-parity-test.ts
 * Exits non-zero on any unexpected divergence. This MUST pass before RBAC_ENFORCE=true.
 */
import {
  pathAccess,
  routePermission,
  canAccessPath,
  canAccessPathByPerms,
  type SessionUser,
} from "@/lib/auth";
import { SYSTEM_ROLES, permissionsForSystemRole } from "@/lib/rbac/system-roles";
import { PERMISSION_CATALOG, PERMISSION_KEYS } from "@/lib/rbac/catalog";

const allKeys = PERMISSION_CATALOG.map((p) => p.key);

// Intentional deviations: ADMIN is a super-role, so it reaches the HR-exclusive
// console that the old model restricted to the HR account. Documented + accepted.
const ALLOWED_DEVIATIONS = new Set<string>([
  "ADMIN /admin/hr",
]);

type Failure = { kind: string; detail: string };
const failures: Failure[] = [];

// Check 1: every non-null routePermission key exists in the catalog.
for (const r of routePermission) {
  if (r.permission !== null && !PERMISSION_KEYS.has(r.permission)) {
    failures.push({ kind: "unknown-permission", detail: `${r.prefix} -> ${r.permission}` });
  }
}

// Check 2: every pathAccess prefix has a routePermission entry (no gaps).
const routePrefixes = new Set(routePermission.map((r) => r.prefix));
for (const p of pathAccess) {
  if (!routePrefixes.has(p.prefix)) {
    failures.push({ kind: "missing-route-mapping", detail: p.prefix });
  }
}

// Check 3: per-role, per-route decision parity.
const originalRoles = SYSTEM_ROLES.filter((r) => r.enumValue !== "MEMBER");
let comparisons = 0;
let deviationsSeen = 0;

for (const role of originalRoles) {
  const perms = permissionsForSystemRole(role.enumValue, allKeys);
  const fakeUser = { role: role.enumValue } as unknown as SessionUser;

  for (const entry of pathAccess) {
    const path = entry.prefix;
    const oldDecision = canAccessPath(fakeUser, path);
    const newDecision = canAccessPathByPerms(perms, path);
    comparisons++;

    if (oldDecision !== newDecision) {
      const key = `${role.enumValue} ${path}`;
      if (ALLOWED_DEVIATIONS.has(key)) {
        deviationsSeen++;
        continue;
      }
      failures.push({
        kind: "parity-mismatch",
        detail: `role=${role.enumValue} path=${path} old=${oldDecision} new=${newDecision}`,
      });
    }
  }
}

// Report.
console.log(`RBAC parity test`);
console.log(`  roles checked:  ${originalRoles.length} (MEMBER excluded - no historical decision)`);
console.log(`  routes checked: ${pathAccess.length}`);
console.log(`  comparisons:    ${comparisons}`);
console.log(`  allowed deviations hit: ${deviationsSeen}/${ALLOWED_DEVIATIONS.size}`);

if (failures.length > 0) {
  console.error(`\nFAIL - ${failures.length} issue(s):`);
  for (const f of failures) console.error(`  [${f.kind}] ${f.detail}`);
  console.error(`\nDo NOT set RBAC_ENFORCE=true until these are resolved.`);
  process.exit(1);
}

console.log(`\nPASS - permission map reproduces the role-based gate for all original roles.`);
