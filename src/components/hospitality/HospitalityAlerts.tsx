"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle, CheckCircle2, Clock, X,
  Users, Wrench, Coffee, Layers, Building2, Filter,
  ChevronDown, RefreshCw, ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/Shell";
import type { HotelAlertPriority, HotelAlertStatus, DepartmentKey } from "@/lib/hospitality/types";

// ─── Color maps ───────────────────────────────────────────────────────────────

const PRIORITY_CHIP: Record<HotelAlertPriority, string> = {
  CRITICAL: "bg-crit-soft text-crit border-crit/25",
  HIGH:     "bg-warn-soft text-warn border-warn/25",
  MEDIUM:   "bg-accent-soft text-accent-strong border-accent/25",
  LOW:      "bg-hover text-muted border-border",
};

const PRIORITY_BAR: Record<HotelAlertPriority, string> = {
  CRITICAL: "bg-crit",
  HIGH:     "bg-warn",
  MEDIUM:   "bg-accent",
  LOW:      "bg-border-strong",
};

const STATUS_CHIP: Record<HotelAlertStatus, string> = {
  OPEN:        "bg-crit-soft text-crit border-crit/25",
  IN_PROGRESS: "bg-warn-soft text-warn border-warn/25",
  RESOLVED:    "bg-ok-soft text-ok border-ok/25",
  DISMISSED:   "bg-hover text-muted border-border",
};

const STATUS_ICON: Record<HotelAlertStatus, React.ComponentType<{ className?: string }>> = {
  OPEN:        AlertCircle,
  IN_PROGRESS: Clock,
  RESOLVED:    CheckCircle2,
  DISMISSED:   X,
};

const DEPT_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  front_office: Users,
  housekeeping: Layers,
  engineering:  Wrench,
  f_and_b:      Coffee,
};

const DEPT_LABELS: Record<string, string> = {
  front_office: "Front Office",
  housekeeping: "Housekeeping",
  engineering:  "Engineering",
  f_and_b:      "F&B",
};

// ─── Alert row type (what the API returns) ────────────────────────────────────

