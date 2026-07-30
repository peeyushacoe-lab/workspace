"use client";

import { useState, useEffect } from "react";
import {
  Shield, CheckCircle2, AlertTriangle, XCircle, Copy, ExternalLink, RefreshCw,
  Search, Ban, Trash2, Loader2, Plus, TrendingUp, MailWarning, UserRound,
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
  if (status === "ok") return <CheckCircle2 className="w-4 h-4 text-ok flex-shrink-0" />;
  if (status === "missing") return <XCircle className="w-4 h-4 text-crit flex-shrink-0" />;
  return <AlertTriangle className="w-4 h-4 text-warn flex-shrink-0" />;
}

function CopyButton({ value }: { value: string }) {
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => toast.success("Copied")).catch(() => {});
  };
  return (
    <button onClick={copy} className="p-1 text-subtle hover:text-accent transition-colors flex-shrink-0">
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
    <div className="min-h-full bg-surface text-foreground">
      <PageHeader
        eyebrow="Admin · Email"
        title="Email Deliverability"
        description="DNS configuration, bounce health, and suppression management for your sending domain(s)."
      />

      <div className="px-6 pb-8 max-w-4xl space-y-6">
        {/* Self-serve domain checker */}
        <div className="bg-surface border border-border rounded-xl p-4 flex items-center gap-3">
          <Search className="w-4 h-4 text-subtle flex-shrink-0" />
          <input
            value={domainInput}
            onChange={(e) => setDomainInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCheckDomain(); }}
            placeholder={checkedDomain ?? "yourdomain.com"}
            className="flex-1 bg-surface border border-border rounded-lg text-sm text-foreground placeholder-subtle px-3 py-2 focus:outline-none focus:border-accent/50"
          />
          <button
            onClick={handleCheckDomain}
            disabled={loading}
            className="px-3 py-2 text-xs font-semibold rounded-lg bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Check domain"}
          </button>
        </div>

        {/* Score card */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Sending Domain", value: data?.domain ?? "—", sub: data?.isDefaultDomain ? "Default sending domain" : "Custom check" },
            { label: "From Address", value: data?.fromEmail ?? "—", sub: "Outgoing sender" },
            { label: "DNS Records", value: loading ? "…" : `${okCount} / ${totalCount}`, sub: `${okCount === totalCount ? "All configured" : "Action required"}` },
          ].map(({ label, value, sub }) => (
            <div key={label} className="bg-surface border border-border rounded-xl p-4">
              <p className="text-[10px] text-subtle mb-1">{label}</p>
              <p className="font-mono text-sm text-accent truncate">{value}</p>
              <p className="text-[11px] text-subtle mt-1">{sub}</p>
            </div>
          ))}
        </div>

        {/* How to fix spam banner */}
        <div className="bg-warn/10 border border-warn/20 rounded-xl p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-warn flex-shrink-0 mt-0.5" />
          <div className="text-sm space-y-1">
            <p className="font-semibold text-warn">Why emails go to spam</p>
            <p className="text-warn/70 leading-relaxed">
              Gmail and Outlook check SPF, DKIM and DMARC before delivering. Without all three,
              your email is classified as unauthenticated and routed to spam.
              Add the records below to your domain registrar DNS, then verify your domain in the{" "}
              <a href="https://resend.com/domains" target="_blank" rel="noreferrer" className="underline text-warn">Resend dashboard</a>.
            </p>
          </div>
        </div>

        {/* DNS Records */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Shield className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium">Required DNS Records</span>
            <div className="flex-1" />
            <button onClick={() => load(checkedDomain ?? undefined)} className="p-1.5 text-subtle hover:text-muted">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="divide-y divide-border-soft">
            {loading ? (
              <div className="py-10 text-center text-subtle text-sm">Checking DNS…</div>
            ) : data?.records.map((record) => (
              <div key={record.host} className="px-4 py-4 flex items-start gap-3">
                <StatusIcon status={record.status} />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono bg-surface-sunken text-accent px-2 py-0.5 rounded">{record.type}</span>
                    <span className="text-sm font-medium text-foreground truncate">{record.host}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                      record.status === "ok" ? "bg-ok/10 text-ok" :
                      record.status === "missing" ? "bg-crit/10 text-crit" :
                      "bg-warn/10 text-warn"
                    }`}>
                      {record.status === "ok" ? "Configured" : record.status === "missing" ? "Missing" : "Unverified"}
                    </span>
                  </div>
                  <p className="text-xs text-subtle">{record.description}</p>
                  <div className="flex items-center gap-2 bg-surface rounded-lg px-3 py-2 mt-1">
                    <code className="text-xs text-accent font-mono flex-1 truncate">{record.value}</code>
                    <CopyButton value={record.value} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bounce health */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <MailWarning className="w-4 h-4 text-accent" />
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
                <p className="text-[10px] text-subtle mb-1">{label}</p>
                <p className="text-lg font-semibold text-foreground">{value.toLocaleString()}</p>
              </div>
            ))}
          </div>
          {health && (
            <div className={`mx-4 mb-4 rounded-lg px-3 py-2.5 text-xs flex items-center gap-2 ${
              health.bounceHealthy ? "bg-ok/10 text-ok" : "bg-crit/10 text-crit"
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
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Ban className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium">Suppression list</span>
            <span className="text-[11px] text-subtle">{suppression.length} address{suppression.length === 1 ? "" : "es"}</span>
          </div>

          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <input
              value={newSuppressEmail}
              onChange={(e) => setNewSuppressEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleAddSuppression(); }}
              placeholder="Add an address to suppress…"
              className="flex-1 bg-surface border border-border rounded-lg text-sm text-foreground placeholder-subtle px-3 py-1.5 focus:outline-none focus:border-accent/50"
            />
            <button
              onClick={() => void handleAddSuppression()}
              disabled={addingSuppress}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors disabled:opacity-50"
            >
              {addingSuppress ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Add
            </button>
          </div>

          <div className="divide-y divide-border-soft max-h-96 overflow-y-auto">
            {suppressionLoading ? (
              <div className="py-10 text-center text-subtle text-sm">Loading…</div>
            ) : suppression.length === 0 ? (
              <div className="py-10 text-center text-subtle text-sm">No suppressed addresses — bounces and manual blocks will appear here.</div>
            ) : suppression.map((s) => (
              <div key={s.id} className="px-4 py-2.5 flex items-center gap-3">
                <span className="text-sm text-foreground flex-1 truncate font-mono">{s.email}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                  s.reason === "BOUNCE" ? "bg-crit/10 text-crit" :
                  s.reason === "SPAM" ? "bg-warn/10 text-warn" :
                  "bg-surface-sunken text-muted"
                }`}>
                  {s.reason}
                </span>
                <span className="text-[11px] text-subtle whitespace-nowrap">{new Date(s.createdAt).toLocaleDateString()}</span>
                <button
                  onClick={() => void handleRemoveSuppression(s.id)}
                  disabled={removingId === s.id}
                  title="Remove — re-enable sending to this address"
                  className="p-1.5 text-muted hover:text-crit hover:bg-surface-sunken rounded-lg transition-colors disabled:opacity-50"
                >
                  {removingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Domain warm-up guidance */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <TrendingUp className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium">Domain warm-up guidance</span>
          </div>
          <div className="p-4 space-y-4">
            <p className="text-xs text-muted leading-relaxed">
              A brand-new domain or IP has no sending reputation with Gmail/Outlook/Yahoo. Sending high volume
              immediately gets flagged as spam. Ramp up gradually and watch your bounce rate at each step —
              back off a step if bounces or spam complaints rise.
            </p>

            <div className="grid grid-cols-2 gap-2">
              {WARMUP_RAMP.map((r) => (
                <div key={r.day} className="bg-surface-sunken border border-border rounded-lg px-3 py-2">
                  <p className="text-[11px] font-semibold text-foreground">{r.day}</p>
                  <p className="text-[11px] text-muted">{r.volume}</p>
                </div>
              ))}
            </div>

            <div>
              <p className="text-[11px] font-semibold text-muted mb-2">Your actual daily volume — last 14 days</p>
              <div className="flex items-end gap-1 h-24">
                {(data?.dailyVolume ?? []).map((d) => (
                  <div key={d.date} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${d.date}: ${d.count} sent`}>
                    <div
                      className="w-full bg-accent/60 rounded-t"
                      style={{ height: `${Math.max(2, (d.count / maxVolume) * 80)}px` }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Avatar/Signature guide */}
        <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <UserRound className="w-4 h-4" /> Sender Avatar in Gmail &amp; Outlook
          </h3>
          <p className="text-xs text-muted leading-relaxed">
            The avatar shown next to your name in Gmail is pulled from the <strong className="text-foreground">sender&apos;s Google profile</strong> or
            from a <strong className="text-foreground">BIMI record</strong> (Brand Indicators for Message Identification).
            Your email signature image is separate and requires the recipient to <em>load remote images</em> (off by default in Gmail).
          </p>
          <div className="grid grid-cols-2 gap-4 text-xs">
            {[
              { title: "For brand avatar in Gmail", steps: ["Set DMARC to p=quarantine or p=reject (required)", "Upload a square SVG logo to a public HTTPS URL", "Add TXT record: default._bimi.cybersage.uk → v=BIMI1; l=https://your-logo-url.svg"] },
              { title: "For signature photo", steps: ["Go to Settings → Signature tab", "Your avatar URL is already embedded in sent emails", "Recipients must enable 'Show images' in their client", "Use a publicly accessible HTTPS avatar URL (no auth)"] },
            ].map(({ title, steps }) => (
              <div key={title} className="bg-surface rounded-lg p-3 space-y-2">
                <p className="font-semibold text-foreground">{title}</p>
                <ol className="space-y-1 list-decimal list-inside text-muted">
                  {steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </div>
            ))}
          </div>
          <a
            href="https://bimigroup.org/bimi-generator/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
          >
            <ExternalLink className="w-3.5 h-3.5" /> BIMI Generator tool
          </a>
        </div>
      </div>
    </div>
  );
}
