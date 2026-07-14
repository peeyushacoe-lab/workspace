"use client";

import { useState, useEffect, useCallback } from "react";
import { Shield, Download, Trash2, RefreshCw, Search, ChevronLeft, ChevronRight, CheckCircle2, Circle, Clock3, MinusCircle, Globe, FileText, ShieldAlert } from "lucide-react";
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

type ComplianceControl = {
  id: string;
  category: string;
  key: string;
  label: string;
  description: string | null;
  status: "NOT_STARTED" | "IN_PROGRESS" | "DONE" | "NOT_APPLICABLE";
  owner: string | null;
  notes: string | null;
  updatedAt: string;
};

const STATUS_CONFIG: Record<ComplianceControl["status"], { label: string; color: string; Icon: React.ElementType }> = {
  NOT_STARTED:    { label: "Not started", color: "text-[#5A6275]", Icon: Circle },
  IN_PROGRESS:    { label: "In progress", color: "text-[#f4b400]", Icon: Clock3 },
  DONE:           { label: "Done",        color: "text-[#0f9d58]", Icon: CheckCircle2 },
  NOT_APPLICABLE: { label: "N/A",         color: "text-[#5A6275]", Icon: MinusCircle },
};

function ChecklistTab({ category, title, hint }: { category: string; title: string; hint: string }) {
  const [controls, setControls] = useState<ComplianceControl[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/compliance/controls?category=${category}`);
      if (res.ok) setControls(await res.json());
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => { void load(); }, [load]);

  const cycleStatus = async (control: ComplianceControl) => {
    const order: ComplianceControl["status"][] = ["NOT_STARTED", "IN_PROGRESS", "DONE", "NOT_APPLICABLE"];
    const next = order[(order.indexOf(control.status) + 1) % order.length];
    setControls(prev => prev.map(c => c.id === control.id ? { ...c, status: next } : c));
    await fetch("/api/compliance/controls", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: control.id, status: next }),
    }).catch(() => void load());
  };

  const doneCount = controls.filter(c => c.status === "DONE" || c.status === "NOT_APPLICABLE").length;

  return (
    <div className="bg-[#12151D] border border-[#262A35] rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#262A35]">
        <Shield className="w-4 h-4 text-[#00C2FF]" />
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-[#5A6275]">{hint}</span>
        <div className="flex-1" />
        {controls.length > 0 && (
          <span className="text-xs text-[#5A6275] font-mono">{doneCount}/{controls.length} complete</span>
        )}
        <button onClick={load} className="p-1.5 text-[#5A6275] hover:text-[#8A92A6]">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      <div className="divide-y divide-[#1C1F28]">
        {loading && controls.length === 0 ? (
          <p className="text-center text-[#5A6275] py-8 text-sm">Loading…</p>
        ) : (
          controls.map(c => {
            const cfg = STATUS_CONFIG[c.status];
            return (
              <button
                key={c.id}
                onClick={() => void cycleStatus(c)}
                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[#1B1F2A]/40 transition-colors"
              >
                <cfg.Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${cfg.color}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#E6E9F0]">{c.label}</p>
                  {c.description && <p className="text-xs text-[#5A6275] mt-0.5">{c.description}</p>}
                </div>
                <span className={`text-[11px] font-medium flex-shrink-0 ${cfg.color}`}>{cfg.label}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function DataResidencyTab() {
  return (
    <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Globe className="w-4 h-4 text-[#00C2FF]" />
        <span className="text-sm font-medium">Data residency</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div className="bg-[#0D1017] border border-[#1C1F28] rounded-lg p-3">
          <p className="text-[10px] text-[#5A6275] mb-1">Application hosting</p>
          <p className="text-[#E6E9F0]">Vercel (serverless functions + edge network)</p>
        </div>
        <div className="bg-[#0D1017] border border-[#1C1F28] rounded-lg p-3">
          <p className="text-[10px] text-[#5A6275] mb-1">Primary database</p>
          <p className="text-[#E6E9F0]">Neon PostgreSQL — us-east-1 (AWS)</p>
        </div>
        <div className="bg-[#0D1017] border border-[#1C1F28] rounded-lg p-3">
          <p className="text-[10px] text-[#5A6275] mb-1">File storage</p>
          <p className="text-[#E6E9F0]">Cloudflare R2 (object storage)</p>
        </div>
        <div className="bg-[#0D1017] border border-[#1C1F28] rounded-lg p-3">
          <p className="text-[10px] text-[#5A6275] mb-1">Cache / queues</p>
          <p className="text-[#E6E9F0]">Upstash Redis</p>
        </div>
        <div className="bg-[#0D1017] border border-[#1C1F28] rounded-lg p-3">
          <p className="text-[10px] text-[#5A6275] mb-1">Email delivery</p>
          <p className="text-[#E6E9F0]">Resend</p>
        </div>
        <div className="bg-[#0D1017] border border-[#1C1F28] rounded-lg p-3">
          <p className="text-[10px] text-[#5A6275] mb-1">AI processing</p>
          <p className="text-[#E6E9F0]">Anthropic Claude API</p>
        </div>
      </div>
      <p className="text-xs text-[#5A6275] leading-relaxed">
        Customer data is currently hosted in the United States across the providers above. Region-pinned or
        EU-resident deployments are not yet offered as a self-serve option — treat requests for data residency
        guarantees outside the US as a sales/legal conversation until a regional deployment story exists.
      </p>
    </div>
  );
}

export default function CompliancePage() {
  const [tab, setTab] = useState<"audit" | "soc2" | "gdpr" | "residency" | "pentest">("audit");

  const tabs: { key: typeof tab; label: string; Icon: React.ElementType }[] = [
    { key: "audit",     label: "Audit log",       Icon: Shield },
    { key: "soc2",      label: "SOC 2 readiness", Icon: ShieldAlert },
    { key: "gdpr",      label: "GDPR & DPA",       Icon: FileText },
    { key: "residency", label: "Data residency",   Icon: Globe },
    { key: "pentest",   label: "Pen testing",      Icon: ShieldAlert },
  ];

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
        {/* Tab bar */}
        <div className="flex flex-wrap gap-2 border-b border-[#262A35] pb-3">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                tab === t.key ? "bg-[#00C2FF]/10 text-[#00C2FF] border border-[#00C2FF]/20" : "text-[#8A92A6] hover:bg-[#1B1F2A]"
              }`}
            >
              <t.Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {tab === "soc2" && (
          <ChecklistTab category="SOC2" title="SOC 2 readiness" hint="Trust Service Criteria checklist" />
        )}

        {tab === "gdpr" && (
          <div className="space-y-4">
            <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-sm font-medium">Data Processing Agreement</p>
                <p className="text-xs text-[#5A6275] mt-0.5">Starting-point DPA template — have counsel review before executing with customers.</p>
              </div>
              <a
                href="/api/compliance/dpa"
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#00C2FF]/10 text-[#00C2FF] border border-[#00C2FF]/20 text-sm hover:bg-[#00C2FF]/20 transition-colors"
              >
                <Download className="w-4 h-4" /> Download DPA template
              </a>
            </div>
            <ChecklistTab category="GDPR" title="GDPR readiness" hint="Articles 28/30/33 obligations" />
          </div>
        )}

        {tab === "residency" && <DataResidencyTab />}

        {tab === "pentest" && (
          <ChecklistTab category="PENTEST" title="Penetration testing" hint="Annual test cadence" />
        )}

        {tab !== "audit" ? null : (
        <>
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
        </>
        )}
      </div>
    </div>
  );
}
