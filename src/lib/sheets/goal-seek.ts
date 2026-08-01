import { evaluateFormula, toN } from "./formula";
import type { CellValue, CellGetter } from "./formula";

/**
 * Goal Seek — "what value in cell X makes cell Y equal Z?"
 *
 * Excel's Data → What-If Analysis → Goal Seek. Solves one equation in one
 * unknown numerically, because the target cell is an arbitrary formula that
 * can't be inverted symbolically.
 *
 * Strategy: secant method first (fast, and handles the smooth
 * monotonic functions that make up almost every real spreadsheet model), with
 * a bracketing + bisection fallback when the secant diverges — which it does
 * on flat or discontinuous regions. Excel's own implementation is likewise
 * iterative and likewise fails on some inputs; the failure is reported rather
 * than a wrong answer returned.
 */

export type GoalSeekResult =
  | { ok: true; value: number; achieved: number; iterations: number }
  | { ok: false; reason: string };

/** Excel stops at 0.001 by default; matching that avoids surprising drift. */
const DEFAULT_TOLERANCE = 1e-4;
const MAX_ITERATIONS = 200;

export type GoalSeekOptions = {
  /** Formula in the target cell, e.g. "=B1*12+500". */
  targetFormula: string;
  /** Value the target should reach. */
  goal: number;
  /** Reads any cell EXCEPT the changing cell. */
  getter: CellGetter;
  /** Row/col of the cell being solved for. */
  changingCell: { row: number; col: number };
  /** Starting guess — usually the changing cell's current value. */
  initialGuess?: number;
  tolerance?: number;
};

/**
 * Solves for the changing cell's value.
 *
 * The getter is wrapped so that reads of the changing cell return the current
 * candidate instead of its stored value — that's what makes the target formula
 * a function of the unknown.
 */
export function goalSeek(opts: GoalSeekOptions): GoalSeekResult {
  const {
    targetFormula, goal, getter, changingCell,
    initialGuess = 1, tolerance = DEFAULT_TOLERANCE,
  } = opts;

  const evaluateAt = (candidate: number): number | null => {
    const patched: CellGetter = (row, col) =>
      row === changingCell.row && col === changingCell.col
        ? candidate
        : getter(row, col);
    const out = evaluateFormula(targetFormula, patched);
    // Spill results and error strings mean the formula doesn't produce a
    // single comparable number at this candidate.
    if (typeof out === "object" && out !== null) return null;
    if (typeof out === "string" && out.startsWith("#")) return null;
    const n = toN(out as CellValue);
    return Number.isFinite(n) ? n : null;
  };

  /** Signed distance from the goal. */
  const residual = (x: number): number | null => {
    const y = evaluateAt(x);
    return y === null ? null : y - goal;
  };

  const startResidual = residual(initialGuess);
  if (startResidual === null) {
    return { ok: false, reason: "The target cell doesn't produce a number." };
  }
  if (Math.abs(startResidual) <= tolerance) {
    return { ok: true, value: initialGuess, achieved: startResidual + goal, iterations: 0 };
  }

  // ── Secant ────────────────────────────────────────────────────────────────
  let x0 = initialGuess;
  let x1 = initialGuess === 0 ? 1 : initialGuess * 1.1;
  let f0 = startResidual;
  let f1 = residual(x1);
  let iterations = 0;

  for (let i = 0; i < MAX_ITERATIONS && f1 !== null; i++) {
    iterations++;
    if (Math.abs(f1) <= tolerance) {
      return { ok: true, value: x1, achieved: f1 + goal, iterations };
    }
    const denom = f1 - f0;
    // Flat region — the secant step is undefined; fall through to bisection.
    if (denom === 0 || !Number.isFinite(denom)) break;

    const x2 = x1 - f1 * ((x1 - x0) / denom);
    if (!Number.isFinite(x2) || Math.abs(x2) > 1e12) break;

    x0 = x1; f0 = f1;
    x1 = x2; f1 = residual(x1);
  }

  // ── Bracket + bisection fallback ──────────────────────────────────────────
  // Expand outwards from the guess looking for a sign change, then halve.
  let lo = initialGuess;
  let hi = initialGuess;
  let flo = startResidual;
  let fhi = startResidual;
  let step = Math.max(Math.abs(initialGuess) * 0.5, 1);

  for (let i = 0; i < 60; i++) {
    lo -= step; hi += step; step *= 1.6;
    const a = residual(lo);
    const b = residual(hi);
    if (a !== null) flo = a;
    if (b !== null) fhi = b;
    if (a !== null && flo * startResidual < 0) { hi = initialGuess; fhi = startResidual; break; }
    if (b !== null && fhi * startResidual < 0) { lo = initialGuess; flo = startResidual; break; }
  }

  if (!(flo * fhi < 0)) {
    return {
      ok: false,
      reason: "Couldn't find a solution. The target may be unreachable, or try a different starting value.",
    };
  }

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    iterations++;
    const mid = (lo + hi) / 2;
    const fmid = residual(mid);
    if (fmid === null) {
      return { ok: false, reason: "The target cell stopped producing a number during the search." };
    }
    if (Math.abs(fmid) <= tolerance || (hi - lo) / 2 < 1e-12) {
      return { ok: true, value: mid, achieved: fmid + goal, iterations };
    }
    if (flo * fmid < 0) { hi = mid; fhi = fmid; }
    else { lo = mid; flo = fmid; }
  }

  return { ok: false, reason: "Didn't converge within the iteration limit." };
}
