"use client";

import { useState } from "react";
import { Target, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { goalSeek, type GoalSeekResult } from "@/lib/sheets/goal-seek";
import type { CellGetter } from "@/lib/sheets/formula";
import { parseRef } from "@/lib/sheets/formula";

/**
 * Goal Seek dialog — Excel's Data → What-If Analysis → Goal Seek.
 *
 * "Set cell B5 to 2000 by changing cell B1." The solve itself is in
 * src/lib/sheets/goal-seek.ts; this only collects the three inputs, previews
 * the answer, and lets the user accept or discard it.
 *
 * The result is previewed rather than written straight into the grid, because
 * Goal Seek overwrites a cell the user typed into and the found value is
 * frequently not a round number.
 */
export function GoalSeekDialog({
  defaultTargetCell,
  getFormula,
  getter,
  onApply,
  onClose,
}: {
  /** Pre-filled from the current selection. */
  defaultTargetCell: string;
  /** Raw contents of a cell — the formula if it has one. */
  getFormula: (row: number, col: number) => string;
  getter: CellGetter;
  /** Commit the solved value into the changing cell. */
  onApply: (cell: { row: number; col: number }, value: number) => void;
  onClose: () => void;
}) {
  const [targetCell, setTargetCell] = useState(defaultTargetCell);
  const [goal, setGoal] = useState("");
  const [changingCell, setChangingCell] = useState("");
  const [result, setResult] = useState<GoalSeekResult | null>(null);
  const [solving, setSolving] = useState(false);

  const run = () => {
    setResult(null);

    const targetRef = parseRef(targetCell.trim().toUpperCase());
    const changingRef = parseRef(changingCell.trim().toUpperCase());
    if (!targetRef) { setResult({ ok: false, reason: "Enter a valid target cell, e.g. B5." }); return; }
    if (!changingRef) { setResult({ ok: false, reason: "Enter a valid changing cell, e.g. B1." }); return; }
    if (targetRef.row === changingRef.row && targetRef.col === changingRef.col) {
      setResult({ ok: false, reason: "The target and changing cells must be different." });
      return;
    }
    const goalValue = Number(goal);
    if (!Number.isFinite(goalValue)) {
      setResult({ ok: false, reason: "Enter a number for the target value." });
      return;
    }

    const formula = getFormula(targetRef.row, targetRef.col);
    if (!formula.startsWith("=")) {
      setResult({ ok: false, reason: `${targetCell.toUpperCase()} must contain a formula.` });
      return;
    }

    setSolving(true);
    // Deferred a tick so the spinner paints — the solve is synchronous and can
    // run a few hundred formula evaluations.
    setTimeout(() => {
      const current = Number(getter(changingRef.row, changingRef.col) ?? 0);
      setResult(
        goalSeek({
          targetFormula: formula,
          goal: goalValue,
          getter,
          changingCell: changingRef,
          initialGuess: Number.isFinite(current) && current !== 0 ? current : 1,
        }),
      );
      setSolving(false);
    }, 0);
  };

  const apply = () => {
    if (!result?.ok) return;
    const ref = parseRef(changingCell.trim().toUpperCase());
    if (!ref) return;
    onApply(ref, result.value);
    onClose();
  };

  const field = (label: string, value: string, set: (v: string) => void, placeholder: string) => (
    <label className="block">
      <span className="text-[11px] font-medium text-muted">{label}</span>
      <input
        value={value}
        onChange={e => { set(e.target.value); setResult(null); }}
        placeholder={placeholder}
        className="mt-1 w-full px-3 py-2 bg-surface-sunken border border-border rounded-lg
                   text-sm text-foreground placeholder:text-subtle
                   focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-colors"
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-overlay p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-surface border border-border rounded-panel shadow-pop"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Goal Seek"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border-soft">
          <Target className="w-4 h-4 text-muted" />
          <h2 className="text-sm font-semibold text-foreground tracking-tight">Goal Seek</h2>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-[11px] text-subtle leading-relaxed">
            Finds the input value that makes a formula reach the result you want.
          </p>
          {field("Set cell", targetCell, setTargetCell, "B5")}
          {field("To value", goal, setGoal, "2000")}
          {field("By changing cell", changingCell, setChangingCell, "B1")}

          {result && (
            result.ok ? (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-ok-soft border border-ok/25">
                <CheckCircle2 className="w-4 h-4 text-ok flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">
                    {changingCell.toUpperCase()} = {Number(result.value.toFixed(6))}
                  </p>
                  <p className="text-[10px] text-muted mt-0.5">
                    Gives {Number(result.achieved.toFixed(4))} after {result.iterations} iteration
                    {result.iterations === 1 ? "" : "s"}.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-warn-soft border border-warn/25">
                <AlertTriangle className="w-4 h-4 text-warn flex-shrink-0 mt-0.5" />
                <p className="text-xs text-foreground">{result.reason}</p>
              </div>
            )
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border-soft">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium rounded-md text-muted hover:bg-hover transition-colors"
          >
            Cancel
          </button>
          {result?.ok ? (
            <button
              onClick={apply}
              className="px-3 py-1.5 text-xs font-semibold rounded-md bg-accent text-accent-foreground hover:bg-accent-hover transition-colors"
            >
              Apply
            </button>
          ) : (
            <button
              onClick={run}
              disabled={solving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md
                         bg-accent text-accent-foreground hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {solving && <Loader2 className="w-3 h-3 animate-spin" />}
              Solve
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
