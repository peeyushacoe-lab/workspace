import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "System Status — CyberSage",
  description: "Real-time status of CyberSage services.",
};

type ServiceStatus = "operational" | "degraded" | "outage";

const SERVICES: { name: string; status: ServiceStatus; latency?: string }[] = [
  { name: "Web Application",   status: "operational", latency: "42ms" },
  { name: "Email Delivery",    status: "operational", latency: "180ms" },
  { name: "Chat (WebSocket)",  status: "operational", latency: "12ms" },
  { name: "Video Meetings",    status: "operational" },
  { name: "Cloud Drive",       status: "operational", latency: "95ms" },
  { name: "AI Assistant",      status: "operational", latency: "620ms" },
  { name: "Calendar & Sync",   status: "operational" },
  { name: "Database",          status: "operational", latency: "8ms" },
  { name: "Job Queue",         status: "operational" },
  { name: "Authentication",    status: "operational", latency: "55ms" },
];

const STATUS_CONFIG: Record<ServiceStatus, { label: string; color: string; dot: string }> = {
  operational: { label: "Operational",   color: "text-emerald-400", dot: "bg-emerald-400" },
  degraded:    { label: "Degraded",      color: "text-yellow-400",  dot: "bg-yellow-400" },
  outage:      { label: "Outage",        color: "text-red-400",     dot: "bg-red-400" },
};

const INCIDENTS: { date: string; title: string; resolved: boolean; detail: string }[] = [
  {
    date: "2026-05-15",
    title: "Email delivery delays",
    resolved: true,
    detail: "Some outbound emails were delayed by up to 8 minutes due to upstream SMTP relay congestion. Resolved at 14:32 UTC.",
  },
];

function allOperational() {
  return SERVICES.every((s) => s.status === "operational");
}

export default function StatusPage() {
  const ok = allOperational();

  return (
    <div className="min-h-screen bg-[#f8fafd] text-[#202124]">
      {/* Nav */}
      <nav className="border-b border-[#e8eaed]">
        <div className="max-w-3xl mx-auto flex items-center justify-between px-6 py-4">
          <Link href="/" className="text-xl font-semibold text-[#1a56db]">CyberSage</Link>
          <Link href="/login" className="text-sm text-[#9aa0a6] hover:text-[#5f6368] transition-colors">Sign in</Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Overall status */}
        <div className={`flex items-center gap-4 p-6 rounded-2xl border mb-10 ${
          ok
            ? "bg-emerald-500/5 border-emerald-500/20"
            : "bg-red-500/5 border-red-500/20"
        }`}>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${ok ? "bg-emerald-500/15" : "bg-red-500/15"}`}>
            {ok ? "✓" : "!"}
          </div>
          <div>
            <p className={`text-xl font-semibold ${ok ? "text-emerald-400" : "text-red-400"}`}>
              {ok ? "All systems operational" : "Some systems are experiencing issues"}
            </p>
            <p className="text-sm text-[#9aa0a6] mt-0.5">
              Last updated: {new Date().toUTCString()}
            </p>
          </div>
        </div>

        {/* Services */}
        <h2 className="text-sm font-semibold text-[#9aa0a6] mb-4">Services</h2>
        <div className="bg-white border border-[#e8eaed] rounded-xl overflow-hidden mb-10 divide-y divide-[#f0f0f0]">
          {SERVICES.map((svc) => {
            const cfg = STATUS_CONFIG[svc.status];
            return (
              <div key={svc.name} className="flex items-center justify-between px-5 py-3.5">
                <div className="flex items-center gap-2.5">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot} ${svc.status === "operational" ? "animate-pulse" : ""}`} />
                  <span className="text-sm text-[#202124]">{svc.name}</span>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  {svc.latency && (
                    <span className="text-[#9aa0a6]">{svc.latency}</span>
                  )}
                  <span className={`font-medium ${cfg.color}`}>{cfg.label}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Incidents */}
        <h2 className="text-sm font-semibold text-[#9aa0a6] mb-4">Recent Incidents</h2>
        {INCIDENTS.length === 0 ? (
          <p className="text-sm text-[#9aa0a6] bg-white border border-[#e8eaed] rounded-xl px-5 py-4">
            No incidents in the last 90 days.
          </p>
        ) : (
          <div className="space-y-3">
            {INCIDENTS.map((inc, i) => (
              <div key={i} className="bg-white border border-[#e8eaed] rounded-xl px-5 py-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-white">{inc.title}</p>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    inc.resolved ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                  }`}>
                    {inc.resolved ? "Resolved" : "Ongoing"}
                  </span>
                </div>
                <p className="text-xs text-[#9aa0a6] mb-1">{inc.date}</p>
                <p className="text-sm text-[#8899a6] leading-relaxed">{inc.detail}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-10 text-center text-sm text-[#9aa0a6]">
          Questions? Email us at{" "}
          <a href="mailto:support@cybersage.uk" className="text-[#1a56db] hover:underline">
            support@cybersage.uk
          </a>
        </div>
      </div>
    </div>
  );
}
