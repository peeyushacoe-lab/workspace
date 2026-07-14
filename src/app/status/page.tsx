"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, ShieldCheck, Loader2 } from "lucide-react";

type ComponentStatus = "operational" | "degraded" | "outage";

type StatusPayload = {
  generatedAt: string;
  overall: ComponentStatus;
  components: { name: string; status: ComponentStatus }[];
  uptime: { last24h: number; last90d: number };
  latencyMs: number;
  history: { date: string; uptimePct: number | null }[];
  backupVerification: { status: string; testedAt: string } | null;
};

function StatusPill({ status }: { status: ComponentStatus }) {
  if (status === "operational") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
        <CheckCircle2 className="w-3.5 h-3.5" /> Operational
      </span>
    );
  }
  if (status === "degraded") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/25">
        <AlertTriangle className="w-3.5 h-3.5" /> Degraded
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-red-500/15 text-red-400 border border-red-500/25">
      <XCircle className="w-3.5 h-3.5" /> Outage
    </span>
  );
}

function dayBarColor(pct: number | null): string {
  if (pct === null) return "bg-[#262A35]";
  if (pct >= 99.5) return "bg-emerald-500";
  if (pct >= 95) return "bg-yellow-500";
  return "bg-red-500";
}

export default function PublicStatusPage() {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      if (!res.ok) throw new Error("bad response");
      setData((await res.json()) as StatusPayload);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 60_000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div className="min-h-screen bg-[#0B0D12] text-[#E6E9F0]">
      <nav className="border-b border-[#262A35]">
        <div className="max-w-3xl mx-auto flex items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-[#E6E9F0]">
            <ShieldCheck className="w-4 h-4 text-[#00C2FF]" /> Nexus Status
          </Link>
          <Link href="/login" className="text-sm text-[#5A6275] hover:text-[#8A92A6] transition-colors">Sign in</Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-12">
        {loading && !data ? (
          <div className="flex items-center gap-2 text-[#5A6275] text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Checking systems…
          </div>
        ) : error && !data ? (
          <div className="bg-[#12151D] border border-red-500/25 rounded-xl p-6 text-sm text-red-400">
            Unable to reach the status service right now. Please try again shortly.
          </div>
        ) : data ? (
          <>
            <div className="bg-[#12151D] border border-[#262A35] rounded-2xl p-6 mb-8 flex items-center justify-between flex-wrap gap-3">
              <div>
                <h1 className="text-xl font-semibold tracking-tight mb-1">
                  {data.overall === "operational"
                    ? "All systems operational"
                    : data.overall === "degraded"
                    ? "Partial service degradation"
                    : "Service disruption"}
                </h1>
                <p className="text-xs text-[#5A6275]">
                  Last checked {new Date(data.generatedAt).toLocaleString()}
                </p>
              </div>
              <StatusPill status={data.overall} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
              <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-4">
                <p className="text-[10px] text-[#5A6275] mb-1">Uptime (24h)</p>
                <p className="text-lg font-semibold">{data.uptime.last24h}%</p>
              </div>
              <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-4">
                <p className="text-[10px] text-[#5A6275] mb-1">Uptime (90d)</p>
                <p className="text-lg font-semibold">{data.uptime.last90d}%</p>
              </div>
              <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-4">
                <p className="text-[10px] text-[#5A6275] mb-1">Avg latency</p>
                <p className="text-lg font-semibold">{data.latencyMs} ms</p>
              </div>
            </div>

            <h2 className="text-sm font-semibold text-[#5A6275] mb-3">Services</h2>
            <div className="bg-[#12151D] border border-[#262A35] rounded-xl overflow-hidden mb-8 divide-y divide-[#1C1F28]">
              {data.components.map((c) => (
                <div key={c.name} className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-sm text-[#E6E9F0]">{c.name}</span>
                  <StatusPill status={c.status} />
                </div>
              ))}
            </div>

            <h2 className="text-sm font-semibold text-[#5A6275] mb-3">90-day history</h2>
            <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-5 mb-8">
              <div className="flex items-end gap-[2px] h-10">
                {data.history.map((d) => (
                  <div
                    key={d.date}
                    title={`${d.date}: ${d.uptimePct === null ? "no data" : `${d.uptimePct}% uptime`}`}
                    className={`flex-1 rounded-sm h-full ${dayBarColor(d.uptimePct)}`}
                  />
                ))}
              </div>
              <div className="flex justify-between mt-2 text-[10px] text-[#5A6275]">
                <span>90 days ago</span>
                <span>Today</span>
              </div>
            </div>

            {data.backupVerification && (
              <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-5 flex items-center justify-between flex-wrap gap-3 mb-8">
                <div>
                  <p className="text-sm font-medium mb-1">Backup restore verification</p>
                  <p className="text-xs text-[#5A6275]">
                    Last tested {new Date(data.backupVerification.testedAt).toLocaleString()}
                  </p>
                </div>
                {data.backupVerification.status === "PASSED" ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Passed
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-red-500/15 text-red-400 border border-red-500/25">
                    <XCircle className="w-3.5 h-3.5" /> Failed
                  </span>
                )}
              </div>
            )}

            <div className="flex items-center justify-between text-sm text-[#5A6275]">
              <button
                onClick={() => void load()}
                className="flex items-center gap-2 px-3 py-1.5 text-xs text-[#5A6275] hover:text-[#8A92A6] transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
              <span>
                Questions? Email{" "}
                <a href="mailto:support@cybersage.uk" className="text-[#00C2FF] hover:underline">
                  support@cybersage.uk
                </a>
              </span>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
