"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Bed, LogIn, LogOut, XCircle, Banknote, TrendingUp,
  AlertTriangle, AlertCircle, CheckCircle2, Clock,
  Users, Wrench, Coffee, Layers, ArrowUp, ArrowDown,
  Minus, Activity, Star, Building2, ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/Shell";
import {
  getDemoOverview,
  getDemoOperations,
  getDemoActivity,
} from "@/lib/hospitality/demo-data";
import { getKpiCards, formatCurrency } from "@/lib/hospitality/metrics";
import type {
  HotelAlertSummary,
  DepartmentPerformance,
  HotelAlertPriority,
  HotelAlertStatus,
} from "@/lib/hospitality/types";

// ─── Color helpers ────────────────────────────────────────────────────────────

const PRIORITY_BG: Record<HotelAlertPriority, string> = {
  CRITICAL: "bg-crit-soft border-crit/25 text-crit",
  HIGH:     "bg-warn-soft border-warn/25 text-warn",
  MEDIUM:   "bg-accent-soft border-accent/25 text-accent-strong",
  LOW:      "bg-hover border-border text-muted",
};

const PRIORITY_DOT: Record<HotelAlertPriority, string> = {
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

// ─── KPI icon map ─────────────────────────────────────────────────────────────

const KPI_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  occupancy:  Bed,
  arrivals:   LogIn,
  departures: LogOut,
  ooo:        XCircle,
  adr:        Banknote,
  revpar:     TrendingUp,
};

// ─── Department icon map ──────────────────────────────────────────────────────

const DEPT_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  front_office: Users,
  housekeeping: Layers,
  engineering:  Wrench,
  f_and_b:      Coffee,
};

function scoreColor(score: number) {
  if (score >= 90) return "text-ok";
  if (score >= 75) return "text-warn";
  return "text-crit";
}

function scoreBg(score: number) {
  if (score >= 90) return "bg-ok-soft";
  if (score >= 75) return "bg-warn-soft";
  return "bg-crit-soft";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  id, label, value, sub,
}: { id: string; label: string; value: string; sub: string }) {
  const Icon = KPI_ICON[id] ?? Bed;
  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-subtle tracking-wide">{label}</span>
        <Icon className="w-4 h-4 text-muted" />
      </div>
      <div>
        <p className="text-xl font-semibold text-foreground leading-none">{value}</p>
        <p className="text-[11px] text-muted mt-1">{sub}</p>
      </div>
    </div>
  );
}

