"use client";

import { useState, useEffect, useCallback } from "react";
import {
  LayoutGrid, Loader2, ExternalLink, RefreshCw,
  LogOut, CheckCircle2, X, Key, Globe, Folder, AlertCircle,
} from "lucide-react";
import { PageHeader } from "@/components/Shell";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type JiraUser = {
  displayName: string; emailAddress: string;
  avatarUrls: Record<string, string>; baseUrl: string;
};

type JiraProject = {
  id: string; key: string; name: string; projectTypeKey: string;
  avatarUrls: Record<string, string>;
};

type JiraIssue = {
  id: string; key: string;
  fields: {
    summary: string;
    status: { name: string; statusCategory: { colorName: string } };
    priority: { name: string; iconUrl: string } | null;
    project: { key: string; name: string };
    updated: string;
    issuetype: { name: string; iconUrl: string };
  };
};

type JiraData = {
  connected: boolean;
  user?: JiraUser;
  projects?: JiraProject[];
  issues?: JiraIssue[];
  total?: number;
  error?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(date: string) {
  const d = new Date(date);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const STATUS_COLORS: Record<string, string> = {
  "blue-grey": "bg-[#262A35] text-[#8A92A6]",
  "yellow": "bg-amber-500/15 text-amber-400",
  "green": "bg-emerald-500/15 text-emerald-400",
  "red": "bg-red-500/15 text-red-400",
  "blue": "bg-blue-500/15 text-blue-400",
  "purple": "bg-purple-500/15 text-purple-400",
};

const PRIORITY_COLORS: Record<string, string> = {
  Highest: "text-red-400", High: "text-orange-500",
  Medium: "text-amber-500", Low: "text-blue-500", Lowest: "text-[#5A6275]",
};

// ─── Connect Panel ─────────────────────────────────────────────────────────────

function ConnectPanel({ onConnected }: { onConnected: () => void }) {
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const handleConnect = async () => {
    if (!email.trim() || !apiToken.trim() || !baseUrl.trim()) {
      toast.error("All fields are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/integrations/jira", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), apiToken: apiToken.trim(), baseUrl: baseUrl.trim() }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; displayName?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "Failed to connect");
        return;
      }
      toast.success(`Connected as ${data.displayName}`);
      onConnected();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto mt-16">
      <div className="bg-[#12151D] border border-[#262A35] rounded-2xl p-8 space-y-6">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#0052cc] flex items-center justify-center mx-auto mb-4">
            <LayoutGrid className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-lg font-semibold text-[#E6E9F0]">Connect Jira</h2>
          <p className="text-sm text-[#8A92A6] mt-1">
            Link your Jira workspace to track issues and projects from Nexus.
          </p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-[#8A92A6] mb-1 block flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" /> Jira Base URL
            </label>
            <input
              type="url"
              placeholder="https://yourcompany.atlassian.net"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm
                         placeholder:text-[#5A6275] focus:outline-none focus:border-[#0052cc]/60 focus:ring-2 focus:ring-[#0052cc]/20"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[#8A92A6] mb-1 block">Atlassian Account Email</label>
            <input
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm
                         placeholder:text-[#5A6275] focus:outline-none focus:border-[#0052cc]/60 focus:ring-2 focus:ring-[#0052cc]/20"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[#8A92A6] mb-1 flex items-center gap-1.5 block">
              <Key className="w-3.5 h-3.5" /> API Token
            </label>
            <input
              type="password"
              placeholder="Your Jira API token"
              value={apiToken}
              onChange={e => setApiToken(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm font-mono
                         placeholder:text-[#5A6275] focus:outline-none focus:border-[#0052cc]/60 focus:ring-2 focus:ring-[#0052cc]/20"
            />
            <p className="text-xs text-[#5A6275] mt-1">
              Generate at{" "}
              <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener noreferrer"
                className="text-[#0052cc] hover:underline">
                id.atlassian.com
              </a>
            </p>
          </div>
        </div>
        <button
          onClick={() => void handleConnect()}
          disabled={!email.trim() || !apiToken.trim() || !baseUrl.trim() || saving}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold
                     bg-[#0052cc] text-white rounded-lg hover:bg-[#0747a6] disabled:opacity-50 transition-colors">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <LayoutGrid className="w-4 h-4" />}
          {saving ? "Connecting…" : "Connect Jira"}
        </button>
      </div>
    </div>
  );
}

// ─── Issue Row ─────────────────────────────────────────────────────────────────

function IssueRow({ issue, baseUrl }: { issue: JiraIssue; baseUrl: string }) {
  const colorName = issue.fields.status.statusCategory.colorName;
  const statusCls = STATUS_COLORS[colorName] ?? "bg-[#1B1F2A] text-[#8A92A6]";
  const priorityName = issue.fields.priority?.name ?? "Medium";
  const priorityCls = PRIORITY_COLORS[priorityName] ?? "text-[#8A92A6]";

  return (
    <a href={`${baseUrl}/browse/${issue.key}`} target="_blank" rel="noopener noreferrer"
      className="flex items-start gap-3 px-4 py-3 hover:bg-[#12151D] transition-colors group">
      {issue.fields.issuetype.iconUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={issue.fields.issuetype.iconUrl} alt={issue.fields.issuetype.name} className="w-4 h-4 mt-0.5 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2 flex-wrap">
          <span className="text-xs font-mono text-[#5A6275] shrink-0 mt-0.5">{issue.key}</span>
          <span className="text-sm font-medium text-[#E6E9F0] group-hover:text-[#0052cc] transition-colors line-clamp-1">
            {issue.fields.summary}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusCls}`}>
            {issue.fields.status.name}
          </span>
          {issue.fields.priority && (
            <span className={`text-[10px] font-medium ${priorityCls}`}>
              ● {issue.fields.priority.name}
            </span>
          )}
          <span className="text-xs text-[#5A6275]">{issue.fields.project.name}</span>
          <span className="text-xs text-[#bdc1c6]">·</span>
          <span className="text-xs text-[#5A6275]">{timeAgo(issue.fields.updated)}</span>
        </div>
      </div>
      <ExternalLink className="w-3.5 h-3.5 text-[#bdc1c6] shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
    </a>
  );
}

// ─── Project Card ──────────────────────────────────────────────────────────────

function ProjectCard({ project, baseUrl }: { project: JiraProject; baseUrl: string }) {
  return (
    <a href={`${baseUrl}/jira/software/projects/${project.key}/boards`} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-3 p-4 bg-[#12151D] border border-[#262A35] rounded-xl hover:border-[#0052cc]/30 hover:shadow-sm transition-all group">
      {project.avatarUrls?.["24x24"] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={project.avatarUrls["24x24"]} alt={project.name} className="w-8 h-8 rounded" />
      ) : (
        <div className="w-8 h-8 rounded bg-[#0052cc] flex items-center justify-center">
          <Folder className="w-4 h-4 text-white" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-[#E6E9F0] group-hover:text-[#0052cc] transition-colors truncate">
          {project.name}
        </div>
        <div className="text-xs text-[#5A6275]">{project.key} · {project.projectTypeKey}</div>
      </div>
      <ExternalLink className="w-3.5 h-3.5 text-[#bdc1c6] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
    </a>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

type Tab = "overview" | "issues" | "projects";

export default function JiraPage() {
  const [data, setData] = useState<JiraData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const res = await fetch("/api/integrations/jira");
      const d = await res.json() as JiraData;
      setData(d);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleDisconnect = async () => {
    await fetch("/api/integrations/jira", { method: "DELETE" });
    toast.success("Jira disconnected");
    setData({ connected: false });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#12151D] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#0052cc]" />
      </div>
    );
  }

  if (!data?.connected) {
    return (
      <div className="min-h-screen bg-[#12151D]">
        <PageHeader
          eyebrow="Apps › Jira"
          title="Jira"
          description="Connect Jira to manage issues and projects"
        />
        <div className="px-6 max-w-6xl">
          {data?.error && (
            <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
              <X className="w-4 h-4 shrink-0" /> {data.error}
            </div>
          )}
          <ConnectPanel onConnected={() => void load()} />
        </div>
      </div>
    );
  }

  const { user, projects = [], issues = [], total = 0 } = data;
  const baseUrl = user?.baseUrl ?? "";

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "issues", label: "My Issues", count: total },
    { id: "projects", label: "Projects", count: projects.length },
  ];

  return (
    <div className="min-h-screen bg-[#12151D] text-[#E6E9F0]">
      <PageHeader
        eyebrow="Apps › Jira"
        title="Jira"
        description="Your issues and projects"
        action={
          <div className="flex items-center gap-2">
            <button onClick={() => void load(true)} disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[#262A35] rounded-lg text-[#8A92A6] hover:bg-[#1B1F2A] disabled:opacity-50 transition-colors">
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
            </button>
            <button onClick={() => void handleDisconnect()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[#262A35] rounded-lg text-[#ea4335] hover:bg-red-500/10 transition-colors">
              <LogOut className="w-3.5 h-3.5" /> Disconnect
            </button>
          </div>
        }
      />

      <div className="px-6 pb-12 max-w-6xl space-y-6">
        {/* ── Profile banner ── */}
        {user && (
          <div className="flex items-center gap-4 p-4 bg-[#12151D] border border-[#262A35] rounded-xl">
            {user.avatarUrls?.["48x48"] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrls["48x48"]} alt={user.displayName} className="w-12 h-12 rounded-full border border-[#262A35]" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-[#0052cc] flex items-center justify-center text-white font-bold text-lg">
                {user.displayName[0]}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[#E6E9F0]">{user.displayName}</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span className="text-xs text-emerald-400 font-medium">Connected</span>
              </div>
              <span className="text-sm text-[#8A92A6]">{user.emailAddress}</span>
            </div>
            <div className="ml-auto flex items-center gap-6 text-sm">
              <div className="text-center">
                <div className="font-semibold text-[#E6E9F0]">{projects.length}</div>
                <div className="text-xs text-[#5A6275]">Projects</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-[#E6E9F0]">{total}</div>
                <div className="text-xs text-[#5A6275]">Open Issues</div>
              </div>
            </div>
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="flex gap-1 border-b border-[#262A35]">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? "text-[#0052cc] border-[#0052cc]"
                  : "text-[#8A92A6] border-transparent hover:text-[#E6E9F0]"
              }`}>
              {tab.label}
              {tab.count !== undefined && (
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-semibold ${
                  activeTab === tab.id ? "bg-blue-500/15 text-[#0052cc]" : "bg-[#1B1F2A] text-[#5A6275]"
                }`}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Overview ── */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-[#E6E9F0] mb-3">Projects</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {projects.slice(0, 6).map(p => <ProjectCard key={p.id} project={p} baseUrl={baseUrl} />)}
                {projects.length === 0 && (
                  <div className="col-span-3 py-8 text-center text-sm text-[#5A6275]">No projects found</div>
                )}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#E6E9F0] mb-2">
                My Open Issues
                {total > issues.length && <span className="text-[#5A6275] font-normal ml-1">(showing {issues.length} of {total})</span>}
              </h3>
              <div className="bg-[#12151D] border border-[#262A35] rounded-xl divide-y divide-[#262A35] overflow-hidden">
                {issues.length === 0
                  ? <div className="py-8 text-center text-sm text-[#5A6275]">No open issues assigned to you</div>
                  : issues.map(i => <IssueRow key={i.id} issue={i} baseUrl={baseUrl} />)}
              </div>
            </div>
          </div>
        )}

        {/* ── Issues ── */}
        {activeTab === "issues" && (
          <div>
            {total > issues.length && (
              <div className="flex items-center gap-2 mb-3 px-1 text-xs text-[#5A6275]">
                <AlertCircle className="w-3.5 h-3.5" />
                Showing {issues.length} of {total} open issues. Open Jira to see all.
              </div>
            )}
            <div className="bg-[#12151D] border border-[#262A35] rounded-xl divide-y divide-[#262A35] overflow-hidden">
              {issues.length === 0
                ? <div className="py-16 text-center text-sm text-[#5A6275]">No open issues assigned to you</div>
                : issues.map(i => <IssueRow key={i.id} issue={i} baseUrl={baseUrl} />)}
            </div>
          </div>
        )}

        {/* ── Projects ── */}
        {activeTab === "projects" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.length === 0
              ? <div className="col-span-3 py-16 text-center text-sm text-[#5A6275]">No projects found</div>
              : projects.map(p => <ProjectCard key={p.id} project={p} baseUrl={baseUrl} />)}
          </div>
        )}
      </div>
    </div>
  );
}
