"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2, X, Plus, Package, Receipt, MessageSquarePlus,
  ShieldQuestion, Check, Eye, Lock,
} from "lucide-react";
import { toast } from "sonner";
import {
  CLIENT_STATUS_LABELS, CLIENT_STATUS_TONE,
  DELIVERABLE_STATUS_LABELS, DELIVERABLE_STATUS_TONE,
  FEE_KIND_LABELS, FEE_STATUS_LABELS, FEE_STATUS_TONE,
  REQUEST_STATUS_LABELS, REQUEST_STATUS_TONE,
  REQUEST_PRIORITY_LABELS, REQUEST_PRIORITY_TONE,
  formatMoney,
} from "@/lib/clients";
import type {
  ClientRequest, ClientRights, Deliverable, Fee, UserLite, Viewer,
} from "./types";

const inputClass =
  "w-full px-3 py-2 bg-surface-sunken border border-border rounded-lg text-sm text-foreground " +
  "placeholder:text-subtle focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-colors";
const primaryBtn =
  "px-4 py-2 text-sm font-semibold rounded-lg bg-accent text-accent-foreground hover:bg-accent-hover transition-colors disabled:opacity-50";
const ghostBtn =
  "px-3 py-1.5 text-[13px] font-medium rounded-md text-muted hover:text-foreground hover:bg-hover transition-colors";

