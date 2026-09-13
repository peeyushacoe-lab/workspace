"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Download, Search, ArrowLeftRight } from "lucide-react";
import { iconSize } from "@/components/icons";
import { HOTEL_DEPARTMENTS, MOVEMENT_META, MOVEMENT_TYPES, labelOf, type MovementType } from "@/lib/hospitality/catalog";
import { HospPage, EmptyState, LoadingRows, api, formatQty, inputCls, outlineBtn, primaryBtn, chipCls } from "./ui";

type Movement = {
  id: string; type: MovementType; quantity: number; balance: number; reason: string | null;
  reference: string | null; department: string | null; createdAt: string; createdByName: string | null;
  item: { name: string; unit: string };
};

function csvCell(v: string | number | null) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function StockMovementsView() {
  const [rows, setRows] = useState<Movement[] | null>(null);
  const [type, setType] = useState<MovementType | "ALL">("ALL");
  const [q, setQ] = useState("");

  useEffect(() => {
    api<{ movements: Movement[] }>("/api/hospitality/inventory/movements")
      .then((d) => setRows(d.movements))
      .catch((e) => { toast.error(e instanceof Error ? e.message : "Couldn't load the ledger."); setRows([]); });
  }, []);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows ?? []).filter(
      (m) => (type === "ALL" || m.type === type) && (!term || m.item.name.toLowerCase().includes(term) || m.reference?.toLowerCase().includes(term)),
    );
  }, [rows, type, q]);

  const exportCsv = () => {
    const header = ["Date", "Item", "Type", "Quantity", "Unit", "Balance", "Department", "Reference", "Note", "By"];
    const lines = visible.map((m) =>
      [
        new Date(m.createdAt).toISOString(), m.item.name, MOVEMENT_META[m.type].label, m.quantity, m.item.unit, m.balance,
        m.department ? labelOf(HOTEL_DEPARTMENTS, m.department) : "", m.reference, m.reason, m.createdByName,
      ].map(csvCell).join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stock-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <HospPage
      title="Stock movements"
      description="The ledger behind every on-hand figure — receipts, issues, wastage and counts."
      action={
        <button onClick={exportCsv} disabled={!visible.length} className={outlineBtn}>
          <Download className={iconSize("sm")} /> Export CSV
        </button>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {(["ALL", ...MOVEMENT_TYPES] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors ${
              type === t ? "border-accent/40 bg-accent-soft text-accent-strong" : "border-border text-muted hover:bg-hover"
            }`}
          >
            {t === "ALL" ? "All" : MOVEMENT_META[t].label}
          </button>
        ))}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className={`${iconSize("sm")} pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle`} />
          <input id="ledger-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Item or reference" className={`${inputCls} pl-9`} />
        </div>
      </div>

      <div className="mt-4">
        {rows === null ? (
          <LoadingRows />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ArrowLeftRight}
            title="No stock movements yet"
            body="Receiving, issuing and counting stock from Inventory builds this ledger."
            action={<Link href="/hospitality/inventory" className={primaryBtn}>Go to inventory</Link>}
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[820px] text-left text-[13px]">
              <thead className="bg-surface-sunken text-xs font-medium text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">When</th>
                  <th className="px-3 py-2.5 font-medium">Item</th>
                  <th className="px-3 py-2.5 font-medium">Movement</th>
                  <th className="px-3 py-2.5 text-right font-medium">Quantity</th>
                  <th className="px-3 py-2.5 text-right font-medium">Balance</th>
                  <th className="px-3 py-2.5 font-medium">Details</th>
                  <th className="px-3 py-2.5 font-medium">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {visible.map((m) => (
                  <tr key={m.id} className="bg-surface">
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted">
                      {new Date(m.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-foreground">{m.item.name}</td>
                    <td className="px-3 py-2.5"><span className={`${chipCls} ${MOVEMENT_META[m.type].chip}`}>{MOVEMENT_META[m.type].label}</span></td>
                    <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${m.quantity >= 0 ? "text-ok" : "text-foreground"}`}>
                      {m.quantity >= 0 ? "+" : ""}{formatQty(m.quantity)} <span className="font-normal text-muted">{m.item.unit}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted">{formatQty(m.balance)}</td>
                    <td className="px-3 py-2.5 text-muted">
                      {[m.department && labelOf(HOTEL_DEPARTMENTS, m.department), m.reference, m.reason].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-muted">{m.createdByName ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </HospPage>
  );
}
