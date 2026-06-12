"use client";

import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, Trash2, Zap, CheckCircle2, AlertTriangle, Clock,
  Loader2, ChevronDown, ChevronRight, RotateCcw, X, Code2,
  ChevronLeft, ChevronRight as ChevronRightIcon,
} from "lucide-react";
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

type Job = {
  id: string;
  name: string;
  data: unknown;
  failedReason: string | null;
  stacktrace: string[];
  attemptsMade: number;
  opts: Record<string, unknown>;
  processedOn: number | null;
  finishedOn: number | null;
  timestamp: number;
};

type JobPage = {
  jobs: Job[];
  counts: Record<string, number>;
  offset: number;
  limit: number;
};

function StatPill({ value, color }: { value: number; color: string }) {
  if (value === 0) return <span className="text-[#bdc1c6]">0</span>;
  return <span className={`font-semibold ${color}`}>{value.toLocaleString()}</span>;
}

function JobDetailModal({ job, queueName, onClose, onAction }: {
  job: Job;
  queueName: string;
  onClose: () => void;
  onAction: () => void;
}) {
  const [acting, setActing] = useState(false);

  const act = async (action: "retry" | "remove") => {
    setActing(true);
    try {
      const res = await fetch(`/api/admin/queues/${queueName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, jobId: job.id }),
      });
      if (res.ok) {
        toast.success(action === "retry" ? "Job queued for retry" : "Job removed");
        onAction();
        onClose();
      } else {
        toast.error("Action failed");
      }
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 " onClick={onClose}>
      <div
        className="bg-white border border-[#e8eaed] rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#e8eaed]">
          <Code2 className="w-4 h-4 text-[#1a56db] flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#202124] truncate">{job.name}</p>
            <p className="text-[10px] text-[#9aa0a6] font-mono mt-0.5">{job.id}</p>
          </div>
          <button onClick={onClose} className="p-1 text-[#9aa0a6] hover:text-[#5f6368]"><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3 text-xs">
            {([
              ["Attempts", job.attemptsMade],
              ["Queued", job.timestamp ? new Date(job.timestamp).toLocaleString() : "—"],
              ["Failed at", job.finishedOn ? new Date(job.finishedOn).toLocaleString() : "—"],
            ] as [string, string | number][]).map(([label, val]) => (
              <div key={label} className="bg-white rounded-lg p-3">
                <p className="text-[#9aa0a6] text-[9px] mb-1">{label}</p>
                <p className="text-[#202124] font-mono">{String(val)}</p>
              </div>
            ))}
          </div>

          {job.failedReason && (
            <div>
              <p className="text-[10px] text-[#9aa0a6] mb-1.5">Error</p>
              <div className="bg-[#2a0e1a] border border-red-900/40 rounded-lg p-3">
                <p className="text-red-300 text-xs font-mono break-all whitespace-pre-wrap">{job.failedReason}</p>
              </div>
            </div>
          )}

          {job.stacktrace?.length > 0 && (
            <div>
              <p className="text-[10px] text-[#9aa0a6] mb-1.5">Stack Trace</p>
              <div className="bg-white border border-[#e8eaed] rounded-lg p-3 max-h-48 overflow-y-auto">
                {job.stacktrace.map((line, i) => (
                  <p key={i} className="text-[#9aa0a6] text-[10px] font-mono break-all leading-5">{line}</p>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-[10px] text-[#9aa0a6] mb-1.5">Job Data</p>
            <div className="bg-white border border-[#e8eaed] rounded-lg p-3 max-h-48 overflow-y-auto">
              <pre className="text-[#5f6368] text-[10px] font-mono whitespace-pre-wrap break-all">
                {JSON.stringify(job.data, null, 2)}
              </pre>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-t border-[#e8eaed]">
          <button
            onClick={() => void act("retry")}
            disabled={acting}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#1a56db]/10 text-[#1a56db] border border-[#1a56db]/20 hover:bg-[#1a56db]/20 transition-colors disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Retry
          </button>
          <button
            onClick={() => void act("remove")}
            disabled={acting}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" /> Remove
          </button>
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2 text-xs text-[#9aa0a6] hover:text-[#5f6368] transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
}

function JobRowActions({ job, queueName, onDone }: { job: Job; queueName: string; onDone: () => void }) {
  const [acting, setActing] = useState(false);

  const act = async (action: "retry" | "remove", e: React.MouseEvent) => {
    e.stopPropagation();
    setActing(true);
    try {
      const res = await fetch(`/api/admin/queues/${queueName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, jobId: job.id }),
      });
      if (res.ok) {
        toast.success(action === "retry" ? "Queued for retry" : "Removed");
        onDone();
      } else {
        toast.error("Failed");
      }
    } finally {
      setActing(false);
    }
  };

  return (
    <>
      <button onClick={(e) => void act("retry", e)} disabled={acting} title="Retry"
        className="p-1.5 text-[#9aa0a6] hover:text-[#1a56db] hover:bg-[#f1f3f4] rounded transition-colors disabled:opacity-40">
        <RotateCcw className="w-3.5 h-3.5" />
      </button>
      <button onClick={(e) => void act("remove", e)} disabled={acting} title="Remove"
        className="p-1.5 text-[#9aa0a6] hover:text-red-400 hover:bg-[#f1f3f4] rounded transition-colors disabled:opacity-40">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </>
  );
}

