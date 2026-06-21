"use client";

import { useState, useEffect, useCallback } from "react";
import { Shield, Download, Trash2, RefreshCw, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/Shell";

type AuditEntry = {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: { email: string; fullName: string } | null;
};

export default function CompliancePage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [retentionResult, setRetentionResult] = useState<{ wouldDelete?: Record<string, number>; deleted?: Record<string, number> } | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (search) params.set("action", search);
      const res = await fetch(`/api/compliance/audit-log?${params}`);
      if (res.ok) {
        const data = await res.json() as { logs: AuditEntry[]; total: number; pages: number };
        setLogs(data.logs);
        setTotal(data.total);
        setPages(data.pages);
      }
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { void fetchLogs(); }, [fetchLogs]);

  const handleExport = (format: "json" | "csv") => {
    window.open(`/api/compliance/export?format=${format}`, "_blank");
  };

  const handleRetentionDryRun = async () => {
    const res = await fetch("/api/compliance/retention", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun: true }),
    });
    if (res.ok) setRetentionResult(await res.json() as typeof retentionResult);
  };

  const handleRetentionRun = async () => {
    if (!confirm("This will permanently delete data matching retention policies. Continue?")) return;
    const res = await fetch("/api/compliance/retention", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun: false }),
    });
    if (res.ok) {
      setRetentionResult(await res.json() as typeof retentionResult);
      void fetchLogs();
    }
  };

  return (
    <div className="min-h-screen bg-[#12151D] text-[#E6E9F0]">
      <PageHeader
        eyebrow="Compliance · Phase 27"
        title="Compliance Center"
        description="Audit logs, GDPR data export, and retention policy management"
      />

      <div className="px-6 pb-8 max-w-6xl space-y-6">
        {/* Actions row */}
        <div className="flex flex-wrap gap-3">
          <button onClick={() => handleExport("json")} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#00C2FF]/10 text-[#00C2FF] border border-[#00C2FF]/20 text-sm hover:bg-[#00C2FF]/20 transition-colors">
            <Download className="w-4 h-4" /> Export JSON
          </button>
          <button onClick={() => handleExport("csv")} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#00C2FF]/10 text-[#00C2FF] border border-[#00C2FF]/20 text-sm hover:bg-[#00C2FF]/20 transition-colors">
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <div className="flex-1" />
          <button onClick={handleRetentionDryRun} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1B1F2A] text-[#8A92A6] text-sm hover:bg-[#2e3347] transition-colors">
            <RefreshCw className="w-4 h-4" /> Retention Dry Run
          </button>
          <button onClick={handleRetentionRun} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#ea4335]/10 text-[#ea4335] border border-[#ea4335]/20 text-sm hover:bg-[#ea4335]/20 transition-colors">
            <Trash2 className="w-4 h-4" /> Run Retention
          </button>
        </div>

        {retentionResult && (
          <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-4 text-sm">
            <p className="text-[#8A92A6] font-medium mb-2">Retention Result</p>
            <pre className="bg-[#0D1017] border border-[#1C1F28] rounded-lg p-3 text-[#00C2FF] text-xs font-mono overflow-x-auto">{JSON.stringify(retentionResult, null, 2)}</pre>
          </div>
        )}

        {/* Audit log */}
        <div className="bg-[#12151D] border border-[#262A35] rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[#262A35]">
            <Shield className="w-4 h-4 text-[#00C2FF]" />
            <span className="text-sm font-medium">Audit Log</span>
            <span className="text-xs text-[#5A6275]">({total} entries)</span>
            <div className="flex-1" />
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#5A6275]" />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Filter by action…"
                className="pl-8 pr-3 py-1.5 text-xs bg-[#0D1017] border border-[#2E333F] rounded-lg text-[#E6E9F0] placeholder-[#5A6275] focus:outline-none focus:border-[#00C2FF]/40 w-44"
              />
            </div>
            <button onClick={fetchLogs} className="p-1.5 text-[#5A6275] hover:text-[#8A92A6]">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#1B1F2A] border-b border-[#262A35] text-[#5A6275]">
                  <th className="text-left px-4 py-2.5 font-medium">Time</th>
                  <th className="text-left px-4 py-2.5 font-medium">User</th>
                  <th className="text-left px-4 py-2.5 font-medium">Action</th>
                  <th className="text-left px-4 py-2.5 font-medium">Resource</th>
                  <th className="text-left px-4 py-2.5 font-medium">ID</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-[#5A6275] py-8">No audit logs found</td></tr>
                )}
                {logs.map(log => (
                  <tr key={log.id} className="border-b border-[#1C1F28] hover:bg-[#1B1F2A]/30">
                    <td className="px-4 py-2 text-[#5A6275] whitespace-nowrap font-mono">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-2 text-[#8A92A6] font-mono">{log.actor?.email ?? log.actorId ?? "system"}</td>
                    <td className="px-4 py-2"><span className="font-mono text-[#00C2FF]">{log.action}</span></td>
                    <td className="px-4 py-2 text-[#8A92A6]">{log.targetType ?? "—"}</td>
                    <td className="px-4 py-2 text-[#5A6275] font-mono truncate max-w-[120px]">{log.targetId ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-2 border-t border-[#1C1F28]">
              <span className="text-xs text-[#5A6275]">Page {page} of {pages}</span>
              <div className="flex gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 text-[#5A6275] hover:text-[#8A92A6] disabled:opacity-30">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="p-1 text-[#5A6275] hover:text-[#8A92A6] disabled:opacity-30">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
