"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Briefcase, Plus, Search, Loader2, X, Eye, ChevronRight, Inbox, BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/Shell";
import {
  CLIENT_STATUS_LABELS, CLIENT_STATUS_TONE,
  REQUEST_STATUS_LABELS, REQUEST_STATUS_TONE,
  REQUEST_PRIORITY_LABELS, REQUEST_PRIORITY_TONE,
  formatMoney,
} from "@/lib/clients";
import { ClientDetail } from "./ClientDetail";
import type { ClientRow, InboxRequest, Viewer } from "./types";

// ─── Small shared pieces ──────────────────────────────────────────────────────

function Chip({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${tone}`}
    >
      {children}
    </span>
  );
}

const inputClass =
  "w-full px-3 py-2 bg-surface-sunken border border-border rounded-lg text-sm text-foreground " +
  "placeholder:text-subtle focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-colors";
const primaryBtn =
  "px-4 py-2 text-sm font-semibold rounded-lg bg-accent text-accent-foreground hover:bg-accent-hover transition-colors disabled:opacity-50";
const ghostBtn =
  "px-3 py-1.5 text-[13px] font-medium rounded-md text-muted hover:text-foreground hover:bg-hover transition-colors";

// ─── Root ─────────────────────────────────────────────────────────────────────

type PageView = "book" | "requests";

export function ClientsView() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Which tab the detail modal should open on — set to "requests" when a row is
  // opened from the inbox, so the reply the person came for is what they see.
  const [detailTab, setDetailTab] = useState<"overview" | "requests">("overview");
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<PageView>("book");
  const [requestCount, setRequestCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/clients?${params}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not load clients");
      const data = await res.json();
      setClients(data.clients);
      setViewer(data.viewer);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load clients");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  // Deep link straight to a client — the link every request notification carries.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("client");
    if (id) {
      setSelectedId(id);
      if (params.get("request")) setDetailTab("requests");
    }
  }, []);

  // Per-currency, never summed together. A UK book in GBP and an India book in
  // INR are two different totals — adding the raw minor-unit numbers would
  // silently produce a meaningless figure the moment there is more than one
  // currency in the book. See CLIENT_STATUS_TONE's neighbour in lib/clients.ts
  // for the same reasoning applied to fee status.
  const totalsByCurrency = useMemo(() => {
    if (!viewer?.canSeeMoney) return null;
    const byCurrency = new Map<string, { billed: number; paid: number }>();
    for (const c of clients) {
      if (!c.money) continue;
      const entry = byCurrency.get(c.currency) ?? { billed: 0, paid: 0 };
      entry.billed += c.money.billedMinor;
      entry.paid += c.money.paidMinor;
      byCurrency.set(c.currency, entry);
    }
    return [...byCurrency.entries()].sort((a, b) => b[1].billed - a[1].billed);
  }, [clients, viewer]);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        eyebrow="Business"
        title="Clients"
        description={
          viewer?.isOversightOnly
            ? "Full visibility across every region. To change a record, raise a request with its owner."
            : "Your client book — relationships, what we owe them, and what they owe us."
        }
        action={
          viewer?.canCreate ? (
            <button className={primaryBtn} onClick={() => setCreating(true)}>
              <Plus className="w-4 h-4 inline mr-1.5 -mt-0.5" />
              New client
            </button>
          ) : viewer?.isOversightOnly ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              <Eye className="w-3.5 h-3.5" />
              View only
            </span>
          ) : null
        }
      />

      <div className="flex items-center gap-1 border-b border-border-soft px-6 lg:px-8 bg-surface">
        <button
          onClick={() => setView("book")}
          className={`px-3 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
            view === "book" ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          Book
        </button>
        <button
          onClick={() => setView("requests")}
          className={`px-3 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
            view === "requests" ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          <Inbox className="w-3.5 h-3.5" />
          Requests
          {requestCount !== null && requestCount > 0 && (
            <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-warn-soft text-warn border border-warn/25">
              {requestCount}
            </span>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-auto px-6 py-5 lg:px-8">
        {view === "requests" ? (
          <RequestsInbox
            onCountChange={setRequestCount}
            onOpen={(clientId) => { setSelectedId(clientId); setDetailTab("requests"); }}
          />
        ) : (
          <>
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 mb-5">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search clients…"
                  className={`${inputClass} pl-9`}
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={`${inputClass} w-auto`}
              >
                <option value="">All statuses</option>
                {Object.entries(CLIENT_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            {totalsByCurrency && totalsByCurrency.length > 0 && (
              <div className="flex flex-wrap gap-3 mb-5">
                {totalsByCurrency.map(([currency, t]) => (
                  <div
                    key={currency}
                    className="bg-surface border border-border rounded-xl shadow-sm p-4 flex-1 min-w-[240px]"
                  >
                    <p className="text-xs font-medium text-muted mb-2">{currency}</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-[10px] text-muted">Billed</p>
                        <p className="text-sm font-semibold text-foreground tracking-tight">
                          {formatMoney(t.billed, currency)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted">Received</p>
                        <p className="text-sm font-semibold text-ok tracking-tight">
                          {formatMoney(t.paid, currency)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted">Outstanding</p>
                        <p className="text-sm font-semibold text-warn tracking-tight">
                          {formatMoney(Math.max(0, t.billed - t.paid), currency)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : clients.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Briefcase className="w-8 h-8 text-subtle mb-3" />
                <p className="text-sm font-medium text-foreground">No clients yet</p>
                <p className="text-[13px] text-muted mt-1">
                  {viewer?.canCreate
                    ? "Add your first client to start tracking deliverables and fees."
                    : "Nothing has been added to the client book yet."}
                </p>
              </div>
            ) : (
              <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
                {clients.map((c, i) => (
                  <button
                    key={c.id}
                    onClick={() => { setSelectedId(c.id); setDetailTab("overview"); }}
                    className={`w-full text-left px-4 py-3 hover:bg-hover transition-colors flex items-center gap-3 ${
                      i > 0 ? "border-t border-border-soft" : ""
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground truncate">{c.name}</span>
                        <Chip tone={CLIENT_STATUS_TONE[c.status]}>{CLIENT_STATUS_LABELS[c.status]}</Chip>
                        {c.region && (
                          <span className="text-[11px] text-subtle">{c.region}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted mt-0.5 truncate">
                        {c.owner ? `${c.owner.customRole ?? c.owner.fullName}` : "Unassigned"}
                        {c._count ? ` · ${c._count.deliverables} deliverables` : ""}
                      </p>
                    </div>
                    {c.money && (
                      <div className="text-right hidden sm:block">
                        <p className="text-sm font-medium text-foreground">
                          {formatMoney(c.money.billedMinor, c.currency)}
                        </p>
                        <p className="text-[11px] text-muted">
                          {formatMoney(Math.max(0, c.money.billedMinor - c.money.paidMinor), c.currency)} due
                        </p>
                      </div>
                    )}
                    <ChevronRight className="w-4 h-4 text-subtle flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {creating && viewer && (
        <NewClientDialog
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); load(); }}
        />
      )}
      {selectedId && viewer && (
        <ClientDetail
          clientId={selectedId}
          viewer={viewer}
          initialTab={detailTab}
          onClose={() => setSelectedId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

// ─── Requests inbox ───────────────────────────────────────────────────────────
//
// The cross-client queue: "what has leadership asked me for", pulled from
// /api/clients/requests?view=inbox — assigned-to-me, on a client I own, or (for
// the Ops Manager) unassigned. Without this a request only existed inside the
// individual client page and nobody would find it without knowing to look.

function fmtDate(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function RequestsInbox({
  onOpen, onCountChange,
}: { onOpen: (clientId: string) => void; onCountChange: (n: number) => void }) {
  const [requests, setRequests] = useState<InboxRequest[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/clients/requests?view=inbox");
        if (!res.ok) throw new Error((await res.json()).error ?? "Could not load requests");
        const data = await res.json();
        if (cancelled) return;
        setRequests(data.requests);
        onCountChange(data.requests.length);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Could not load requests");
      }
    })();
    return () => { cancelled = true; };
    // onCountChange is a setState setter — stable across renders, safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (requests === null) {
    return (
      <div className="flex items-center justify-center py-16 text-muted">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Inbox className="w-8 h-8 text-subtle mb-3" />
        <p className="text-sm font-medium text-foreground">Nothing waiting on you</p>
        <p className="text-[13px] text-muted mt-1">
          Requests raised against your clients will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
      {requests.map((r, i) => (
        <button
          key={r.id}
          onClick={() => onOpen(r.client.id)}
          className={`w-full text-left px-4 py-3 hover:bg-hover transition-colors flex items-start gap-3 ${
            i > 0 ? "border-t border-border-soft" : ""
          }`}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-foreground truncate">{r.subject}</span>
              <Chip tone={REQUEST_STATUS_TONE[r.status]}>{REQUEST_STATUS_LABELS[r.status]}</Chip>
              {r.priority !== "NORMAL" && (
                <Chip tone={REQUEST_PRIORITY_TONE[r.priority]}>{REQUEST_PRIORITY_LABELS[r.priority]}</Chip>
              )}
            </div>
            <p className="text-xs text-muted mt-0.5 truncate">
              {r.client.name}{r.client.region ? ` · ${r.client.region}` : ""} — from {r.raisedBy.fullName}
              {" · "}{fmtDate(r.createdAt)}
              {r._count.comments > 0 ? ` · ${r._count.comments} repl${r._count.comments === 1 ? "y" : "ies"}` : ""}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-subtle flex-shrink-0 mt-0.5" />
        </button>
      ))}
    </div>
  );
}

// ─── New client ───────────────────────────────────────────────────────────────

function NewClientDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: "", region: "", industry: "", currency: "GBP",
    primaryContactName: "", primaryContactEmail: "",
  });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not create client");
      toast.success(`${form.name} added to the client book`);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create client");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Overlay onClose={onClose} title="New client">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="text-xs font-medium text-muted">Client name</label>
          <input
            required autoFocus value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputClass} placeholder="Acme Ltd"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted">Region</label>
            <input
              value={form.region}
              onChange={(e) => setForm({ ...form, region: e.target.value })}
              className={inputClass} placeholder="India"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted">Currency</label>
            <input
              value={form.currency} maxLength={3}
              onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
              className={inputClass} placeholder="GBP"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted">Industry</label>
          <input
            value={form.industry}
            onChange={(e) => setForm({ ...form, industry: e.target.value })}
            className={inputClass} placeholder="Financial services"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted">Contact name</label>
            <input
              value={form.primaryContactName}
              onChange={(e) => setForm({ ...form, primaryContactName: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted">Contact email</label>
            <input
              type="email" value={form.primaryContactEmail}
              onChange={(e) => setForm({ ...form, primaryContactEmail: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>
        <p className="text-xs text-muted">
          You will own this client. Only the Operations Manager can reassign it later.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={ghostBtn}>Cancel</button>
          <button type="submit" disabled={saving || !form.name} className={primaryBtn}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create client"}
          </button>
        </div>
      </form>
    </Overlay>
  );
}

function Overlay({
  title, onClose, children, wide,
}: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay backdrop-blur-sm">
      <div
        className={`bg-surface border border-border rounded-panel shadow-pop w-full ${
          wide ? "max-w-3xl" : "max-w-lg"
        } max-h-[88vh] overflow-auto`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-soft sticky top-0 bg-surface">
          <h2 className="text-base font-semibold text-foreground tracking-tight">{title}</h2>
          <button onClick={onClose} className={ghostBtn} aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