function Chip({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${tone}`}>
      {children}
    </span>
  );
}

function fmtDate(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

type ClientFull = {
  id: string;
  name: string;
  legalName?: string | null;
  region?: string | null;
  industry?: string | null;
  website?: string | null;
  status: keyof typeof CLIENT_STATUS_LABELS;
  currency: string;
  startedAt?: string | null;
  notes?: string | null;
  primaryContactName?: string | null;
  primaryContactEmail?: string | null;
  primaryContactPhone?: string | null;
  owner?: UserLite | null;
  deliverables: Deliverable[];
  requests: ClientRequest[];
};

type Tab = "overview" | "deliverables" | "fees" | "requests";

export function ClientDetail({
  clientId, viewer, initialTab, onClose, onChanged,
}: {
  clientId: string;
  viewer: Viewer;
  /** Which tab to open on — "requests" when a row is opened from the cross-client inbox. */
  initialTab?: "overview" | "requests";
  onClose: () => void;
  onChanged: () => void;
}) {
  const [client, setClient] = useState<ClientFull | null>(null);
  const [fees, setFees] = useState<Fee[] | null>(null);
  const [rights, setRights] = useState<ClientRights | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab ?? "overview");
  const [loading, setLoading] = useState(true);
  const [raising, setRaising] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not load client");
      const data = await res.json();
      setClient(data.client);
      setFees(data.fees);
      setRights(data.rights);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load client");
      onClose();
    } finally {
      setLoading(false);
    }
  }, [clientId, onClose]);

  useEffect(() => { load(); }, [load]);

  if (loading || !client || !rights) {
    return (
      <Shell title="Loading…" onClose={onClose}>
        <div className="flex items-center justify-center py-16 text-muted">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      </Shell>
    );
  }

  const openRequests = client.requests.filter(
    (r) => r.status === "OPEN" || r.status === "ACKNOWLEDGED",
  ).length;

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "deliverables", label: "Deliverables", count: client.deliverables.length },
    ...(rights.canSeeMoney ? [{ key: "fees" as Tab, label: "Fees", count: fees?.length ?? 0 }] : []),
    { key: "requests", label: "Requests", count: openRequests },
  ];

  return (
    <Shell
      title={client.name}
      onClose={onClose}
      subtitle={
        <div className="flex items-center gap-2 flex-wrap mt-1">
          <Chip tone={CLIENT_STATUS_TONE[client.status]}>{CLIENT_STATUS_LABELS[client.status]}</Chip>
          {client.region && <span className="text-[11px] text-subtle">{client.region}</span>}
          <span className="text-[11px] text-subtle">
            {client.owner ? `Owned by ${client.owner.fullName}` : "Unassigned"}
          </span>
          {rights.isReadOnly && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted">
              <Eye className="w-3 h-3" /> View only
            </span>
          )}
        </div>
      }
      action={
        <button className={primaryBtn} onClick={() => setRaising(true)}>
          <MessageSquarePlus className="w-4 h-4 inline mr-1.5 -mt-0.5" />
          Raise a request
        </button>
      }
    >
      {/* Read-only viewers get told what to do instead of what they cannot do. */}
      {rights.isReadOnly && (
        <div className="flex items-start gap-2.5 px-3 py-2.5 mb-4 rounded-lg bg-accent-soft border border-accent/20">
          <ShieldQuestion className="w-4 h-4 text-accent-strong flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-accent-strong">
            You have full visibility of this client but cannot change it. Raise a request and it
            goes to{" "}
            {client.owner ? <strong>{client.owner.fullName}</strong> : "the Operations Manager"}
            {client.owner ? ", copied to the Operations Manager" : ""}.
          </p>
        </div>
      )}

      <div className="flex items-center gap-1 border-b border-border-soft mb-4 -mx-5 px-5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="ml-1.5 text-[11px] text-subtle">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "overview" && <Overview client={client} />}
      {tab === "deliverables" && (
        <Deliverables
          client={client}
          rights={rights}
          onChanged={() => { load(); onChanged(); }}
        />
      )}
      {tab === "fees" && rights.canSeeMoney && (
        <Fees
          clientId={client.id}
          currency={client.currency}
          fees={fees ?? []}
          deliverables={client.deliverables}
          rights={rights}
          onChanged={() => { load(); onChanged(); }}
        />
      )}
      {tab === "requests" && (
        <Requests
          client={client}
          rights={rights}
          viewer={viewer}
          onChanged={load}
        />
      )}

      {raising && (
        <RaiseRequestDialog
          clientId={client.id}
          clientName={client.name}
          ownerName={client.owner?.fullName ?? null}
          deliverables={client.deliverables}
          onClose={() => setRaising(false)}
          onRaised={() => { setRaising(false); setTab("requests"); load(); }}
        />
      )}
    </Shell>
  );
}

function Shell({
  title, subtitle, action, onClose, children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-panel shadow-pop w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between px-5 py-4 border-b border-border-soft">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground tracking-tight truncate">{title}</h2>
            {subtitle}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-4">
            {action}
            <button onClick={onClose} className={ghostBtn} aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function Overview({ client }: { client: ClientFull }) {
  const rows: [string, React.ReactNode][] = [
    ["Legal name", client.legalName ?? "—"],
    ["Region", client.region ?? "—"],
    ["Industry", client.industry ?? "—"],
    ["Currency", client.currency],
    ["Client since", fmtDate(client.startedAt)],
    ["Contact", client.primaryContactName ?? "—"],
    ["Contact email", client.primaryContactEmail ?? "—"],
    ["Contact phone", client.primaryContactPhone ?? "—"],
  ];
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {rows.map(([label, value]) => (
          <div key={label}>
            <p className="text-xs font-medium text-muted mb-0.5">{label}</p>
            <p className="text-sm text-foreground break-words">{value}</p>
          </div>
        ))}
      </div>
      {client.notes && (
        <div className="mt-5">
          <p className="text-xs font-medium text-muted mb-1">Notes</p>
          <p className="text-sm text-foreground whitespace-pre-wrap">{client.notes}</p>
        </div>
      )}
    </div>
  );
}

// ─── Deliverables ─────────────────────────────────────────────────────────────

function Deliverables({
  client, rights, onChanged,
}: { client: ClientFull; rights: ClientRights; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${client.id}/deliverables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, dueDate: dueDate || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not add deliverable");
      toast.success("Deliverable added");
      setTitle(""); setDueDate(""); setAdding(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add deliverable");
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(id: string, status: string) {
    try {
      const res = await fetch(`/api/clients/deliverables/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not update");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update");
    }
  }

  return (
    <div>
      {rights.canEdit && (
        <div className="mb-4">
          {adding ? (
            <form onSubmit={add} className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="text-xs font-medium text-muted">What are we delivering?</label>
                <input
                  autoFocus required value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={inputClass} placeholder="Q3 penetration test report"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted">Due</label>
                <input
                  type="date" value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <button type="submit" disabled={saving || !title} className={primaryBtn}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
              </button>
              <button type="button" onClick={() => setAdding(false)} className={ghostBtn}>Cancel</button>
            </form>
          ) : (
            <button onClick={() => setAdding(true)} className={ghostBtn}>
              <Plus className="w-4 h-4 inline mr-1 -mt-0.5" />
              Add deliverable
            </button>
          )}
        </div>
      )}

      {client.deliverables.length === 0 ? (
        <Empty icon={Package} label="Nothing scheduled for this client yet." />
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          {client.deliverables.map((d, i) => (
            <div
              key={d.id}
              className={`px-4 py-3 flex items-center gap-3 ${i > 0 ? "border-t border-border-soft" : ""}`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{d.title}</p>
                <p className="text-xs text-muted mt-0.5">
                  Due {fmtDate(d.dueDate)}
                  {d.owner ? ` · ${d.owner.fullName}` : ""}
                </p>
              </div>
              {rights.canEdit ? (
                <select
                  value={d.status}
                  onChange={(e) => setStatus(d.id, e.target.value)}
                  className="px-2 py-1 text-xs bg-surface-sunken border border-border rounded-md text-foreground focus:outline-none focus:border-accent/60"
                >
                  {Object.entries(DELIVERABLE_STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              ) : (
                <Chip tone={DELIVERABLE_STATUS_TONE[d.status]}>
                  {DELIVERABLE_STATUS_LABELS[d.status]}
                </Chip>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Fees ─────────────────────────────────────────────────────────────────────

function Fees({
  clientId, currency, fees, deliverables, rights, onChanged,
}: {
  clientId: string;
  currency: string;
  fees: Fee[];
  deliverables: Deliverable[];
  rights: ClientRights;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ description: "", amount: "", kind: "PROJECT", dueAt: "", deliverableId: "" });
  const [saving, setSaving] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");

  const billed = fees.filter((f) => f.status !== "WRITTEN_OFF").reduce((a, f) => a + f.amountMinor, 0);
  const paid = fees.filter((f) => f.status !== "WRITTEN_OFF").reduce((a, f) => a + f.paidMinor, 0);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/fees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: form.description,
          amount: form.amount,
          kind: form.kind,
          currency,
          dueAt: form.dueAt || undefined,
          deliverableId: form.deliverableId || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not add fee");
      toast.success("Fee recorded");
      setForm({ description: "", amount: "", kind: "PROJECT", dueAt: "", deliverableId: "" });
      setAdding(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add fee");
    } finally {
      setSaving(false);
    }
  }

  async function confirmPayment(feeId: string) {
    try {
      const res = await fetch(`/api/clients/fees/${feeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paidAmount: payAmount }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not record payment");
      toast.success("Payment recorded");
      setPayingId(null); setPayAmount("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not record payment");
    }
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat label="Billed" value={formatMoney(billed, currency)} />
        <Stat label="Received" value={formatMoney(paid, currency)} tone="text-ok" />
        <Stat label="Outstanding" value={formatMoney(Math.max(0, billed - paid), currency)} tone="text-warn" />
      </div>

      {(rights.canEdit || rights.canManageMoney) && (
        <div className="mb-4">
          {adding ? (
            <form onSubmit={add} className="space-y-2 p-3 bg-surface-sunken rounded-lg border border-border">
              <div className="flex flex-wrap gap-2">
                <div className="flex-1 min-w-[180px]">
                  <label className="text-xs font-medium text-muted">Description</label>
                  <input
                    autoFocus required value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className={inputClass} placeholder="Retainer — Q3"
                  />
                </div>
                <div className="w-32">
                  <label className="text-xs font-medium text-muted">Amount ({currency})</label>
                  <input
                    required inputMode="decimal" value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className={inputClass} placeholder="2500.00"
                  />
                </div>
                <div className="w-36">
                  <label className="text-xs font-medium text-muted">Kind</label>
                  <select
                    value={form.kind}
                    onChange={(e) => setForm({ ...form, kind: e.target.value })}
                    className={inputClass}
                  >
                    {Object.entries(FEE_KIND_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div className="w-40">
                  <label className="text-xs font-medium text-muted">Due</label>
                  <input
                    type="date" value={form.dueAt}
                    onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
              {deliverables.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-muted">Against deliverable (optional)</label>
                  <select
                    value={form.deliverableId}
                    onChange={(e) => setForm({ ...form, deliverableId: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">—</option>
                    {deliverables.map((d) => (
                      <option key={d.id} value={d.id}>{d.title}</option>
                    ))}
                  </select>
                </div>
              )}
              {!rights.canManageMoney && (
                <p className="text-xs text-muted">
                  This saves as a draft. Finance raises the invoice and confirms payment.
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setAdding(false)} className={ghostBtn}>Cancel</button>
                <button type="submit" disabled={saving || !form.description || !form.amount} className={primaryBtn}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Record fee"}
                </button>
              </div>
            </form>
          ) : (
            <button onClick={() => setAdding(true)} className={ghostBtn}>
              <Plus className="w-4 h-4 inline mr-1 -mt-0.5" />
              Record a fee
            </button>
          )}
        </div>
      )}

      {fees.length === 0 ? (
        <Empty icon={Receipt} label="No fees recorded against this client." />
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          {fees.map((f, i) => (
            <div key={f.id} className={`px-4 py-3 ${i > 0 ? "border-t border-border-soft" : ""}`}>
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground truncate">{f.description}</span>
                    <Chip tone={FEE_STATUS_TONE[f.status]}>{FEE_STATUS_LABELS[f.status]}</Chip>
                  </div>
                  <p className="text-xs text-muted mt-0.5">
                    {FEE_KIND_LABELS[f.kind]}
                    {f.dueAt ? ` · due ${fmtDate(f.dueAt)}` : ""}
                    {f.invoiceRef ? ` · ${f.invoiceRef}` : ""}
                    {f.confirmedBy ? ` · confirmed by ${f.confirmedBy.fullName}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-foreground">
                    {formatMoney(f.amountMinor, f.currency)}
                  </p>
                  {f.paidMinor > 0 && f.paidMinor < f.amountMinor && (
                    <p className="text-[11px] text-warn">
                      {formatMoney(f.amountMinor - f.paidMinor, f.currency)} outstanding
                    </p>
                  )}
                </div>
                {rights.canManageMoney && f.status !== "PAID" && f.status !== "WRITTEN_OFF" && (
                  <button
                    onClick={() => {
                      setPayingId(f.id);
                      setPayAmount(((f.amountMinor - f.paidMinor) / 100).toFixed(2));
                    }}
                    className={ghostBtn}
                    title="Confirm payment received"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                )}
              </div>
              {payingId === f.id && (
                <div className="flex items-end gap-2 mt-2 pt-2 border-t border-border-soft">
                  <div className="w-36">
                    <label className="text-xs font-medium text-muted">Total received</label>
                    <input
                      autoFocus inputMode="decimal" value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <button onClick={() => confirmPayment(f.id)} className={primaryBtn}>Confirm</button>
                  <button onClick={() => setPayingId(null)} className={ghostBtn}>Cancel</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!rights.canManageMoney && (
        <p className="flex items-center gap-1.5 text-xs text-muted mt-3">
          <Lock className="w-3.5 h-3.5" />
          Only Finance can raise invoices and confirm payments received.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-surface-sunken border border-border rounded-lg p-3">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`text-base font-semibold tracking-tight mt-0.5 ${tone ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}

function Empty({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon className="w-6 h-6 text-subtle mb-2" />
      <p className="text-[13px] text-muted">{label}</p>
    </div>
  );
}

// ─── Requests ─────────────────────────────────────────────────────────────────

function Requests({
  client, rights, viewer, onChanged,
}: {
  client: ClientFull;
  rights: ClientRights;
  viewer: Viewer;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reply, setReply] = useState<Record<string, string>>({});

  async function patch(id: string, payload: Record<string, unknown>) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/clients/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not update request");
      setReply((r) => ({ ...r, [id]: "" }));
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update request");
    } finally {
      setBusyId(null);
    }
  }

  if (client.requests.length === 0) {
    return <Empty icon={MessageSquarePlus} label="No requests have been raised on this client." />;
  }

  return (
    <div className="space-y-3">
      {client.requests.map((r) => {
        const isRaiser = r.raisedBy.id === viewer.id;
        const open = r.status === "OPEN" || r.status === "ACKNOWLEDGED";
        return (
          <div key={r.id} className="border border-border rounded-xl p-4">
            <div className="flex items-start gap-2 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground">{r.subject}</span>
                  <Chip tone={REQUEST_STATUS_TONE[r.status]}>{REQUEST_STATUS_LABELS[r.status]}</Chip>
                  {r.priority !== "NORMAL" && (
                    <Chip tone={REQUEST_PRIORITY_TONE[r.priority]}>
                      {REQUEST_PRIORITY_LABELS[r.priority]}
                    </Chip>
                  )}
                </div>
                <p className="text-xs text-muted mt-0.5">
                  {r.raisedBy.fullName} · {fmtDate(r.createdAt)}
                  {r.assignedTo ? ` → ${r.assignedTo.fullName}` : " → unassigned"}
                </p>
              </div>
            </div>

            <p className="text-[13px] text-foreground whitespace-pre-wrap mt-2">{r.body}</p>

            {r.comments.length > 0 && (
              <div className="mt-3 space-y-2 pl-3 border-l-2 border-border-soft">
                {r.comments.map((c) => (
                  <div key={c.id}>
                    <p className="text-xs text-muted">
                      <span className="font-medium text-foreground">{c.author.fullName}</span>
                      {" · "}{fmtDate(c.createdAt)}
                    </p>
                    <p className="text-[13px] text-foreground whitespace-pre-wrap">{c.body}</p>
                  </div>
                ))}
              </div>
            )}

            {r.resolutionNote && (
              <div className="mt-3 px-3 py-2 rounded-lg bg-ok-soft border border-ok/20">
                <p className="text-[13px] text-foreground">
                  <strong>{r.resolvedBy?.fullName ?? "Owner"}:</strong> {r.resolutionNote}
                </p>
              </div>
            )}

            {open && (
              <div className="flex flex-wrap items-end gap-2 mt-3 pt-3 border-t border-border-soft">
                <div className="flex-1 min-w-[200px]">
                  <input
                    value={reply[r.id] ?? ""}
                    onChange={(e) => setReply({ ...reply, [r.id]: e.target.value })}
                    placeholder="Reply…"
                    className={inputClass}
                  />
                </div>
                <button
                  disabled={busyId === r.id || !(reply[r.id] ?? "").trim()}
                  onClick={() => patch(r.id, { comment: reply[r.id] })}
                  className={ghostBtn}
                >
                  Reply
                </button>
                {/* Only the owner resolves. The raiser may withdraw — see the API. */}
                {rights.canEdit && (
                  <button
                    disabled={busyId === r.id}
                    onClick={() => patch(r.id, { status: "RESOLVED", resolutionNote: reply[r.id] })}
                    className={primaryBtn}
                  >
                    {busyId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Resolve"}
                  </button>
                )}
                {isRaiser && !rights.canEdit && (
                  <button
                    disabled={busyId === r.id}
                    onClick={() => patch(r.id, { status: "DECLINED" })}
                    className={ghostBtn}
                  >
                    Withdraw
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RaiseRequestDialog({
  clientId, clientName, ownerName, deliverables, onClose, onRaised,
}: {
  clientId: string;
  clientName: string;
  ownerName: string | null;
  deliverables: Deliverable[];
  onClose: () => void;
  onRaised: () => void;
}) {
  const [form, setForm] = useState({ subject: "", body: "", priority: "NORMAL", deliverableId: "" });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: form.subject,
          body: form.body,
          priority: form.priority,
          deliverableId: form.deliverableId || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not raise request");
      const data = await res.json();
      toast.success(
        data.notified > 0
          ? `Request sent to ${ownerName ?? "the Operations Manager"}`
          : "Request raised",
      );
      onRaised();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not raise request");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-overlay backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-panel shadow-pop w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-soft">
          <h2 className="text-base font-semibold text-foreground tracking-tight">
            Raise a request
          </h2>
          <button onClick={onClose} className={ghostBtn} aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <p className="text-[13px] text-muted">
            Goes to <strong className="text-foreground">{ownerName ?? "the Operations Manager"}</strong>
            {ownerName ? ", copied to the Operations Manager" : ""}. {clientName} is not changed until
            they action it.
          </p>
          <div>
            <label className="text-xs font-medium text-muted">Subject</label>
            <input
              autoFocus required value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className={inputClass} placeholder="Confirm the Q3 retainer uplift"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted">Detail</label>
            <textarea
              required rows={4} value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              className={inputClass} placeholder="What you need, and by when."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className={inputClass}
              >
                {Object.entries(REQUEST_PRIORITY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            {deliverables.length > 0 && (
              <div>
                <label className="text-xs font-medium text-muted">About (optional)</label>
                <select
                  value={form.deliverableId}
                  onChange={(e) => setForm({ ...form, deliverableId: e.target.value })}
                  className={inputClass}
                >
                  <option value="">The client overall</option>
                  {deliverables.map((d) => (
                    <option key={d.id} value={d.id}>{d.title}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className={ghostBtn}>Cancel</button>
            <button type="submit" disabled={saving || !form.subject || !form.body} className={primaryBtn}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
