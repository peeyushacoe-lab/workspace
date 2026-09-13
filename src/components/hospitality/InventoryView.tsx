"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Package, Plus, Search, ArrowDownToLine, ArrowUpFromLine, Trash2, Pencil, History, Ban, ClipboardList,
} from "lucide-react";
import { iconSize } from "@/components/icons";
import {
  INVENTORY_CATEGORIES, STOCK_UNITS, HOTEL_DEPARTMENTS, MOVEMENT_META, labelOf,
  type MovementType, type StockState,
} from "@/lib/hospitality/catalog";
import {
  HospPage, Modal, Field, EmptyState, LoadingRows, api, notifyShell, readQuery, relTime,
  formatMoney, formatQty, inputCls, primaryBtn, outlineBtn, ghostBtn, chipCls,
} from "./ui";
import { useHotelTeam } from "./useHotelTeam";

type Item = {
  id: string; name: string; sku: string | null; category: string; unit: string;
  quantity: number; parLevel: number; reorderPoint: number; unitCost: number | null;
  supplier: string | null; location: string | null; state: StockState;
};

const STATE_CHIP: Record<StockState, { label: string; cls: string }> = {
  ok: { label: "In stock", cls: "bg-ok-soft text-ok border-ok/25" },
  low: { label: "Low", cls: "bg-warn-soft text-warn border-warn/25" },
  out: { label: "Out", cls: "bg-crit-soft text-crit border-crit/25" },
};

