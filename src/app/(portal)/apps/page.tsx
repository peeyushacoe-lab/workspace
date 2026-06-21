"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  GitBranch, Layers, LayoutGrid, MessageSquare, Briefcase, Zap,
  Link, Code, CheckCircle2, Loader2, FileSpreadsheet, Presentation,
  FileText, NotebookPen, ArrowRight, ExternalLink, HardDrive,
} from "lucide-react";
import { PageHeader } from "@/components/Shell";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────

type AppStatus = "available" | "coming_soon";

type AppEntry = {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  status: AppStatus;
  enabled: boolean;
};

// ─── Built-in productivity app definitions ───────────────────────────────────

const BUILTIN_APPS = [
  {
    id: "sheets",
    name: "Sheets",
    description: "Collaborative spreadsheets with formulas, formatting, and real-time editing",
    href: "/apps/sheets",
    icon: FileSpreadsheet,
    color: "bg-[#0f9d58]/10 text-[#0f9d58] border border-[#0f9d58]/20",
    badge: "New",
  },
  {
    id: "slides",
    name: "Slides",
    description: "Build beautiful presentations with drag-and-drop elements and live collaboration",
    href: "/apps/slides",
    icon: Presentation,
    color: "bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20",
    badge: "New",
  },
  {
    id: "docs",
    name: "Docs",
    description: "Rich collaborative documents powered by Tiptap with version history",
    href: "/docs",
    icon: FileText,
    color: "bg-[#00C2FF]/10 text-[#00C2FF] border border-[#00C2FF]/20",
    badge: null,
  },
  {
    id: "notes",
    name: "Notes",
    description: "Personal notes with rich text, pinning, and fast access",
    href: "/notes",
    icon: NotebookPen,
    color: "bg-violet-400/10 text-violet-400 border border-violet-400/20",
    badge: null,
  },
  {
    id: "drive",
    name: "Drive",
    description: "Store, organize, and share files and folders with previews and version history",
    href: "/drive",
    icon: HardDrive,
    color: "bg-sky-400/10 text-sky-400 border border-sky-400/20",
    badge: null,
  },
];

// ─── Icon map ────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  github:           GitBranch,
  layers:           Layers,
  trello:           LayoutGrid,
  "message-square": MessageSquare,
  briefcase:        Briefcase,
  zap:              Zap,
  link:             Link,
  webhook:          Link,
  code:             Code,
  "file-spreadsheet": FileSpreadsheet,
  presentation:     Presentation,
  "file-text":      FileText,
  notebook:         NotebookPen,
};

function AppIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] ?? Code;
  return <Icon className={className} />;
}

// ─── Category colours ─────────────────────────────────────────────────────────

const CATEGORY_COLOURS: Record<string, string> = {
  Developer:            "bg-[#00C2FF]/10 text-[#00C2FF] border-[#00C2FF]/20",
  "Project Management": "bg-violet-400/10 text-violet-400 border-violet-400/20",
  Communication:        "bg-sky-400/10 text-sky-400 border-sky-400/20",
  CRM:                  "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20",
  Automation:           "bg-[#0f9d58]/10 text-[#0f9d58] border-[#0f9d58]/20",
  Productivity:         "bg-[#00C2FF]/10 text-[#00C2FF] border-[#00C2FF]/20",
};

function CategoryBadge({ category }: { category: string }) {
  const cls = CATEGORY_COLOURS[category] ?? "bg-[#1B1F2A] text-[#8A92A6] border-[#262A35]";
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      {category}
    </span>
  );
}

// ─── Integration page routes for deep-link integrations ──────────────────────

const INTEGRATION_ROUTES: Record<string, string> = {
  github: "/apps/github",
  jira: "/apps/jira",
  linear: "/apps/linear",
};

// ─── Integration Card ─────────────────────────────────────────────────────────

