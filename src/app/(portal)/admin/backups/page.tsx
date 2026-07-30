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

type VerificationDetail = {
  tablesVerified: number;
  rowsVerified: number;
  backupTimestamp: string | null;
  error: string | null;
} | null;

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
  verificationDetail?: VerificationDetail;
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
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-ok/15 text-ok border border-ok/25">
        <CheckCircle2 className="w-3 h-3" /> OK
      </span>
    );
  }
  if (status === "warning") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-warn/15 text-warn border border-warn/25">
        <AlertTriangle className="w-3 h-3" /> Warning
      </span>
    );
  }
  if (status === "not_tested") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-border-strong/15 text-subtle border border-border-strong/25">
        <Clock className="w-3 h-3" /> Not tested
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-crit/15 text-crit border border-crit/25">
        <XCircle className="w-3 h-3" /> Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-crit/15 text-crit border border-crit/25">
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
    <div className="bg-surface border border-border rounded-xl p-4 flex items-start gap-3">
      <div className="p-2 rounded-lg bg-accent/[0.08] flex-shrink-0">
        <Icon className="w-4 h-4 text-accent" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-subtle mb-1">{label}</p>
        <p className={`font-semibold text-sm truncate ${accent ?? "text-foreground"}`}>{value}</p>
        {sub && <p className="text-xs text-subtle mt-0.5">{sub}</p>}
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
      if (json.ok) {
        toast.success(json.message ?? "Restore drill queued");
        // The drill runs asynchronously on the persistent worker — poll once
        // after a delay so the page picks up the result without a manual refresh.
        setTimeout(() => void load(), 15000);
      } else {
        toast.error(json.message ?? "Could not queue restore drill");
      }
    } catch {
      toast.error("Network error during restore drill");
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
    <div className="min-h-full bg-surface text-foreground">
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
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors disabled:opacity-50"
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
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-surface-sunken text-muted border border-border hover:bg-hover transition-colors disabled:opacity-50"
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
            className="p-2 text-subtle hover:text-muted transition-colors"
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
                ? "text-ok"
                : data?.verification.status === "failed"
                ? "text-crit"
                : "text-subtle"
            }
          />
          <SummaryCard
            icon={HardDrive}
            label="Storage"
            value={data ? data.storage.provider : "—"}
            sub={data ? `Region: ${data.storage.region}` : undefined}
          />
        </div>

        {/* ── Last restore drill detail ── */}
        {data?.verificationDetail && (
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <FlaskConical className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium">Last restore drill</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-[10px] text-subtle mb-1">Tables verified</p>
                <p className="font-semibold text-foreground">{data.verificationDetail.tablesVerified}</p>
              </div>
              <div>
                <p className="text-[10px] text-subtle mb-1">Rows verified</p>
                <p className="font-semibold text-foreground">{data.verificationDetail.rowsVerified.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] text-subtle mb-1">Backup tested</p>
                <p className="font-semibold text-foreground">
                  {data.verificationDetail.backupTimestamp
                    ? new Date(data.verificationDetail.backupTimestamp).toLocaleString()
                    : "—"}
                </p>
              </div>
            </div>
            {data.verificationDetail.error && (
              <p className="mt-3 text-xs text-crit leading-relaxed">
                {data.verificationDetail.error}
              </p>
            )}
          </div>
        )}

        {/* ── Backup status table ── */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Database className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium">Backup Sources</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-soft text-subtle text-xs">
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
                    <td colSpan={5} className="text-center text-subtle py-10">
                      <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                      Loading backup data…
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr
                      key={row.source}
                      className="border-b border-border-soft hover:bg-surface-sunken/30"
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-foreground">{row.source}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-subtle">{row.type}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-subtle hidden sm:table-cell">
                        {row.lastRun ? new Date(row.lastRun).toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-semibold text-foreground">
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
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <CalendarDays className="w-4 h-4 text-accent" />
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
              <div key={label} className="bg-surface rounded-lg p-3">
                <p className="text-[10px] text-subtle mb-1">{label}</p>
                <p className="text-sm font-semibold text-foreground">{value}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-subtle leading-relaxed">
            Backups are managed by the Vercel/Postgres platform (Neon). Configure
            additional retention or cross-region replication in the platform dashboard.
            Run <span className="text-accent font-mono">Test Restore</span> periodically
            to verify backup integrity.
          </p>
        </div>
      </div>
    </div>
  );
}
