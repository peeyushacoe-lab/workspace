"use client";

import { useState, useEffect, useCallback } from "react";
import {
  TrendingUp, TrendingDown, Minus, BarChart2, Download,
  Bed, Users, Coffee, Loader2, AlertCircle, Calendar,
  CheckCircle2, XCircle, Printer,
} from "lucide-react";
import { PageHeader } from "@/components/Shell";
import { NexusIntelligencePanel } from "./NexusIntelligencePanel";
import type { ReportData, KPIValue, ReportPeriod } from "@/lib/hospitality/types";

// ─── Period selector ──────────────────────────────────────────────────────────

const PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: "today",     label: "Today"       },
  { value: "yesterday", label: "Yesterday"   },
  { value: "7days",     label: "Last 7 Days" },
  { value: "30days",    label: "Last 30 Days"},
];

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KPICard({ label, kpi, higherBetter = true }: { label: string; kpi: KPIValue; higherBetter?: boolean }) {
  const dir = kpi.changeDir;
  // For "higherBetter = false" items the direction was already inverted in the API
  const isUp       = dir === "up";
  const isDown     = dir === "down";
  const okColor    = "text-ok";
  const critColor  = "text-crit";
  const deltaColor = dir === "stable" ? "text-muted" : isUp ? okColor : critColor;
  const DirIcon    = dir === "up" ? TrendingUp : dir === "down" ? TrendingDown : Minus;

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <p className="text-[11px] font-medium text-subtle uppercase tracking-wide mb-1.5">{label}</p>
      <p className="text-[22px] font-semibold text-foreground tabular-nums leading-none">{kpi.formatted}</p>
      {kpi.changePct != null && (
        <div className={`mt-1.5 flex items-center gap-1 text-[11px] ${deltaColor}`}>
          <DirIcon className="w-3 h-3" />
          <span>{kpi.changePct > 0 ? "+" : ""}{kpi.changePct}% vs previous</span>
        </div>
      )}
      {kpi.previousFormatted && (
        <p className="text-[11px] text-subtle mt-0.5">Prev: {kpi.previousFormatted}</p>
      )}
    </div>
  );
}

// ─── Metric row ───────────────────────────────────────────────────────────────