function DeadLetterPanel({ queueName, onClose }: { queueName: string; onClose: () => void }) {
  const LIMIT = 20;
  const [page, setPage] = useState<JobPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [acting, setActing] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  const load = useCallback(async (off = 0) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/queues/${queueName}?state=failed&offset=${off}&limit=${LIMIT}`);
      if (res.ok) { setPage(await res.json() as JobPage); setOffset(off); }
    } finally {
      setLoading(false);
    }
  }, [queueName]);

  useEffect(() => { void load(0); }, [load]);

  const retryAll = async () => {
    if (!confirm(`Retry all failed jobs in ${queueName}?`)) return;
    setActing(true);
    try {
      const res = await fetch(`/api/admin/queues/${queueName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry-all" }),
      });
      if (res.ok) { toast.success("All failed jobs queued for retry"); void load(0); }
      else toast.error("Failed");
    } finally {
      setActing(false);
    }
  };

  const total = page?.counts?.failed ?? 0;
  const totalPages = Math.ceil(total / LIMIT);
  const currentPage = Math.floor(offset / LIMIT) + 1;

  return (
    <>
      {selectedJob && (
        <JobDetailModal
          job={selectedJob}
          queueName={queueName}
          onClose={() => setSelectedJob(null)}
          onAction={() => void load(offset)}
        />
      )}
      <div className="bg-white border border-[#e8eaed] rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#e8eaed] bg-[#f1f3f4]">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-[#202124]">
            Dead Letter — <span className="font-mono text-[#1a56db]">{queueName}</span>
          </span>
          {total > 0 && (
            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
              {total} failed
            </span>
          )}
          <div className="flex-1" />
          {total > 0 && (
            <button onClick={() => void retryAll()} disabled={acting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#1a56db]/10 text-[#1a56db] border border-[#1a56db]/20 hover:bg-[#1a56db]/20 transition-colors disabled:opacity-50">
              <RotateCcw className="w-3 h-3" /> Retry All
            </button>
          )}
          <button onClick={() => void load(offset)} className="p-1.5 text-[#9aa0a6] hover:text-[#5f6368]">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={onClose} className="p-1.5 text-[#9aa0a6] hover:text-[#5f6368]">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 gap-2 text-[#9aa0a6] text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading failed jobs…
          </div>
        ) : page?.jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-400/50" />
            <p className="text-[#9aa0a6] text-sm">No failed jobs</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#f0f0f0] text-[#9aa0a6] text-xs">
                  <th className="text-left px-4 py-2.5 font-medium">Job</th>
                  <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Error</th>
                  <th className="text-right px-4 py-2.5 font-medium">Attempts</th>
                  <th className="text-right px-4 py-2.5 font-medium hidden sm:table-cell">Failed at</th>
                  <th className="text-right px-4 py-2.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {page?.jobs.map((job) => (
                  <tr key={job.id} onClick={() => setSelectedJob(job)}
                    className="border-b border-[#f0f0f0] hover:bg-[#f1f3f4]/30 cursor-pointer">
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs text-[#202124]">{job.name}</p>
                      <p className="text-[10px] text-[#bdc1c6] font-mono mt-0.5 truncate max-w-[160px]">{job.id}</p>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell max-w-[280px]">
                      <p className="text-xs text-red-300/80 truncate">{job.failedReason ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-xs text-[#5f6368]">{job.attemptsMade}</span>
                    </td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell">
                      <span className="text-xs text-[#9aa0a6]">
                        {job.finishedOn ? new Date(job.finishedOn).toLocaleTimeString() : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <JobRowActions job={job} queueName={queueName} onDone={() => void load(offset)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#f0f0f0] text-xs text-[#9aa0a6]">
            <span>Page {currentPage} of {totalPages}</span>
            <div className="flex items-center gap-1">
              <button disabled={offset === 0} onClick={() => void load(offset - LIMIT)}
                className="p-1 hover:text-[#5f6368] disabled:opacity-30 transition-colors">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button disabled={offset + LIMIT >= total} onClick={() => void load(offset + LIMIT)}
                className="p-1 hover:text-[#5f6368] disabled:opacity-30 transition-colors">
                <ChevronRightIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default function QueuesPage() {
  const [data, setData] = useState<QueueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [expandedQueue, setExpandedQueue] = useState<string | null>(null);

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
    if (!confirm(`${action === "drain" ? "Drain waiting jobs from" : "Clear all failed jobs in"} ${queueName}?`)) return;
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
    <div className="min-h-screen bg-white text-[#202124]">
      <PageHeader
        eyebrow="Admin"
        title="Queue Monitor"
        description="BullMQ job queues — worker health, throughput, dead-letter viewer, and replay."
      />

      <div className="px-6 pb-8 max-w-5xl space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-4 gap-3">
          {([
            { label: "Queues", value: data?.queues.length ?? 9, Icon: Zap, color: "text-[#1a56db]" },
            { label: "Active jobs", value: totalActive, Icon: Loader2, color: "text-blue-400" },
            { label: "Failed jobs", value: totalFailed, Icon: AlertTriangle, color: totalFailed > 0 ? "text-red-400" : "text-emerald-400" },
            { label: "Last refresh", value: data ? new Date(data.collectedAt).toLocaleTimeString() : "—", Icon: Clock, color: "text-[#9aa0a6]" },
          ] as { label: string; value: number | string; Icon: React.ElementType; color: string }[]).map(({ label, value, Icon, color }) => (
            <div key={label} className="bg-white border border-[#e8eaed] rounded-xl p-4 flex items-center gap-3">
              <Icon className={`w-5 h-5 flex-shrink-0 ${color}`} />
              <div>
                <p className="text-[10px] text-[#9aa0a6]">{label}</p>
                <p className={`font-semibold text-sm ${color}`}>{String(value)}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Queue table */}
        <div className="bg-white border border-[#e8eaed] rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[#e8eaed]">
            <Zap className="w-4 h-4 text-[#1a56db]" />
            <span className="text-sm font-medium">BullMQ Queues</span>
            <div className="flex-1" />
            <button onClick={load} className="p-1.5 text-[#9aa0a6] hover:text-[#5f6368]">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#f0f0f0] text-[#9aa0a6] text-xs">
                  <th className="w-8 px-2" />
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
                  <tr><td colSpan={8} className="text-center text-[#9aa0a6] py-10">Loading queue metrics…</td></tr>
                ) : data?.queues.map((q) => (
                  <tr key={q.name} className="border-b border-[#f0f0f0] hover:bg-[#f1f3f4]/30">
                    <td className="px-2 py-3 text-center">
                      {q.failed > 0 && (
                        <button
                          onClick={() => setExpandedQueue(expandedQueue === q.name ? null : q.name)}
                          className="text-[#9aa0a6] hover:text-[#5f6368] transition-colors p-0.5"
                          title="View failed jobs"
                        >
                          {expandedQueue === q.name
                            ? <ChevronDown className="w-3.5 h-3.5" />
                            : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {q.active > 0
                          ? <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                          : q.failed > 0
                          ? <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                          : <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/50" />}
                        <span className="font-mono text-xs text-[#202124]">{q.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs"><StatPill value={q.waiting} color="text-yellow-400" /></td>
                    <td className="px-4 py-3 text-right text-xs"><StatPill value={q.active} color="text-blue-400" /></td>
                    <td className="px-4 py-3 text-right text-xs"><StatPill value={q.completed} color="text-emerald-400" /></td>
                    <td className="px-4 py-3 text-right text-xs">
                      {q.failed > 0 ? (
                        <button
                          onClick={() => setExpandedQueue(expandedQueue === q.name ? null : q.name)}
                          className="font-semibold text-red-400 hover:text-red-300 hover:underline transition-colors"
                        >
                          {q.failed.toLocaleString()}
                        </button>
                      ) : <span className="text-[#bdc1c6]">0</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-xs"><StatPill value={q.delayed} color="text-purple-400" /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {q.failed > 0 && (
                          <button onClick={() => void queueAction(q.name, "clean-failed")} disabled={acting === q.name}
                            title="Clear all failed jobs"
                            className="p-1 text-[#9aa0a6] hover:text-red-400 transition-colors disabled:opacity-40">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {q.waiting > 0 && (
                          <button onClick={() => void queueAction(q.name, "drain")} disabled={acting === q.name}
                            title="Drain waiting jobs"
                            className="p-1 text-[#9aa0a6] hover:text-yellow-400 transition-colors disabled:opacity-40">
                            <Zap className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {q.waiting === 0 && q.failed === 0 && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#bdc1c6]" />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Dead-letter panel */}
        {expandedQueue && (
          <DeadLetterPanel
            queueName={expandedQueue}
            onClose={() => setExpandedQueue(null)}
          />
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-4 text-xs text-[#9aa0a6]">
          {([
            ["bg-yellow-400", "Waiting — queued but not started"],
            ["bg-blue-400 animate-pulse", "Active — currently processing"],
            ["bg-emerald-400", "Completed — finished successfully"],
            ["bg-red-400", "Failed — click count to inspect & replay"],
            ["bg-purple-400", "Delayed — scheduled for future"],
          ] as [string, string][]).map(([cls, label]) => (
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

