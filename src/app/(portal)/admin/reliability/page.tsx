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
  if (pct >= 99.9) return "text-emerald-400";
  if (pct >= 99.0) return "text-yellow-400";
  return "text-red-400";
}

function uptimeDotClass(pct: number): string {
  if (pct >= 99.9) return "bg-emerald-400";
  if (pct >= 99.0) return "bg-yellow-400";
  return "bg-red-400 animate-pulse";
}

function JobStatusBadge({ status }: { status: ScheduledJobStatus }) {
  if (status === "ok") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
        <CheckCircle2 className="w-3 h-3" /> OK
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/25">
        <Clock className="w-3 h-3" /> Pending
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-red-500/15 text-red-400 border border-red-500/25">
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
    <div className="bg-[#1b1f2e] border border-[rgba(255,255,255,0.06)] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-[#5d6579] flex-shrink-0" />
        <p className="text-[10px] text-[#5d6579]">{label}</p>
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
    <div className="min-h-screen bg-[#0f1321] text-[#dfe1f6]">
      <PageHeader
        eyebrow="Admin"
        title="Reliability"
        description="Service uptime, scheduled job status, and recent error events. Auto-refreshes every 30 seconds."
      />

      <div className="px-6 pb-10 max-w-5xl space-y-6">
        {/* ── Toolbar ── */}
        <div className="flex items-center gap-3">
          <div className="flex-1" />
          <span className="text-[10px] text-[#5d6579]">
            Next refresh in {countdown}s
          </span>
          <button
            onClick={handleManualRefresh}
            className="p-2 text-[#5d6579] hover:text-[#9aa3b8] transition-colors"
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
        <div className="bg-[#1b1f2e] border border-[rgba(255,255,255,0.06)] rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[rgba(255,255,255,0.06)]">
            <Clock className="w-4 h-4 text-[#00d2ff]" />
            <span className="text-sm font-medium">Scheduled Jobs</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.04)] text-[#5d6579] text-xs">
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
                    <td colSpan={4} className="text-center text-[#5d6579] py-10">
                      <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                      Loading job status…
                    </td>
                  </tr>
                ) : (
                  data?.scheduledJobs.map((job) => (
                    <tr
                      key={job.name}
                      className="border-b border-[rgba(255,255,255,0.03)] hover:bg-[#262939]/30"
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-[#dfe1f6]">{job.name}</span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <code className="text-[10px] font-mono text-[#00d2ff] bg-[rgba(0,210,255,0.06)] px-1.5 py-0.5 rounded">
                          {job.schedule}
                        </code>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#5d6579] hidden md:table-cell">
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
          <div className="bg-[#1b1f2e] border border-[rgba(255,255,255,0.06)] rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[rgba(255,255,255,0.06)]">
              <AlertTriangle className="w-4 h-4 text-yellow-400" />
              <span className="text-sm font-medium">Recent Errors</span>
              {data.recentErrors.length > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/25">
                  {data.recentErrors.length}
                </span>
              )}
            </div>
            {data.recentErrors.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400/50" />
                <p className="text-[#5d6579] text-sm">No recent errors</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[rgba(255,255,255,0.04)] text-[#5d6579] text-xs">
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
                        className="border-b border-[rgba(255,255,255,0.03)] hover:bg-[#262939]/30"
                      >
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-[#00d2ff]">{err.service}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-red-300/80 max-w-xs truncate">
                          {err.message}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-[#5d6579] hidden sm:table-cell">
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
        <div className="bg-[#1b1f2e] border border-[rgba(255,255,255,0.06)] rounded-xl p-4">
          <p className="text-[10px] text-[#5d6579] mb-3">
            Related admin pages
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/queues"
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#262939] text-[#9aa3b8] border border-[rgba(255,255,255,0.06)] hover:bg-[#2e3347] hover:text-[#dfe1f6] transition-colors"
            >
              <Zap className="w-3.5 h-3.5 text-[#00d2ff]" />
              Queue Monitor
              <ExternalLink className="w-3 h-3 text-[#5d6579]" />
            </Link>
            <Link
              href="/admin/health"
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#262939] text-[#9aa3b8] border border-[rgba(255,255,255,0.06)] hover:bg-[#2e3347] hover:text-[#dfe1f6] transition-colors"
            >
              <Activity className="w-3.5 h-3.5 text-[#00d2ff]" />
              System Health
              <ExternalLink className="w-3 h-3 text-[#5d6579]" />
            </Link>
          </div>
        </div>

        {/* ── Footer ── */}
        {data && (
          <p className="text-xs text-[#5d6579]">
            <Clock className="w-3 h-3 inline mr-1" />
            Last checked: {new Date(data.lastChecked).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}