export function InventoryView() {
  const team = useHotelTeam();
  const isManager = team?.isManager ?? false;
  const [items, setItems] = useState<Item[] | null>(null);
  const [currency, setCurrency] = useState("GBP");
  const [category, setCategory] = useState<string>("all");
  const [stateFilter, setStateFilter] = useState<"all" | "low">("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [moving, setMoving] = useState<{ type: MovementType; item: Item | null } | null>(null);
  const [history, setHistory] = useState<Item | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<{ items: Item[]; currency: string }>("/api/hospitality/inventory");
      setItems(d.items);
      setCurrency(d.currency);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load inventory.");
      setItems([]);
    }
  }, []);

  useEffect(() => {
    load();
    if (readQuery("add")) setEditing("new");
    if (readQuery("action") === "receive") setMoving({ type: "IN", item: null });
    if (readQuery("state") === "low") setStateFilter("low");
  }, [load]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (items ?? []).filter(
      (i) =>
        (category === "all" || i.category === category) &&
        (stateFilter === "all" || i.state !== "ok") &&
        (!term || i.name.toLowerCase().includes(term) || i.sku?.toLowerCase().includes(term) || i.supplier?.toLowerCase().includes(term)),
    );
  }, [items, category, stateFilter, q]);

  const stats = useMemo(() => {
    const list = items ?? [];
    return {
      skus: list.length,
      low: list.filter((i) => i.state === "low").length,
      out: list.filter((i) => i.state === "out").length,
      value: list.reduce((s, i) => s + (i.unitCost ?? 0) * Math.max(i.quantity, 0), 0),
    };
  }, [items]);

  const archive = async (item: Item) => {
    if (!window.confirm(`Archive ${item.name}? Its movement history is kept.`)) return;
    try {
      await api(`/api/hospitality/inventory/${item.id}`, { method: "DELETE" });
      toast.success(`${item.name} archived`);
      await load();
      notifyShell();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't archive the item.");
    }
  };

  return (
    <HospPage
      title="Inventory"
      description="Stores, linen, amenities and minibar. Every change is recorded in the stock ledger."
      action={
        <>
          <Link href="/hospitality/inventory/movements" className={outlineBtn}>
            <ClipboardList className={iconSize("sm")} /> Ledger
          </Link>
          <button onClick={() => setMoving({ type: "OUT", item: null })} className={outlineBtn} disabled={!items?.length}>
            <ArrowUpFromLine className={iconSize("sm")} /> Issue
          </button>
          <button onClick={() => setMoving({ type: "IN", item: null })} className={outlineBtn} disabled={!items?.length}>
            <ArrowDownToLine className={iconSize("sm")} /> Receive
          </button>
          {isManager && (
            <button onClick={() => setEditing("new")} className={primaryBtn}>
              <Plus className={iconSize("sm")} /> Add item
            </button>
          )}
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Items", value: String(stats.skus), tone: "text-foreground" },
          { label: "Low stock", value: String(stats.low), tone: stats.low ? "text-warn" : "text-foreground" },
          { label: "Out of stock", value: String(stats.out), tone: stats.out ? "text-crit" : "text-foreground" },
          { label: "Value on hand", value: formatMoney(stats.value, currency), tone: "text-foreground" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-surface px-4 py-3">
            <p className="text-xs font-medium text-muted">{s.label}</p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${s.tone}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className={`${inputCls} w-auto`}>
          <option value="all">All categories</option>
          {INVENTORY_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <div className="flex rounded-lg bg-surface-sunken p-1">
          {(["all", "low"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStateFilter(s)}
              className={`rounded-md px-3 py-1 text-[12.5px] font-medium transition-colors ${stateFilter === s ? "bg-surface text-foreground shadow-sm" : "text-muted"}`}
            >
              {s === "all" ? "Everything" : "Needs reorder"}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className={`${iconSize("sm")} pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle`} />
          <input id="stock-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Item, SKU or supplier" className={`${inputCls} pl-9`} />
        </div>
      </div>

      <div className="mt-4">
        {items === null ? (
          <LoadingRows />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No stock items yet"
            body={isManager ? "Add the items you keep in stores — each with a par level and a reorder point." : "Your manager hasn't added stock items yet."}
            action={isManager && <button onClick={() => setEditing("new")} className={primaryBtn}><Plus className={iconSize("sm")} /> Add item</button>}
          />
        ) : visible.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-subtle">No items match.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead className="bg-surface-sunken text-xs font-medium text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Item</th>
                  <th className="px-3 py-2.5 font-medium">Category</th>
                  <th className="px-3 py-2.5 font-medium">On hand</th>
                  <th className="px-3 py-2.5 text-right font-medium">Reorder at</th>
                  <th className="px-3 py-2.5 text-right font-medium">Par</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {visible.map((i) => {
                  const pct = Math.min(100, (i.quantity / Math.max(i.parLevel, i.reorderPoint, 1)) * 100);
                  return (
                    <tr key={i.id} className="bg-surface hover:bg-hover">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-foreground">{i.name}</p>
                        <p className="text-[11.5px] text-subtle">{[i.sku, i.location, i.supplier].filter(Boolean).join(" · ") || "—"}</p>
                      </td>
                      <td className="px-3 py-2.5 text-muted">{labelOf(INVENTORY_CATEGORIES, i.category)}</td>
                      <td className="px-3 py-2.5">
                        <p className="font-semibold tabular-nums text-foreground">{formatQty(i.quantity)} <span className="font-normal text-muted">{i.unit}</span></p>
                        <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-surface-sunken">
                          <div className={`h-full rounded-full ${i.state === "out" ? "bg-crit" : i.state === "low" ? "bg-warn" : "bg-ok"}`} style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted">{formatQty(i.reorderPoint)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted">{formatQty(i.parLevel)}</td>
                      <td className="px-3 py-2.5"><span className={`${chipCls} ${STATE_CHIP[i.state].cls}`}>{STATE_CHIP[i.state].label}</span></td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-0.5">
                          <button onClick={() => setMoving({ type: "IN", item: i })} title="Receive" aria-label={`Receive ${i.name}`} className={ghostBtn}>
                            <ArrowDownToLine className={iconSize("sm")} />
                          </button>
                          <button onClick={() => setMoving({ type: "OUT", item: i })} title="Issue" aria-label={`Issue ${i.name}`} className={ghostBtn} disabled={i.quantity <= 0}>
                            <ArrowUpFromLine className={iconSize("sm")} />
                          </button>
                          <button onClick={() => setMoving({ type: "WASTE", item: i })} title="Record wastage" aria-label={`Record wastage of ${i.name}`} className={ghostBtn} disabled={i.quantity <= 0}>
                            <Ban className={iconSize("sm")} />
                          </button>
                          <button onClick={() => setHistory(i)} title="History" aria-label={`History for ${i.name}`} className={ghostBtn}>
                            <History className={iconSize("sm")} />
                          </button>
                          {isManager && (
                            <>
                              <button onClick={() => setEditing(i)} title="Edit" aria-label={`Edit ${i.name}`} className={ghostBtn}>
                                <Pencil className={iconSize("sm")} />
                              </button>
                              <button onClick={() => archive(i)} title="Archive" aria-label={`Archive ${i.name}`} className={`${ghostBtn} hover:text-crit`}>
                                <Trash2 className={iconSize("sm")} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <ItemModal
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); notifyShell(); }}
        />
      )}
      {moving && (
        <MovementModal
          type={moving.type}
          item={moving.item}
          items={items ?? []}
          isManager={isManager}
          onClose={() => setMoving(null)}
          onSaved={async () => { setMoving(null); await load(); notifyShell(); }}
        />
      )}
      {history && <HistoryModal item={history} onClose={() => setHistory(null)} />}
    </HospPage>
  );
}

function ItemModal({ item, onClose, onSaved }: { item: Item | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({
    name: item?.name ?? "",
    category: item?.category ?? "linen",
    unit: item?.unit ?? "pcs",
    sku: item?.sku ?? "",
    quantity: "",
    parLevel: item ? String(item.parLevel) : "",
    reorderPoint: item ? String(item.reorderPoint) : "",
    unitCost: item?.unitCost != null ? String(item.unitCost) : "",
    supplier: item?.supplier ?? "",
    location: item?.location ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (item) {
        const { quantity: _q, ...rest } = form;
        await api(`/api/hospitality/inventory/${item.id}`, { method: "PATCH", json: rest });
        toast.success(`${form.name} updated`);
      } else {
        await api("/api/hospitality/inventory", { method: "POST", json: form });
        toast.success(`${form.name} added`);
      }
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the item.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={item ? `Edit ${item.name}` : "Add stock item"}
      description={item ? "On-hand quantity changes through Receive, Issue or a stock count." : "Par is what you aim to hold; reorder point is when to buy more."}
      footer={
        <>
          <button onClick={onClose} className={outlineBtn}>Cancel</button>
          <button form="item-form" type="submit" disabled={saving} className={primaryBtn}>{saving ? "Saving…" : item ? "Save changes" : "Add item"}</button>
        </>
      }
    >
      <form id="item-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Item name" htmlFor="item-name">
            <input id="item-name" value={form.name} onChange={set("name")} placeholder="e.g. Bath towel, white" className={inputCls} required />
          </Field>
        </div>
        <Field label="Category" htmlFor="item-category">
          <select id="item-category" value={form.category} onChange={set("category")} className={inputCls}>
            {INVENTORY_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Unit" htmlFor="item-unit">
          <select id="item-unit" value={form.unit} onChange={set("unit")} className={inputCls}>
            {STOCK_UNITS.map((u) => <option key={u}>{u}</option>)}
          </select>
        </Field>
        {!item && (
          <Field label="Opening quantity" htmlFor="item-qty" hint="Recorded as a receipt in the ledger.">
            <input id="item-qty" type="number" min="0" step="any" value={form.quantity} onChange={set("quantity")} placeholder="0" className={inputCls} />
          </Field>
        )}
        <Field label="SKU / code (optional)" htmlFor="item-sku">
          <input id="item-sku" value={form.sku} onChange={set("sku")} className={inputCls} />
        </Field>
        <Field label="Par level" htmlFor="item-par">
          <input id="item-par" type="number" min="0" step="any" value={form.parLevel} onChange={set("parLevel")} placeholder="0" className={inputCls} />
        </Field>
        <Field label="Reorder point" htmlFor="item-reorder">
          <input id="item-reorder" type="number" min="0" step="any" value={form.reorderPoint} onChange={set("reorderPoint")} placeholder="0" className={inputCls} />
        </Field>
        <Field label="Unit cost (optional)" htmlFor="item-cost">
          <input id="item-cost" type="number" min="0" step="any" value={form.unitCost} onChange={set("unitCost")} className={inputCls} />
        </Field>
        <Field label="Supplier (optional)" htmlFor="item-supplier">
          <input id="item-supplier" value={form.supplier} onChange={set("supplier")} className={inputCls} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Location (optional)" htmlFor="item-location" hint="Store room, outlet or floor pantry.">
            <input id="item-location" value={form.location} onChange={set("location")} className={inputCls} />
          </Field>
        </div>
      </form>
    </Modal>
  );
}

function MovementModal({
  type: initialType, item, items, isManager, onClose, onSaved,
}: {
  type: MovementType; item: Item | null; items: Item[]; isManager: boolean;
  onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [type, setType] = useState<MovementType>(initialType);
  const [itemId, setItemId] = useState(item?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [department, setDepartment] = useState("");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const current = items.find((i) => i.id === itemId) ?? null;
  const types = (["IN", "OUT", "WASTE", ...(isManager ? ["ADJUST"] : [])] as MovementType[]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api<{ balance: number }>("/api/hospitality/inventory/movements", {
        method: "POST",
        json: { itemId, type, quantity, department, reference, reason },
      });
      toast.success(`${current?.name ?? "Item"}: ${formatQty(res.balance)} ${current?.unit ?? ""} on hand`);
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't record the movement.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={MOVEMENT_META[type].verb}
      description={current ? `${formatQty(current.quantity)} ${current.unit} of ${current.name} on hand` : "Choose the item first."}
      footer={
        <>
          <button onClick={onClose} className={outlineBtn}>Cancel</button>
          <button form="move-form" type="submit" disabled={saving || !itemId || !quantity} className={primaryBtn}>{saving ? "Saving…" : "Record"}</button>
        </>
      }
    >
      <form id="move-form" onSubmit={submit} className="space-y-4">
        <div className="flex flex-wrap gap-1 rounded-lg bg-surface-sunken p-1">
          {types.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`flex-1 rounded-md px-2 py-1.5 text-[12.5px] font-medium transition-colors ${type === t ? "bg-surface text-foreground shadow-sm" : "text-muted"}`}
            >
              {MOVEMENT_META[t].label}
            </button>
          ))}
        </div>
        <Field label="Item" htmlFor="move-item">
          <select id="move-item" value={itemId} onChange={(e) => setItemId(e.target.value)} className={inputCls} required>
            <option value="">Choose an item…</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({formatQty(i.quantity)} {i.unit})</option>)}
          </select>
        </Field>
        <Field
          label={type === "ADJUST" ? "Counted on hand" : "Quantity"}
          htmlFor="move-qty"
          hint={type === "ADJUST" ? "The physical count. The difference is recorded as the adjustment." : undefined}
        >
          <input id="move-qty" type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputCls} required />
        </Field>
        {type === "OUT" && (
          <Field label="Issued to" htmlFor="move-dept">
            <select id="move-dept" value={department} onChange={(e) => setDepartment(e.target.value)} className={inputCls}>
              <option value="">No department</option>
              {HOTEL_DEPARTMENTS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          </Field>
        )}
        {type === "IN" && (
          <Field label="PO / delivery note (optional)" htmlFor="move-ref">
            <input id="move-ref" value={reference} onChange={(e) => setReference(e.target.value)} className={inputCls} />
          </Field>
        )}
        <Field label="Note (optional)" htmlFor="move-reason">
          <input id="move-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={type === "WASTE" ? "e.g. stained beyond repair" : ""} className={inputCls} />
        </Field>
      </form>
    </Modal>
  );
}

type Movement = {
  id: string; type: MovementType; quantity: number; balance: number; reason: string | null;
  reference: string | null; department: string | null; createdAt: string; createdByName: string | null;
};

function HistoryModal({ item, onClose }: { item: Item; onClose: () => void }) {
  const [rows, setRows] = useState<Movement[] | null>(null);
  useEffect(() => {
    api<{ movements: Movement[] }>(`/api/hospitality/inventory/movements?itemId=${item.id}`)
      .then((d) => setRows(d.movements))
      .catch(() => setRows([]));
  }, [item.id]);

  return (
    <Modal open wide onClose={onClose} title={item.name} description={`${formatQty(item.quantity)} ${item.unit} on hand · last 100 movements`}>
      {rows === null ? (
        <LoadingRows rows={3} />
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-subtle">No movements yet.</p>
      ) : (
        <ul className="divide-y divide-border-soft">
          {rows.map((m) => (
            <li key={m.id} className="flex items-start gap-3 py-2.5">
              <span className={`${chipCls} mt-0.5 ${MOVEMENT_META[m.type].chip}`}>{MOVEMENT_META[m.type].label}</span>
              <span className="min-w-0 flex-1 text-[12.5px] text-muted">
                {[m.department && labelOf(HOTEL_DEPARTMENTS, m.department), m.reference, m.reason, m.createdByName].filter(Boolean).join(" · ") || "—"}
                <span className="block text-[11.5px] text-subtle">{relTime(m.createdAt)}</span>
              </span>
              <span className="text-right">
                <span className={`block text-[13px] font-semibold tabular-nums ${m.quantity >= 0 ? "text-ok" : "text-foreground"}`}>
                  {m.quantity >= 0 ? "+" : ""}{formatQty(m.quantity)}
                </span>
                <span className="block text-[11.5px] tabular-nums text-subtle">= {formatQty(m.balance)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