function AlertCard({ alert }: { alert: HotelAlertSummary }) {
  const relMins = Math.round((Date.now() - new Date(alert.createdAt).getTime()) / 60_000);
  const relLabel = relMins < 60
    ? `${relMins}m ago`
    : `${Math.round(relMins / 60)}h ago`;

  return (
    <div className={`flex gap-3 p-3 rounded-xl border ${PRIORITY_BG[alert.priority]} bg-opacity-50`}>
      <div className="flex-shrink-0 mt-1">
        <span className={`inline-block w-2 h-2 rounded-full ${PRIORITY_DOT[alert.priority]}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[13px] font-medium text-foreground leading-snug">{alert.title}</p>
          <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_CHIP[alert.status]}`}>
            {alert.status.replace("_", " ")}
          </span>
        </div>
        {alert.description && (
          <p className="text-[12px] text-muted mt-0.5 line-clamp-1">{alert.description}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          {alert.roomNumber && (
            <span className="text-[11px] text-subtle">Room {alert.roomNumber}</span>
          )}
          {alert.assignedToName && (
            <span className="text-[11px] text-subtle">→ {alert.assignedToName}</span>
          )}
          <span className="text-[11px] text-subtle ml-auto">{relLabel}</span>
        </div>
      </div>
    </div>
  );
}

function DeptCard({ dept }: { dept: DepartmentPerformance }) {
  const Icon = DEPT_ICON[dept.key] ?? Building2;
  const TrendIcon = dept.trend === "up" ? ArrowUp : dept.trend === "down" ? ArrowDown : Minus;
  const trendColor = dept.trend === "up" ? "text-ok" : dept.trend === "down" ? "text-crit" : "text-muted";

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-surface-sunken flex items-center justify-center flex-shrink-0">
          <Icon className="w-3.5 h-3.5 text-muted" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-foreground">{dept.label}</p>
          {dept.openAlerts > 0 && (
            <p className="text-[11px] text-warn">{dept.openAlerts} open alert{dept.openAlerts !== 1 ? "s" : ""}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <TrendIcon className={`w-3 h-3 ${trendColor}`} />
          <span className={`text-lg font-semibold ${scoreColor(dept.score)}`}>{dept.score}</span>
        </div>
      </div>
      {/* Score bar */}
      <div className="h-1.5 rounded-full bg-surface-sunken overflow-hidden mb-3">
        <div
          className={`h-full rounded-full ${scoreBg(dept.score)}`}
          style={{ width: `${dept.score}%` }}
        />
      </div>
      <ul className="space-y-0.5">
        {dept.highlights.map((h, i) => (
          <li key={i} className="text-[11px] text-muted flex items-start gap-1">
            <span className="text-subtle mt-0.5 flex-shrink-0">·</span>
            {h}
          </li>
        ))}
      </ul>
    </div>
  );
}

function OpsBlock({
  label, children,
}: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <p className="text-[11px] font-medium text-subtle tracking-wide mb-3">{label}</p>
      {children}
    </div>
  );
}

function StatRow({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[12px] text-muted">{label}</span>
      <span className={`text-[12px] font-medium ${warn ? "text-warn" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

function ActivityIcon({ type }: { type: string }) {
  if (type === "alert")       return <AlertTriangle className="w-3.5 h-3.5 text-warn" />;
  if (type === "task")        return <CheckCircle2  className="w-3.5 h-3.5 text-ok" />;
  if (type === "integration") return <Activity      className="w-3.5 h-3.5 text-accent" />;
  return <Clock className="w-3.5 h-3.5 text-muted" />;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function HospitalityDashboard() {
  const overview = useMemo(() => getDemoOverview(), []);
  const ops      = useMemo(() => getDemoOperations(), []);
  const activity = useMemo(() => getDemoActivity(), []);

  const kpis = useMemo(
    () => getKpiCards(overview.metrics, overview.property.currency),
    [overview],
  );

  const topAlerts = overview.topAlerts;

  return (
    <div className="flex flex-col h-full overflow-auto">
      <PageHeader
        eyebrow="Hospitality"
        title="Command Centre"
        description={`${overview.property.name} · Live Operations`}
        action={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent-soft text-accent-strong border border-accent/20">
              DEMO
            </span>
            <span className="text-[12px] text-muted flex items-center gap-1">
              {[...Array(overview.property.starRating ?? 0)].map((_, i) => (
                <Star key={i} className="w-3 h-3 text-warn" />
              ))}
              {overview.property.totalRooms} rooms · {overview.property.city}
            </span>
          </div>
        }
      />

      <div className="flex-1 p-6 space-y-6">
        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpis.map(k => (
            <KpiCard key={k.id} {...k} />
          ))}
        </div>

        {/* Middle: alerts + departments */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Active alerts (left 3/5) */}
          <div className="lg:col-span-3 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-crit" />
                Active Alerts
                <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-crit-soft text-crit">
                  {topAlerts.length}
                </span>
              </h2>
              <Link
                href="/hospitality/alerts"
                className="text-[12px] text-accent flex items-center gap-0.5 hover:underline"
              >
                View all <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            {topAlerts.length === 0 ? (
              <div className="bg-surface border border-border rounded-xl p-6 text-center">
                <CheckCircle2 className="w-8 h-8 text-ok mx-auto mb-2" />
                <p className="text-sm text-muted">No active alerts</p>
              </div>
            ) : (
              <div className="space-y-2">
                {topAlerts.map(a => <AlertCard key={a.id} alert={a} />)}
              </div>
            )}
          </div>

          {/* Department performance (right 2/5) */}
          <div className="lg:col-span-2 space-y-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-muted" />
              Department Scores
            </h2>
            <div className="space-y-2">
              {overview.departments.map(d => <DeptCard key={d.key} dept={d} />)}
            </div>
          </div>
        </div>

        {/* Operations snapshot */}
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">Operations Snapshot</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <OpsBlock label="ROOMS">
              <StatRow label="Occupied"       value={ops.rooms.occupied} />
              <StatRow label="Available"      value={ops.rooms.available} />
              <StatRow label="Dirty"          value={ops.rooms.dirty} warn={ops.rooms.dirty > 10} />
              <StatRow label="Out of Order"   value={ops.rooms.outOfOrder} warn={ops.rooms.outOfOrder > 0} />
              <StatRow label="VIP"            value={ops.rooms.vip} />
              <StatRow label="Check-ins today"  value={ops.rooms.checkInToday} />
              <StatRow label="Check-outs today" value={ops.rooms.checkOutToday} />
            </OpsBlock>
            <OpsBlock label="HOUSEKEEPING">
              <StatRow label="Pending"         value={ops.housekeeping.pending} warn={ops.housekeeping.pending > 10} />
              <StatRow label="Completed"       value={ops.housekeeping.completed} />
              <StatRow label="Delayed"         value={ops.housekeeping.delayed} warn={ops.housekeeping.delayed > 0} />
              <StatRow label="Avg turnaround"  value={`${ops.housekeeping.avgTurnaround} min`} warn={ops.housekeeping.avgTurnaround > 35} />
            </OpsBlock>
            <OpsBlock label="FRONT OFFICE">
              <StatRow label="Arrivals"         value={ops.frontOffice.arrivals} />
              <StatRow label="Departures"       value={ops.frontOffice.departures} />
              <StatRow label="VIP arrivals"     value={ops.frontOffice.vipArrivals} />
              <StatRow label="Early check-ins"  value={ops.frontOffice.earlyCheckIns} />
              <StatRow label="Late check-outs"  value={ops.frontOffice.lateCheckOuts} />
              <StatRow label="Guest issues"     value={ops.frontOffice.unresolvedGuest} warn={ops.frontOffice.unresolvedGuest > 0} />
            </OpsBlock>
            <OpsBlock label="F&B / ENGINEERING">
              <StatRow label="F&B Revenue"     value={formatCurrency(ops.fAndB.revenue, overview.property.currency)} />
              <StatRow label="Covers"          value={ops.fAndB.covers} />
              <StatRow label="Avg check"       value={formatCurrency(ops.fAndB.avgCheck, overview.property.currency)} />
              <StatRow label="Stock variance"  value={ops.fAndB.stockVariance ? "Yes" : "No"} warn={ops.fAndB.stockVariance} />
              <div className="border-t border-border-soft my-1.5" />
              <StatRow label="Open work orders" value={ops.engineering.open} />
              <StatRow label="Critical"         value={ops.engineering.critical} warn={ops.engineering.critical > 0} />
              <StatRow label="Overdue"          value={ops.engineering.overdue} warn={ops.engineering.overdue > 0} />
            </OpsBlock>
          </div>
        </div>

        {/* Activity timeline */}
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-muted" />
            Activity Feed
          </h2>
          <div className="bg-surface border border-border rounded-xl divide-y divide-border-soft">
            {activity.map(entry => {
              const relMins = Math.round((Date.now() - new Date(entry.time).getTime()) / 60_000);
              const relLabel = relMins < 60
                ? `${relMins}m ago`
                : `${Math.round(relMins / 60)}h ago`;
              return (
                <div key={entry.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="w-6 h-6 rounded-full bg-surface-sunken flex items-center justify-center flex-shrink-0 mt-0.5">
                    <ActivityIcon type={entry.type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-foreground">{entry.description}</p>
                    {entry.department && (
                      <p className="text-[11px] text-subtle capitalize mt-0.5">{entry.department.replace("_", " ")}</p>
                    )}
                  </div>
                  <span className="text-[11px] text-subtle flex-shrink-0 mt-0.5">{relLabel}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
