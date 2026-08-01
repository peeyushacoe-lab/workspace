"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Table2, Unlink, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { appUrl } from "@/lib/subdomains";

/**
 * A live spreadsheet range embedded in a document or slide.
 *
 * The suite's missing connective tissue: Docs, Sheets and Slides could not
 * reference each other at all, so a table in a report was a dead copy-paste
 * that silently went stale. This holds a reference and refetches, the way
 * Google Sheets → Docs linked tables and Excel → Word linked objects do.
 *
 * The link is a reference, not a copy: nothing is duplicated into the document,
 * so spreadsheet permissions keep applying. A reader without access to the
 * sheet sees an access error rather than the data.
 */

export type LinkedRangeRef = {
  sheetId: string;
  /** Sheet-tab id or name. */
  sheet: string;
  /** A1-style, e.g. "A1:D12". */
  range: string;
  /** Optional caption shown above the table. */
  label?: string;
};

type RangeData = {
  sheetName: string;
  range: string;
  columns: string[];
  rows: (string | number | boolean | null)[][];
  fetchedAt: string;
};

export function LinkedRange({
  reference,
  onUnlink,
  /** Read-only contexts (published view, viewer role) hide the controls. */
  editable = true,
}: {
  reference: LinkedRangeRef;
  onUnlink?: () => void;
  editable?: boolean;
}) {
  const [data, setData] = useState<RangeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ sheet: reference.sheet, range: reference.range });
      const res = await fetch(`/api/documents/${reference.sheetId}/range?${params}`);
      if (res.status === 404 || res.status === 403) {
        setError("You don't have access to the linked spreadsheet.");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? "Could not load the linked range.");
        return;
      }
      setData(await res.json() as RangeData);
    } catch {
      setError("Could not reach the linked spreadsheet.");
    } finally {
      setLoading(false);
    }
  }, [reference.sheetId, reference.sheet, reference.range]);

  useEffect(() => { void load(); }, [load]);

  const sheetHref = appUrl(`/apps/sheets/${reference.sheetId}`);

  return (
    <figure
      className="my-4 rounded-xl border border-border bg-surface overflow-hidden"
      data-linked-range={`${reference.sheetId}|${reference.sheet}|${reference.range}`}
    >
      <figcaption className="flex items-center gap-2 px-3 py-2 border-b border-border-soft bg-surface-sunken">
        <Table2 className="w-3.5 h-3.5 text-muted flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-foreground truncate">
            {reference.label || `${data?.sheetName ?? "Spreadsheet"}!${reference.range}`}
          </p>
          <p className="text-[10px] text-subtle">
            {loading
              ? "Refreshing…"
              : data
                ? `Live link · updated ${formatDistanceToNow(new Date(data.fetchedAt), { addSuffix: true })}`
                : "Linked range"}
          </p>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <a
            href={sheetHref}
            target="_blank"
            rel="noopener noreferrer"
            title="Open the spreadsheet"
            className="p-1.5 rounded-md text-muted hover:text-accent hover:bg-accent-soft transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={() => void load()}
            disabled={loading}
            title="Refresh from the spreadsheet"
            className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-hover transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </button>
          {editable && onUnlink && (
            <button
              onClick={() => {
                onUnlink();
                toast.success("Converted to a static table");
              }}
              title="Break the link and keep the current values"
              className="p-1.5 rounded-md text-muted hover:text-crit hover:bg-crit-soft transition-colors"
            >
              <Unlink className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </figcaption>

      {error ? (
        <p className="px-3 py-4 text-xs text-crit">{error}</p>
      ) : loading && !data ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-4 h-4 animate-spin text-subtle" />
        </div>
      ) : data && data.rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <tbody>
              {data.rows.map((row, r) => (
                <tr key={r} className={r === 0 ? "bg-surface-sunken" : undefined}>
                  {row.map((cell, c) =>
                    // First row is treated as the header, matching how people
                    // actually lay out spreadsheet ranges — and it gives the
                    // embedded table real <th> cells for screen readers.
                    r === 0 ? (
                      <th
                        key={c}
                        scope="col"
                        className="border border-border-soft px-2 py-1 text-left font-semibold text-foreground"
                      >
                        {cell === null ? "" : String(cell)}
                      </th>
                    ) : (
                      <td key={c} className="border border-border-soft px-2 py-1 text-muted">
                        {cell === null ? "" : String(cell)}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-3 py-4 text-xs text-subtle">That range is empty.</p>
      )}
    </figure>
  );
}

/** Serialises the current values as static HTML, for "break link". */
export function rangeToStaticHtml(data: {
  columns: string[];
  rows: (string | number | boolean | null)[][];
}): string {
  const cell = (v: unknown) =>
    String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const rows = data.rows
    .map((row, r) =>
      `<tr>${row
        .map(v => (r === 0 ? `<th>${cell(v)}</th>` : `<td>${cell(v)}</td>`))
        .join("")}</tr>`,
    )
    .join("");
  return `<table>${rows}</table>`;
}
