"use client";

import { useCallback, useEffect, useState } from "react";
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
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

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
    bg: "bg-[#ea4335]/20",
    text: "text-[#ea4335]",
    border: "border-[#ea4335]",
    dot: "bg-[#ea4335]",
  },
  HIGH: {
    label: "High",
    bg: "bg-[#ea4335]/10",
    text: "text-[#ea4335]/80",
    border: "border-[#ea4335]/50",
    dot: "bg-[#ea4335]/80",
  },
  MEDIUM: {
    label: "Medium",
    bg: "bg-[#ffb4ab]/10",
    text: "text-[#ffb4ab]",
    border: "border-[#ffb4ab]/20",
    dot: "bg-[#ffb4ab]",
  },
  LOW: {
    label: "Low",
    bg: "bg-[#1a56db]/10",
    text: "text-[#1a56db]",
    border: "border-[#1a56db]/20",
    dot: "bg-[#1a56db]",
  },
};

const STATUS_CONFIG = {
  OPEN: { label: "Open", bg: "bg-[#303444]", text: "text-[#5f6368]" },
  INVESTIGATING: { label: "Investigating", bg: "bg-[#353849]", text: "text-[#1a56db]" },
  CONTAINED: { label: "Contained", bg: "bg-[#1a56db]/10", text: "text-[#1a56db]" },
  RESOLVED: { label: "Resolved", bg: "bg-[#0f9d58]/10", text: "text-[#0f9d58]" },
  CLOSED: { label: "Closed", bg: "bg-white", text: "text-[#80868b]" },
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
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-white border border-[#e8eaed] rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-[#5f6368] font-medium">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-[#202124]">{value}</p>
        </div>
        <div className={`rounded-2xl p-3 ${color}`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
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
    <div className="flex h-full flex-col bg-white overflow-hidden">
      <div className="border-b border-[#e8eaed] bg-white px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-[#ea4335]/20 p-2 border border-[#ea4335]/30">
              <Shield className="h-5 w-5 text-[#ea4335]" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-[#202124]">Security Operations Center</h1>
              <p className="text-xs text-[#5f6368]">Real-time threat monitoring and incident management</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { fetchStats(); fetchIncidents(); }}
              className="rounded-xl border border-[#e8eaed] p-2 hover:bg-[#f1f3f4] transition-colors"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4 text-[#5f6368]" />
            </button>
            <button
              onClick={() => setShowNewIncident(true)}
              className="flex items-center gap-2 rounded-2xl bg-[#ea4335] px-4 py-2 text-sm font-medium text-white hover:bg-[#ea4335]/80 transition-colors"
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
              color="bg-red-500"
            />
            <StatCard
              icon={FileWarning}
              label="DLP Violations"
              value={stats.dlpViolations}
              color="bg-orange-500"
            />
            <StatCard
              icon={ShieldAlert}
              label="High-Risk Threats"
              value={stats.highRiskThreats}
              color="bg-yellow-500"
            />
            <StatCard
              icon={Activity}
              label="Critical Alerts"
              value={stats.criticalAlerts}
              color="bg-purple-500"
            />
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-96 shrink-0 flex flex-col border-r border-[#e8eaed] bg-white overflow-hidden">
          <div className="flex items-center gap-1 border-b border-[#e8eaed] p-3">
            {(["ALL", "OPEN", "INVESTIGATING", "RESOLVED"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  statusFilter === s
                    ? "bg-[#1a56db] text-white"
                    : "text-[#5f6368] hover:bg-[#f1f3f4]"
                }`}
              >
                {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-[#1a56db]" />
              </div>
            ) : filteredIncidents.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center gap-2 text-[#80868b]">
                <Shield className="h-8 w-8 text-[#262b3a]" />
                <p className="text-sm">No incidents found</p>
              </div>
            ) : (
              filteredIncidents.map((incident) => (
                <button
                  key={incident.id}
                  onClick={() => handleSelectIncident(incident)}
                  className={`w-full border-b border-[#e8eaed] px-4 py-3.5 text-left transition-colors hover:bg-[#f1f3f4] ${
                    selectedIncident?.id === incident.id ? "bg-[#1a56db]/5 border-l-2 border-l-[#00d2ff]" : ""
                  } ${
                    incident.severity === "CRITICAL" ? "border-l-4 border-[#ea4335]" :
                    incident.severity === "HIGH" ? "border-l-4 border-[#ea4335]/50" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="font-medium text-sm text-[#202124] line-clamp-1">{incident.title}</p>
                    <SeverityBadge severity={incident.severity} />
                  </div>
                  <p className="text-xs text-[#5f6368] line-clamp-2 mb-2">{incident.description}</p>
                  <div className="flex items-center justify-between">
                    <StatusBadge status={incident.status} />
                    <span className="text-xs text-[#80868b]">
                      {formatDistanceToNow(new Date(incident.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>

          {stats && stats.recentSecurityEvents.length > 0 && (
            <div className="border-t border-[#e8eaed]">
              <div className="px-4 py-3 border-b border-[#e8eaed] flex items-center justify-between">
                <h3 className="text-xs font-semibold text-[#5f6368]">
                  Recent Security Events
                </h3>
                <a
                  href="/api/admin/audit-logs?action=DLP"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-[#1a56db] hover:underline"
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
                      className="border-b border-[#e8eaed] px-4 py-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${sevCfg.dot}`} />
                          <span className="text-xs font-medium text-[#202124]">{event.type}</span>
                        </div>
                        <span className="text-xs text-[#80868b]">
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

        <div className="flex-1 flex flex-col bg-white overflow-y-auto">
          {loadingDetail ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-[#1a56db]" />
            </div>
          ) : !selectedIncident ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-[#80868b] p-8">
              <ShieldAlert className="h-16 w-16 text-[#262b3a]" />
              <p className="text-base font-medium text-[#80868b]">Select an incident to view details</p>
              <p className="text-sm text-[#262b3a] text-center">
                Choose an incident from the list to investigate, add notes, and update its status.
              </p>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              <div className="bg-white border border-[#e8eaed] rounded-xl overflow-hidden mx-0 p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-xl font-semibold text-[#202124] mb-2">
                      {selectedIncident.title}
                    </h2>
                    <div className="flex items-center gap-2 flex-wrap">
                      <SeverityBadge severity={selectedIncident.severity} />
                      <StatusBadge status={selectedIncident.status} />
                      {selectedIncident.assignee && (
                        <span className="flex items-center gap-1.5 rounded-full bg-[#f1f3f4] px-2.5 py-0.5 text-xs text-[#5f6368]">
                          <User className="h-3 w-3" />
                          {selectedIncident.assignee.fullName}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-xs text-[#80868b] shrink-0">
                    <p>Created {format(new Date(selectedIncident.createdAt), "PPP")}</p>
                    <p className="mt-0.5">Updated {formatDistanceToNow(new Date(selectedIncident.updatedAt), { addSuffix: true })}</p>
                  </div>
                </div>

                <div className="rounded-xl bg-white border border-[#e8eaed] p-4">
                  <p className="text-sm text-[#202124] whitespace-pre-wrap">
                    {selectedIncident.description}
                  </p>
                </div>
              </div>

              <div className="bg-white border border-[#e8eaed] rounded-xl overflow-hidden mx-0 p-6">
                <h3 className="mb-4 text-sm font-semibold text-[#202124]">Update Status</h3>
                <div className="flex items-center gap-3">
                  <select
                    value={pendingStatus}
                    onChange={(e) => setPendingStatus(e.target.value as Incident["status"])}
                    className="flex-1 rounded-xl border border-[#e8eaed] px-3 py-2 text-sm outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/15 bg-white text-[#202124]"
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
                    className="flex items-center gap-2 rounded-md bg-[#1a56db] px-4 py-2 text-sm font-medium text-white hover:bg-[#1447c0] transition-colors disabled:opacity-60"
                  >
                    {updatingStatus && <Loader2 className="h-4 w-4 animate-spin" />}
                    Update
                  </button>
                </div>
              </div>

              {selectedIncident.timeline && selectedIncident.timeline.length > 0 && (
                <div className="bg-white border border-[#e8eaed] rounded-xl overflow-hidden mx-0 p-6">
                  <h3 className="mb-4 text-sm font-semibold text-[#202124]">Timeline</h3>
                  <div className="space-y-4">
                    {selectedIncident.timeline.map((entry, idx) => (
                      <div key={entry.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="h-7 w-7 rounded-full bg-[#1a56db]/10 border border-[#1a56db]/20 flex items-center justify-center shrink-0">
                            <Clock className="h-3.5 w-3.5 text-[#1a56db]" />
                          </div>
                          {idx < selectedIncident.timeline!.length - 1 && (
                            <div className="mt-1 w-px flex-1 bg-[#f1f3f4]" />
                          )}
                        </div>
                        <div className="flex-1 pb-4">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-[#202124]">
                              {entry.action}
                            </span>
                            <span className="text-xs text-[#80868b]">
                              {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                          {entry.note && (
                            <p className="text-sm text-[#5f6368] rounded-xl bg-white border border-[#e8eaed] px-3 py-2">
                              {entry.note}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-white border border-[#e8eaed] rounded-xl overflow-hidden mx-0 p-6">
                <h3 className="mb-4 text-sm font-semibold text-[#202124]">Add Note</h3>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={3}
                  placeholder="Add an investigation note, action taken, or observation..."
                  className="w-full rounded-xl border border-[#e8eaed] bg-white text-[#202124] placeholder-[#9aa3b8] px-3 py-2.5 text-sm outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/15 resize-none"
                />
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={handleAddNote}
                    disabled={!noteText.trim() || submittingNote}
                    className="flex items-center gap-2 rounded-md bg-[#1a56db] px-4 py-2 text-sm font-medium text-white hover:bg-[#1447c0] transition-colors disabled:opacity-60"
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
          <div className="w-full max-w-lg rounded-xl bg-white border border-[#e8eaed] p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#202124]">New Incident</h2>
              <button
                onClick={() => setShowNewIncident(false)}
                className="rounded-lg p-1 hover:bg-[#f1f3f4] transition-colors"
              >
                <X className="h-4 w-4 text-[#5f6368]" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5f6368]">
                  Title *
                </label>
                <input
                  autoFocus
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Incident title"
                  className="w-full rounded-xl border border-[#e8eaed] bg-white text-[#202124] placeholder-[#9aa3b8] px-3 py-2 text-sm outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/15"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5f6368]">
                  Description *
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  placeholder="Describe the incident in detail"
                  className="w-full rounded-xl border border-[#e8eaed] bg-white text-[#202124] placeholder-[#9aa3b8] px-3 py-2 text-sm outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/15 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#5f6368]">Severity</label>
                  <select
                    value={form.severity}
                    onChange={(e) =>
                      setForm({ ...form, severity: e.target.value as Incident["severity"] })
                    }
                    className="w-full rounded-xl border border-[#e8eaed] bg-white text-[#202124] px-3 py-2 text-sm outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/15"
                  >
                    <option value="CRITICAL">Critical</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#5f6368]">Source Type</label>
                  <input
                    value={form.sourceType}
                    onChange={(e) => setForm({ ...form, sourceType: e.target.value })}
                    placeholder="e.g. SIEM, Email, IDS"
                    className="w-full rounded-xl border border-[#e8eaed] bg-white text-[#202124] placeholder-[#9aa3b8] px-3 py-2 text-sm outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/15"
                  />
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowNewIncident(false)}
                className="rounded-md border border-[#e8eaed] px-4 py-2 text-sm font-medium text-[#5f6368] hover:bg-[#f1f3f4] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateIncident}
                disabled={submittingNew}
                className="flex items-center gap-2 rounded-xl bg-[#ea4335] px-4 py-2 text-sm font-medium text-white hover:bg-[#ea4335]/80 transition-colors disabled:opacity-60"
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
