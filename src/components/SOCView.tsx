"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Shield,
  ShieldAlert,
  Activity,
  FileWarning,
  Plus,
  X,
  Clock,
  User,
  RefreshCw,
  Loader2,
  Send,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { avatarGradient } from "@/lib/avatar";

type Incident = {
  id: string;
  title: string;
  description: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  status: "OPEN" | "INVESTIGATING" | "CONTAINED" | "RESOLVED" | "CLOSED";
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
  assignee?: { id: string; fullName: string; avatarUrl?: string };
  timeline?: Array<{
    id: string;
    action: string;
    note?: string;
    userId?: string;
    createdAt: string;
  }>;
  _count?: { timeline: number };
};

type SecurityEvent = {
  id: string;
  type: string;
  severity: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

type SOCStats = {
  openIncidents: number;
  dlpViolations: number;
  highRiskThreats: number;
  criticalAlerts: number;
  recentSecurityEvents: SecurityEvent[];
};

type StatusFilter = "ALL" | "OPEN" | "INVESTIGATING" | "RESOLVED";

const SEVERITY_CONFIG = {
  CRITICAL: {
    label: "Critical",
    bg: "bg-[#ea4335]/15",
    text: "text-[#ea4335]",
    border: "border-[#ea4335]",
    dot: "bg-[#ea4335]",
  },
  HIGH: {
    label: "High",
    bg: "bg-[#ff6d00]/15",
    text: "text-[#ff6d00]",
    border: "border-[#ff6d00]/50",
    dot: "bg-[#ff6d00]",
  },
  MEDIUM: {
    label: "Medium",
    bg: "bg-[#F59E0B]/15",
    text: "text-[#F59E0B]",
    border: "border-[#F59E0B]/40",
    dot: "bg-[#F59E0B]",
  },
  LOW: {
    label: "Low",
    bg: "bg-[#0f9d58]/15",
    text: "text-[#0f9d58]",
    border: "border-[#0f9d58]/30",
    dot: "bg-[#0f9d58]",
  },
};

const STATUS_CONFIG = {
  OPEN: { label: "Open", bg: "bg-[#1B1F2A]", text: "text-[#8A92A6]" },
  INVESTIGATING: { label: "Investigating", bg: "bg-[#00C2FF]/10", text: "text-[#00C2FF]" },
  CONTAINED: { label: "Contained", bg: "bg-[#00C2FF]/10", text: "text-[#00C2FF]" },
  RESOLVED: { label: "Resolved", bg: "bg-[#0f9d58]/10", text: "text-[#0f9d58]" },
  CLOSED: { label: "Closed", bg: "bg-[#1B1F2A]", text: "text-[#5A6275]" },
};

function SeverityBadge({ severity }: { severity: Incident["severity"] }) {
  const cfg = SEVERITY_CONFIG[severity];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: Incident["status"] }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.OPEN;
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tint,
  iconColor,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  tint: string;
  iconColor: string;
}) {
  return (
    <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-5 hover:border-[#2E333F] transition-colors">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-[#8A92A6] font-medium">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-[#E6E9F0] font-mono tracking-tight">{value}</p>
        </div>
        <div className={`rounded-xl p-2.5 border ${tint}`}>
          <Icon className="h-5 w-5" style={{ color: iconColor }} />
        </div>
      </div>
    </div>
  );
}

// ─── AI Threat Analysis Card ──────────────────────────────────────────────────
function AIAnalysisCard({ incident }: { incident: Incident }) {
  const [analysis, setAnalysis] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const QUICK_PROMPTS = [
    { label: "Threat analysis", prompt: `Analyze this security incident and identify likely attack vectors, threat actors, and immediate containment steps:\n\nTitle: ${incident.title}\nSeverity: ${incident.severity}\nDescription: ${incident.description}` },
    { label: "Remediation steps", prompt: `Provide a step-by-step remediation playbook for this ${incident.severity} severity incident:\n\nTitle: ${incident.title}\nDescription: ${incident.description}` },
    { label: "Similar incidents", prompt: `What known threat campaigns or CVEs match this incident pattern? Provide IOCs to look for:\n\nTitle: ${incident.title}\nDescription: ${incident.description}` },
  ];

  const run = async (prompt: string) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setAnalysis("");
    setLoading(true);
    setRan(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt, history: [] }),
        signal: abortRef.current.signal,
      });
      if (!res.ok || !res.body) throw new Error("AI unavailable");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // SSE lines: "data: text\n\n"
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const chunk = line.slice(6);
            if (chunk === "[DONE]") break;
            setAnalysis(prev => prev + chunk);
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setAnalysis("AI analysis unavailable. Check your AI provider configuration.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-4 w-4 text-[#00C2FF]" />
        <h3 className="text-sm font-semibold text-[#E6E9F0]">AI Threat Analysis</h3>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {QUICK_PROMPTS.map(q => (
          <button
            key={q.label}
            onClick={() => run(q.prompt)}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#1B1F2A] border border-[#262A35] text-[#8A92A6] hover:text-[#E6E9F0] hover:border-[#00C2FF]/40 transition-colors disabled:opacity-50"
          >
            {q.label}
          </button>
        ))}
      </div>
      {loading && !analysis && (
        <div className="flex items-center gap-2 text-xs text-[#5A6275] py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#00C2FF]" />
          Analyzing incident…
        </div>
      )}
      {ran && analysis && (
        <div className="rounded-lg bg-[#0D1017] border border-[#262A35] p-4 text-sm text-[#C8CDD8] whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
          {analysis}
          {loading && <span className="inline-block w-1.5 h-3.5 bg-[#00C2FF] animate-pulse ml-0.5 align-text-bottom" />}
        </div>
      )}
    </div>
  );
}

