"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Building2, Wifi, WifiOff, AlertCircle, RefreshCw, CheckCircle2,
  Database, ShoppingCart, Package, Star, Wrench, Info, Activity,
  Users, Loader2, ChevronDown, ChevronUp,
} from "lucide-react";
import { PageHeader } from "@/components/Shell";
import type { HotelIntegrationFull, IntegrationStatus } from "@/lib/hospitality/types";

// ─── Status display config ────────────────────────────────────────────────────

const STATUS_CONFIG: Record<IntegrationStatus | string, {
  chip: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}> = {
  demo:         { chip: "bg-accent-soft text-accent-strong border-accent/20",   icon: Info,         label: "Demo"         },
  connected:    { chip: "bg-ok-soft text-ok border-ok/25",                      icon: Wifi,         label: "Connected"    },
  syncing:      { chip: "bg-warn-soft text-warn border-warn/25",                icon: RefreshCw,    label: "Syncing"      },
  error:        { chip: "bg-crit-soft text-crit border-crit/25",               icon: AlertCircle,  label: "Error"        },
  disabled:     { chip: "bg-hover text-muted border-border",                    icon: WifiOff,      label: "Disabled"     },
  disconnected: { chip: "bg-hover text-muted border-border",                    icon: WifiOff,      label: "Disconnected" },
};

const CATEGORY_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  PMS:         Building2,
  ERP:         Database,
  POS:         ShoppingCart,
  STOCK:       Package,
  REPUTATION:  Star,
  HR:          Users,
  MAINTENANCE: Wrench,
  OTHER:       Database,
};

const DATA_TYPE_LABELS: Record<string, string> = {
  occupancy:               "Occupancy",
  arrivals:                "Arrivals",
  departures:              "Departures",
  room_status:             "Room Status",
  vip_guests:              "VIP Guests",
  revenue:                 "Revenue",
  covers:                  "Covers",
  avg_check:               "Avg Check",
  outlets:                 "Outlets",
  stock_levels:            "Stock Levels",
  stock_variance:          "Variance",
  reviews:                 "Reviews",
  scores:                  "Scores",
  sentiment:               "Sentiment",
  work_orders:             "Work Orders",
  preventive_maintenance:  "Preventive Maint.",
  payroll:                 "Payroll",
  schedules:               "Schedules",
  other:                   "Other",
};

// ─── SyncButton ───────────────────────────────────────────────────────────────

