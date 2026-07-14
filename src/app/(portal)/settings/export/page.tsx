"use client";

import { useEffect, useState } from "react";
import {
  Download, Loader2, Mail, HardDrive, FileText, Users, CalendarDays,
  CheckCircle2, XCircle, Package,
} from "lucide-react";
import { PageHeader } from "@/components/Shell";
import { toast } from "sonner";

type ExportStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

type ExportJob = {
  id: string;
  status: ExportStatus;
  totalItems: number;
  processedItems: number;
  currentStage: string | null;
  resultSize: number | null;
  errorLog: string[] | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  includeMail?: boolean;
  includeDrive?: boolean;
  includeDocs?: boolean;
  includeContacts?: boolean;
  includeCalendar?: boolean;
};

const cardClass = "bg-[#12151D] border border-[#262A35] rounded-xl";
const primaryBtn =
  "inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#00C2FF] text-[#06121A] hover:bg-[#0098E6] transition disabled:opacity-50 disabled:cursor-not-allowed";

const CATEGORIES: { key: keyof Pick<ExportJob, "includeMail" | "includeDrive" | "includeDocs" | "includeContacts" | "includeCalendar">; label: string; hint: string; Icon: React.ElementType }[] = [
  { key: "includeMail", label: "Mail", hint: "All threads as a .mbox file", Icon: Mail },
  { key: "includeDrive", label: "Drive files", hint: "Original files, organized by folder", Icon: HardDrive },
  { key: "includeDocs", label: "Notes & docs", hint: "Exported as HTML", Icon: FileText },
  { key: "includeContacts", label: "Contacts", hint: "CSV of workspace contacts", Icon: Users },
  { key: "includeCalendar", label: "Calendar", hint: "Your events as .ics", Icon: CalendarDays },
];

