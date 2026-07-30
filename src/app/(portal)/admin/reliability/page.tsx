"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Activity,
  Server,
  Database,
  Layers,
  Zap,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Loader2,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/Shell";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ScheduledJobStatus = "ok" | "pending" | "failed";

type ScheduledJob = {
  name: string;
  schedule: string;
  lastRun: string | null;
  status: ScheduledJobStatus;
};

type RecentError = {
  message: string;
  service: string;
  timestamp: string;
};

type ReliabilityData = {
  uptime: {
    api: string;
    database: string;
    redis: string;
    queues: string;
  };
  lastChecked: string;
  recentErrors: RecentError[];
  scheduledJobs: ScheduledJob[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse "99.9%" → 99.9 */
function parsePercent(s: string): number {
  return parseFloat(s.replace("%", ""));
}

function uptimeColor(pct: number): string {
  if (pct >= 99.9) return "text-ok";
  if (pct >= 99.0) return "text-warn";
  return "text-crit";
}

function uptimeDotClass(pct: number): string {
  if (pct >= 99.9) return "bg-ok";
  if (pct >= 99.0) return "bg-warn";
  return "bg-crit animate-pulse";
}

function JobStatusBadge({ status }: { status: ScheduledJobStatus }) {
  if (status === "ok") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-ok/15 text-ok border border-ok/25">
        <CheckCircle2 className="w-3 h-3" /> OK
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-warn/15 text-warn border border-warn/25">
        <Clock className="w-3 h-3" /> Pending
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-crit/15 text-crit border border-crit/25">
      <XCircle className="w-3 h-3" /> Failed
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function UptimeCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | undefined;
  icon: React.ElementType;
}) {
  const pct = value ? parsePercent(value) : 100;
  const color = uptimeColor(pct);
  const dotCls = uptimeDotClass(pct);

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-subtle flex-shrink-0" />
        <p className="text-[10px] text-subtle">{label}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotCls}`} />
        <span className={`text-2xl font-semibold tabular-nums ${color}`}>
          {value ?? "—"}
        </span>
      </div>
      <p className={`text-[10px] mt-1 ${color}`}>
        {pct >= 99.9 ? "Nominal" : pct >= 99.0 ? "Degraded" : "Incident"}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL_MS = 30_000;

export default function ReliabilityPage() {
  const [data, setData] = useState<ReliabilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL_MS / 1000);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/reliability");
      if (res.ok) setData((await res.json()) as ReliabilityData);
    } finally {
      setLoading(false);
      setCountdown(REFRESH_INTERVAL_MS / 1000);
    }
  }, []);

  // Auto-refresh every 30 s
  useEffect(() => {
    void load();

    timerRef.current = setInterval(() => {
      void load();
    }, REFRESH_INTERVAL_MS);

    countdownRef.current = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [load]);

  const handleManualRefresh = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    void load();
    timerRef.current = setInterval(() => void load(), REFRESH_INTERVAL_MS);
    countdownRef.current = setInterval(
      () => setCountdown((c) => (c > 0 ? c - 1 : 0)),
      1000,
    );
  };

  return (
    <div className="min-h-full bg-surface text-foreground">
      <PageHeader
        eyebrow="Admin"
        title="Reliability"
        description="Service uptime, scheduled job status, and recent error events. Auto-refreshes every 30 seconds."
      />

      <div className="px-6 pb-10 max-w-5xl space-y-6">
        {/* ── Toolbar ── */}
        <div className="flex items-center gap-3">
          <div className="flex-1" />
          <span className="text-[10px] text-subtle">
            Next refresh in {countdown}s
          </span>
          <button
            onClick={handleManualRefresh}
            className="p-2 text-subtle hover:text-muted transition-colors"
            title="Refresh now"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* ── Uptime cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <UptimeCard label="API" value={data?.uptime.api} icon={Activity} />
          <UptimeCard label="Database" value={data?.uptime.database} icon={Database} />
          <UptimeCard label="Redis" value={data?.uptime.redis} icon={Server} />
          <UptimeCard label="Queues" value={data?.uptime.queues} icon={Layers} />
        </div>

        {/* ── Scheduled jobs ── */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Clock className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium">Scheduled Jobs</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-soft text-subtle text-xs">
                  <th className="text-left px-4 py-2.5 font-medium">Job</th>
                  <th className="text-left px-4 py-2.5 font-medium hidden sm:table-cell">
                    Schedule (cron)
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">
                    Last run
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading && !data ? (
                  <tr>
                    <td colSpan={4} className="text-center text-subtle py-10">
                      <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                      Loading job status…
                    </td>
                  </tr>
                ) : (
                  data?.scheduledJobs.map((job) => (
                    <tr
                      key={job.name}
                      className="border-b border-border-soft hover:bg-surface-sunken/30"
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-foreground">{job.name}</span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <code className="text-[10px] font-mono text-accent bg-accent/[0.06] px-1.5 py-0.5 rounded">
                          {job.schedule}
                        </code>
                      </td>
                      <td className="px-4 py-3 text-xs text-subtle hidden md:table-cell">
                        {job.lastRun ? new Date(job.lastRun).toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <JobStatusBadge status={job.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Recent errors ── */}
        {data && (
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <AlertTriangle className="w-4 h-4 text-warn" />
              <span className="text-sm font-medium">Recent Errors</span>
              {data.recentErrors.length > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-warn/15 text-warn border border-warn/25">
                  {data.recentErrors.length}
                </span>
              )}
            </div>
            {data.recentErrors.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <CheckCircle2 className="w-8 h-8 text-ok/50" />
                <p className="text-subtle text-sm">No recent errors</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-soft text-subtle text-xs">
                      <th className="text-left px-4 py-2.5 font-medium">Service</th>
                      <th className="text-left px-4 py-2.5 font-medium">Message</th>
                      <th className="text-right px-4 py-2.5 font-medium hidden sm:table-cell">
                        Time
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentErrors.map((err, i) => (
                      <tr
                        key={i}
                        className="border-b border-border-soft hover:bg-surface-sunken/30"
                      >
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-accent">{err.service}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-crit/80 max-w-xs truncate">
                          {err.message}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-subtle hidden sm:table-cell">
                          {new Date(err.timestamp).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Quick links ── */}
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-[10px] text-subtle mb-3">
            Related admin pages
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/queues"
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-surface-sunken text-muted border border-border hover:bg-hover hover:text-foreground transition-colors"
            >
              <Zap className="w-3.5 h-3.5 text-accent" />
              Queue Monitor
              <ExternalLink className="w-3 h-3 text-subtle" />
            </Link>
            <Link
              href="/admin/health"
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-surface-sunken text-muted border border-border hover:bg-hover hover:text-foreground transition-colors"
            >
              <Activity className="w-3.5 h-3.5 text-accent" />
              System Health
              <ExternalLink className="w-3 h-3 text-subtle" />
            </Link>
          </div>
        </div>

        {/* ── Footer ── */}
        {data && (
          <p className="text-xs text-subtle">
            <Clock className="w-3 h-3 inline mr-1" />
            Last checked: {new Date(data.lastChecked).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}