function SyncButton({ id, isDemo, onDone }: {
  id: string;
  isDemo: boolean;
  onDone: (success: boolean, msg: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleSync() {
    setLoading(true);
    try {
      const res  = await fetch(`/api/hospitality/integrations/${id}/sync`, { method: "POST" });
      const data = await res.json();
      onDone(data.success, data.success
        ? `Synced ${data.recordCount} records across ${data.dataTypes?.length ?? 0} data types`
        : (data.error ?? "Sync failed"));
    } catch {
      onDone(false, "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleSync}
      disabled={loading}
      className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium rounded-lg bg-surface-sunken hover:bg-hover transition-colors text-muted disabled:opacity-50"
      title={isDemo ? "Run demo sync" : "Sync now"}
    >
      {loading
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : <RefreshCw className="w-3.5 h-3.5" />}
      Sync
    </button>
  );
}

// ─── HealthButton ─────────────────────────────────────────────────────────────

function HealthButton({ id, onDone }: {
  id: string;
  onDone: (healthy: boolean, details: string, latencyMs: number) => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleCheck() {
    setLoading(true);
    try {
      const res  = await fetch(`/api/hospitality/integrations/${id}/health`, { method: "POST" });
      const data = await res.json();
      onDone(data.healthy, data.details ?? "", data.latencyMs ?? 0);
    } catch {
      onDone(false, "Network error", 0);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleCheck}
      disabled={loading}
      className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium rounded-lg bg-surface-sunken hover:bg-hover transition-colors text-muted disabled:opacity-50"
      title="Check health"
    >
      {loading
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : <Activity className="w-3.5 h-3.5" />}
      Health
    </button>
  );
}

// ─── IntegrationCard ──────────────────────────────────────────────────────────

function IntegrationCard({ integration }: { integration: HotelIntegrationFull }) {
  const [expanded,   setExpanded]   = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; msg: string } | null>(null);
  const [health,     setHealth]     = useState<{ healthy: boolean; details: string; latencyMs: number } | null>(null);

  const cfg        = STATUS_CONFIG[integration.status] ?? STATUS_CONFIG.disabled;
  const CatIcon    = CATEGORY_ICON[integration.category] ?? Database;
  const StatusIcon = cfg.icon;

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      {/* Card header */}
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface-sunken flex items-center justify-center flex-shrink-0">
              <CatIcon className="w-5 h-5 text-muted" />
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-foreground truncate">{integration.label}</p>
              <p className="text-[11px] text-subtle">{integration.category} · {integration.propertyName}</p>
            </div>
          </div>
          <span className={`flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.chip}`}>
            <StatusIcon className="w-2.5 h-2.5" />
            {cfg.label}
          </span>
        </div>

        {/* Last sync / error */}
        <div className="text-[12px] space-y-1">
          {integration.status === "demo" && (
            <p className="text-muted flex items-center gap-1.5">
              <Info className="w-3 h-3 text-subtle flex-shrink-0" />
              Demo mode — no live connection
            </p>
          )}
          {integration.lastSyncAt && (
            <p className="text-muted flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-ok flex-shrink-0" />
              Last sync: {new Date(integration.lastSyncAt).toLocaleString()}
            </p>
          )}
          {integration.status === "error" && integration.lastError && (
            <p className="text-crit flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              {integration.lastError}
            </p>
          )}
        </div>

        {/* Data types */}
        {integration.dataTypes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {integration.dataTypes.map(dt => (
              <span key={dt} className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-surface-sunken text-muted border border-border-soft">
                {DATA_TYPE_LABELS[dt] ?? dt}
              </span>
            ))}
          </div>
        )}

        {/* Sync / health result banners */}
        {syncResult && (
          <div className={`flex items-start gap-2 px-3 py-2 rounded-lg text-[12px] ${syncResult.success ? "bg-ok-soft text-ok" : "bg-crit-soft text-crit"}`}>
            {syncResult.success ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />}
            {syncResult.msg}
          </div>
        )}
        {health && (
          <div className={`flex items-start gap-2 px-3 py-2 rounded-lg text-[12px] ${health.healthy ? "bg-ok-soft text-ok" : "bg-crit-soft text-crit"}`}>
            <Activity className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            {health.healthy ? `Healthy · ${health.latencyMs}ms` : `Unhealthy`} — {health.details}
          </div>
        )}
      </div>

      {/* Expandable actions footer */}
      <div className="border-t border-border-soft px-4 py-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SyncButton
            id={integration.id}
            isDemo={integration.isDemo}
            onDone={(success, msg) => { setSyncResult({ success, msg }); setHealth(null); }}
          />
          <HealthButton
            id={integration.id}
            onDone={(healthy, details, latencyMs) => { setHealth({ healthy, details, latencyMs }); setSyncResult(null); }}
          />
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1 text-[11px] text-subtle hover:text-muted transition-colors"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? "Less" : "Details"}
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 space-y-2 border-t border-border-soft bg-surface-sunken">
          <div className="pt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
            <span className="text-subtle">Integration ID</span>
            <span className="text-muted font-mono text-[11px] truncate">{integration.id}</span>
            <span className="text-subtle">Property</span>
            <span className="text-muted">{integration.propertyName}</span>
            <span className="text-subtle">Category</span>
            <span className="text-muted">{integration.category}</span>
            <span className="text-subtle">Type key</span>
            <span className="text-muted font-mono">{integration.type}</span>
            <span className="text-subtle">Added</span>
            <span className="text-muted">{new Date(integration.createdAt).toLocaleDateString()}</span>
          </div>
          {integration.isDemo && (
            <p className="text-[11px] text-accent/70 mt-2 italic">
              This is a demo integration. Connect real credentials when your system is ready.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function HospitalityIntegrations() {
  const [integrations, setIntegrations] = useState<HotelIntegrationFull[]>([]);
  const [isDemo,       setIsDemo]       = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/hospitality/integrations");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load integrations");
      setIntegrations(data.integrations ?? []);
      setIsDemo(data.isDemo ?? false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load integrations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const byCategory = integrations.reduce<Record<string, HotelIntegrationFull[]>>((acc, i) => {
    (acc[i.category] ??= []).push(i);
    return acc;
  }, {});

  const connected = integrations.filter(i => i.status === "connected").length;
  const errors    = integrations.filter(i => i.status === "error").length;
  const demo      = integrations.filter(i => i.status === "demo").length;

  return (
    <div className="flex flex-col h-full overflow-auto">
      <PageHeader
        eyebrow="Hospitality"
        title="Integrations"
        description="Data connectors that feed Nexus from your existing hotel systems"
        action={
          <div className="flex items-center gap-3 text-[12px] text-muted">
            {connected > 0 && <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-ok" /> {connected} connected</span>}
            {errors    > 0 && <span className="flex items-center gap-1"><AlertCircle  className="w-3.5 h-3.5 text-crit" /> {errors} error{errors !== 1 ? "s" : ""}</span>}
            {demo      > 0 && <span className="flex items-center gap-1"><Info         className="w-3.5 h-3.5 text-accent" /> {demo} demo</span>}
          </div>
        }
      />

      <div className="p-6 space-y-5">
        {/* Architecture note */}
        <div className="flex items-start gap-3 bg-accent-soft border border-accent/20 rounded-xl px-4 py-3">
          <Info className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-medium text-accent-strong">Nexus is your operational intelligence layer</p>
            <p className="text-[12px] text-accent/80 mt-0.5">
              It sits above your existing systems — Opera, SAP, POS, Stock, Reputation platforms — and normalises their data into
              a unified view. Nexus does not replace those systems.
            </p>
          </div>
        </div>

        {/* Demo mode banner */}
        {isDemo && (
          <div className="flex items-start gap-3 bg-warn-soft border border-warn/20 rounded-xl px-4 py-3">
            <WifiOff className="w-4 h-4 text-warn flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-medium text-warn">Demo mode active</p>
              <p className="text-[12px] text-warn/80 mt-0.5">
                No real hotel properties are registered for this organisation. All integrations are running demo simulations.
              </p>
            </div>
          </div>
        )}

        {/* Loading / error */}
        {loading && (
          <div className="flex items-center justify-center py-16 gap-3 text-muted">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-[13px]">Loading integrations…</span>
          </div>
        )}

        {!loading && error && (
          <div className="flex items-center gap-3 bg-crit-soft border border-crit/20 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-crit flex-shrink-0" />
            <p className="text-[13px] text-crit">{error}</p>
            <button onClick={load} className="ml-auto text-[12px] text-crit underline">Retry</button>
          </div>
        )}

        {/* Integration cards grouped by category */}
        {!loading && !error && Object.entries(byCategory).map(([category, items]) => (
          <section key={category}>
            <p className="text-[11px] font-semibold text-subtle uppercase tracking-wide mb-3">{category}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map(i => <IntegrationCard key={i.id} integration={i} />)}
            </div>
          </section>
        ))}

        {/* Available connectors catalogue */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <p className="text-[13px] font-semibold text-foreground mb-1">Available connectors</p>
          <p className="text-[12px] text-muted mb-3">
            These integrations can be connected when live credentials are available. Credentials are never stored in plaintext.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {[
              ["PMS", "Oracle OPERA Cloud"],
              ["PMS", "Cloudbeds"],
              ["PMS", "Mews"],
              ["PMS", "Apaleo"],
              ["PMS", "Clock PMS+"],
              ["ERP", "SAP"],
              ["POS", "Micros"],
              ["STOCK", "FutureLog"],
              ["REPUTATION", "TrustYou"],
              ["HR", "ADP"],
              ["MAINTENANCE", "Planon"],
              ["MAINTENANCE", "Transcendent"],
            ].map(([cat, name]) => (
              <div key={name} className="flex items-center gap-2 px-3 py-2 bg-surface-sunken rounded-lg">
                {(() => { const I = CATEGORY_ICON[cat] ?? Database; return <I className="w-3.5 h-3.5 text-subtle flex-shrink-0" />; })()}
                <span className="text-[12px] text-muted truncate">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
