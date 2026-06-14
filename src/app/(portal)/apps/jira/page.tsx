"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutGrid, ChevronLeft, Loader2, ExternalLink, RefreshCw,
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
  "blue-grey": "bg-[#e8eaed] text-[#5f6368]",
  "yellow": "bg-amber-100 text-amber-700",
  "green": "bg-emerald-100 text-emerald-700",
  "red": "bg-red-100 text-red-700",
  "blue": "bg-blue-100 text-blue-700",
  "purple": "bg-purple-100 text-purple-700",
};

const PRIORITY_COLORS: Record<string, string> = {
  Highest: "text-red-600", High: "text-orange-500",
  Medium: "text-amber-500", Low: "text-blue-500", Lowest: "text-[#80868b]",
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
      <div className="bg-white border border-[#e8eaed] rounded-2xl p-8 space-y-6">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#0052cc] flex items-center justify-center mx-auto mb-4">
            <LayoutGrid className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-lg font-semibold text-[#202124]">Connect Jira</h2>
          <p className="text-sm text-[#5f6368] mt-1">
            Link your Jira workspace to track issues and projects from Nexus.
          </p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-[#5f6368] mb-1 block flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" /> Jira Base URL
            </label>
            <input
              type="url"
              placeholder="https://yourcompany.atlassian.net"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm
                         placeholder:text-[#80868b] focus:outline-none focus:border-[#0052cc]/60 focus:ring-2 focus:ring-[#0052cc]/20"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[#5f6368] mb-1 block">Atlassian Account Email</label>
            <input
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm
                         placeholder:text-[#80868b] focus:outline-none focus:border-[#0052cc]/60 focus:ring-2 focus:ring-[#0052cc]/20"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[#5f6368] mb-1 flex items-center gap-1.5 block">
              <Key className="w-3.5 h-3.5" /> API Token
            </label>
            <input
              type="password"
              placeholder="Your Jira API token"
              value={apiToken}
              onChange={e => setApiToken(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm font-mono
                         placeholder:text-[#80868b] focus:outline-none focus:border-[#0052cc]/60 focus:ring-2 focus:ring-[#0052cc]/20"
            />
            <p className="text-xs text-[#80868b] mt-1">
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
  const statusCls = STATUS_COLORS[colorName] ?? "bg-[#f1f3f4] text-[#5f6368]";
  const priorityName = issue.fields.priority?.name ?? "Medium";
  const priorityCls = PRIORITY_COLORS[priorityName] ?? "text-[#5f6368]";

  return (
    <a href={`${baseUrl}/browse/${issue.key}`} target="_blank" rel="noopener noreferrer"
      className="flex items-start gap-3 px-4 py-3 hover:bg-[#f8f9fa] transition-colors group">
      {issue.fields.issuetype.iconUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={issue.fields.issuetype.iconUrl} alt={issue.fields.issuetype.name} className="w-4 h-4 mt-0.5 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2 flex-wrap">
          <span className="text-xs font-mono text-[#80868b] shrink-0 mt-0.5">{issue.key}</span>
          <span className="text-sm font-medium text-[#202124] group-hover:text-[#0052cc] transition-colors line-clamp-1">
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
          <span className="text-xs text-[#80868b]">{issue.fields.project.name}</span>
          <span className="text-xs text-[#bdc1c6]">·</span>
          <span className="text-xs text-[#80868b]">{timeAgo(issue.fields.updated)}</span>
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
      className="flex items-center gap-3 p-4 bg-white border border-[#e8eaed] rounded-xl hover:border-[#0052cc]/30 hover:shadow-sm transition-all group">
      {project.avatarUrls?.["24x24"] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={project.avatarUrls["24x24"]} alt={project.name} className="w-8 h-8 rounded" />
      ) : (
        <div className="w-8 h-8 rounded bg-[#0052cc] flex items-center justify-center">
          <Folder className="w-4 h-4 text-white" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-[#202124] group-hover:text-[#0052cc] transition-colors truncate">
          {project.name}
        </div>
        <div className="text-xs text-[#80868b]">{project.key} · {project.projectTypeKey}</div>
      </div>
      <ExternalLink className="w-3.5 h-3.5 text-[#bdc1c6] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
    </a>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

type Tab = "overview" | "issues" | "projects";

export default function JiraPage() {
  const router = useRouter();
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
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#0052cc]" />
      </div>
    );
  }

  if (!data?.connected) {
    return (
      <div className="min-h-screen bg-white">
        <PageHeader
          eyebrow={<button onClick={() => router.push("/apps")} className="flex items-center gap-1 text-xs text-[#5f6368] hover:text-[#202124]"><ChevronLeft className="w-3.5 h-3.5" /> Apps</button>}
          title="Jira"
          description="Connect Jira to manage issues and projects"
        />
        <div className="px-6 max-w-6xl">
          {data?.error && (
            <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
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
    <div className="min-h-screen bg-white text-[#202124]">
      <PageHeader
        eyebrow={<button onClick={() => router.push("/apps")} className="flex items-center gap-1 text-xs text-[#5f6368] hover:text-[#202124]"><ChevronLeft className="w-3.5 h-3.5" /> Apps</button>}
        title="Jira"
        description="Your issues and projects"
        action={
          <div className="flex items-center gap-2">
            <button onClick={() => void load(true)} disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[#e8eaed] rounded-lg text-[#5f6368] hover:bg-[#f1f3f4] disabled:opacity-50 transition-colors">
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
            </button>
            <button onClick={() => void handleDisconnect()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[#e8eaed] rounded-lg text-[#ea4335] hover:bg-red-50 transition-colors">
              <LogOut className="w-3.5 h-3.5" /> Disconnect
            </button>
          </div>
        }
      />

      <div className="px-6 pb-12 max-w-6xl space-y-6">
        {/* ── Profile banner ── */}
        {user && (
          <div className="flex items-center gap-4 p-4 bg-[#f8f9fa] border border-[#e8eaed] rounded-xl">
            {user.avatarUrls?.["48x48"] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrls["48x48"]} alt={user.displayName} className="w-12 h-12 rounded-full border border-[#e8eaed]" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-[#0052cc] flex items-center justify-center text-white font-bold text-lg">
                {user.displayName[0]}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[#202124]">{user.displayName}</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span className="text-xs text-emerald-600 font-medium">Connected</span>
              </div>
              <span className="text-sm text-[#5f6368]">{user.emailAddress}</span>
            </div>
            <div className="ml-auto flex items-center gap-6 text-sm">
              <div className="text-center">
                <div className="font-semibold text-[#202124]">{projects.length}</div>
                <div className="text-xs text-[#80868b]">Projects</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-[#202124]">{total}</div>
                <div className="text-xs text-[#80868b]">Open Issues</div>
              </div>
            </div>
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="flex gap-1 border-b border-[#e8eaed]">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? "text-[#0052cc] border-[#0052cc]"
                  : "text-[#5f6368] border-transparent hover:text-[#202124]"
              }`}>
              {tab.label}
              {tab.count !== undefined && (
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-semibold ${
                  activeTab === tab.id ? "bg-blue-100 text-[#0052cc]" : "bg-[#f1f3f4] text-[#80868b]"
                }`}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Overview ── */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-[#202124] mb-3">Projects</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {projects.slice(0, 6).map(p => <ProjectCard key={p.id} project={p} baseUrl={baseUrl} />)}
                {projects.length === 0 && (
                  <div className="col-span-3 py-8 text-center text-sm text-[#80868b]">No projects found</div>
                )}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#202124] mb-2">
                My Open Issues
                {total > issues.length && <span className="text-[#80868b] font-normal ml-1">(showing {issues.length} of {total})</span>}
              </h3>
              <div className="bg-white border border-[#e8eaed] rounded-xl divide-y divide-[#e8eaed] overflow-hidden">
                {issues.length === 0
                  ? <div className="py-8 text-center text-sm text-[#80868b]">No open issues assigned to you</div>
                  : issues.map(i => <IssueRow key={i.id} issue={i} baseUrl={baseUrl} />)}
              </div>
            </div>
          </div>
        )}

        {/* ── Issues ── */}
        {activeTab === "issues" && (
          <div>
            {total > issues.length && (
              <div className="flex items-center gap-2 mb-3 px-1 text-xs text-[#80868b]">
                <AlertCircle className="w-3.5 h-3.5" />
                Showing {issues.length} of {total} open issues. Open Jira to see all.
              </div>
            )}
            <div className="bg-white border border-[#e8eaed] rounded-xl divide-y divide-[#e8eaed] overflow-hidden">
              {issues.length === 0
                ? <div className="py-16 text-center text-sm text-[#80868b]">No open issues assigned to you</div>
                : issues.map(i => <IssueRow key={i.id} issue={i} baseUrl={baseUrl} />)}
            </div>
          </div>
        )}

        {/* ── Projects ── */}
        {activeTab === "projects" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.length === 0
              ? <div className="col-span-3 py-16 text-center text-sm text-[#80868b]">No projects found</div>
              : projects.map(p => <ProjectCard key={p.id} project={p} baseUrl={baseUrl} />)}
          </div>
        )}
      </div>
    </div>
  );
}
