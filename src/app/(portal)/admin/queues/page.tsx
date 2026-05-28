"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Trash2, Zap, CheckCircle2, AlertTriangle, Clock, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/Shell";
import { toast } from "sonner";

type QueueStat = {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
};

type QueueData = {
  queues: QueueStat[];
  collectedAt: string;
};

function StatPill({ value, color }: { value: number; color: string }) {
  if (value === 0) return <span className="text-[#3c4f5a]">0</span>;
  return <span className={`font-semibold ${color}`}>{value.toLocaleString()}</span>;
}

export default function QueuesPage() {
  const [data, setData] = useState<QueueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/queues");
      if (res.ok) setData(await res.json() as QueueData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const queueAction = async (queueName: string, action: "drain" | "clean-failed") => {
    if (!confirm(`${action === "drain" ? "Drain waiting jobs from" : "Clear failed jobs in"} ${queueName}?`)) return;
    setActing(queueName);
    try {
      const res = await fetch("/api/admin/queues", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueName, action }),
      });
      if (res.ok) { toast.success("Done"); void load(); }
      else toast.error("Failed");
    } finally {
      setActing(null);
    }
  };

  const totalFailed = data?.queues.reduce((s, q) => s + q.failed, 0) ?? 0;
  const totalActive = data?.queues.reduce((s, q) => s + q.active, 0) ?? 0;

  return (
    <div className="min-h-screen bg-[#0f1321] text-[#dfe1f6]">
      <PageHeader
        eyebrow="Admin · Phase 35"
        title="Queue Monitor"
        description="BullMQ job queues — worker health, throughput, and failure management."
      />

      <div className="px-6 pb-8 max-w-5xl space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Queues", value: data?.queues.length ?? 9, icon: Zap, color: "text-[#00d2ff]" },
            { label: "Active jobs", value: totalActive, icon: Loader2, color: "text-blue-400" },
            { label: "Failed jobs", value: totalFailed, icon: AlertTriangle, color: totalFailed > 0 ? "text-red-400" : "text-emerald-400" },
            { label: "Last refresh", value: data ? new Date(data.collectedAt).toLocaleTimeString() : "—", icon: Clock, color: "text-[#5c6b72]" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-[#1b1f2e] border border-[rgba(0,255,255,0.08)] rounded-xl p-4 flex items-center gap-3">
              <Icon className={`w-5 h-5 flex-shrink-0 ${color}`} />
              <div>
                <p className="text-[10px] text-[#5c6b72] uppercase tracking-widest">{label}</p>
                <p className={`font-semibold text-sm ${color}`}>{String(value)}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Queue table */}
        <div className="bg-[#1b1f2e] border border-[rgba(0,255,255,0.08)] rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[rgba(0,255,255,0.08)]">
            <Zap className="w-4 h-4 text-[#00d2ff]" />
            <span className="text-sm font-medium">BullMQ Queues</span>
            <div className="flex-1" />
            <button onClick={load} className="p-1.5 text-[#5c6b72] hover:text-[#bbc9cf]">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(0,255,255,0.05)] text-[#5c6b72] text-xs">
                  <th className="text-left px-4 py-2.5 font-medium">Queue</th>
                  <th className="text-right px-4 py-2.5 font-medium">Waiting</th>
                  <th className="text-right px-4 py-2.5 font-medium">Active</th>
                  <th className="text-right px-4 py-2.5 font-medium">Completed</th>
                  <th className="text-right px-4 py-2.5 font-medium">Failed</th>
                  <th className="text-right px-4 py-2.5 font-medium">Delayed</th>
                  <th className="text-right px-4 py-2.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && !data ? (
                  <tr><td colSpan={7} className="text-center text-[#5c6b72] py-10">Loading queue metrics…</td></tr>
                ) : data?.queues.map((q) => (
                  <tr key={q.name} className="border-b border-[rgba(0,255,255,0.03)] hover:bg-[#262939]/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {q.active > 0 ? (
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                        ) : q.failed > 0 ? (
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/50" />
                        )}
                        <span className="font-mono text-xs text-[#dfe1f6]">{q.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs"><StatPill value={q.waiting} color="text-yellow-400" /></td>
                    <td className="px-4 py-3 text-right text-xs"><StatPill value={q.active} color="text-blue-400" /></td>
                    <td className="px-4 py-3 text-right text-xs"><StatPill value={q.completed} color="text-emerald-400" /></td>
                    <td className="px-4 py-3 text-right text-xs"><StatPill value={q.failed} color="text-red-400" /></td>
                    <td className="px-4 py-3 text-right text-xs"><StatPill value={q.delayed} color="text-purple-400" /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {q.failed > 0 && (
                          <button
                            onClick={() => void queueAction(q.name, "clean-failed")}
                            disabled={acting === q.name}
                            title="Clear failed jobs"
                            className="p-1 text-[#5c6b72] hover:text-red-400 transition-colors disabled:opacity-40"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {q.waiting > 0 && (
                          <button
                            onClick={() => void queueAction(q.name, "drain")}
                            disabled={acting === q.name}
                            title="Drain waiting jobs"
                            className="p-1 text-[#5c6b72] hover:text-yellow-400 transition-colors disabled:opacity-40"
                          >
                            <Zap className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {q.waiting === 0 && q.failed === 0 && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#3c4f5a]" />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 text-xs text-[#5c6b72]">
          {[
            ["bg-yellow-400", "Waiting — queued but not started"],
            ["bg-blue-400 animate-pulse", "Active — currently processing"],
            ["bg-emerald-400", "Completed — finished successfully"],
            ["bg-red-400", "Failed — errored, needs investigation"],
            ["bg-purple-400", "Delayed — scheduled for future"],
          ].map(([cls, label]) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${cls}`} />
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