function statusBadge(status: ExportStatus) {
  const map: Record<ExportStatus, { label: string; cls: string }> = {
    PENDING: { label: "Queued", cls: "text-[#8A92A6] bg-[#8A92A6]/10 border-[#8A92A6]/20" },
    RUNNING: { label: "Running", cls: "text-[#00C2FF] bg-[#00C2FF]/10 border-[#00C2FF]/20" },
    COMPLETED: { label: "Ready", cls: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
    FAILED: { label: "Failed", cls: "text-[#ea4335] bg-[#ea4335]/10 border-[#ea4335]/20" },
  };
  const { label, cls } = map[status];
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${cls}`}>{label}</span>;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes, i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${units[i]}`;
}

export default function ExportPage() {
  const [selected, setSelected] = useState<Record<string, boolean>>({
    includeMail: true, includeDrive: true, includeDocs: true, includeContacts: true, includeCalendar: true,
  });
  const [starting, setStarting] = useState(false);
  const [activeJob, setActiveJob] = useState<ExportJob | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [history, setHistory] = useState<ExportJob[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const loadHistory = () => {
    fetch("/api/settings/export")
      .then((r) => r.json())
      .then((d: { jobs: ExportJob[] }) => {
        setHistory(d.jobs ?? []);
        const running = (d.jobs ?? []).find((j) => j.status === "PENDING" || j.status === "RUNNING");
        if (running) setActiveJob(running);
      })
      .catch(() => toast.error("Failed to load export history"))
      .finally(() => setLoadingHistory(false));
  };

  useEffect(() => { loadHistory(); }, []);

  useEffect(() => {
    if (!activeJob) return;
    if (activeJob.status !== "PENDING" && activeJob.status !== "RUNNING") {
      if (activeJob.status === "COMPLETED") {
        fetch(`/api/settings/export/${activeJob.id}`)
          .then((r) => r.json())
          .then((d: { downloadUrl: string | null }) => setDownloadUrl(d.downloadUrl))
          .catch(() => {});
      }
      return;
    }
    const interval = setInterval(() => {
      fetch(`/api/settings/export/${activeJob.id}`)
        .then((r) => r.json())
        .then((d: { job: ExportJob; downloadUrl: string | null }) => {
          if (!d.job) return;
          setActiveJob(d.job);
          if (d.downloadUrl) setDownloadUrl(d.downloadUrl);
          if (d.job.status !== "PENDING" && d.job.status !== "RUNNING") loadHistory();
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJob?.id, activeJob?.status]);

  const handleStart = async () => {
    if (!Object.values(selected).some(Boolean)) {
      toast.error("Select at least one category to export");
      return;
    }
    setStarting(true);
    setDownloadUrl(null);
    try {
      const res = await fetch("/api/settings/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selected),
      });
      const data = (await res.json()) as { ok?: boolean; jobId?: string; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not start export");
      toast.success("Export started — this can take a while for large accounts");
      fetch(`/api/settings/export/${data.jobId}`)
        .then((r) => r.json())
        .then((d: { job: ExportJob }) => d.job && setActiveJob(d.job))
        .catch(() => {});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start export");
    } finally {
      setStarting(false);
    }
  };

  const jobRunning = activeJob && (activeJob.status === "PENDING" || activeJob.status === "RUNNING");
  const progressPct = activeJob && activeJob.totalItems > 0
    ? Math.min(100, Math.round((activeJob.processedItems / activeJob.totalItems) * 100))
    : 0;

  return (
    <div className="bg-[#0B0D13] min-h-screen">
      <PageHeader
        eyebrow="Mailbox Settings"
        title="Export your account"
        description="Download everything — mail, files, notes, contacts, and calendar — as a single archive. No lock-in."
      />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {activeJob && (
          <section className={`${cardClass} p-5`}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-[#E6E9F0]">Account export</h2>
                <p className="text-xs text-[#8A92A6] mt-0.5">{activeJob.currentStage ?? "Preparing…"}</p>
              </div>
              {statusBadge(activeJob.status)}
            </div>

            <div className="w-full h-2 rounded-full bg-[#1B1F2A] overflow-hidden mb-3">
              <div
                className="h-full bg-[#00C2FF] transition-all duration-500"
                style={{ width: `${activeJob.totalItems > 0 ? progressPct : jobRunning ? 8 : 100}%` }}
              />
            </div>

            <p className="text-xs text-[#8A92A6]">
              {activeJob.processedItems} / {activeJob.totalItems || "?"} items processed
            </p>

            {activeJob.status === "COMPLETED" && (
              <div className="mt-4 flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <p className="text-xs text-[#8A92A6] flex-1">
                  Archive ready — {formatBytes(activeJob.resultSize)}. Link expires in 1 hour.
                </p>
                {downloadUrl ? (
                  <a href={downloadUrl} className={primaryBtn}>
                    <Download className="w-3.5 h-3.5" /> Download
                  </a>
                ) : (
                  <Loader2 className="w-4 h-4 animate-spin text-[#5A6275]" />
                )}
              </div>
            )}

            {activeJob.status === "FAILED" && (
              <div className="mt-4 flex items-start gap-2 text-xs text-[#ea4335]">
                <XCircle className="w-4 h-4 flex-shrink-0" />
                <span>{activeJob.errorLog?.[activeJob.errorLog.length - 1] ?? "Export failed — try again."}</span>
              </div>
            )}
          </section>
        )}

        {!jobRunning && (
          <section className={`${cardClass} p-5`}>
            <h2 className="text-sm font-semibold text-[#E6E9F0] mb-1">What to include</h2>
            <p className="text-xs text-[#8A92A6] mb-4">Pick what you want in the archive. Everything is selected by default.</p>

            <div className="space-y-2 mb-5">
              {CATEGORIES.map(({ key, label, hint, Icon }) => (
                <label key={key} className="flex items-center gap-3 p-3 rounded-lg bg-[#1B1F2A] border border-[#262A35] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!selected[key]}
                    onChange={(e) => setSelected((prev) => ({ ...prev, [key]: e.target.checked }))}
                    className="accent-[#00C2FF] flex-shrink-0"
                  />
                  <Icon className="w-4 h-4 text-[#8A92A6] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#E6E9F0]">{label}</p>
                    <p className="text-[11px] text-[#5A6275]">{hint}</p>
                  </div>
                </label>
              ))}
            </div>

            <button onClick={() => void handleStart()} disabled={starting} className={primaryBtn}>
              {starting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Package className="w-3.5 h-3.5" />}
              {starting ? "Starting…" : "Start export"}
            </button>
          </section>
        )}

        <section>
          <h2 className="text-sm font-semibold text-[#E6E9F0] mb-3">Export history</h2>
          <div className={`${cardClass} overflow-hidden`}>
            {loadingHistory ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-[#00C2FF]" />
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-center px-6">
                <Package className="h-8 w-8 text-[#5A6275] mb-2" />
                <p className="text-sm text-[#8A92A6]">No exports yet</p>
              </div>
            ) : (
              <div className="divide-y divide-[#262A35]">
                {history.map((j) => (
                  <div key={j.id} className="flex items-center justify-between p-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#E6E9F0]">{new Date(j.createdAt).toLocaleString()}</p>
                      <p className="text-xs text-[#8A92A6]">{formatBytes(j.resultSize)} · {j.processedItems} items</p>
                    </div>
                    {statusBadge(j.status)}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
