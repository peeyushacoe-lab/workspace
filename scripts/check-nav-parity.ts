/**
 * Nav parity: the spine + rail model must expose exactly the destinations each
 * role could already reach. Grouping is presentation only — it must never add or
 * drop a route. Run with: npx tsx scripts/check-nav-parity.ts
 */
import { getPortalNavForRole } from "../src/lib/auth";
import { getNavGroups, railVisible } from "../src/lib/nav-groups";
import type { UserRole } from "../src/generated/prisma/enums";

const ROLES: UserRole[] = [
  "ADMIN","CEO","CISO","R_AND_D","COO","OPS_MANAGER","DEVELOPER","CYBER_SECURITY",
  "QA","MARKETING","RESEARCH","FINANCE","OPERATIONS","SUPPORT","BUSINESS_MANAGER",
  "INTERNSHIP","HR","MEMBER",
] as UserRole[];

// Rail links intentionally added back for routes that were reachable by URL but
// had no nav entry at all (Drive, Docs, Notes, Compose).
/**
 * Rail entries that exist in nav-groups but deliberately not in
 * `portalNavItems`, so the parity check shouldn't flag them.
 *
 * `/apps/sheets` and `/apps/slides` belong here: they are declared as `extra`
 * items on the Docs group (see nav-groups.ts) because Sheets and Slides sit in
 * the Docs rail rather than owning their own spine icon — mirroring the way
 * docs.google.com hosts all three. They were never added to this list, so the
 * check reported 16 false failures (one per role) and `npm run check` could
 * never pass.
 */
const INTENTIONAL_ADDITIONS = new Set([
  "/drive", "/docs", "/notes", "/compose", "/apps/sheets", "/apps/slides",
]);

let failures = 0;
for (const role of ROLES) {
  const before = new Set(getPortalNavForRole(role).map((i) => i.href));
  const groups = getNavGroups(role);
  const after = new Set(groups.flatMap((g) => g.items.map((i) => i.href)));

  const lost = [...before].filter((h) => !after.has(h));
  const gained = [...after].filter((h) => !before.has(h) && !INTENTIONAL_ADDITIONS.has(h));

  const spine = groups.map((g) => g.label).join(", ");
  const railed = groups.filter((g) => railVisible(g)).map((g) => g.label).join(", ") || "none";
  console.log(`${role.padEnd(16)} spine[${groups.length}]: ${spine}`);
  console.log(`${"".padEnd(16)} rail for: ${railed}`);
  if (lost.length)   { console.log(`  ✗ LOST:   ${lost.join(", ")}`);   failures++; }
  if (gained.length) { console.log(`  ✗ GAINED: ${gained.join(", ")}`); failures++; }
}
console.log(failures === 0
  ? "\n✓ nav parity: every role keeps exactly the destinations it had"
  : `\n✗ nav parity: ${failures} discrepancy(ies)`);
process.exit(failures === 0 ? 0 : 1);
