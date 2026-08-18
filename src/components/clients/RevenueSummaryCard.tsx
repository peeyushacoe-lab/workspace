"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Briefcase, ArrowRight, AlertTriangle } from "lucide-react";
import { formatMoney } from "@/lib/clients";

type Summary = {
  byCurrency: { currency: string; billedMinor: number; paidMinor: number }[];
  overdueCount: number;
  clientCount: number;
};

// Rendered on /dashboard only for viewers holding `clients.finance.read` — the
// page checks that server-side before mounting this at all (see page.tsx), so
// this component never has to reason about who is allowed to see it.
export function RevenueSummaryCard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/clients/revenue-summary")
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then((data) => { if (!cancelled) setSummary(data); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  if (failed || (summary && summary.clientCount === 0)) return null;

  return (
    <div className="bg-surface rounded-xl border border-border p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-subtle" />
          <p className="text-[13px] font-medium text-muted">Client revenue</p>
        </div>
        <Link
          href="/clients"
          className="text-xs font-medium text-accent hover:text-accent-hover inline-flex items-center gap-1"
        >
          Client book
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {!summary ? (
        <div className="h-16 animate-pulse bg-surface-sunken rounded-lg" />
      ) : summary.byCurrency.length === 0 ? (
        <p className="text-[13px] text-muted">No fees recorded yet.</p>
      ) : (
        <div className="space-y-3">
          {/* One row per currency — never summed together, since a GBP total
              and an INR total are not the same number. See revenue-summary's
              route handler for the full reasoning. */}
          {summary.byCurrency.map((row) => (
            <div key={row.currency} className="flex items-center justify-between">
              <span className="text-xs font-medium text-subtle w-12">{row.currency}</span>
              <div className="flex-1 flex items-center justify-end gap-4 text-right">
                <div>
                  <p className="text-[10px] text-muted">Billed</p>
                  <p className="text-sm font-semibold text-foreground tabular-nums">
                    {formatMoney(row.billedMinor, row.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted">Received</p>
                  <p className="text-sm font-semibold text-ok tabular-nums">
                    {formatMoney(row.paidMinor, row.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted">Outstanding</p>
                  <p className="text-sm font-semibold text-warn tabular-nums">
                    {formatMoney(Math.max(0, row.billedMinor - row.paidMinor), row.currency)}
                  </p>
                </div>
              </div>
            </div>
          ))}
          {summary.overdueCount > 0 && (
            <div className="flex items-center gap-1.5 pt-2 border-t border-border-soft text-xs text-crit">
              <AlertTriangle className="h-3.5 w-3.5" />
              {summary.overdueCount} fee{summary.overdueCount === 1 ? "" : "s"} overdue
            </div>
          )}
        </div>
      )}
    </div>
  );
}
