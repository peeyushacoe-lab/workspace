"use client";

import { useEffect, useState } from "react";
import { Table2, Loader2, AlertTriangle } from "lucide-react";

/**
 * "Insert a spreadsheet range" picker for Docs.
 *
 * Completes the cross-app story: a report can pull its numbers straight from
 * the spreadsheet they live in, instead of a copy-paste that silently goes
 * stale the moment the sheet changes.
 *
 * The inserted table carries `data-linked-range` so "Refresh linked tables"
 * can find and re-fetch it later. A full Tiptap NodeView would give live
 * re-render, but it can't survive the HTML round-trip through `Note.content`
 * — a tagged table does, and it degrades to a perfectly ordinary table
 * everywhere else (DOCX export, print, HTML export).
 */

type SheetSummary = { id: string; title: string };

export type RangeInsert = {
  sheetId: string;
  sheetTab: string;
  range: string;
  /** Rendered HTML for the fetched values. */
  html: string;
};

export function InsertRangeDialog({
  onInsert,
  onClose,
}: {
  onInsert: (result: RangeInsert) => void;
  onClose: () => void;
}) {
  const [sheets, setSheets] = useState<SheetSummary[]>([]);
  const [sheetId, setSheetId] = useState("");
  const [tab, setTab] = useState("");
  const [range, setRange] = useState("A1:C10");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sheets")
      .then(r => r.json())
      .then((d: SheetSummary[]) => {
        setSheets(d);
        if (d.length) setSheetId(d[0].id);
      })
      .catch(() => setError("Could not load your spreadsheets."))
      .finally(() => setLoading(false));
  }, []);

  const insert = async () => {
    if (!sheetId) return;
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ sheet: tab, range: range.trim().toUpperCase() });
      const res = await fetch(`/api/documents/${sheetId}/range?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? "Could not read that range.");
        return;
      }
      const data = await res.json() as {
        sheetTabId: string;
        sheetName: string;
        rows: (string | number | boolean | null)[][];
      };
      if (!data.rows.length) { setError("That range is empty."); return; }

      const esc = (v: unknown) =>
        String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      // First row becomes real <th> cells — the accessibility checker requires
      // header cells, and this is content we generate, so it should pass.
      const body = data.rows
        .map((row, r) =>
          `<tr>${row.map(v => (r === 0 ? `<th>${esc(v)}</th>` : `<td>${esc(v)}</td>`)).join("")}</tr>`,
        )
        .join("");

      onInsert({
        sheetId,
        sheetTab: data.sheetTabId,
        range: range.trim().toUpperCase(),
        html:
          `<table data-linked-range="${sheetId}|${data.sheetTabId}|${range.trim().toUpperCase()}" ` +
          `data-linked-label="${esc(data.sheetName)}!${esc(range.trim().toUpperCase())}">` +
          `${body}</table><p></p>`,
      });
      onClose();
    } catch {
      setError("Could not reach the spreadsheet.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-overlay p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-surface border border-border rounded-panel shadow-pop"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Insert spreadsheet range"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border-soft">
          <Table2 className="w-4 h-4 text-muted" />
          <h2 className="text-sm font-semibold text-foreground tracking-tight">
            Insert spreadsheet range
          </h2>
        </div>

        <div className="p-4 space-y-3">
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-subtle" /></div>
          ) : sheets.length === 0 ? (
            <p className="text-xs text-muted py-4 text-center">You don&apos;t have any spreadsheets yet.</p>
          ) : (
            <>
              <label className="block">
                <span className="text-[11px] font-medium text-muted">Spreadsheet</span>
                <select
                  value={sheetId}
                  onChange={e => { setSheetId(e.target.value); setError(null); }}
                  className="mt-1 w-full px-3 py-2 bg-surface-sunken border border-border rounded-lg
                             text-sm text-foreground focus:outline-none focus:border-accent/60
                             focus:ring-2 focus:ring-accent/20 transition-colors"
                >
                  {sheets.map(s => <option key={s.id} value={s.id}>{s.title || "Untitled"}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="text-[11px] font-medium text-muted">Sheet tab</span>
                <input
                  value={tab}
                  onChange={e => { setTab(e.target.value); setError(null); }}
                  placeholder="Leave blank for the first tab"
                  className="mt-1 w-full px-3 py-2 bg-surface-sunken border border-border rounded-lg
                             text-sm text-foreground placeholder:text-subtle focus:outline-none
                             focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-colors"
                />
              </label>

              <label className="block">
                <span className="text-[11px] font-medium text-muted">Range</span>
                <input
                  value={range}
                  onChange={e => { setRange(e.target.value); setError(null); }}
                  placeholder="A1:C10"
                  className="mt-1 w-full px-3 py-2 bg-surface-sunken border border-border rounded-lg
                             text-sm font-mono text-foreground placeholder:text-subtle focus:outline-none
                             focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-colors"
                />
              </label>

              <p className="text-[10px] text-subtle leading-relaxed">
                Values are inserted as a table and remembered as a link — use
                <span className="font-medium text-muted"> Refresh linked tables </span>
                to pull the latest numbers. Formulas are resolved to their results.
              </p>
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-warn-soft border border-warn/25">
              <AlertTriangle className="w-4 h-4 text-warn flex-shrink-0 mt-0.5" />
              <p className="text-xs text-foreground">{error}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border-soft">
          <button onClick={onClose} className="px-3 py-1.5 text-xs font-medium rounded-md text-muted hover:bg-hover transition-colors">
            Cancel
          </button>
          <button
            onClick={() => void insert()}
            disabled={busy || !sheetId || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md
                       bg-accent text-accent-foreground hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {busy && <Loader2 className="w-3 h-3 animate-spin" />}
            Insert
          </button>
        </div>
      </div>
    </div>
  );
}
