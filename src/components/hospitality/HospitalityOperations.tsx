"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle, AlertTriangle, CheckCircle2, Clock, RefreshCw,
  Users, Layers, Coffee, Wrench, Building2,
  BedDouble, Info, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/Shell";
import type {
  OperationsData,
  OperationsStatus,
  HotelAlertPriority,
  PriorityOperationItem,
  DepartmentOperationsStatus,
  ExtendedRoomStatusCounts,
} from "@/lib/hospitality/types";
import { formatCurrency } from "@/lib/hospitality/metrics";

// ─── Atrium token maps ────────────────────────────────────────────────────────

const OPS_STATUS_CONFIG: Record<OperationsStatus, {
  chip: string;
  dot: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}> = {
  NORMAL:    { chip: "bg-ok-soft text-ok border-ok/25",           dot: "bg-ok",          icon: CheckCircle2,  label: "Normal" },
  ATTENTION: { chip: "bg-accent-soft text-accent-strong border-accent/20", dot: "bg-accent", icon: Info,     label: "Attention" },
  WARNING:   { chip: "bg-warn-soft text-warn border-warn/25",    dot: "bg-warn",         icon: AlertTriangle, label: "Warning" },
  CRITICAL:  { chip: "bg-crit-soft text-crit border-crit/25",    dot: "bg-crit",         icon: AlertCircle,   label: "Critical" },
};

const PRIORITY_CONFIG: Record<HotelAlertPriority, { chip: string; bar: string }> = {
  CRITICAL: { chip: "bg-crit-soft text-crit border-crit/25",         bar: "bg-crit" },
  HIGH:     { chip: "bg-warn-soft text-warn border-warn/25",         bar: "bg-warn" },
  MEDIUM:   { chip: "bg-accent-soft text-accent-strong border-accent/25", bar: "bg-accent" },
  LOW:      { chip: "bg-hover text-muted border-border",             bar: "bg-border-strong" },
};

const DEPT_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  front_office: Users,
  housekeeping: Layers,
  engineering:  Wrench,
  f_and_b:      Coffee,
};

// ─── Room status pill config ──────────────────────────────────────────────────

type RoomStatusKey = keyof ExtendedRoomStatusCounts;

const ROOM_STATUS_CONFIG: { key: RoomStatusKey; label: string; color: string }[] = [
  { key: "occupied",      label: "Occupied",      color: "bg-surface-sunken text-foreground border-border" },
  { key: "available",     label: "Available",     color: "bg-ok-soft text-ok border-ok/25" },
  { key: "dirty",         label: "Dirty",         color: "bg-warn-soft text-warn border-warn/25" },
  { key: "clean",         label: "Clean",         color: "bg-ok-soft text-ok border-ok/20" },
  { key: "inspected",     label: "Inspected",     color: "bg-ok-soft text-ok border-ok/20" },
  { key: "outOfOrder",    label: "Out of Order",  color: "bg-crit-soft text-crit border-crit/25" },
  { key: "maintenance",   label: "Maintenance",   color: "bg-warn-soft text-warn border-warn/20" },
  { key: "vip",           label: "VIP",           color: "bg-accent-soft text-accent-strong border-accent/20" },
  { key: "checkInToday",  label: "Arriving",      color: "bg-accent-soft text-accent-strong border-accent/15" },
  { key: "checkOutToday", label: "Departing",     color: "bg-surface-sunken text-muted border-border" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function OperationsStatusBadge({ status }: { status: OperationsStatus }) {
  const cfg  = OPS_STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-semibold border ${cfg.chip}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function DeptStatusChip({ dept }: { dept: DepartmentOperationsStatus }) {
  const cfg    = OPS_STATUS_CONFIG[dept.status];
  const Icon   = cfg.icon;
  const DIcon  = DEPT_ICON[dept.key] ?? Building2;
  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border ${cfg.chip}`}>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <DIcon className="w-4 h-4 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">{dept.label}</p>
          <p className="text-[11px] opacity-80 leading-snug mt-0.5 line-clamp-2">{dept.statusReason}</p>
        </div>
      </div>
      <div className="flex-shrink-0 flex flex-col items-end gap-1">
        <Icon className="w-3.5 h-3.5" />
        {dept.openIssues > 0 && (
          <span className="text-[10px] font-semibold">{dept.openIssues} issue{dept.openIssues !== 1 ? "s" : ""}</span>
        )}
      </div>
    </div>
  );
}

function PriorityItem({ item }: { item: PriorityOperationItem }) {
  const pcfg   = PRIORITY_CONFIG[item.priority];
  const DIcon  = item.department ? (DEPT_ICON[item.department] ?? Building2) : Building2;
  return (
    <div className="flex gap-3 p-3.5 bg-surface border border-border rounded-xl hover:shadow-sm transition-shadow">
      <div className={`flex-shrink-0 w-0.5 self-stretch rounded-full ${pcfg.bar}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${pcfg.chip}`}>
            {item.priority}
          </span>
          <DIcon className="w-3.5 h-3.5 text-subtle" />
          {item.roomNumber && (
            <span className="text-[11px] text-subtle">Room {item.roomNumber}</span>
          )}
        </div>
        <p className="text-[13px] font-medium text-foreground leading-snug">{item.title}</p>
        {item.detail && (
          <p className="text-[12px] text-muted mt-0.5 leading-snug">{item.detail}</p>
        )}
      </div>
      {item.alertId && (
        <Link
          href="/hospitality/alerts"
          className="flex-shrink-0 self-start p-1 rounded-md text-subtle hover:text-foreground hover:bg-hover transition-colors"
          title="View alert"
        >
          <ChevronRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  );
}

function RoomStatusGrid({ rooms }: { rooms: ExtendedRoomStatusCounts }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ROOM_STATUS_CONFIG.map(({ key, label, color }) => (
        <div
          key={key}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] font-medium ${color}`}
        >
          <span className="text-[15px] font-semibold tabular-nums">{rooms[key]}</span>
          <span className="opacity-80">{label}</span>
        </div>
      ))}
    </div>
  );
}

