"use client";

import { useState, useEffect } from "react";
import { Shield, CheckCircle2, AlertTriangle, XCircle, Copy, ExternalLink, RefreshCw } from "lucide-react";
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
  fromEmail: string;
  resendConfigured: boolean;
  records: DnsRecord[];
};

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
    <button onClick={copy} className="p-1 text-[#5c6b72] hover:text-[#00d2ff] transition-colors flex-shrink-0">
      <Copy className="w-3.5 h-3.5" />
    </button>
  );
}

export default function DeliverabilityPage() {
  const [data, setData] = useState<DeliverabilityStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/deliverability");
      if (res.ok) setData(await res.json() as DeliverabilityStatus);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const okCount = data?.records.filter((r) => r.status === "ok").length ?? 0;
  const totalCount = data?.records.length ?? 0;

  return (
    <div className="min-h-screen bg-[#0f1321] text-[#dfe1f6]">
      <PageHeader
        eyebrow="Admin · Email"
        title="Email Deliverability"
        description="DNS configuration required to avoid spam folders and authenticate your sending domain."
      />

      <div className="px-6 pb-8 max-w-4xl space-y-6">
        {/* Score card */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Sending Domain", value: data?.domain ?? "—", sub: "Your domain" },
            { label: "From Address", value: data?.fromEmail ?? "—", sub: "Outgoing sender" },
            { label: "DNS Records", value: loading ? "…" : `${okCount} / ${totalCount}`, sub: `${okCount === totalCount ? "All configured ✓" : "Action required"}` },
          ].map(({ label, value, sub }) => (
            <div key={label} className="bg-[#1b1f2e] border border-[rgba(0,255,255,0.08)] rounded-xl p-4">
              <p className="text-[10px] text-[#5c6b72] uppercase tracking-widest mb-1">{label}</p>
              <p className="font-mono text-sm text-[#00d2ff] truncate">{value}</p>
              <p className="text-[11px] text-[#5c6b72] mt-1">{sub}</p>
            </div>
          ))}
        </div>

        {/* How to fix spam banner */}
        <div className="bg-[#1a1200] border border-yellow-500/20 rounded-xl p-4 flex gap-3">
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
        <div className="bg-[#1b1f2e] border border-[rgba(0,255,255,0.08)] rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[rgba(0,255,255,0.08)]">
            <Shield className="w-4 h-4 text-[#00d2ff]" />
            <span className="text-sm font-medium">Required DNS Records</span>
            <div className="flex-1" />
            <button onClick={load} className="p-1.5 text-[#5c6b72] hover:text-[#bbc9cf]">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="divide-y divide-[rgba(0,255,255,0.04)]">
            {loading ? (
              <div className="py-10 text-center text-[#5c6b72] text-sm">Checking DNS…</div>
            ) : data?.records.map((record) => (
              <div key={record.host} className="px-4 py-4 flex items-start gap-3">
                <StatusIcon status={record.status} />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono bg-[#262939] text-[#a5e7ff] px-2 py-0.5 rounded">{record.type}</span>
                    <span className="text-sm font-medium text-[#dfe1f6] truncate">{record.host}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                      record.status === "ok" ? "bg-emerald-500/10 text-emerald-400" :
                      record.status === "missing" ? "bg-red-500/10 text-red-400" :
                      "bg-yellow-500/10 text-yellow-400"
                    }`}>
                      {record.status === "ok" ? "Configured" : record.status === "missing" ? "Missing" : "Unverified"}
                    </span>
                  </div>
                  <p className="text-xs text-[#5c6b72]">{record.description}</p>
                  <div className="flex items-center gap-2 bg-[#0c0e1a] rounded-lg px-3 py-2 mt-1">
                    <code className="text-xs text-[#a5e7ff] font-mono flex-1 truncate">{record.value}</code>
                    <CopyButton value={record.value} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Avatar/Signature guide */}
        <div className="bg-[#1b1f2e] border border-[rgba(0,255,255,0.08)] rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <span className="text-base">👤</span> Sender Avatar in Gmail &amp; Outlook
          </h3>
          <p className="text-xs text-[#bbc9cf] leading-relaxed">
            The avatar shown next to your name in Gmail is pulled from the <strong className="text-[#dfe1f6]">sender&apos;s Google profile</strong> or
            from a <strong className="text-[#dfe1f6]">BIMI record</strong> (Brand Indicators for Message Identification).
            Your email signature image is separate and requires the recipient to <em>load remote images</em> (off by default in Gmail).
          </p>
          <div className="grid grid-cols-2 gap-4 text-xs">
            {[
              { title: "For brand avatar in Gmail", steps: ["Set DMARC to p=quarantine or p=reject (required)", "Upload a square SVG logo to a public HTTPS URL", "Add TXT record: default._bimi.cybersage.uk → v=BIMI1; l=https://your-logo-url.svg"] },
              { title: "For signature photo", steps: ["Go to Settings → Signature tab", "Your avatar URL is already embedded in sent emails", "Recipients must enable 'Show images' in their client", "Use a publicly accessible HTTPS avatar URL (no auth)"] },
            ].map(({ title, steps }) => (
              <div key={title} className="bg-[#0c0e1a] rounded-lg p-3 space-y-2">
                <p className="font-semibold text-[#dfe1f6]">{title}</p>
                <ol className="space-y-1 list-decimal list-inside text-[#bbc9cf]">
                  {steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </div>
            ))}
          </div>
          <a
            href="https://bimigroup.org/bimi-generator/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-[#00d2ff] hover:underline"
          >
            <ExternalLink className="w-3.5 h-3.5" /> BIMI Generator tool
          </a>
        </div>
      </div>
    </div>
  );
}