function IntegrationCard({
  app, isAdmin, onToggle,
}: {
  app: AppEntry;
  isAdmin: boolean;
  onToggle: (id: string, next: boolean) => Promise<void>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const isComingSoon = app.status === "coming_soon";
  const isEnabled = app.enabled;
  const detailRoute = INTEGRATION_ROUTES[app.id];

  const handleClick = async () => {
    if (isComingSoon || !isAdmin) return;
    setBusy(true);
    try { await onToggle(app.id, !isEnabled); } finally { setBusy(false); }
  };

  return (
    <div className={[
      "group relative flex flex-col gap-4 rounded-xl p-5 bg-[#12151D] border transition-all duration-200",
      isComingSoon ? "opacity-60 border-[#262A35]"
        : isEnabled ? "border-[#0f9d58]/40 hover:border-[#0f9d58]/60"
        : "border-[#262A35] hover:border-[#2E333F]",
    ].join(" ")}>
      {isEnabled && (
        <span className="absolute inset-x-0 top-0 h-[2px] rounded-t-xl bg-gradient-to-r from-[#0f9d58]/0 via-[#0f9d58]/60 to-[#0f9d58]/0" />
      )}
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${isEnabled ? "bg-[#0f9d58]/10 text-[#0f9d58] border border-[#0f9d58]/20" : "bg-[#00C2FF]/10 text-[#00C2FF] border border-[#00C2FF]/20"}`}>
          <AppIcon name={app.icon} className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[#E6E9F0]">{app.name}</span>
            {isEnabled && (
              <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#0f9d58]/10 text-[#0f9d58] border border-[#0f9d58]/20">
                <CheckCircle2 className="h-2.5 w-2.5" /> Active
              </span>
            )}
          </div>
          <div className="mt-1"><CategoryBadge category={app.category} /></div>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-[#8A92A6] flex-1">{app.description}</p>
      <div className="flex items-center gap-2">
        {isComingSoon ? (
          <span className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-[#1B1F2A] text-[#5A6275] border border-[#262A35] cursor-default">
            Coming Soon
          </span>
        ) : isAdmin ? (
          <>
            <button onClick={() => void handleClick()} disabled={busy}
              className={[
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors disabled:opacity-50",
                isEnabled
                  ? "bg-[#0f9d58]/10 text-[#0f9d58] border-[#0f9d58]/20 hover:bg-[#0f9d58]/20"
                  : "bg-[#00C2FF]/10 text-[#00C2FF] border-[#00C2FF]/20 hover:bg-[#00C2FF]/20",
              ].join(" ")}>
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : isEnabled ? <CheckCircle2 className="h-3 w-3" /> : null}
              {busy ? "Saving…" : isEnabled ? "Active" : "Enable"}
            </button>
            {detailRoute && (
              <button onClick={() => router.push(detailRoute)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#262A35] text-[#8A92A6] hover:bg-[#1B1F2A] transition-colors">
                <ExternalLink className="h-3 w-3" /> Open
              </button>
            )}
          </>
        ) : detailRoute ? (
          <button onClick={() => router.push(detailRoute)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#00C2FF]/10 text-[#00C2FF] border border-[#00C2FF]/20 hover:bg-[#00C2FF]/20 transition-colors">
            <ExternalLink className="h-3 w-3" /> Connect
          </button>
        ) : (
          <button className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#1B1F2A] text-[#8A92A6] border border-[#262A35] hover:bg-[#262A35] transition-colors">
            Request
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const CATEGORIES = ["All", "Developer", "Project Management", "CRM", "Communication", "Automation"] as const;
type Category = (typeof CATEGORIES)[number];

export default function AppsPage() {
  const router = useRouter();
  const [apps, setApps] = useState<AppEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<Category>("All");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [appsRes, meRes] = await Promise.all([fetch("/api/apps"), fetch("/api/me")]);
      if (appsRes.ok) { const d = await appsRes.json() as { apps: AppEntry[] }; setApps(d.apps); }
      if (meRes.ok) { const me = await meRes.json() as { role?: string }; setIsAdmin(me.role === "ADMIN"); }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleToggle = async (appId: string, next: boolean) => {
    const res = await fetch("/api/apps", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId, enabled: next }),
    });
    if (!res.ok) { toast.error("Failed to update app"); return; }
    setApps((prev) => prev.map((a) => (a.id === appId ? { ...a, enabled: next } : a)));
    toast.success(next ? "App enabled" : "App disabled");
  };

  // Filter to integrations only (exclude built-ins which are shown separately)
  const BUILTIN_IDS = new Set(["sheets", "slides", "docs", "notes"]);
  const integrations = apps.filter((a) => !BUILTIN_IDS.has(a.id));
  const filtered = integrations.filter((a) => activeTab === "All" || a.category === activeTab);
  const sorted = [...filtered.filter((a) => a.enabled), ...filtered.filter((a) => !a.enabled)];
  const enabledCount = integrations.filter((a) => a.enabled).length;

  return (
    <div className="min-h-screen bg-[#12151D] text-[#E6E9F0]">
      <PageHeader
        eyebrow="Workspace"
        title="Apps"
        description="Productivity tools and integrations for Nexus"
      />

      <div className="px-6 pb-12 max-w-6xl space-y-8">

        {/* ── Built-in apps ── */}
        <div>
          <h2 className="text-sm font-semibold text-[#E6E9F0] mb-3">Built-in Apps</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {BUILTIN_APPS.map((app) => {
              const Icon = app.icon;
              return (
                <button key={app.id} onClick={() => router.push(app.href)}
                  className="group flex flex-col gap-3 rounded-xl p-5 bg-[#12151D] border border-[#262A35] hover:border-[#00C2FF]/30 hover:shadow-sm text-left transition-all">
                  <div className="flex items-center justify-between">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${app.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    {app.badge && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#00C2FF] text-[#06121A]">
                        {app.badge}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#E6E9F0]">{app.name}</p>
                    <p className="text-xs text-[#8A92A6] mt-0.5 leading-relaxed line-clamp-2">{app.description}</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-medium text-[#00C2FF] group-hover:gap-2 transition-all">
                    Open <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Integrations ── */}
        <div>
          <h2 className="text-sm font-semibold text-[#E6E9F0] mb-3">Integrations</h2>

          {!loading && enabledCount > 0 && (
            <div className="flex items-center gap-2 text-xs text-[#8A92A6] mb-3">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#0f9d58]" />
              <span><span className="font-semibold font-mono text-[#0f9d58]">{enabledCount}</span> {enabledCount === 1 ? "integration" : "integrations"} active</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mb-4">
            {CATEGORIES.map((cat) => (
              <button key={cat} onClick={() => setActiveTab(cat)}
                className={[
                  "px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors",
                  activeTab === cat
                    ? "bg-[#00C2FF]/10 text-[#00C2FF] border-[#00C2FF]/30"
                    : "bg-[#12151D] text-[#8A92A6] border-[#262A35] hover:text-[#E6E9F0] hover:border-[#2E333F]",
                ].join(" ")}>
                {cat}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-[#8A92A6]">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-[#1B1F2A] border border-[#262A35] flex items-center justify-center">
                <Zap className="w-7 h-7 text-[#5A6275]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#E6E9F0] mb-1">More integrations coming soon</p>
                <p className="text-xs text-[#8A92A6]">
                  {activeTab === "All" ? "We're building new connections to Nexus." : `${activeTab} integrations are on the roadmap.`}
                </p>
              </div>
              {activeTab !== "All" && (
                <button onClick={() => setActiveTab("All")} className="px-4 py-2 text-sm font-medium rounded-lg bg-[#00C2FF] text-[#06121A] hover:bg-[#0098E6] transition-colors">
                  View all integrations
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sorted.map((app) => (
                <IntegrationCard key={app.id} app={app} isAdmin={isAdmin} onToggle={handleToggle} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
