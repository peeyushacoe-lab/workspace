"use client";

import { useState, useEffect } from "react";
import {
  Shield, CheckCircle2, AlertTriangle, XCircle, Copy, ExternalLink, RefreshCw,
  Search, Ban, Trash2, Loader2, Plus, TrendingUp, MailWarning,
} from "lucide-react";
import { PageHeader } from "@/components/Shell";
import { toast } from "sonner";

type DnsRecord = {
  type: string;
  host: string;
  value: string;
  status: "ok" | "missing" | "unknown";
  description: string;
};

type DeliverabilityStatus = {
  domain: string;
  isDefaultDomain: boolean;
  fromEmail: string;
  resendConfigured: boolean;
  records: DnsRecord[];
  deliverabilityHealth: {
    totalSent: number;
    bounced: number;
    failed: number;
    bounceRate: number;
    bounceHealthy: boolean;
    suppressedCount: number;
  };
  dailyVolume: { date: string; count: number }[];
};

type SuppressionEntry = { id: string; email: string; reason: string; createdAt: string };

function StatusIcon({ status }: { status: "ok" | "missing" | "unknown" }) {
  if (status === "ok") return <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />;
  if (status === "missing") return <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />;
  return <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0" />;
}

function CopyButton({ value }: { value: string }) {
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => toast.success("Copied")).catch(() => {});
  };
  return (
    <button onClick={copy} className="p-1 text-[#5A6275] hover:text-[#00C2FF] transition-colors flex-shrink-0">
      <Copy className="w-3.5 h-3.5" />
    </button>
  );
}

// Suggested daily-volume ramp for a brand-new sending domain/IP. Numbers are
// the widely-cited industry rule of thumb (start small, roughly double every
// couple of days) — not a guarantee, just guidance.
const WARMUP_RAMP = [
  { day: "Day 1–2", volume: "≤50 / day" },
  { day: "Day 3–4", volume: "≤100 / day" },
  { day: "Day 5–7", volume: "≤500 / day" },
  { day: "Week 2", volume: "≤1,000 / day" },
  { day: "Week 3", volume: "≤5,000 / day" },
  { day: "Week 4+", volume: "Ramp to target volume, watch bounce/complaint rate at each step" },
];

