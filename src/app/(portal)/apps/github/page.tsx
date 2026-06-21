"use client";

import { useState, useEffect, useCallback } from "react";
import {
  GitBranch, GitPullRequest, AlertCircle, Star, Lock, Globe,
  Loader2, ExternalLink, RefreshCw, LogOut,
  CheckCircle2, Clock, Circle, X, Key,
} from "lucide-react";
import { PageHeader } from "@/components/Shell";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type GHUser = {
  login: string; name: string; avatar_url: string;
  public_repos: number; followers: number;
};

type GHRepo = {
  id: number; name: string; full_name: string; description: string | null;
  stargazers_count: number; language: string | null; private: boolean;
  open_issues_count: number; html_url: string; updated_at: string;
};

type GHIssue = {
  id: number; number: number; title: string; html_url: string;
  state: string; created_at: string; updated_at: string;
  repository_url: string;
  labels: Array<{ name: string; color: string }>;
  pull_request?: object;
};

type GHData = {
  connected: boolean;
  user?: GHUser;
  repos?: GHRepo[];
  prs?: GHIssue[];
  issues?: GHIssue[];
  error?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3178c6", JavaScript: "#f1e05a", Python: "#3572A5",
  Go: "#00ADD8", Rust: "#dea584", Java: "#b07219", "C++": "#f34b7d",
  Ruby: "#701516", PHP: "#4F5D95", Swift: "#F05138",
};

