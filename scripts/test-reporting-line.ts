/**
 * Reporting-line cycle guard.
 *
 * `User.managerId` is a self-relation, so the data can describe an impossible
 * org (A reports to B, B reports to A). Nothing fails at write time — the damage
 * appears later, when something walks the chain to draw an org chart or resolve
 * an approval path and loops forever.
 *
 * The database blocks only the one-hop case (`User_manager_not_self` CHECK), so
 * the multi-hop guard lives in application code and is the part worth testing.
 * `detectReportingCycle` takes its lookup as a parameter precisely so this can
 * run against fixture graphs with no Postgres.
 *
 * Run:  npx tsx scripts/test-reporting-line.ts
 */
import { detectReportingCycle, MAX_CHAIN } from "../src/lib/reporting-line";

let failures = 0;

/** Builds a lookup over a plain { person: manager } map. */
function lookupFrom(graph: Record<string, string | null>) {
  return async (id: string) => graph[id] ?? null;
}

async function check(name: string, got: Promise<boolean>, want: boolean) {
  const value = await got;
  const ok = value === want;
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${name}`);
  if (!ok) console.log(`    got ${value}, want ${want}`);
}

async function main() {
  // A -> B -> C  (C is top). Nobody reports to anybody else yet.
  const chain = { A: "B", B: "C", C: null };

  // ── Legitimate assignments ─────────────────────────────────────────────────
  await check("assigning a fresh manager is fine",
    detectReportingCycle("D", "C", lookupFrom({ ...chain, D: null })), false);
  await check("moving someone under a peer is fine",
    detectReportingCycle("A", "C", lookupFrom(chain)), false);
  await check("a manager with no manager of their own is fine",
    detectReportingCycle("X", "Y", lookupFrom({ X: null, Y: null })), false);

  // ── Cycles that must be refused ────────────────────────────────────────────
  await check("self-management is a cycle",
    detectReportingCycle("A", "A", lookupFrom(chain)), true);
  await check("two-hop loop (C reporting to A, who is under B under C)",
    detectReportingCycle("C", "A", lookupFrom(chain)), true);
  await check("direct swap (B reporting to A, who reports to B)",
    detectReportingCycle("B", "A", lookupFrom(chain)), true);

  // ── Deep chains ────────────────────────────────────────────────────────────
  // 30 links: p0 -> p1 -> ... -> p29 -> null
  const deep: Record<string, string | null> = {};
  for (let i = 0; i < 30; i++) deep[`p${i}`] = i === 29 ? null : `p${i + 1}`;

  await check("a 30-deep chain resolves without a false positive",
    detectReportingCycle("newcomer", "p0", lookupFrom({ ...deep, newcomer: null })), false);
  await check("closing a 30-deep chain into a loop is caught",
    detectReportingCycle("p29", "p0", lookupFrom(deep)), true);

  // ── Pre-existing corruption ────────────────────────────────────────────────
  // If a cycle already exists above the proposed manager, refuse rather than
  // write into it — otherwise the guard helps deepen the damage it exists to stop.
  await check("a loop already in the data is refused",
    detectReportingCycle("fresh", "L1", lookupFrom({ L1: "L2", L2: "L1", fresh: null })), true);

  // ── Runaway protection ─────────────────────────────────────────────────────
  // A chain longer than the depth cap can't be verified, so it's refused rather
  // than assumed safe.
  const endless: Record<string, string | null> = {};
  for (let i = 0; i <= MAX_CHAIN + 5; i++) endless[`q${i}`] = `q${i + 1}`;
  await check("a chain past the depth cap is refused, not assumed safe",
    detectReportingCycle("start", "q0", lookupFrom(endless)), true);

  console.log(
    failures === 0
      ? "\n✓ reporting-line: no cycle can be written, no valid chain is blocked"
      : `\n✗ reporting-line: ${failures} failure(s)`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();