export default function DeliverabilityPage() {
  const [domainInput, setDomainInput] = useState("");
  const [checkedDomain, setCheckedDomain] = useState<string | null>(null);
  const [data, setData] = useState<DeliverabilityStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const [suppression, setSuppression] = useState<SuppressionEntry[]>([]);
  const [suppressionLoading, setSuppressionLoading] = useState(true);
  const [newSuppressEmail, setNewSuppressEmail] = useState("");
  const [addingSuppress, setAddingSuppress] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = async (domain?: string) => {
    setLoading(true);
    try {
      const qs = domain ? `?domain=${encodeURIComponent(domain)}` : "";
      const res = await fetch(`/api/admin/deliverability${qs}`);
      if (res.ok) {
        const json = await res.json() as DeliverabilityStatus;
        setData(json);
        setCheckedDomain(json.domain);
      } else {
        toast.error("Could not check that domain");
      }
    } finally {
      setLoading(false);
    }
  };

  const loadSuppression = async () => {
    setSuppressionLoading(true);
    try {
      const res = await fetch("/api/admin/suppression");
      if (res.ok) setSuppression(await res.json() as SuppressionEntry[]);
    } finally {
      setSuppressionLoading(false);
    }
  };

  useEffect(() => { void load(); void loadSuppression(); }, []);

  const handleCheckDomain = () => {
    const d = domainInput.trim();
    if (!d) { void load(); return; }
    void load(d);
  };

  const handleAddSuppression = async () => {
    const email = newSuppressEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) { toast.error("Enter a valid email"); return; }
    setAddingSuppress(true);
    try {
      const res = await fetch("/api/admin/suppression", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, reason: "MANUAL" }),
      });
      const json = await res.json() as SuppressionEntry & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to add");
      setSuppression((prev) => [json, ...prev]);
      setNewSuppressEmail("");
      toast.success("Added to suppression list");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setAddingSuppress(false);
    }
  };

  const handleRemoveSuppression = async (id: string) => {
    setRemovingId(id);
    const prev = suppression;
    setSuppression((p) => p.filter((s) => s.id !== id));
    try {
      const res = await fetch(`/api/admin/suppression/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Removed — this address can receive mail again");
    } catch {
      toast.error("Failed to remove");
      setSuppression(prev);
    } finally {
      setRemovingId(null);
    }
  };

  const okCount = data?.records.filter((r) => r.status === "ok").length ?? 0;
  const totalCount = data?.records.length ?? 0;
  const health = data?.deliverabilityHealth;
  const maxVolume = Math.max(1, ...(data?.dailyVolume.map((d) => d.count) ?? [1]));

  return (
    <div className="min-h-screen bg-[#12151D] text-[#E6E9F0]">
      <PageHeader
        eyebrow="Admin · Email"
        title="Email Deliverability"
        description="DNS configuration, bounce health, and suppression management for your sending domain(s)."
      />

      <div className="px-6 pb-8 max-w-4xl space-y-6">
        {/* Self-serve domain checker */}
        <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-4 flex items-center gap-3">
          <Search className="w-4 h-4 text-[#5A6275] flex-shrink-0" />
          <input
            value={domainInput}
            onChange={(e) => setDomainInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCheckDomain(); }}
            placeholder={checkedDomain ?? "yourdomain.com"}
            className="flex-1 bg-[#0B0D13] border border-[#262A35] rounded-lg text-sm text-[#E6E9F0] placeholder-[#454e63] px-3 py-2 focus:outline-none focus:border-[#00C2FF]/50"
          />
          <button
            onClick={handleCheckDomain}
            disabled={loading}
            className="px-3 py-2 text-xs font-semibold rounded-lg bg-[#00C2FF]/10 text-[#00C2FF] border border-[#00C2FF]/20 hover:bg-[#00C2FF]/20 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Check domain"}
          </button>
        </div>

        {/* Score card */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Sending Domain", value: data?.domain ?? "—", sub: data?.isDefaultDomain ? "Default sending domain" : "Custom check" },
            { label: "From Address", value: data?.fromEmail ?? "—", sub: "Outgoing sender" },
            { label: "DNS Records", value: loading ? "…" : `${okCount} / ${totalCount}`, sub: `${okCount === totalCount ? "All configured ✓" : "Action required"}` },
          ].map(({ label, value, sub }) => (
            <div key={label} className="bg-[#12151D] border border-[#262A35] rounded-xl p-4">
              <p className="text-[10px] text-[#5A6275] mb-1">{label}</p>
              <p className="font-mono text-sm text-[#00C2FF] truncate">{value}</p>
              <p className="text-[11px] text-[#5A6275] mt-1">{sub}</p>
            </div>
          ))}
        </div>

        {/* How to fix spam banner */}
        <div className="bg-amber-500/10 border border-yellow-500/20 rounded-xl p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm space-y-1">
            <p className="font-semibold text-yellow-300">Why emails go to spam</p>
            <p className="text-yellow-200/70 leading-relaxed">
              Gmail and Outlook check SPF, DKIM and DMARC before delivering. Without all three,
              your email is classified as unauthenticated and routed to spam.
              Add the records below to your domain registrar DNS, then verify your domain in the{" "}
              <a href="https://resend.com/domains" target="_blank" rel="noreferrer" className="underline text-yellow-300">Resend dashboard</a>.
            </p>
          </div>
        </div>

        {/* DNS Records */}
        <div className="bg-[#12151D] border border-[#262A35] rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[#262A35]">
            <Shield className="w-4 h-4 text-[#00C2FF]" />
            <span className="text-sm font-medium">Required DNS Records</span>
            <div className="flex-1" />
            <button onClick={() => load(checkedDomain ?? undefined)} className="p-1.5 text-[#5A6275] hover:text-[#8A92A6]">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="divide-y divide-[#1C1F28]">
            {loading ? (
              <div className="py-10 text-center text-[#5A6275] text-sm">Checking DNS…</div>
            ) : data?.records.map((record) => (
              <div key={record.host} className="px-4 py-4 flex items-start gap-3">
                <StatusIcon status={record.status} />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono bg-[#1B1F2A] text-[#00C2FF] px-2 py-0.5 rounded">{record.type}</span>
                    <span className="text-sm font-medium text-[#E6E9F0] truncate">{record.host}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                      record.status === "ok" ? "bg-emerald-500/10 text-emerald-400" :
                      record.status === "missing" ? "bg-red-500/10 text-red-400" :
                      "bg-yellow-500/10 text-yellow-400"
                    }`}>
                      {record.status === "ok" ? "Configured" : record.status === "missing" ? "Missing" : "Unverified"}
                    </span>
                  </div>
                  <p className="text-xs text-[#5A6275]">{record.description}</p>
                  <div className="flex items-center gap-2 bg-[#12151D] rounded-lg px-3 py-2 mt-1">
                    <code className="text-xs text-[#00C2FF] font-mono flex-1 truncate">{record.value}</code>
                    <CopyButton value={record.value} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bounce health */}
        <div className="bg-[#12151D] border border-[#262A35] rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[#262A35]">
            <MailWarning className="w-4 h-4 text-[#00C2FF]" />
            <span className="text-sm font-medium">Bounce health — last 30 days</span>
          </div>
          <div className="grid grid-cols-4 gap-4 p-4">
            {[
              { label: "Sent", value: health?.totalSent ?? 0 },
              { label: "Bounced", value: health?.bounced ?? 0 },
              { label: "Failed / complained", value: health?.failed ?? 0 },
              { label: "Suppressed (all-time)", value: health?.suppressedCount ?? 0 },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[10px] text-[#5A6275] mb-1">{label}</p>
                <p className="text-lg font-semibold text-[#E6E9F0]">{value.toLocaleString()}</p>
              </div>
            ))}
          </div>
          {health && (
            <div className={`mx-4 mb-4 rounded-lg px-3 py-2.5 text-xs flex items-center gap-2 ${
              health.bounceHealthy ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"
            }`}>
              {health.bounceHealthy ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />}
              Bounce rate: {(health.bounceRate * 100).toFixed(2)}% —{" "}
              {health.bounceHealthy
                ? "within the healthy range (Gmail/Yahoo bulk-sender guidance: keep under 0.3%)."
                : "above the 0.3% threshold Gmail/Yahoo use to flag bulk senders. Clean your list and check the DNS records above."}
            </div>
          )}
        </div>

        {/* Suppression list */}
        <div className="bg-[#12151D] border border-[#262A35] rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[#262A35]">
            <Ban className="w-4 h-4 text-[#00C2FF]" />
            <span className="text-sm font-medium">Suppression list</span>
            <span className="text-[11px] text-[#5A6275]">{suppression.length} address{suppression.length === 1 ? "" : "es"}</span>
          </div>

          <div className="px-4 py-3 border-b border-[#262A35] flex items-center gap-2">
            <input
              value={newSuppressEmail}
              onChange={(e) => setNewSuppressEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleAddSuppression(); }}
              placeholder="Add an address to suppress…"
              className="flex-1 bg-[#0B0D13] border border-[#262A35] rounded-lg text-sm text-[#E6E9F0] placeholder-[#454e63] px-3 py-1.5 focus:outline-none focus:border-[#00C2FF]/50"
            />
            <button
              onClick={() => void handleAddSuppression()}
              disabled={addingSuppress}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#00C2FF]/10 text-[#00C2FF] border border-[#00C2FF]/20 hover:bg-[#00C2FF]/20 transition-colors disabled:opacity-50"
            >
              {addingSuppress ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Add
            </button>
          </div>

          <div className="divide-y divide-[#1C1F28] max-h-96 overflow-y-auto">
            {suppressionLoading ? (
              <div className="py-10 text-center text-[#5A6275] text-sm">Loading…</div>
            ) : suppression.length === 0 ? (
              <div className="py-10 text-center text-[#5A6275] text-sm">No suppressed addresses — bounces and manual blocks will appear here.</div>
            ) : suppression.map((s) => (
              <div key={s.id} className="px-4 py-2.5 flex items-center gap-3">
                <span className="text-sm text-[#E6E9F0] flex-1 truncate font-mono">{s.email}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                  s.reason === "BOUNCE" ? "bg-red-500/10 text-red-400" :
                  s.reason === "SPAM" ? "bg-yellow-500/10 text-yellow-400" :
                  "bg-[#1B1F2A] text-[#8A92A6]"
                }`}>
                  {s.reason}
                </span>
                <span className="text-[11px] text-[#5A6275] whitespace-nowrap">{new Date(s.createdAt).toLocaleDateString()}</span>
                <button
                  onClick={() => void handleRemoveSuppression(s.id)}
                  disabled={removingId === s.id}
                  title="Remove — re-enable sending to this address"
                  className="p-1.5 text-[#8A92A6] hover:text-[#ea4335] hover:bg-[#1B1F2A] rounded-lg transition-colors disabled:opacity-50"
                >
                  {removingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Domain warm-up guidance */}
        <div className="bg-[#12151D] border border-[#262A35] rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[#262A35]">
            <TrendingUp className="w-4 h-4 text-[#00C2FF]" />
            <span className="text-sm font-medium">Domain warm-up guidance</span>
          </div>
          <div className="p-4 space-y-4">
            <p className="text-xs text-[#8A92A6] leading-relaxed">
              A brand-new domain or IP has no sending reputation with Gmail/Outlook/Yahoo. Sending high volume
              immediately gets flagged as spam. Ramp up gradually and watch your bounce rate at each step —
              back off a step if bounces or spam complaints rise.
            </p>

            <div className="grid grid-cols-2 gap-2">
              {WARMUP_RAMP.map((r) => (
                <div key={r.day} className="bg-[#1B1F2A] border border-[#262A35] rounded-lg px-3 py-2">
                  <p className="text-[11px] font-semibold text-[#E6E9F0]">{r.day}</p>
                  <p className="text-[11px] text-[#8A92A6]">{r.volume}</p>
                </div>
              ))}
            </div>

            <div>
              <p className="text-[11px] font-semibold text-[#8A92A6] mb-2">Your actual daily volume — last 14 days</p>
              <div className="flex items-end gap-1 h-24">
                {(data?.dailyVolume ?? []).map((d) => (
                  <div key={d.date} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${d.date}: ${d.count} sent`}>
                    <div
                      className="w-full bg-[#00C2FF]/60 rounded-t"
                      style={{ height: `${Math.max(2, (d.count / maxVolume) * 80)}px` }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Avatar/Signature guide */}
        <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <span className="text-base">👤</span> Sender Avatar in Gmail &amp; Outlook
          </h3>
          <p className="text-xs text-[#8A92A6] leading-relaxed">
            The avatar shown next to your name in Gmail is pulled from the <strong className="text-[#E6E9F0]">sender&apos;s Google profile</strong> or
            from a <strong className="text-[#E6E9F0]">BIMI record</strong> (Brand Indicators for Message Identification).
            Your email signature image is separate and requires the recipient to <em>load remote images</em> (off by default in Gmail).
          </p>
          <div className="grid grid-cols-2 gap-4 text-xs">
            {[
              { title: "For brand avatar in Gmail", steps: ["Set DMARC to p=quarantine or p=reject (required)", "Upload a square SVG logo to a public HTTPS URL", "Add TXT record: default._bimi.cybersage.uk → v=BIMI1; l=https://your-logo-url.svg"] },
              { title: "For signature photo", steps: ["Go to Settings → Signature tab", "Your avatar URL is already embedded in sent emails", "Recipients must enable 'Show images' in their client", "Use a publicly accessible HTTPS avatar URL (no auth)"] },
            ].map(({ title, steps }) => (
              <div key={title} className="bg-[#12151D] rounded-lg p-3 space-y-2">
                <p className="font-semibold text-[#E6E9F0]">{title}</p>
                <ol className="space-y-1 list-decimal list-inside text-[#8A92A6]">
                  {steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </div>
            ))}
          </div>
          <a
            href="https://bimigroup.org/bimi-generator/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-[#00C2FF] hover:underline"
          >
            <ExternalLink className="w-3.5 h-3.5" /> BIMI Generator tool
          </a>
        </div>
      </div>
    </div>
  );
}