type AlertRow = {
  id: string;
  source: string;
  type: string;
  department: string | null;
  priority: HotelAlertPriority;
  title: string;
  description: string | null;
  roomNumber: string | null;
  status: HotelAlertStatus;
  assignedTo: { fullName: string } | null;
  taskId: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

type AlertsResponse = {
  alerts: AlertRow[];
  total: number;
  page: number;
  hasMore: boolean;
  isDemo: boolean;
};

// ─── Filter chips ─────────────────────────────────────────────────────────────

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-[12px] font-medium transition-colors whitespace-nowrap ${
        active
          ? "bg-accent text-accent-foreground"
          : "bg-surface-sunken text-muted hover:text-foreground hover:bg-hover"
      }`}
    >
      {label}
    </button>
  );
}

// ─── Alert card ───────────────────────────────────────────────────────────────

function AlertCard({ alert }: { alert: AlertRow }) {
  const [expanded, setExpanded] = useState(false);
  const pBar    = PRIORITY_BAR[alert.priority];
  const pChip   = PRIORITY_CHIP[alert.priority];
  const sChip   = STATUS_CHIP[alert.status];
  const SIcon   = STATUS_ICON[alert.status];
  const DIcon   = alert.department ? (DEPT_ICON[alert.department] ?? Building2) : Building2;

  const relMins = Math.round((Date.now() - new Date(alert.createdAt).getTime()) / 60_000);
  const rel     = relMins < 60 ? `${relMins}m ago`
                : relMins < 1440 ? `${Math.round(relMins / 60)}h ago`
                : `${Math.round(relMins / 1440)}d ago`;

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden hover:shadow-sm transition-shadow">
      <div className={`h-0.5 ${pBar}`} />
      <div
        className="p-4 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${pChip}`}>
                {alert.priority}
              </span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${sChip}`}>
                <SIcon className="w-2.5 h-2.5" />
                {alert.status.replace("_", " ")}
              </span>
              {alert.department && (
                <span className="inline-flex items-center gap-1 text-[11px] text-subtle">
                  <DIcon className="w-3 h-3" />
                  {DEPT_LABELS[alert.department] ?? alert.department}
                </span>
              )}
              {alert.roomNumber && <span className="text-[11px] text-subtle">Room {alert.roomNumber}</span>}
              {alert.taskId && (
                <span className="text-[10px] text-accent-strong bg-accent-soft border border-accent/20 px-1.5 py-0.5 rounded">Task</span>
              )}
            </div>
            <p className="text-[14px] font-medium text-foreground leading-snug">{alert.title}</p>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className="text-[11px] text-subtle">{rel}</span>
            <ChevronDown className={`w-4 h-4 text-subtle transition-transform ${expanded ? "rotate-180" : ""}`} />
          </div>
        </div>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-border-soft space-y-2">
            {alert.description && (
              <p className="text-[13px] text-muted leading-relaxed">{alert.description}</p>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-[11px] text-subtle">
                {alert.assignedTo && <span>→ {alert.assignedTo.fullName}</span>}
                <span>Source: {alert.source}</span>
              </div>
              <a
                href={`/hospitality/alerts/${alert.id}`}
                className="text-[12px] text-accent hover:underline"
                onClick={e => e.stopPropagation()}
              >
                View details →
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type StatusFilter   = "ALL" | "ACTIVE" | HotelAlertStatus;
type PriorityFilter = "ALL" | HotelAlertPriority;
type DeptFilter     = "ALL" | DepartmentKey;
type SortBy         = "priority" | "newest" | "oldest" | "age";

export function HospitalityAlerts() {
  const [response, setResponse] = useState<AlertsResponse | null>(null);
  const [loading,  setLoading]  = useState(true);

  const [statusFilter,   setStatusFilter]   = useState<StatusFilter>("ACTIVE");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("ALL");
  const [deptFilter,     setDeptFilter]     = useState<DeptFilter>("ALL");
  const [sortBy,         setSortBy]         = useState<SortBy>("priority");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (statusFilter   !== "ALL") sp.set("status",   statusFilter);
      if (priorityFilter !== "ALL") sp.set("priority", priorityFilter);
      if (deptFilter     !== "ALL") sp.set("department", deptFilter);
      sp.set("sortBy", sortBy);

      const res = await fetch(`/api/hospitality/alerts?${sp}`);
      if (!res.ok) throw new Error(`${res.status}`);
      setResponse(await res.json());
    } catch {
      toast.error("Could not load alerts");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, deptFilter, sortBy]);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    if (!response) return null;
    const all = response.alerts;
    return {
      total:      all.length,
      critical:   all.filter(a => a.priority === "CRITICAL").length,
      active:     all.filter(a => a.status === "OPEN" || a.status === "IN_PROGRESS").length,
      resolved:   all.filter(a => a.status === "RESOLVED").length,
    };
  }, [response]);

  return (
    <div className="flex flex-col h-full overflow-auto">
      <PageHeader
        eyebrow="Hospitality"
        title="Alerts"
        description="Operational alerts across all departments"
        action={
          <div className="flex items-center gap-3">
            {counts && (
              <div className="flex items-center gap-2 text-[12px] text-muted">
                {counts.critical > 0 && <span className="text-crit font-semibold">{counts.critical} critical</span>}
                <span>{counts.active} active</span>
                <span className="text-ok">{counts.resolved} resolved</span>
              </div>
            )}
            {response?.isDemo && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent-soft text-accent-strong border border-accent/20">
                DEMO
              </span>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="p-1.5 rounded-md text-subtle hover:text-foreground hover:bg-hover transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        }
      />

      <div className="p-6 space-y-4">
        {/* Filter panel */}
        <div className="bg-surface border border-border rounded-xl p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1 text-[11px] font-medium text-subtle tracking-wide">
              <Filter className="w-3 h-3" /> STATUS
            </span>
            <div className="flex flex-wrap gap-1">
              {(["ALL", "ACTIVE", "OPEN", "IN_PROGRESS", "RESOLVED", "DISMISSED"] as StatusFilter[]).map(s => (
                <Chip key={s} label={s.replace("_", " ")} active={statusFilter === s} onClick={() => setStatusFilter(s)} />
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[11px] font-medium text-subtle tracking-wide">PRIORITY</span>
            <div className="flex flex-wrap gap-1">
              {(["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"] as PriorityFilter[]).map(p => (
                <Chip key={p} label={p} active={priorityFilter === p} onClick={() => setPriorityFilter(p)} />
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[11px] font-medium text-subtle tracking-wide">DEPT</span>
            <div className="flex flex-wrap gap-1">
              {(["ALL", "front_office", "housekeeping", "engineering", "f_and_b"] as DeptFilter[]).map(d => (
                <Chip
                  key={d}
                  label={d === "ALL" ? "All" : (DEPT_LABELS[d] ?? d)}
                  active={deptFilter === d}
                  onClick={() => setDeptFilter(d)}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1 text-[11px] font-medium text-subtle tracking-wide">
              <ArrowUpDown className="w-3 h-3" /> SORT
            </span>
            <div className="flex flex-wrap gap-1">
              {([
                ["priority", "Priority"],
                ["newest",   "Newest"],
                ["oldest",   "Oldest"],
                ["age",      "Unresolved age"],
              ] as [SortBy, string][]).map(([v, l]) => (
                <Chip key={v} label={l} active={sortBy === v} onClick={() => setSortBy(v)} />
              ))}
            </div>
          </div>
        </div>

        {/* Alert list */}
        {loading && !response && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 text-muted animate-spin" />
          </div>
        )}

        {response && response.alerts.length === 0 && (
          <div className="bg-surface border border-border rounded-xl p-12 text-center">
            <CheckCircle2 className="w-8 h-8 text-ok mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">No alerts match these filters</p>
            <p className="text-[12px] text-muted mt-1">Try adjusting the filters above</p>
          </div>
        )}

        {response && response.alerts.length > 0 && (
          <div className="space-y-2">
            {response.alerts.map(a => <AlertCard key={a.id} alert={a} />)}
            {response.hasMore && (
              <p className="text-[12px] text-subtle text-center py-2">
                Showing {response.alerts.length} of {response.total} alerts
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
