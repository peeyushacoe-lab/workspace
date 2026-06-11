"use client";

import { useState, useEffect, useCallback } from "react";
import { Activity, Database, Server, Zap, RefreshCw, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

type HealthData = {
  status: "ok" | "degraded";
  timestamp: string;
  services: { database: string; redis: string };
  queues: Record<string, { waiting: number; active: number; failed: number; delayed: number } | null>;
};

type MetricsData = {
  users_total: number;
  users_active_30d: number;
  messages_total: number;
  threads_total: number;
  chat_messages_total: number;
  meetings_total: number;
  drive_files_total: number;
  audit_logs_total: number;
  sentinel_alerts_open: number;
  redis_memory_mb: number;
  collected_at: string;
};

function StatusIcon({ ok }: { ok: boolean | null }) {
  if (ok === null) return <AlertTriangle className="w-4 h-4 text-[#ffd166]" />;
  return ok
    ? <CheckCircle className="w-4 h-4 text-[#06d6a0]" />
    : <XCircle className="w-4 h-4 text-[#ff4d6d]" />;
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-[#1b1f2e] border border-[rgba(255,255,255,0.06)] rounded-xl p-4">
      <p className="text-[10px] text-[#5d6579] mb-1">{label}</p>
      <p className="text-2xl font-semibold text-[#dfe1f6]">{typeof value === "number" ? value.toLocaleString() : value}</p>
    </div>
  );
}

export default function SystemHealthPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [h, m] = await Promise.all([
        fetch("/api/health?detail=1").then(r => r.json()),
        fetch("/api/metrics").then(r => r.json()),
      ]);
      setHealth(h as HealthData);
      setMetrics(m as MetricsData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const isOk = (s: string) => s === "ok";

  return (
    <div className="min-h-screen bg-[#0f1321] text-[#dfe1f6] p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] text-[#00d2ff] mb-1">Observability · Phase 28</p>
            <h1 className="text-2xl font-semibold">System Health</h1>
          </div>
          <button onClick={refresh} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#262939] text-[#9aa3b8] text-sm hover:bg-[#2e3347]">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Services */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { label: "Database", icon: Database, ok: health ? isOk(health.services.database) : null },
            { label: "Redis", icon: Server, ok: health ? isOk(health.services.redis) : null },
          ].map(({ label, icon: Icon, ok }) => (
            <div key={label} className="bg-[#1b1f2e] border border-[rgba(255,255,255,0.06)] rounded-xl p-4 flex items-center gap-3">
              <Icon className="w-5 h-5 text-[#5d6579]" />
              <span className="font-medium">{label}</span>
              <div className="flex-1" />
              <StatusIcon ok={ok} />
              <span className={`text-sm ${ok === null ? "text-[#ffd166]" : ok ? "text-[#06d6a0]" : "text-[#ff4d6d]"}`}>
                {ok === null ? "checking" : ok ? "healthy" : "down"}
              </span>
            </div>
          ))}
        </div>

        {/* Metrics grid */}
        {metrics && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <Stat label="Total Users" value={metrics.users_total} />
            <Stat label="Active 30d" value={metrics.users_active_30d} />
            <Stat label="Messages" value={metrics.messages_total} />
            <Stat label="Threads" value={metrics.threads_total} />
            <Stat label="Chat Messages" value={metrics.chat_messages_total} />
            <Stat label="Meetings" value={metrics.meetings_total} />
            <Stat label="Drive Files" value={metrics.drive_files_total} />
            <Stat label="Audit Logs" value={metrics.audit_logs_total} />
            <Stat label="Open Alerts" value={metrics.sentinel_alerts_open} />
            <Stat label="Redis RAM (MB)" value={metrics.redis_memory_mb} />
          </div>
        )}

        {/* Queue health */}
        {health?.queues && (
          <div className="bg-[#1b1f2e] border border-[rgba(255,255,255,0.06)] rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[rgba(255,255,255,0.06)]">
              <Zap className="w-4 h-4 text-[#00d2ff]" />
              <span className="text-sm font-medium">BullMQ Queues</span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.04)] text-[#5d6579]">
                  <th className="text-left px-4 py-2 font-medium">Queue</th>
                  <th className="text-right px-4 py-2 font-medium">Waiting</th>
                  <th className="text-right px-4 py-2 font-medium">Active</th>
                  <th className="text-right px-4 py-2 font-medium">Failed</th>
                  <th className="text-right px-4 py-2 font-medium">Delayed</th>
                  <th className="text-right px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(health.queues).map(([name, q]) => (
                  <tr key={name} className="border-b border-[rgba(255,255,255,0.03)] hover:bg-[#262939]/30">
                    <td className="px-4 py-2 font-mono text-[#9aa3b8]">{name}</td>
                    <td className="px-4 py-2 text-right text-[#9aa3b8]">{q?.waiting ?? "—"}</td>
                    <td className="px-4 py-2 text-right text-[#00d2ff]">{q?.active ?? "—"}</td>
                    <td className={`px-4 py-2 text-right ${q && q.failed > 0 ? "text-[#ff4d6d]" : "text-[#9aa3b8]"}`}>{q?.failed ?? "—"}</td>
                    <td className="px-4 py-2 text-right text-[#9aa3b8]">{q?.delayed ?? "—"}</td>
                    <td className="px-4 py-2 text-right">
                      {q === null
                        ? <span className="text-[#ff4d6d]">offline</span>
                        : q.failed > 0
                          ? <span className="text-[#ffd166]">warn</span>
                          : <span className="text-[#06d6a0]">ok</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {health && (
          <p className="text-xs text-[#5d6579]">
            <Activity className="w-3 h-3 inline mr-1" />
            Overall: <span className={health.status === "ok" ? "text-[#06d6a0]" : "text-[#ff4d6d]"}>{health.status}</span>
            {" · "} Last checked: {new Date(health.timestamp).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}