function MetricRow({ label, value, trend, good, warn }: {
  label: string; value: string; trend?: "up"|"down"|"stable";
  good?: boolean; warn?: boolean;
}) {
  const TrendIcon  = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendOk    = trend && (good ? trend === "up" : trend === "down");
  const trendBad   = trend && (good ? trend === "down" : trend === "up");
  const trendColor = trendOk ? "text-ok" : trendBad ? "text-crit" : "text-muted";
  return (
    <div className="flex items-center py-2.5 border-b border-border-soft last:border-0">
      <span className="text-[13px] text-muted flex-1">{label}</span>
      {trend && <TrendIcon className={`w-3.5 h-3.5 mr-2 ${trendColor}`} />}
      <span className={`text-[13px] font-semibold tabular-nums ${warn ? "text-warn" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function ReportSection({ title, icon: Icon, children }: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border-soft flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted" />
        <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
      </div>
      <div className="px-5 py-1">{children}</div>
    </div>
  );
}

// ─── Alert summary bar ────────────────────────────────────────────────────────

function AlertSummaryBar({ report }: { report: ReportData }) {
  const a = report.alertSummary;
  return (
    <div className="bg-surface border border-border rounded-xl px-5 py-4 flex items-center gap-6 flex-wrap">
      <p className="text-[13px] font-semibold text-foreground flex-shrink-0">Alert Summary</p>
      <div className="flex items-center gap-4 flex-wrap text-[12px]">
        {a.critical > 0 && (
          <span className="flex items-center gap-1.5 text-crit">
            <AlertCircle className="w-3.5 h-3.5" />{a.critical} Critical
          </span>
        )}
        {a.high > 0 && (
          <span className="flex items-center gap-1.5 text-warn">
            <AlertCircle className="w-3.5 h-3.5" />{a.high} High
          </span>
        )}
        {a.medium > 0 && (
          <span className="flex items-center gap-1.5 text-muted">
            <AlertCircle className="w-3.5 h-3.5" />{a.medium} Medium
          </span>
        )}
        {a.low > 0 && (
          <span className="flex items-center gap-1.5 text-subtle">
            <AlertCircle className="w-3.5 h-3.5" />{a.low} Low
          </span>
        )}
        <span className="flex items-center gap-1.5 text-ok">
          <CheckCircle2 className="w-3.5 h-3.5" />{a.resolved} Resolved
        </span>
        {a.total === 0 && <span className="text-muted">No alerts in this period</span>}
      </div>
    </div>
  );
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function downloadCSV(report: ReportData) {
  const rows: string[][] = [
    ["Nexus Hospitality Report"],
    ["Property", report.property.name],
    ["Period",   report.periodLabel],
    ["From",     new Date(report.from).toLocaleDateString()],
    ["To",       new Date(report.to).toLocaleDateString()],
    ["Data",     report.isDemo ? "Demo" : "Live"],
    [],
    ["KPI", "Value", "Previous", "Change %"],
    ["Occupancy",     report.kpis.occupancy.formatted,  report.kpis.occupancy.previousFormatted  ?? "",  report.kpis.occupancy.changePct  != null ? String(report.kpis.occupancy.changePct)  + "%" : ""],
    ["ADR",           report.kpis.adr.formatted,        report.kpis.adr.previousFormatted        ?? "",  report.kpis.adr.changePct        != null ? String(report.kpis.adr.changePct)        + "%" : ""],
    ["RevPAR",        report.kpis.revpar.formatted,     report.kpis.revpar.previousFormatted     ?? "",  report.kpis.revpar.changePct     != null ? String(report.kpis.revpar.changePct)     + "%" : ""],
    ["Arrivals",      report.kpis.arrivals.formatted,   report.kpis.arrivals.previousFormatted   ?? "",  report.kpis.arrivals.changePct   != null ? String(report.kpis.arrivals.changePct)   + "%" : ""],
    ["Departures",    report.kpis.departures.formatted, report.kpis.departures.previousFormatted ?? "",  report.kpis.departures.changePct != null ? String(report.kpis.departures.changePct) + "%" : ""],
    ["Rooms OOO",     report.kpis.roomsOoo.formatted,   report.kpis.roomsOoo.previousFormatted   ?? "",  report.kpis.roomsOoo.changePct   != null ? String(report.kpis.roomsOoo.changePct)   + "%" : ""],
    ["F&B Revenue",   report.kpis.fbRevenue.formatted,  report.kpis.fbRevenue.previousFormatted  ?? "",  report.kpis.fbRevenue.changePct  != null ? String(report.kpis.fbRevenue.changePct)  + "%" : ""],
    ["F&B Covers",    report.kpis.fbCovers.formatted,   report.kpis.fbCovers.previousFormatted   ?? "",  report.kpis.fbCovers.changePct   != null ? String(report.kpis.fbCovers.changePct)   + "%" : ""],
    ["Open Issues",   report.kpis.openIssues.formatted, report.kpis.openIssues.previousFormatted ?? "",  report.kpis.openIssues.changePct != null ? String(report.kpis.openIssues.changePct) + "%" : ""],
    [],
    ["Alerts"],
    ["Critical", String(report.alertSummary.critical)],
    ["High",     String(report.alertSummary.high)],
    ["Medium",   String(report.alertSummary.medium)],
    ["Low",      String(report.alertSummary.low)],
    ["Resolved", String(report.alertSummary.resolved)],
    [],
    ["Department", "Score", "Open Alerts", "Trend"],
    ...report.departments.map(d => [d.label, String(d.score), String(d.openAlerts), d.trend]),
  ];

  const csv = rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `nexus-hospitality-report-${report.periodLabel.replace(/\s+/g, "-").toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main component ───────────────────────────────────────────────────────────

export function HospitalityReports() {
  const [period,  setPeriod]  = useState<ReportPeriod>("today");
  const [report,  setReport]  = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async (p: ReportPeriod) => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/hospitality/reports?period=${p}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load report");
      setReport(data.report ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(period); }, [period, load]);

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="flex flex-col h-full overflow-auto">
      <PageHeader
        eyebrow="Hospitality"
        title="Reports"
        description={`Performance reporting · ${today}`}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-lg text-muted bg-surface-sunken border border-border hover:bg-hover transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
            <button
              disabled={!report}
              onClick={() => report && downloadCSV(report)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-lg text-muted bg-surface-sunken border border-border hover:bg-hover transition-colors disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        }
      />

      <div className="p-6 space-y-5">
        {/* Period selector */}
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar className="w-4 h-4 text-subtle" />
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                period === p.value
                  ? "bg-accent text-accent-foreground"
                  : "bg-surface-sunken text-muted hover:bg-hover border border-border"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20 gap-3 text-muted">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-[13px]">Loading report…</span>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="flex items-center gap-3 bg-crit-soft border border-crit/20 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-crit flex-shrink-0" />
            <p className="text-[13px] text-crit">{error}</p>
            <button onClick={() => load(period)} className="ml-auto text-[12px] text-crit underline">Retry</button>
          </div>
        )}

        {/* Report content */}
        {!loading && report && (
          <>
            {/* Property header */}
            <div className={`border rounded-xl px-5 py-4 flex items-center justify-between flex-wrap gap-2 ${report.isDemo ? "bg-accent-soft border-accent/20" : "bg-surface border-border"}`}>
              <div>
                <p className="text-[15px] font-semibold text-foreground">{report.property.name}</p>
                <p className="text-[12px] text-muted">{report.property.city}, {report.property.country} · {report.property.totalRooms} rooms · {report.periodLabel}</p>
              </div>
              <div className="flex items-center gap-2">
                {report.isDemo
                  ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent text-accent-foreground">DEMO DATA</span>
                  : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-ok-soft text-ok border border-ok/25"><CheckCircle2 className="w-2.5 h-2.5" /> LIVE</span>
                }
              </div>
            </div>

            {/* KPI grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <KPICard label="Occupancy"  kpi={report.kpis.occupancy}  />
              <KPICard label="ADR"        kpi={report.kpis.adr}        />
              <KPICard label="RevPAR"     kpi={report.kpis.revpar}     />
              <KPICard label="F&B Rev."   kpi={report.kpis.fbRevenue}  />
              <KPICard label="Open Issues" kpi={report.kpis.openIssues} higherBetter={false} />
            </div>

            {/* Secondary KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KPICard label="Arrivals"   kpi={report.kpis.arrivals}   />
              <KPICard label="Departures" kpi={report.kpis.departures} />
              <KPICard label="Rooms OOO"  kpi={report.kpis.roomsOoo}   higherBetter={false} />
              <KPICard label="F&B Covers" kpi={report.kpis.fbCovers}   />
            </div>

            {/* Alert summary */}
            <AlertSummaryBar report={report} />

            {/* Detailed sections */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ReportSection title="Rooms & Occupancy" icon={Bed}>
                <MetricRow label="Occupancy rate"     value={report.kpis.occupancy.formatted}  trend={report.kpis.occupancy.changeDir  ?? undefined} good={true} />
                <MetricRow label="Arrivals"           value={report.kpis.arrivals.formatted}   />
                <MetricRow label="Departures"         value={report.kpis.departures.formatted} />
                <MetricRow label="Rooms out of order" value={report.kpis.roomsOoo.formatted}   trend={report.kpis.roomsOoo.changeDir   ?? undefined} good={false} warn={report.kpis.roomsOoo.value > 2} />
                <MetricRow label="Average Daily Rate" value={report.kpis.adr.formatted}        trend={report.kpis.adr.changeDir        ?? undefined} good={true} />
                <MetricRow label="RevPAR"             value={report.kpis.revpar.formatted}     trend={report.kpis.revpar.changeDir     ?? undefined} good={true} />
              </ReportSection>

              <ReportSection title="Food & Beverage" icon={Coffee}>
                <MetricRow label="Revenue"            value={report.kpis.fbRevenue.formatted}  trend={report.kpis.fbRevenue.changeDir ?? undefined} good={true} />
                <MetricRow label="Covers served"      value={report.kpis.fbCovers.formatted}   trend={report.kpis.fbCovers.changeDir  ?? undefined} good={true} />
                <MetricRow
                  label="Average cover value"
                  value={report.kpis.fbCovers.value > 0
                    ? new Intl.NumberFormat("en-IN", { style: "currency", currency: report.property.currency, maximumFractionDigits: 0 }).format(
                        Math.round(report.kpis.fbRevenue.value / report.kpis.fbCovers.value)
                      )
                    : "N/A"
                  }
                />
              </ReportSection>

              <ReportSection title="Department Performance" icon={BarChart2}>
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-border-soft">
                        <th className="text-left py-2.5 pr-4 text-[11px] font-medium text-subtle">DEPARTMENT</th>
                        <th className="text-right py-2.5 pr-4 text-[11px] font-medium text-subtle">SCORE</th>
                        <th className="text-right py-2.5 pr-4 text-[11px] font-medium text-subtle">ALERTS</th>
                        <th className="text-right py-2.5 text-[11px] font-medium text-subtle">TREND</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.departments.map(d => {
                        const TIcon = d.trend === "up" ? TrendingUp : d.trend === "down" ? TrendingDown : Minus;
                        const scoreColor = d.score >= 90 ? "text-ok" : d.score >= 75 ? "text-warn" : "text-crit";
                        const tColor     = d.trend === "up" ? "text-ok" : d.trend === "down" ? "text-crit" : "text-muted";
                        return (
                          <tr key={d.key} className="border-b border-border-soft last:border-0">
                            <td className="py-3 pr-4 font-medium text-foreground">{d.label}</td>
                            <td className="py-3 pr-4 text-right">
                              <span className={`font-semibold ${scoreColor}`}>{d.score}</span>
                              <span className="text-subtle">/100</span>
                            </td>
                            <td className="py-3 pr-4 text-right">
                              <span className={d.openAlerts > 0 ? "text-warn font-medium" : "text-muted"}>{d.openAlerts}</span>
                            </td>
                            <td className="py-3 text-right">
                              <TIcon className={`w-4 h-4 inline ${tColor}`} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </ReportSection>

              <ReportSection title="Alerts & Issues" icon={Users}>
                <MetricRow label="Total alerts (period)"   value={String(report.alertSummary.total)}    />
                <MetricRow label="Critical open"           value={String(report.alertSummary.critical)}  warn={report.alertSummary.critical > 0} />
                <MetricRow label="High open"               value={String(report.alertSummary.high)}      warn={report.alertSummary.high > 2} />
                <MetricRow label="Medium open"             value={String(report.alertSummary.medium)}    />
                <MetricRow label="Resolved"                value={String(report.alertSummary.resolved)}  trend="up" good={true} />
                <MetricRow label="Open operational issues" value={report.kpis.openIssues.formatted}      warn={report.kpis.openIssues.value > 3} />
              </ReportSection>
            </div>

            {/* Demo notice */}
            {report.isDemo && (
              <p className="text-[11px] text-subtle text-center">
                All figures are from demo data. Connect live integrations for real reports.
              </p>
            )}
          </>
        )}

        {/* Nexus Intelligence panel */}
        <NexusIntelligencePanel />
      </div>
    </div>
  );
}
