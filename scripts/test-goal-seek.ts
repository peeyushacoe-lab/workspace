/**
 * Goal Seek tests.  npm run test:goal-seek
 * Includes cases the secant method alone cannot solve, to prove the bisection
 * fallback actually engages.
 */
import { goalSeek } from "../src/lib/sheets/goal-seek";
import type { CellValue } from "../src/lib/sheets/formula";

let pass = 0, fail = 0;
const t = (label: string, cond: boolean, extra = "") => {
  if (cond) pass++; else { fail++; console.log("  ✗", label, extra); }
};
const near = (a: number, b: number, tol = 1e-3) => Math.abs(a - b) < tol;

// B1 is the changing cell (row 0, col 1); other cells hold constants.
const grid: Record<string, CellValue> = { "0:2": 12, "0:3": 500 };
const getter = (r: number, c: number): CellValue => grid[`${r}:${c}`] ?? null;
const changing = { row: 0, col: 1 };

console.log("Linear");
let res = goalSeek({ targetFormula: "=B1*12+500", goal: 2000, getter, changingCell: changing, initialGuess: 1 });
t("solves B1*12+500 = 2000", res.ok && near(res.value, 125), JSON.stringify(res));
t("reports the achieved value", res.ok && near(res.achieved, 2000, 1e-2));

res = goalSeek({ targetFormula: "=C1*B1+D1", goal: 1700, getter, changingCell: changing, initialGuess: 0 });
t("solves using other cells (C1*B1+D1)", res.ok && near(res.value, 100), JSON.stringify(res));

console.log("Non-linear");
res = goalSeek({ targetFormula: "=B1*B1", goal: 144, getter, changingCell: changing, initialGuess: 1 });
t("solves B1^2 = 144", res.ok && near(Math.abs(res.value), 12, 1e-2), JSON.stringify(res));

res = goalSeek({ targetFormula: "=POWER(B1,3)-2*B1", goal: 100, getter, changingCell: changing, initialGuess: 1 });
t("solves a cubic", res.ok && near(Math.pow(res.value, 3) - 2 * res.value, 100, 1e-2), JSON.stringify(res));

console.log("Financial — the real use case");
// What loan amount gives a £1000/month payment at 5%/12 over 360 months?
res = goalSeek({ targetFormula: "=PMT(0.05/12,360,B1)", goal: -1000, getter, changingCell: changing, initialGuess: 100000 });
t("solves PMT for principal", res.ok && res.value > 150000 && res.value < 200000, JSON.stringify(res));

console.log("Already at goal");
res = goalSeek({ targetFormula: "=B1", goal: 42, getter, changingCell: changing, initialGuess: 42 });
t("returns immediately when already correct", res.ok && res.iterations === 0 && near(res.value, 42));

console.log("Unsolvable cases report failure");
res = goalSeek({ targetFormula: "=B1*0+5", goal: 99, getter, changingCell: changing, initialGuess: 1 });
t("constant formula can't reach goal", !res.ok, JSON.stringify(res));
res = goalSeek({ targetFormula: "=\"text\"", goal: 10, getter, changingCell: changing, initialGuess: 1 });
t("non-numeric target reports failure", !res.ok);
res = goalSeek({ targetFormula: "=B1/0", goal: 10, getter, changingCell: changing, initialGuess: 1 });
t("error-producing formula reports failure", !res.ok);
t("failure carries a human reason", !res.ok && typeof res.reason === "string" && res.reason.length > 10);

console.log("Terminates");
const start = Date.now();
goalSeek({ targetFormula: "=SIN(B1)", goal: 5, getter, changingCell: changing, initialGuess: 1 });
t("impossible goal still terminates quickly", Date.now() - start < 3000);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
