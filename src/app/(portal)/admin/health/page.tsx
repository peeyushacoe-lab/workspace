"use client";

import { useState, useEffect, useCallback } from "react";
import { Activity, Database, Server, Zap, RefreshCw, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/Shell";

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
  if (ok === null) return <AlertTriangle className="w-4 h-4 text-warn" />;
  return ok
    ? <CheckCircle className="w-4 h-4 text-ok" />
    : <XCircle className="w-4 h-4 text-crit" />;
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <p className="text-[10px] text-subtle mb-1">{label}</p>
      <p className="text-2xl font-semibold font-mono text-foreground">{typeof value === "number" ? value.toLocaleString() : value}</p>
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
    <div className="min-h-full bg-surface text-foreground">
      <PageHeader
        eyebrow="Admin · Observability"
        title="System Health"
        description="Live service status, platform metrics, and BullMQ queue health."
      />

      <div className="px-6 pb-10 max-w-6xl space-y-6">
        <div className="flex items-center">
          <div className="flex-1" />
          <button onClick={refresh} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-sunken text-muted text-sm border border-border hover:bg-hover hover:text-foreground transition-colors">
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
            <div key={label} className="bg-surface border border-border rounded-xl p-4 flex items-center gap-3">
              <Icon className="w-5 h-5 text-subtle" />
              <span className="font-medium">{label}</span>
              <div className="flex-1" />
              <StatusIcon ok={ok} />
              <span className={`text-sm font-medium ${ok === null ? "text-warn" : ok ? "text-ok" : "text-crit"}`}>
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
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Zap className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium">BullMQ Queues</span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border-soft text-subtle">
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
                  <tr key={name} className="border-b border-border-soft hover:bg-surface-sunken">
                    <td className="px-4 py-2 font-mono text-foreground">{name}</td>
                    <td className="px-4 py-2 text-right font-mono text-muted">{q?.waiting ?? "—"}</td>
                    <td className="px-4 py-2 text-right font-mono text-accent">{q?.active ?? "—"}</td>
                    <td className={`px-4 py-2 text-right font-mono ${q && q.failed > 0 ? "text-crit" : "text-muted"}`}>{q?.failed ?? "—"}</td>
                    <td className="px-4 py-2 text-right font-mono text-muted">{q?.delayed ?? "—"}</td>
                    <td className="px-4 py-2 text-right">
                      {q === null
                        ? <span className="font-medium text-crit">offline</span>
                        : q.failed > 0
                          ? <span className="font-medium text-warn">warn</span>
                          : <span className="font-medium text-ok">ok</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {health && (
          <p className="text-xs text-subtle">
            <Activity className="w-3 h-3 inline mr-1" />
            Overall: <span className={health.status === "ok" ? "text-ok" : "text-crit"}>{health.status}</span>
            {" · "} Last checked: {new Date(health.timestamp).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}
