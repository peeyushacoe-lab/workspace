/**
 * Custom (user-defined) spreadsheet function tests.  npm run test:custom-fn
 *
 * The security block is the important part: custom functions are formula
 * expressions, not JavaScript, so there must be no reachable path to the host
 * environment. These assert that explicitly rather than trusting the design.
 */
import {
  evaluateFormula, setCustomFunctions, getCustomFunctions, isValidFunctionName,
} from "../src/lib/sheets/formula";
import type { CellValue } from "../src/lib/sheets/formula";

const grid: Record<string, CellValue> = {
  "0:0": 1000, "0:1": 400,      // A1 revenue, B1 cost
  "1:0": 250,  "1:1": 100,
  "0:2": 5, "1:2": 10, "2:2": 15,
};
const g = (r: number, c: number): CellValue => grid[`${r}:${c}`] ?? null;

let pass = 0, fail = 0;
const t = (label: string, got: unknown, want: unknown) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) pass++; else { fail++; console.log(`  ✗ ${label}\n      got ${a}  want ${b}`); }
};
const approx = (label: string, got: unknown, want: number) => {
  if (typeof got === "number" && Math.abs(got - want) < 1e-6) pass++;
  else { fail++; console.log(`  ✗ ${label}: got ${JSON.stringify(got)} want ~${want}`); }
};

setCustomFunctions([
  { name: "PROFIT",  params: ["revenue", "cost"], body: "revenue - cost" },
  { name: "MARGIN",  params: ["revenue", "cost"], body: "IF(revenue=0, 0, (revenue-cost)/revenue)" },
  { name: "VATFULL", params: ["net"],             body: "ROUND(net * 1.2, 2)" },
  { name: "TOTALOF", params: ["rng"],             body: "SUM(rng)" },
  { name: "NESTED",  params: ["x"],               body: "PROFIT(x, 100)" },
  { name: "LOOPY",   params: ["x"],               body: "LOOPY(x)" },        // self-referential
  { name: "NOARGS",  params: [],                  body: "42" },
]);

console.log("Basics");
approx("=PROFIT(1000,400)", evaluateFormula("=PROFIT(1000,400)", g), 600);
approx("reads cells", evaluateFormula("=PROFIT(A1,B1)", g), 600);
approx("=MARGIN(1000,400)", evaluateFormula("=MARGIN(1000,400)", g), 0.6);
approx("guards divide-by-zero", evaluateFormula("=MARGIN(0,50)", g), 0);
approx("uses built-ins inside", evaluateFormula("=VATFULL(10)", g), 12);
approx("zero-arg function", evaluateFormula("=NOARGS()", g), 42);

console.log("Composition");
approx("nests inside a built-in", evaluateFormula("=SUM(PROFIT(1000,400), 1)", g), 601);
approx("custom calls custom", evaluateFormula("=NESTED(500)", g), 400);
approx("accepts a range argument", evaluateFormula("=TOTALOF(C1:C3)", g), 30);
approx("used in arithmetic", evaluateFormula("=PROFIT(1000,400)/2", g), 300);

console.log("Safety");
t("self-recursion errors, doesn't hang", evaluateFormula("=LOOPY(1)", g), "#NUM!");
t("unknown function still #NAME?", evaluateFormula("=NOPE(1)", g), "#NAME?");
// Parameters must not leak between calls or into later formulas.
evaluateFormula("=PROFIT(1,2)", g);
const leaked = evaluateFormula("=revenue", g);
t("params don't leak into later formulas",
  typeof leaked === "string" && leaked.startsWith("#"), true);

console.log("Built-ins cannot be shadowed");
t("SUM is rejected as a name", isValidFunctionName("SUM"), false);
t("IF is rejected", isValidFunctionName("IF"), false);
t("lower-case sum rejected too", isValidFunctionName("sum"), false);
t("MARGIN is allowed", isValidFunctionName("MARGIN"), true);
t("bad chars rejected", isValidFunctionName("MY-FUNC"), false);
t("leading digit rejected", isValidFunctionName("2FAST"), false);
setCustomFunctions([{ name: "SUM", params: ["x"], body: "999" }]);
t("registry drops a shadowing name", getCustomFunctions().length, 0);
approx("SUM still built-in after that attempt", evaluateFormula("=SUM(C1:C3)", g), 30);

console.log("No host access — these must NOT execute anything");
setCustomFunctions([
  { name: "EVIL1", params: [], body: "fetch" },
  { name: "EVIL2", params: [], body: "globalThis" },
  { name: "EVIL3", params: [], body: "process" },
  { name: "EVIL4", params: [], body: "constructor" },
  { name: "EVIL5", params: [], body: "require(\"fs\")" },
]);
for (const name of ["EVIL1", "EVIL2", "EVIL3", "EVIL4"]) {
  const out = evaluateFormula(`=${name}()`, g);
  const safe = out === "#NAME?" || out === null || out === "#ERROR!" ||
               (typeof out === "string" && out.startsWith("#"));
  if (safe) pass++;
  else { fail++; console.log(`  ✗ ${name} resolved to something real: ${JSON.stringify(out)}`); }
}
const req = evaluateFormula("=EVIL5()", g);
if (typeof req === "string" && req.startsWith("#")) pass++;
else { fail++; console.log(`  ✗ require() was reachable: ${JSON.stringify(req)}`); }

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