export function SOCView(_props: { currentUserId: string }) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [stats, setStats] = useState<SOCStats | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [loading, setLoading] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showNewIncident, setShowNewIncident] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [submittingNote, setSubmittingNote] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<Incident["status"]>("OPEN");

  const [form, setForm] = useState({
    title: "",
    description: "",
    severity: "HIGH" as Incident["severity"],
    sourceType: "",
  });
  const [submittingNew, setSubmittingNew] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/soc/stats");
      if (res.ok) setStats(await res.json());
    } catch {
      toast.error("Failed to load SOC stats");
    }
  }, []);

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/soc/incidents");
      if (res.ok) setIncidents(await res.json());
      else setIncidents([]);
    } catch {
      toast.error("Failed to load incidents");
      setIncidents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchIncidentDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/soc/incidents/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedIncident(data);
        setPendingStatus(data.status);
      }
    } catch {
      toast.error("Failed to load incident detail");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchIncidents();
  }, [fetchStats, fetchIncidents]);

  const handleSelectIncident = (incident: Incident) => {
    fetchIncidentDetail(incident.id);
  };

  const handleAddNote = async () => {
    if (!selectedIncident || !noteText.trim()) return;
    setSubmittingNote(true);
    try {
      const res = await fetch(`/api/soc/incidents/${selectedIncident.id}/timeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "NOTE", note: noteText.trim() }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Note added");
      setNoteText("");
      fetchIncidentDetail(selectedIncident.id);
    } catch {
      toast.error("Could not add note");
    } finally {
      setSubmittingNote(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!selectedIncident) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/soc/incidents/${selectedIncident.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: pendingStatus }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Status updated");
      fetchIncidentDetail(selectedIncident.id);
      fetchIncidents();
    } catch {
      toast.error("Could not update status");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleCreateIncident = async () => {
    if (!form.title.trim() || !form.description.trim()) {
      toast.error("Title and description are required");
      return;
    }
    setSubmittingNew(true);
    try {
      const res = await fetch("/api/soc/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          severity: form.severity,
          sourceType: form.sourceType.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Incident created");
      setShowNewIncident(false);
      setForm({ title: "", description: "", severity: "HIGH", sourceType: "" });
      fetchIncidents();
      fetchStats();
    } catch {
      toast.error("Could not create incident");
    } finally {
      setSubmittingNew(false);
    }
  };

  const filteredIncidents = incidents.filter((i) => {
    if (statusFilter === "ALL") return true;
    if (statusFilter === "RESOLVED") return i.status === "RESOLVED" || i.status === "CLOSED";
    return i.status === statusFilter;
  });

  return (
    <div className="flex h-full flex-col bg-[#12151D] overflow-hidden">
      <div className="border-b border-[#262A35] bg-[#12151D] px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-[#ea4335]/15 p-2.5 border border-[#ea4335]/30">
              <Shield className="h-5 w-5 text-[#ea4335]" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-[#E6E9F0] tracking-[-0.01em]">Security Operations Center</h1>
              <p className="text-xs text-[#8A92A6]">Real-time threat monitoring and incident management</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { fetchStats(); fetchIncidents(); }}
              className="rounded-lg border border-[#262A35] p-2 hover:bg-[#1B1F2A] transition-colors"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4 text-[#8A92A6]" />
            </button>
            <button
              onClick={() => setShowNewIncident(true)}
              className="flex items-center gap-2 rounded-lg bg-[#ea4335] px-4 py-2 text-sm font-medium text-white hover:bg-[#d33828] transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Incident
            </button>
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-4 gap-4">
            <StatCard
              icon={AlertTriangle}
              label="Open Incidents"
              value={stats.openIncidents}
              tint="bg-[#ea4335]/10 border-[#ea4335]/20"
              iconColor="#ea4335"
            />
            <StatCard
              icon={FileWarning}
              label="DLP Violations"
              value={stats.dlpViolations}
              tint="bg-[#ff6d00]/10 border-[#ff6d00]/20"
              iconColor="#ff6d00"
            />
            <StatCard
              icon={ShieldAlert}
              label="High-Risk Threats"
              value={stats.highRiskThreats}
              tint="bg-[#F59E0B]/10 border-[#F59E0B]/20"
              iconColor="#F59E0B"
            />
            <StatCard
              icon={Activity}
              label="Critical Alerts"
              value={stats.criticalAlerts}
              tint="bg-[#00C2FF]/10 border-[#00C2FF]/20"
              iconColor="#00C2FF"
            />
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-96 shrink-0 flex flex-col border-r border-[#262A35] bg-[#12151D] overflow-hidden">
          <div className="flex items-center gap-1 border-b border-[#262A35] p-3">
            {(["ALL", "OPEN", "INVESTIGATING", "RESOLVED"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  statusFilter === s
                    ? "bg-[#00C2FF] text-[#06121A]"
                    : "text-[#8A92A6] hover:bg-[#1B1F2A]"
                }`}
              >
                {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-[#00C2FF]" />
              </div>
            ) : filteredIncidents.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center gap-2 text-[#5A6275]">
                <Shield className="h-8 w-8 text-[#2E333F]" />
                <p className="text-sm">No incidents found</p>
              </div>
            ) : (
              filteredIncidents.map((incident) => (
                <button
                  key={incident.id}
                  onClick={() => handleSelectIncident(incident)}
                  className={`w-full border-b border-[#262A35] px-4 py-3.5 text-left transition-colors hover:bg-[#1B1F2A] ${
                    selectedIncident?.id === incident.id ? "bg-[#00C2FF]/5 border-l-2 border-l-[#00C2FF]" : ""
                  } ${
                    incident.severity === "CRITICAL" ? "border-l-4 border-[#ea4335]" :
                    incident.severity === "HIGH" ? "border-l-4 border-[#ea4335]/50" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="font-medium text-sm text-[#E6E9F0] line-clamp-1">{incident.title}</p>
                    <SeverityBadge severity={incident.severity} />
                  </div>
                  <p className="text-xs text-[#8A92A6] line-clamp-2 mb-2">{incident.description}</p>
                  <div className="flex items-center justify-between">
                    <StatusBadge status={incident.status} />
                    <span className="text-[11px] text-[#5A6275] font-mono">
                      {formatDistanceToNow(new Date(incident.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>

          {stats && stats.recentSecurityEvents.length > 0 && (
            <div className="border-t border-[#262A35]">
              <div className="px-4 py-3 border-b border-[#262A35] flex items-center justify-between">
                <h3 className="text-xs font-semibold text-[#8A92A6]">
                  Recent Security Events
                </h3>
                <a
                  href="/api/admin/audit-logs?action=DLP"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-[#00C2FF] hover:underline"
                >
                  DLP Violations
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {stats.recentSecurityEvents.map((event) => {
                  const sevCfg = SEVERITY_CONFIG[event.severity as Incident["severity"]] ?? SEVERITY_CONFIG.LOW;
                  return (
                    <div
                      key={event.id}
                      className="border-b border-[#262A35] px-4 py-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${sevCfg.dot}`} />
                          <span className="text-xs font-medium text-[#E6E9F0]">{event.type}</span>
                        </div>
                        <span className="text-xs text-[#5A6275]">
                          {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col bg-[#12151D] overflow-y-auto">
          {loadingDetail ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-[#00C2FF]" />
            </div>
          ) : !selectedIncident ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-[#5A6275] p-8">
              <ShieldAlert className="h-16 w-16 text-[#2E333F]" />
              <p className="text-base font-medium text-[#5A6275]">Select an incident to view details</p>
              <p className="text-sm text-[#5A6275] text-center">
                Choose an incident from the list to investigate, add notes, and update its status.
              </p>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              <div className="bg-[#12151D] border border-[#262A35] rounded-xl overflow-hidden mx-0 p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-xl font-semibold text-[#E6E9F0] mb-2">
                      {selectedIncident.title}
                    </h2>
                    <div className="flex items-center gap-2 flex-wrap">
                      <SeverityBadge severity={selectedIncident.severity} />
                      <StatusBadge status={selectedIncident.status} />
                      {selectedIncident.assignee && (
                        <span className="flex items-center gap-1.5 rounded-full bg-[#1B1F2A] border border-[#262A35] pl-1 pr-2.5 py-0.5 text-xs text-[#8A92A6]">
                          <span
                            style={{ background: avatarGradient(selectedIncident.assignee.fullName) }}
                            className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold text-white"
                          >
                            {selectedIncident.assignee.fullName.charAt(0).toUpperCase()}
                          </span>
                          {selectedIncident.assignee.fullName}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-xs text-[#5A6275] shrink-0 font-mono">
                    <p>Created {format(new Date(selectedIncident.createdAt), "PPP")}</p>
                    <p className="mt-0.5">Updated {formatDistanceToNow(new Date(selectedIncident.updatedAt), { addSuffix: true })}</p>
                  </div>
                </div>

                <div className="rounded-xl bg-[#1B1F2A] border border-[#262A35] p-4">
                  <p className="text-sm text-[#E6E9F0] whitespace-pre-wrap leading-relaxed">
                    {selectedIncident.description}
                  </p>
                </div>
              </div>

              <div className="bg-[#12151D] border border-[#262A35] rounded-xl overflow-hidden mx-0 p-6">
                <h3 className="mb-4 text-sm font-semibold text-[#E6E9F0]">Update Status</h3>
                <div className="flex items-center gap-3">
                  <select
                    value={pendingStatus}
                    onChange={(e) => setPendingStatus(e.target.value as Incident["status"])}
                    className="flex-1 rounded-lg border border-[#2E333F] px-3 py-2 text-sm outline-none focus:border-[#00C2FF] focus:ring-2 focus:ring-[#00C2FF]/15 bg-[#0D1017] text-[#E6E9F0]"
                  >
                    {(["OPEN", "INVESTIGATING", "CONTAINED", "RESOLVED", "CLOSED"] as const).map(
                      (s) => (
                        <option key={s} value={s}>
                          {STATUS_CONFIG[s].label}
                        </option>
                      )
                    )}
                  </select>
                  <button
                    onClick={handleUpdateStatus}
                    disabled={updatingStatus || pendingStatus === selectedIncident.status}
                    className="flex items-center gap-2 rounded-md bg-[#00C2FF] px-4 py-2 text-sm font-medium text-[#06121A] hover:bg-[#0098E6] transition-colors disabled:opacity-60"
                  >
                    {updatingStatus && <Loader2 className="h-4 w-4 animate-spin" />}
                    Update
                  </button>
                </div>
              </div>

              {selectedIncident.timeline && selectedIncident.timeline.length > 0 && (
                <div className="bg-[#12151D] border border-[#262A35] rounded-xl overflow-hidden mx-0 p-6">
                  <h3 className="mb-4 text-sm font-semibold text-[#E6E9F0]">Timeline</h3>
                  <div className="space-y-4">
                    {selectedIncident.timeline.map((entry, idx) => (
                      <div key={entry.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="h-7 w-7 rounded-full bg-[#00C2FF]/10 border border-[#00C2FF]/20 flex items-center justify-center shrink-0">
                            <Clock className="h-3.5 w-3.5 text-[#00C2FF]" />
                          </div>
                          {idx < selectedIncident.timeline!.length - 1 && (
                            <div className="mt-1 w-px flex-1 bg-[#1B1F2A]" />
                          )}
                        </div>
                        <div className="flex-1 pb-4">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-[#E6E9F0] uppercase tracking-wide">
                              {entry.action}
                            </span>
                            <span className="text-[11px] text-[#5A6275] font-mono">
                              {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                          {entry.note && (
                            <p className="text-sm text-[#8A92A6] rounded-xl bg-[#1B1F2A] border border-[#262A35] px-3 py-2">
                              {entry.note}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <AIAnalysisCard incident={selectedIncident} />

              <div className="bg-[#12151D] border border-[#262A35] rounded-xl overflow-hidden mx-0 p-6">
                <h3 className="mb-4 text-sm font-semibold text-[#E6E9F0]">Add Note</h3>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={3}
                  placeholder="Add an investigation note, action taken, or observation..."
                  className="w-full rounded-lg border border-[#2E333F] bg-[#0D1017] text-[#E6E9F0] placeholder-[#5A6275] px-3 py-2.5 text-sm outline-none focus:border-[#00C2FF] focus:ring-2 focus:ring-[#00C2FF]/15 resize-none"
                />
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={handleAddNote}
                    disabled={!noteText.trim() || submittingNote}
                    className="flex items-center gap-2 rounded-md bg-[#00C2FF] px-4 py-2 text-sm font-medium text-[#06121A] hover:bg-[#0098E6] transition-colors disabled:opacity-60"
                  >
                    {submittingNote ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Submit Note
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showNewIncident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 ">
          <div className="w-full max-w-lg rounded-xl bg-[#12151D] border border-[#262A35] p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#E6E9F0]">New Incident</h2>
              <button
                onClick={() => setShowNewIncident(false)}
                className="rounded-lg p-1 hover:bg-[#1B1F2A] transition-colors"
              >
                <X className="h-4 w-4 text-[#8A92A6]" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#8A92A6]">
                  Title *
                </label>
                <input
                  autoFocus
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Incident title"
                  className="w-full rounded-lg border border-[#2E333F] bg-[#0D1017] text-[#E6E9F0] placeholder-[#5A6275] px-3 py-2 text-sm outline-none focus:border-[#00C2FF] focus:ring-2 focus:ring-[#00C2FF]/15"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#8A92A6]">
                  Description *
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  placeholder="Describe the incident in detail"
                  className="w-full rounded-lg border border-[#2E333F] bg-[#0D1017] text-[#E6E9F0] placeholder-[#5A6275] px-3 py-2 text-sm outline-none focus:border-[#00C2FF] focus:ring-2 focus:ring-[#00C2FF]/15 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#8A92A6]">Severity</label>
                  <select
                    value={form.severity}
                    onChange={(e) =>
                      setForm({ ...form, severity: e.target.value as Incident["severity"] })
                    }
                    className="w-full rounded-lg border border-[#2E333F] bg-[#0D1017] text-[#E6E9F0] px-3 py-2 text-sm outline-none focus:border-[#00C2FF] focus:ring-2 focus:ring-[#00C2FF]/15"
                  >
                    <option value="CRITICAL">Critical</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#8A92A6]">Source Type</label>
                  <input
                    value={form.sourceType}
                    onChange={(e) => setForm({ ...form, sourceType: e.target.value })}
                    placeholder="e.g. SIEM, Email, IDS"
                    className="w-full rounded-lg border border-[#2E333F] bg-[#0D1017] text-[#E6E9F0] placeholder-[#5A6275] px-3 py-2 text-sm outline-none focus:border-[#00C2FF] focus:ring-2 focus:ring-[#00C2FF]/15"
                  />
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowNewIncident(false)}
                className="rounded-md border border-[#262A35] px-4 py-2 text-sm font-medium text-[#8A92A6] hover:bg-[#1B1F2A] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateIncident}
                disabled={submittingNew}
                className="flex items-center gap-2 rounded-lg bg-[#ea4335] px-4 py-2 text-sm font-medium text-white hover:bg-[#d33828] transition-colors disabled:opacity-60"
              >
                {submittingNew && <Loader2 className="h-4 w-4 animate-spin" />}
                Create Incident
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
