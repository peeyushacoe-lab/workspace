"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Layers, Loader2, ExternalLink, RefreshCw,
  LogOut, CheckCircle2, X, Key, Circle,
} from "lucide-react";
import { PageHeader } from "@/components/Shell";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type LinearUser = {
  id: string; name: string; email: string; avatarUrl: string | null;
  teams: { nodes: LinearTeam[] };
};

type LinearTeam = { id: string; name: string; key: string; color: string };

type LinearIssue = {
  id: string; identifier: string; title: string; priority: number;
  state: { name: string; color: string; type: string };
  team: { name: string; key: string };
  updatedAt: string; url: string;
  labels: { nodes: Array<{ name: string; color: string }> };
};

type LinearData = {
  connected: boolean;
  user?: LinearUser;
  teams?: LinearTeam[];
  issues?: LinearIssue[];
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

const PRIORITY_LABELS = ["No priority", "Urgent", "High", "Medium", "Low"];
const PRIORITY_COLORS = ["text-[#80868b]", "text-red-600", "text-orange-500", "text-amber-500", "text-blue-500"];

// State type → badge style
function stateBadge(type: string, _color: string) {
  const map: Record<string, string> = {
    completed: "bg-emerald-100 text-emerald-700",
    cancelled: "bg-[#f1f3f4] text-[#80868b] line-through",
    started: "bg-blue-100 text-blue-700",
    unstarted: "bg-[#f1f3f4] text-[#5f6368]",
    backlog: "bg-purple-100 text-purple-700",
  };
  return map[type] ?? "bg-[#f1f3f4] text-[#5f6368]";
}

// ─── Connect Panel ─────────────────────────────────────────────────────────────

function ConnectPanel({ onConnected }: { onConnected: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  const handleConnect = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/integrations/linear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; name?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "Failed to connect");
        return;
      }
      toast.success(`Connected as ${data.name}`);
      onConnected();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto mt-16">
      <div className="bg-white border border-[#e8eaed] rounded-2xl p-8 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-[#5e6ad2] flex items-center justify-center mx-auto">
          <Layers className="w-8 h-8 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[#202124]">Connect Linear</h2>
          <p className="text-sm text-[#5f6368] mt-1">
            Link your Linear workspace to track issues and projects directly in Nexus.
          </p>
        </div>
        <div className="text-left space-y-3">
          <label className="text-xs font-medium text-[#5f6368] flex items-center gap-1.5 block">
            <Key className="w-3.5 h-3.5" /> Personal API Key
          </label>
          <input
            type="password"
            placeholder="lin_api_xxxxxxxxxxxxxxxxxxxx"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            onKeyDown={e => e.key === "Enter" && void handleConnect()}
            className="w-full px-3 py-2.5 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm font-mono
                       placeholder:text-[#80868b] focus:outline-none focus:border-[#5e6ad2]/60 focus:ring-2 focus:ring-[#5e6ad2]/20"
          />
          <p className="text-xs text-[#80868b]">
            Generate at{" "}
            <a href="https://linear.app/settings/api" target="_blank" rel="noopener noreferrer"
              className="text-[#5e6ad2] hover:underline">
              linear.app/settings/api
            </a>
          </p>
        </div>
        <button
          onClick={() => void handleConnect()}
          disabled={!apiKey.trim() || saving}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold
                     bg-[#5e6ad2] text-white rounded-lg hover:bg-[#4f5abf] disabled:opacity-50 transition-colors">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
          {saving ? "Connecting…" : "Connect Linear"}
        </button>
      </div>
    </div>
  );
}

// ─── Issue Row ─────────────────────────────────────────────────────────────────

function IssueRow({ issue }: { issue: LinearIssue }) {
  const priorityCls = PRIORITY_COLORS[issue.priority] ?? "text-[#80868b]";
  const priorityLabel = PRIORITY_LABELS[issue.priority] ?? "No priority";
  const stateStyle = stateBadge(issue.state.type, issue.state.color);

  return (
    <a href={issue.url} target="_blank" rel="noopener noreferrer"
      className="flex items-start gap-3 px-4 py-3 hover:bg-[#f8f9fa] transition-colors group">
      <Circle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: issue.state.color }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <span className="text-xs font-mono text-[#80868b] shrink-0 mt-0.5">{issue.identifier}</span>
          <span className="text-sm font-medium text-[#202124] group-hover:text-[#5e6ad2] transition-colors line-clamp-1">
            {issue.title}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${stateStyle}`}>
            {issue.state.name}
          </span>
          <span className={`text-[10px] font-medium ${priorityCls}`}>● {priorityLabel}</span>
          <span className="text-xs text-[#80868b]">{issue.team.name}</span>
          {issue.labels.nodes.map(l => (
            <span key={l.name} className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
              style={{ background: `${l.color}22`, color: l.color, border: `1px solid ${l.color}44` }}>
              {l.name}
            </span>
          ))}
          <span className="text-xs text-[#bdc1c6]">·</span>
          <span className="text-xs text-[#80868b]">{timeAgo(issue.updatedAt)}</span>
        </div>
      </div>
      <ExternalLink className="w-3.5 h-3.5 text-[#bdc1c6] shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
    </a>
  );
}

// ─── Team Card ─────────────────────────────────────────────────────────────────

function TeamCard({ team }: { team: LinearTeam }) {
  return (
    <div className="flex items-center gap-3 p-4 bg-white border border-[#e8eaed] rounded-xl">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm"
        style={{ background: team.color || "#5e6ad2" }}>
        {team.key.slice(0, 2)}
      </div>
      <div>
        <div className="text-sm font-semibold text-[#202124]">{team.name}</div>
        <div className="text-xs text-[#80868b]">{team.key}</div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

type Tab = "overview" | "issues" | "teams";

export default function LinearPage() {
  const [data, setData] = useState<LinearData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const res = await fetch("/api/integrations/linear");
      const d = await res.json() as LinearData;
      setData(d);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleDisconnect = async () => {
    await fetch("/api/integrations/linear", { method: "DELETE" });
    toast.success("Linear disconnected");
    setData({ connected: false });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#5e6ad2]" />
      </div>
    );
  }

  if (!data?.connected) {
    return (
      <div className="min-h-screen bg-white">
        <PageHeader
          eyebrow="Apps › Linear"
          title="Linear"
          description="Connect Linear to track issues and projects"
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

  const { user, teams = [], issues = [] } = data;

  // Group issues by team
  const byTeam = issues.reduce<Record<string, LinearIssue[]>>((acc, issue) => {
    const key = issue.team.key;
    if (!acc[key]) acc[key] = [];
    acc[key].push(issue);
    return acc;
  }, {});

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "issues", label: "My Issues", count: issues.length },
    { id: "teams", label: "Teams", count: teams.length },
  ];

  return (
    <div className="min-h-screen bg-white text-[#202124]">
      <PageHeader
        eyebrow="Apps › Linear"
        title="Linear"
        description="Your issues and team workspaces"
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
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt={user.name} className="w-12 h-12 rounded-full border border-[#e8eaed]" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-[#5e6ad2] flex items-center justify-center text-white font-bold text-lg">
                {user.name[0]}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[#202124]">{user.name}</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span className="text-xs text-emerald-600 font-medium">Connected</span>
              </div>
              <span className="text-sm text-[#5f6368]">{user.email}</span>
            </div>
            <div className="ml-auto flex items-center gap-6 text-sm">
              <div className="text-center">
                <div className="font-semibold text-[#202124]">{teams.length}</div>
                <div className="text-xs text-[#80868b]">Teams</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-[#202124]">{issues.length}</div>
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
                  ? "text-[#5e6ad2] border-[#5e6ad2]"
                  : "text-[#5f6368] border-transparent hover:text-[#202124]"
              }`}>
              {tab.label}
              {tab.count !== undefined && (
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-semibold ${
                  activeTab === tab.id ? "bg-purple-100 text-[#5e6ad2]" : "bg-[#f1f3f4] text-[#80868b]"
                }`}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Overview ── */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-[#202124] mb-3">Teams</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {teams.map(t => <TeamCard key={t.id} team={t} />)}
                {teams.length === 0 && <div className="col-span-4 py-6 text-center text-sm text-[#80868b]">No teams found</div>}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#202124] mb-2">Assigned to Me</h3>
              {Object.keys(byTeam).length === 0 ? (
                <div className="bg-white border border-[#e8eaed] rounded-xl py-12 text-center text-sm text-[#80868b]">
                  No open issues assigned to you
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(byTeam).map(([key, teamIssues]) => (
                    <div key={key}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-5 h-5 rounded flex items-center justify-center text-white text-[10px] font-bold"
                          style={{ background: teams.find(t => t.key === key)?.color ?? "#5e6ad2" }}>
                          {key.slice(0, 2)}
                        </div>
                        <span className="text-xs font-semibold text-[#202124]">
                          {teams.find(t => t.key === key)?.name ?? key}
                        </span>
                        <span className="text-xs text-[#80868b]">({teamIssues.length})</span>
                      </div>
                      <div className="bg-white border border-[#e8eaed] rounded-xl divide-y divide-[#e8eaed] overflow-hidden">
                        {teamIssues.slice(0, 5).map(i => <IssueRow key={i.id} issue={i} />)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Issues ── */}
        {activeTab === "issues" && (
          <div className="bg-white border border-[#e8eaed] rounded-xl divide-y divide-[#e8eaed] overflow-hidden">
            {issues.length === 0
              ? <div className="py-16 text-center text-sm text-[#80868b]">No open issues assigned to you</div>
              : issues.map(i => <IssueRow key={i.id} issue={i} />)}
          </div>
        )}

        {/* ── Teams ── */}
        {activeTab === "teams" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {teams.length === 0
              ? <div className="col-span-4 py-16 text-center text-sm text-[#80868b]">No teams found</div>
              : teams.map(t => <TeamCard key={t.id} team={t} />)}
          </div>
        )}
      </div>
    </div>
  );
}
