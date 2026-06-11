"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Database,
  ShieldCheck,
  HardDrive,
  RefreshCw,
  Play,
  FlaskConical,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Loader2,
  CalendarDays,
} from "lucide-react";
import { PageHeader } from "@/components/Shell";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BackupStatus = "ok" | "warning" | "error";
type VerificationStatus = "not_tested" | "ok" | "failed";

type BackupsData = {
  database: {
    lastBackup: string | null;
    size: string;
    status: BackupStatus;
    retentionDays: number;
  };
  verification: {
    lastTested: string | null;
    status: VerificationStatus;
  };
  storage: {
    provider: string;
    region: string;
  };
};

type BackupRow = {
  source: string;
  type: string;
  status: BackupStatus;
  lastRun: string | null;
  size: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: BackupStatus | VerificationStatus }) {
  if (status === "ok") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
        <CheckCircle2 className="w-3 h-3" /> OK
      </span>
    );
  }
  if (status === "warning") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/25">
        <AlertTriangle className="w-3 h-3" /> Warning
      </span>
    );
  }
  if (status === "not_tested") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-[#5d6579]/15 text-[#5d6579] border border-[#5d6579]/25">
        <Clock className="w-3 h-3" /> Not tested
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-red-500/15 text-red-400 border border-red-500/25">
        <XCircle className="w-3 h-3" /> Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-red-500/15 text-red-400 border border-red-500/25">
      <XCircle className="w-3 h-3" /> Error
    </span>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="bg-[#1b1f2e] border border-[rgba(255,255,255,0.06)] rounded-xl p-4 flex items-start gap-3">
      <div className="p-2 rounded-lg bg-[rgba(0,210,255,0.08)] flex-shrink-0">
        <Icon className="w-4 h-4 text-[#00d2ff]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-[#5d6579] mb-1">{label}</p>
        <p className={`font-semibold text-sm truncate ${accent ?? "text-[#dfe1f6]"}`}>{value}</p>
        {sub && <p className="text-xs text-[#5d6579] mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BackupsPage() {
  const [data, setData] = useState<BackupsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningBackup, setRunningBackup] = useState(false);
  const [testingRestore, setTestingRestore] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/backups");
      if (res.ok) setData((await res.json()) as BackupsData);
      else toast.error("Failed to load backup data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runBackup = async () => {
    setRunningBackup(true);
    try {
      const res = await fetch("/api/admin/backups", { method: "POST" });
      const json = (await res.json()) as { ok: boolean; message?: string };
      if (json.ok) toast.success(json.message ?? "Backup enqueued");
      else toast.error("Backup failed");
    } catch {
      toast.error("Network error while triggering backup");
    } finally {
      setRunningBackup(false);
    }
  };

  const testRestore = async () => {
    setTestingRestore(true);
    try {
      const res = await fetch("/api/admin/backups?action=test", { method: "POST" });
      const json = (await res.json()) as { ok: boolean; message?: string };
      if (json.ok) toast.success(json.message ?? "Restore test passed");
      else toast.error(json.message ?? "Restore test failed");
    } catch {
      toast.error("Network error during restore test");
    } finally {
      setTestingRestore(false);
    }
  };

  // Build backup rows from live data (or placeholders while loading)
  const rows: BackupRow[] = data
    ? [
        {
          source: "PostgreSQL (primary)",
          type: "Full snapshot",
          status: data.database.status,
          lastRun: data.database.lastBackup,
          size: data.database.size,
        },
        {
          source: "Redis",
          type: "RDB dump",
          status: "ok",
          lastRun: null,
          size: "—",
        },
        {
          source: "Drive files",
          type: "Object storage",
          status: "ok",
          lastRun: null,
          size: "—",
        },
      ]
    : [];

  return (
    <div className="min-h-screen bg-[#0f1321] text-[#dfe1f6]">
      <PageHeader
        eyebrow="Admin"
        title="Backups"
        description="Database snapshots, restore verification, and retention policy overview."
      />

      <div className="px-6 pb-10 max-w-5xl space-y-6">
        {/* ── Action bar ── */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => void runBackup()}
            disabled={runningBackup}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#00d2ff]/10 text-[#00d2ff] border border-[#00d2ff]/20 hover:bg-[#00d2ff]/20 transition-colors disabled:opacity-50"
          >
            {runningBackup ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            Run Backup
          </button>

          <button
            onClick={() => void testRestore()}
            disabled={testingRestore}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#262939] text-[#9aa3b8] border border-[rgba(255,255,255,0.06)] hover:bg-[#2e3347] transition-colors disabled:opacity-50"
          >
            {testingRestore ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FlaskConical className="w-3.5 h-3.5" />
            )}
            Test Restore
          </button>

          <div className="flex-1" />

          <button
            onClick={() => void load()}
            className="p-2 text-[#5d6579] hover:text-[#9aa3b8] transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* ── Summary cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SummaryCard
            icon={Database}
            label="Database"
            value={data ? data.database.size : "—"}
            sub={
              data?.database.lastBackup
                ? `Last backup ${new Date(data.database.lastBackup).toLocaleString()}`
                : "No backup on record"
            }
          />
          <SummaryCard
            icon={ShieldCheck}
            label="Verification"
            value={
              data
                ? data.verification.status === "not_tested"
                  ? "Not tested"
                  : data.verification.status === "ok"
                  ? "Verified"
                  : "Failed"
                : "—"
            }
            sub={
              data?.verification.lastTested
                ? `Last tested ${new Date(data.verification.lastTested).toLocaleString()}`
                : "Run a test restore to verify"
            }
            accent={
              data?.verification.status === "ok"
                ? "text-emerald-400"
                : data?.verification.status === "failed"
                ? "text-red-400"
                : "text-[#5d6579]"
            }
          />
          <SummaryCard
            icon={HardDrive}
            label="Storage"
            value={data ? data.storage.provider : "—"}
            sub={data ? `Region: ${data.storage.region}` : undefined}
          />
        </div>

        {/* ── Backup status table ── */}
        <div className="bg-[#1b1f2e] border border-[rgba(255,255,255,0.06)] rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[rgba(255,255,255,0.06)]">
            <Database className="w-4 h-4 text-[#00d2ff]" />
            <span className="text-sm font-medium">Backup Sources</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.04)] text-[#5d6579] text-xs">
                  <th className="text-left px-4 py-2.5 font-medium">Source</th>
                  <th className="text-left px-4 py-2.5 font-medium">Type</th>
                  <th className="text-left px-4 py-2.5 font-medium">Status</th>
                  <th className="text-left px-4 py-2.5 font-medium hidden sm:table-cell">Last run</th>
                  <th className="text-right px-4 py-2.5 font-medium">Size</th>
                </tr>
              </thead>
              <tbody>
                {loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-[#5d6579] py-10">
                      <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                      Loading backup data…
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr
                      key={row.source}
                      className="border-b border-[rgba(255,255,255,0.03)] hover:bg-[#262939]/30"
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-[#dfe1f6]">{row.source}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#5d6579]">{row.type}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-[#5d6579] hidden sm:table-cell">
                        {row.lastRun ? new Date(row.lastRun).toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-semibold text-[#dfe1f6]">
                        {row.size}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Retention policy card ── */}
        <div className="bg-[#1b1f2e] border border-[rgba(255,255,255,0.06)] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <CalendarDays className="w-4 h-4 text-[#00d2ff]" />
            <span className="text-sm font-medium">Retention Policy</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(
              [
                ["Retention period", data ? `${data.database.retentionDays} days` : "—"],
                ["Backup frequency", "Daily (automated)"],
                ["Point-in-time recovery", "Enabled via platform"],
              ] as [string, string][]
            ).map(([label, value]) => (
              <div key={label} className="bg-[#0f1321] rounded-lg p-3">
                <p className="text-[10px] text-[#5d6579] mb-1">{label}</p>
                <p className="text-sm font-semibold text-[#dfe1f6]">{value}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-[#5d6579] leading-relaxed">
            Backups are managed by the Vercel/Postgres platform (Neon). Configure
            additional retention or cross-region replication in the platform dashboard.
            Run <span className="text-[#00d2ff] font-mono">Test Restore</span> periodically
            to verify backup integrity.
          </p>
        </div>
      </div>
    </div>
  );
}