function timeAgo(date: string) {
  const d = new Date(date);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function repoName(url: string) {
  return url.split("/").slice(-2).join("/");
}

// ─── Connect Panel ─────────────────────────────────────────────────────────────

function ConnectPanel({ onConnected }: { onConnected: () => void }) {
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);

  const handleConnect = async () => {
    if (!token.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/integrations/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; login?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "Failed to connect");
        return;
      }
      toast.success(`Connected as @${data.login}`);
      onConnected();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto mt-16">
      <div className="bg-[#12151D] border border-[#262A35] rounded-2xl p-8 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-[#24292e] flex items-center justify-center mx-auto">
          <GitBranch className="w-8 h-8 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[#E6E9F0]">Connect GitHub</h2>
          <p className="text-sm text-[#8A92A6] mt-1">
            Link your GitHub account to view repos, pull requests, and issues directly in Nexus.
          </p>
        </div>
        <div className="text-left space-y-3">
          <label className="text-xs font-medium text-[#8A92A6] flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5" /> Personal Access Token
          </label>
          <input
            type="password"
            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
            value={token}
            onChange={e => setToken(e.target.value)}
            onKeyDown={e => e.key === "Enter" && void handleConnect()}
            className="w-full px-3 py-2.5 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm font-mono
                       placeholder:text-[#5A6275] focus:outline-none focus:border-[#00C2FF]/60 focus:ring-2 focus:ring-[#00C2FF]/20"
          />
          <p className="text-xs text-[#5A6275]">
            Generate at{" "}
            <a href="https://github.com/settings/tokens/new?scopes=repo,read:user" target="_blank" rel="noopener noreferrer"
              className="text-[#00C2FF] hover:underline">
              github.com/settings/tokens
            </a>
            . Needs <code className="bg-[#1B1F2A] px-1 rounded text-[11px]">repo</code> and{" "}
            <code className="bg-[#1B1F2A] px-1 rounded text-[11px]">read:user</code> scopes.
          </p>
        </div>
        <button
          onClick={() => void handleConnect()}
          disabled={!token.trim() || saving}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold
                     bg-[#24292e] text-white rounded-lg hover:bg-[#1c2128] disabled:opacity-50 transition-colors">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitBranch className="w-4 h-4" />}
          {saving ? "Connecting…" : "Connect GitHub"}
        </button>
      </div>
    </div>
  );
}

// ─── Repo Card ─────────────────────────────────────────────────────────────────

function RepoCard({ repo }: { repo: GHRepo }) {
  const langColor = repo.language ? (LANG_COLORS[repo.language] ?? "#8A92A6") : "#8A92A6";
  return (
    <a href={repo.html_url} target="_blank" rel="noopener noreferrer"
      className="flex flex-col gap-2 p-4 bg-[#12151D] border border-[#262A35] rounded-xl hover:border-[#00C2FF]/30 hover:shadow-sm transition-all group">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {repo.private ? <Lock className="w-3.5 h-3.5 text-[#5A6275] shrink-0" /> : <Globe className="w-3.5 h-3.5 text-[#5A6275] shrink-0" />}
          <span className="text-sm font-semibold text-[#00C2FF] truncate group-hover:underline">{repo.name}</span>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-[#bdc1c6] shrink-0 mt-0.5" />
      </div>
      {repo.description && (
        <p className="text-xs text-[#8A92A6] leading-relaxed line-clamp-2">{repo.description}</p>
      )}
      <div className="flex items-center gap-3 text-xs text-[#5A6275] mt-auto">
        {repo.language && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: langColor }} />
            {repo.language}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Star className="w-3 h-3" /> {repo.stargazers_count}
        </span>
        {repo.open_issues_count > 0 && (
          <span className="flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {repo.open_issues_count}
          </span>
        )}
        <span className="ml-auto">{timeAgo(repo.updated_at)}</span>
      </div>
    </a>
  );
}

// ─── Issue/PR row ──────────────────────────────────────────────────────────────

function IssueRow({ item, isPR }: { item: GHIssue; isPR: boolean }) {
  return (
    <a href={item.html_url} target="_blank" rel="noopener noreferrer"
      className="flex items-start gap-3 px-4 py-3 hover:bg-[#12151D] transition-colors group">
      <div className="mt-0.5 shrink-0">
        {isPR
          ? <GitPullRequest className="w-4 h-4 text-purple-500" />
          : <Circle className="w-4 h-4 text-emerald-500" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-[#E6E9F0] group-hover:text-[#00C2FF] transition-colors line-clamp-1">
            {item.title}
          </span>
          {item.labels.map(l => (
            <span key={l.name} className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
              style={{ background: `#${l.color}22`, color: `#${l.color}`, border: `1px solid #${l.color}44` }}>
              {l.name}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-[#5A6275] mt-0.5">
          <span className="font-mono">{repoName(item.repository_url)} #{item.number}</span>
          <span>·</span>
          <Clock className="w-3 h-3" />
          <span>{timeAgo(item.updated_at)}</span>
        </div>
      </div>
      <ExternalLink className="w-3.5 h-3.5 text-[#bdc1c6] shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
    </a>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

type Tab = "overview" | "repos" | "prs" | "issues";

export default function GitHubPage() {
  const [data, setData] = useState<GHData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch("/api/integrations/github");
      const d = await res.json() as GHData;
      setData(d);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleDisconnect = async () => {
    await fetch("/api/integrations/github", { method: "DELETE" });
    toast.success("GitHub disconnected");
    setData({ connected: false });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#12151D] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#00C2FF]" />
      </div>
    );
  }

  if (!data?.connected) {
    return (
      <div className="min-h-screen bg-[#12151D]">
        <PageHeader eyebrow="Apps › GitHub" title="GitHub" description="Connect GitHub to track repos, PRs, and issues" />
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

  const { user, repos = [], prs = [], issues = [] } = data;
  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "repos", label: "Repositories", count: repos.length },
    { id: "prs", label: "Pull Requests", count: prs.length },
    { id: "issues", label: "Issues", count: issues.length },
  ];

  return (
    <div className="min-h-screen bg-[#12151D] text-[#E6E9F0]">
      <PageHeader
        eyebrow="Apps › GitHub"
        title="GitHub"
        description="Your repos, pull requests, and issues"
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={user.avatar_url} alt={user.login} className="w-12 h-12 rounded-full border border-[#262A35]" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[#E6E9F0]">{user.name || user.login}</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span className="text-xs text-emerald-400 font-medium">Connected</span>
              </div>
              <span className="text-sm text-[#8A92A6]">@{user.login}</span>
            </div>
            <div className="ml-auto flex items-center gap-6 text-sm">
              <div className="text-center">
                <div className="font-semibold text-[#E6E9F0]">{repos.length}</div>
                <div className="text-xs text-[#5A6275]">Repos</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-[#E6E9F0]">{prs.length}</div>
                <div className="text-xs text-[#5A6275]">Open PRs</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-[#E6E9F0]">{issues.length}</div>
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
                  ? "text-[#00C2FF] border-[#00C2FF]"
                  : "text-[#8A92A6] border-transparent hover:text-[#E6E9F0]"
              }`}>
              {tab.label}
              {tab.count !== undefined && (
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-semibold ${
                  activeTab === tab.id ? "bg-[#0E2532] text-[#00C2FF]" : "bg-[#1B1F2A] text-[#5A6275]"
                }`}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Overview ── */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-[#E6E9F0] mb-3">Recent Repositories</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {repos.slice(0, 6).map(r => <RepoCard key={r.id} repo={r} />)}
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-semibold text-[#E6E9F0] mb-2">Open Pull Requests</h3>
                <div className="bg-[#12151D] border border-[#262A35] rounded-xl divide-y divide-[#262A35] overflow-hidden">
                  {prs.length === 0
                    ? <div className="py-8 text-center text-sm text-[#5A6275]">No open pull requests</div>
                    : prs.slice(0, 5).map(pr => <IssueRow key={pr.id} item={pr} isPR />)}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#E6E9F0] mb-2">Assigned Issues</h3>
                <div className="bg-[#12151D] border border-[#262A35] rounded-xl divide-y divide-[#262A35] overflow-hidden">
                  {issues.length === 0
                    ? <div className="py-8 text-center text-sm text-[#5A6275]">No assigned issues</div>
                    : issues.slice(0, 5).map(issue => <IssueRow key={issue.id} item={issue} isPR={false} />)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Repos ── */}
        {activeTab === "repos" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {repos.length === 0
              ? <div className="col-span-3 py-16 text-center text-sm text-[#5A6275]">No repositories found</div>
              : repos.map(r => <RepoCard key={r.id} repo={r} />)}
          </div>
        )}

        {/* ── PRs ── */}
        {activeTab === "prs" && (
          <div className="bg-[#12151D] border border-[#262A35] rounded-xl divide-y divide-[#262A35] overflow-hidden">
            {prs.length === 0
              ? <div className="py-16 text-center text-sm text-[#5A6275]">No open pull requests</div>
              : prs.map(pr => <IssueRow key={pr.id} item={pr} isPR />)}
          </div>
        )}

        {/* ── Issues ── */}
        {activeTab === "issues" && (
          <div className="bg-[#12151D] border border-[#262A35] rounded-xl divide-y divide-[#262A35] overflow-hidden">
            {issues.length === 0
              ? <div className="py-16 text-center text-sm text-[#5A6275]">No assigned issues</div>
              : issues.map(issue => <IssueRow key={issue.id} item={issue} isPR={false} />)}
          </div>
        )}
      </div>
    </div>
  );
}
