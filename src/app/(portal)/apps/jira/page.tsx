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
  "blue-grey": "bg-border text-muted",
  "yellow": "bg-warn/15 text-warn",
  "green": "bg-ok/15 text-ok",
  "red": "bg-crit/15 text-crit",
  "blue": "bg-accent/15 text-accent",
  "purple": "bg-violet/15 text-violet",
};

const PRIORITY_COLORS: Record<string, string> = {
  Highest: "text-crit", High: "text-warn",
  Medium: "text-warn", Low: "text-accent", Lowest: "text-subtle",
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
      <div className="bg-surface border border-border rounded-2xl p-8 space-y-6">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center mx-auto mb-4">
            <LayoutGrid className="w-8 h-8 text-accent-foreground" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Connect Jira</h2>
          <p className="text-sm text-muted mt-1">
            Link your Jira workspace to track issues and projects from Nexus.
          </p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted mb-1 block flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" /> Jira Base URL
            </label>
            <input
              type="url"
              placeholder="https://yourcompany.atlassian.net"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              className="w-full px-3 py-2.5 bg-surface-sunken border border-border-strong rounded-lg text-sm
                         placeholder:text-subtle focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted mb-1 block">Atlassian Account Email</label>
            <input
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 bg-surface-sunken border border-border-strong rounded-lg text-sm
                         placeholder:text-subtle focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted mb-1 flex items-center gap-1.5 block">
              <Key className="w-3.5 h-3.5" /> API Token
            </label>
            <input
              type="password"
              placeholder="Your Jira API token"
              value={apiToken}
              onChange={e => setApiToken(e.target.value)}
              className="w-full px-3 py-2.5 bg-surface-sunken border border-border-strong rounded-lg text-sm font-mono
                         placeholder:text-subtle focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
            />
            <p className="text-xs text-subtle mt-1">
              Generate at{" "}
              <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener noreferrer"
                className="text-accent hover:underline">
                id.atlassian.com
              </a>
            </p>
          </div>
        </div>
        <button
          onClick={() => void handleConnect()}
          disabled={!email.trim() || !apiToken.trim() || !baseUrl.trim() || saving}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold
                     bg-accent text-accent-foreground rounded-lg hover:bg-accent disabled:opacity-50 transition-colors">
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
  const statusCls = STATUS_COLORS[colorName] ?? "bg-surface-sunken text-muted";
  const priorityName = issue.fields.priority?.name ?? "Medium";
  const priorityCls = PRIORITY_COLORS[priorityName] ?? "text-muted";

  return (
    <a href={`${baseUrl}/browse/${issue.key}`} target="_blank" rel="noopener noreferrer"
      className="flex items-start gap-3 px-4 py-3 hover:bg-surface transition-colors group">
      {issue.fields.issuetype.iconUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={issue.fields.issuetype.iconUrl} alt={issue.fields.issuetype.name} className="w-4 h-4 mt-0.5 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2 flex-wrap">
          <span className="text-xs font-mono text-subtle shrink-0 mt-0.5">{issue.key}</span>
          <span className="text-sm font-medium text-foreground group-hover:text-accent transition-colors line-clamp-1">
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
          <span className="text-xs text-subtle">{issue.fields.project.name}</span>
          <span className="text-xs text-subtle">·</span>
          <span className="text-xs text-subtle">{timeAgo(issue.fields.updated)}</span>
        </div>
      </div>
      <ExternalLink className="w-3.5 h-3.5 text-subtle shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
    </a>
  );
}

// ─── Project Card ──────────────────────────────────────────────────────────────

function ProjectCard({ project, baseUrl }: { project: JiraProject; baseUrl: string }) {
  return (
    <a href={`${baseUrl}/jira/software/projects/${project.key}/boards`} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-3 p-4 bg-surface border border-border rounded-xl hover:border-accent/30 hover:shadow-sm transition-all group">
      {project.avatarUrls?.["24x24"] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={project.avatarUrls["24x24"]} alt={project.name} className="w-8 h-8 rounded" />
      ) : (
        <div className="w-8 h-8 rounded bg-accent flex items-center justify-center">
          <Folder className="w-4 h-4 text-white" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-foreground group-hover:text-accent transition-colors truncate">
          {project.name}
        </div>
        <div className="text-xs text-subtle">{project.key} · {project.projectTypeKey}</div>
      </div>
      <ExternalLink className="w-3.5 h-3.5 text-subtle shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
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
      <div className="min-h-full bg-surface flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );
  }

  if (!data?.connected) {
    return (
      <div className="min-h-full bg-surface">
        <PageHeader
          eyebrow="Apps › Jira"
          title="Jira"
          description="Connect Jira to manage issues and projects"
        />
        <div className="px-6 max-w-6xl">
          {data?.error && (
            <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-crit/10 border border-crit/20 rounded-xl text-sm text-crit">
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
    <div className="min-h-full bg-surface text-foreground">
      <PageHeader
        eyebrow="Apps › Jira"
        title="Jira"
        description="Your issues and projects"
        action={
          <div className="flex items-center gap-2">
            <button onClick={() => void load(true)} disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg text-muted hover:bg-surface-sunken disabled:opacity-50 transition-colors">
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
            </button>
            <button onClick={() => void handleDisconnect()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg text-crit hover:bg-crit/10 transition-colors">
              <LogOut className="w-3.5 h-3.5" /> Disconnect
            </button>
          </div>
        }
      />

      <div className="px-6 pb-12 max-w-6xl space-y-6">
        {/* ── Profile banner ── */}
        {user && (
          <div className="flex items-center gap-4 p-4 bg-surface border border-border rounded-xl">
            {user.avatarUrls?.["48x48"] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrls["48x48"]} alt={user.displayName} className="w-12 h-12 rounded-full border border-border" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center text-accent-foreground font-bold text-lg">
                {user.displayName[0]}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">{user.displayName}</span>
                <CheckCircle2 className="w-4 h-4 text-ok" />
                <span className="text-xs text-ok font-medium">Connected</span>
              </div>
              <span className="text-sm text-muted">{user.emailAddress}</span>
            </div>
            <div className="ml-auto flex items-center gap-6 text-sm">
              <div className="text-center">
                <div className="font-semibold text-foreground">{projects.length}</div>
                <div className="text-xs text-subtle">Projects</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-foreground">{total}</div>
                <div className="text-xs text-subtle">Open Issues</div>
              </div>
            </div>
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="flex gap-1 border-b border-border">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? "text-accent border-accent"
                  : "text-muted border-transparent hover:text-foreground"
              }`}>
              {tab.label}
              {tab.count !== undefined && (
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-semibold ${
                  activeTab === tab.id ? "bg-accent/15 text-accent" : "bg-surface-sunken text-subtle"
                }`}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Overview ── */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Projects</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {projects.slice(0, 6).map(p => <ProjectCard key={p.id} project={p} baseUrl={baseUrl} />)}
                {projects.length === 0 && (
                  <div className="col-span-3 py-8 text-center text-sm text-subtle">No projects found</div>
                )}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">
                My Open Issues
                {total > issues.length && <span className="text-subtle font-normal ml-1">(showing {issues.length} of {total})</span>}
              </h3>
              <div className="bg-surface border border-border rounded-xl divide-y divide-border overflow-hidden">
                {issues.length === 0
                  ? <div className="py-8 text-center text-sm text-subtle">No open issues assigned to you</div>
                  : issues.map(i => <IssueRow key={i.id} issue={i} baseUrl={baseUrl} />)}
              </div>
            </div>
          </div>
        )}

        {/* ── Issues ── */}
        {activeTab === "issues" && (
          <div>
            {total > issues.length && (
              <div className="flex items-center gap-2 mb-3 px-1 text-xs text-subtle">
                <AlertCircle className="w-3.5 h-3.5" />
                Showing {issues.length} of {total} open issues. Open Jira to see all.
              </div>
            )}
            <div className="bg-surface border border-border rounded-xl divide-y divide-border overflow-hidden">
              {issues.length === 0
                ? <div className="py-16 text-center text-sm text-subtle">No open issues assigned to you</div>
                : issues.map(i => <IssueRow key={i.id} issue={i} baseUrl={baseUrl} />)}
            </div>
          </div>
        )}

        {/* ── Projects ── */}
        {activeTab === "projects" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.length === 0
              ? <div className="col-span-3 py-16 text-center text-sm text-subtle">No projects found</div>
              : projects.map(p => <ProjectCard key={p.id} project={p} baseUrl={baseUrl} />)}
          </div>
        )}
      </div>
    </div>
  );
}