function StatRow({ label, value, warn, crit }: { label: string; value: string | number; warn?: boolean; crit?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border-soft last:border-0">
      <span className="text-[12px] text-muted">{label}</span>
      <span className={`text-[13px] font-semibold tabular-nums ${crit ? "text-crit" : warn ? "text-warn" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

function DeptCard({ title, icon: Icon, status, children }: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  status: OperationsStatus;
  children: React.ReactNode;
}) {
  const scfg = OPS_STATUS_CONFIG[status];
  const SIcon = scfg.icon;
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border-soft flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted" />
        <h3 className="text-[13px] font-semibold text-foreground flex-1">{title}</h3>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${scfg.chip}`}>
          <SIcon className="w-2.5 h-2.5" />
          {scfg.label}
        </span>
      </div>
      <div className="px-4 py-2">{children}</div>
    </div>
  );
}

// ─── Loading / error states ───────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted">
        <RefreshCw className="w-6 h-6 animate-spin" />
        <p className="text-sm">Loading operations data…</p>
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-3">
        <AlertCircle className="w-8 h-8 text-crit mx-auto" />
        <p className="text-sm font-medium text-foreground">Failed to load operations data</p>
        <button
          onClick={onRetry}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-accent text-accent-foreground hover:bg-accent-hover transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function HospitalityOperations() {
  const [data,    setData]    = useState<OperationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/hospitality/operations");
      if (!res.ok) throw new Error(`${res.status}`);
      setData(await res.json());
    } catch {
      setError(true);
      toast.error("Could not load operations data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const asOfLabel = data
    ? new Date(data.asOf).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div className="flex flex-col h-full overflow-auto">
      <PageHeader
        eyebrow="Hospitality"
        title="Operations"
        description={data ? `${data.property.name} · Live operational status` : "Loading…"}
        action={
          data ? (
            <div className="flex items-center gap-3">
              <OperationsStatusBadge status={data.overallStatus} />
              {data.isDemo && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent-soft text-accent-strong border border-accent/20">
                  DEMO
                </span>
              )}
              <span className="text-[11px] text-subtle flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {asOfLabel}
              </span>
              <button
                onClick={load}
                disabled={loading}
                className="p-1.5 rounded-md text-subtle hover:text-foreground hover:bg-hover transition-colors disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          ) : null
        }
      />

      {loading && !data && <LoadingState />}
      {error   && !data && <ErrorState onRetry={load} />}

      {data && (
        <div className="flex-1 p-6 space-y-6">

          {/* Department status bar */}
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3">Department Status</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {data.departmentStatuses.map(d => (
                <DeptStatusChip key={d.key} dept={d} />
              ))}
            </div>
          </div>

          {/* Priority operations + Room status */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

            {/* Priority operations (left 3/5) */}
            <div className="lg:col-span-3 space-y-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-warn" />
                Priority Operations
                <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-surface-sunken text-muted border border-border">
                  {data.priorityItems.length}
                </span>
              </h2>
              <div className="space-y-2">
                {data.priorityItems.map(item => (
                  <PriorityItem key={item.id} item={item} />
                ))}
              </div>
            </div>

            {/* Room status (right 2/5) */}
            <div className="lg:col-span-2 space-y-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <BedDouble className="w-4 h-4 text-muted" />
                Room Status
                <span className="ml-1 text-[11px] text-subtle font-normal">
                  {data.property.totalRooms} total
                </span>
              </h2>
              <div className="bg-surface border border-border rounded-xl p-4">
                <RoomStatusGrid rooms={data.rooms} />
                <div className="mt-3 pt-3 border-t border-border-soft">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-muted">Occupancy</span>
                    <span className="font-semibold text-foreground">
                      {((data.rooms.occupied / data.property.totalRooms) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Department detail cards */}
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3">Department Detail</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Front Office */}
              <DeptCard
                title="Front Office"
                icon={Users}
                status={data.departmentStatuses.find(d => d.key === "front_office")?.status ?? "NORMAL"}
              >
                <StatRow label="Arrivals today"       value={data.departments.frontOffice.arrivals} />
                <StatRow label="Departures today"     value={data.departments.frontOffice.departures} />
                <StatRow label="VIP arrivals"         value={data.departments.frontOffice.vipArrivals} />
                <StatRow label="Early check-ins"      value={data.departments.frontOffice.earlyCheckIns} />
                <StatRow label="Late check-outs"      value={data.departments.frontOffice.lateCheckOuts} />
                <StatRow
                  label="Unresolved guest issues"
                  value={data.departments.frontOffice.unresolvedGuest}
                  warn={data.departments.frontOffice.unresolvedGuest > 0}
                  crit={data.departments.frontOffice.unresolvedGuest > 3}
                />
              </DeptCard>

              {/* Housekeeping */}
              <DeptCard
                title="Housekeeping"
                icon={Layers}
                status={data.departmentStatuses.find(d => d.key === "housekeeping")?.status ?? "NORMAL"}
              >
                <StatRow label="Rooms to clean"       value={data.departments.housekeeping.toclean} warn={data.departments.housekeeping.toclean > 10} />
                <StatRow label="Cleaned"              value={data.departments.housekeeping.cleaned} />
                <StatRow label="Inspected"            value={data.departments.housekeeping.inspected} />
                <StatRow
                  label="Awaiting inspection"
                  value={data.departments.housekeeping.awaitingInspection}
                  warn={data.departments.housekeeping.awaitingInspection > 5}
                />
                <StatRow label="Priority rooms"       value={data.departments.housekeeping.priorityRooms} />
                <StatRow label="VIP rooms"            value={data.departments.housekeeping.vipRooms} />
                <StatRow
                  label="Rooms with issues"
                  value={data.departments.housekeeping.issueRooms}
                  warn={data.departments.housekeeping.issueRooms > 0}
                />
                <StatRow
                  label="Avg turnaround"
                  value={`${data.departments.housekeeping.avgTurnaround} min`}
                  warn={data.departments.housekeeping.avgTurnaround > 35}
                />
              </DeptCard>

              {/* F&B */}
              <DeptCard
                title="Food & Beverage"
                icon={Coffee}
                status={data.departmentStatuses.find(d => d.key === "f_and_b")?.status ?? "NORMAL"}
              >
                <StatRow label="Today's covers"   value={data.departments.fAndB.covers} />
                <StatRow label="Revenue"          value={formatCurrency(data.departments.fAndB.revenue, data.property.currency)} />
                <StatRow label="Average spend"    value={formatCurrency(data.departments.fAndB.avgCheck, data.property.currency)} />
                <StatRow
                  label="Stock variance"
                  value={data.departments.fAndB.variancePct ? `${data.departments.fAndB.variancePct.toFixed(1)}%` : "None"}
                  warn={!!data.departments.fAndB.stockVariance}
                />
                {data.departments.fAndB.varianceAmount && (
                  <StatRow
                    label="Variance amount"
                    value={formatCurrency(data.departments.fAndB.varianceAmount, data.property.currency)}
                    warn
                  />
                )}
                <StatRow label="Open issues"      value={data.departments.fAndB.openIssues} warn={data.departments.fAndB.openIssues > 0} />
                {/* Outlets */}
                {data.departments.fAndB.outlets.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border-soft space-y-1.5">
                    {data.departments.fAndB.outlets.map(o => (
                      <div key={o.name} className="flex items-center justify-between">
                        <span className="text-[11px] text-muted flex items-center gap-1">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${o.isOpen ? "bg-ok" : "bg-border-strong"}`} />
                          {o.name}
                        </span>
                        <span className="text-[11px] text-muted">{o.covers} covers</span>
                      </div>
                    ))}
                  </div>
                )}
              </DeptCard>

              {/* Engineering */}
              <DeptCard
                title="Engineering"
                icon={Wrench}
                status={data.departmentStatuses.find(d => d.key === "engineering")?.status ?? "NORMAL"}
              >
                <StatRow
                  label="Open work orders"
                  value={data.departments.engineering.open}
                  warn={data.departments.engineering.open > 3}
                />
                <StatRow
                  label="Critical issues"
                  value={data.departments.engineering.critical}
                  crit={data.departments.engineering.critical > 0}
                />
                <StatRow
                  label="Rooms out of order"
                  value={data.departments.engineering.roomsOutOfOrder}
                  warn={data.departments.engineering.roomsOutOfOrder > 0}
                  crit={data.departments.engineering.roomsOutOfOrder > 3}
                />
                <StatRow
                  label="Overdue items"
                  value={data.departments.engineering.overdue}
                  warn={data.departments.engineering.overdue > 0}
                />
                <StatRow
                  label="Avg issue age"
                  value={`${data.departments.engineering.avgIssueAgeHours.toFixed(1)}h`}
                  warn={data.departments.engineering.avgIssueAgeHours > 4}
                />
                {data.departments.engineering.priorityWork.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border-soft space-y-1">
                    {data.departments.engineering.priorityWork.map((item, i) => (
                      <p key={i} className="text-[11px] text-muted flex items-start gap-1">
                        <span className="text-subtle mt-0.5 flex-shrink-0">·</span>
                        {item}
                      </p>
                    ))}
                  </div>
                )}
              </DeptCard>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
