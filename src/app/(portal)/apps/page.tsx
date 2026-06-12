"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  GitBranch, Layers, LayoutGrid, MessageSquare, Briefcase, Zap,
  Link, Code, CheckCircle2, Loader2, FileSpreadsheet, Presentation,
  FileText, NotebookPen, ArrowRight,
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
    color: "bg-emerald-50 text-emerald-600",
    badge: "New",
  },
  {
    id: "slides",
    name: "Slides",
    description: "Build beautiful presentations with drag-and-drop elements and live collaboration",
    href: "/apps/slides",
    icon: Presentation,
    color: "bg-amber-50 text-amber-600",
    badge: "New",
  },
  {
    id: "docs",
    name: "Docs",
    description: "Rich collaborative documents powered by Tiptap with version history",
    href: "/docs",
    icon: FileText,
    color: "bg-blue-50 text-blue-600",
    badge: null,
  },
  {
    id: "notes",
    name: "Notes",
    description: "Personal notes with rich text, pinning, and fast access",
    href: "/notes",
    icon: NotebookPen,
    color: "bg-purple-50 text-purple-600",
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
  Developer:            "bg-[#1a56db]/10 text-[#1a56db] border-[#1a56db]/20",
  "Project Management": "bg-violet-100 text-violet-600 border-violet-200",
  Communication:        "bg-sky-100 text-sky-600 border-sky-200",
  CRM:                  "bg-amber-100 text-amber-600 border-amber-200",
  Automation:           "bg-emerald-100 text-emerald-600 border-emerald-200",
  Productivity:         "bg-blue-100 text-blue-600 border-blue-200",
};

function CategoryBadge({ category }: { category: string }) {
  const cls = CATEGORY_COLOURS[category] ?? "bg-[#f1f3f4] text-[#5f6368] border-[#e8eaed]";
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      {category}
    </span>
  );
}

// ─── Integration Card ─────────────────────────────────────────────────────────

function IntegrationCard({
  app, isAdmin, onToggle,
}: {
  app: AppEntry;
  isAdmin: boolean;
  onToggle: (id: string, next: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const isComingSoon = app.status === "coming_soon";
  const isEnabled = app.enabled;

  const handleClick = async () => {
    if (isComingSoon || !isAdmin) return;
    setBusy(true);
    try { await onToggle(app.id, !isEnabled); } finally { setBusy(false); }
  };

  return (
    <div className={[
      "group relative flex flex-col gap-4 rounded-xl p-5 bg-white border transition-all duration-200",
      isComingSoon ? "opacity-60 border-[#e8eaed]"
        : isEnabled ? "border-emerald-300 hover:border-emerald-400"
        : "border-[#e8eaed] hover:border-[#d0d5dd]",
    ].join(" ")}>
      {isEnabled && (
        <span className="absolute inset-x-0 top-0 h-[2px] rounded-t-xl bg-gradient-to-r from-emerald-400/0 via-emerald-400/60 to-emerald-400/0" />
      )}
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${isEnabled ? "bg-emerald-50 text-emerald-600" : "bg-[#e8f0fe] text-[#1a56db]"}`}>
          <AppIcon name={app.icon} className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[#202124]">{app.name}</span>
            {isEnabled && (
              <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                <CheckCircle2 className="h-2.5 w-2.5" /> Active
              </span>
            )}
          </div>
          <div className="mt-1"><CategoryBadge category={app.category} /></div>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-[#5f6368] flex-1">{app.description}</p>
      <div className="flex items-center gap-2">
        {isComingSoon ? (
          <span className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-[#f1f3f4] text-[#80868b] border border-[#e8eaed] cursor-default">
            Coming Soon
          </span>
        ) : isAdmin ? (
          <button onClick={() => void handleClick()} disabled={busy}
            className={[
              "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors disabled:opacity-50",
              isEnabled
                ? "bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100"
                : "bg-[#e8f0fe] text-[#1a56db] border-[#1a56db]/20 hover:bg-[#dbeafe]",
            ].join(" ")}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : isEnabled ? <CheckCircle2 className="h-3 w-3" /> : null}
            {busy ? "Saving…" : isEnabled ? "Disable" : "Enable"}
          </button>
        ) : (
          <button className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#f1f3f4] text-[#5f6368] border border-[#e8eaed] hover:bg-[#e8eaed] transition-colors">
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
    <div className="min-h-screen bg-white text-[#202124]">
      <PageHeader
        eyebrow="Workspace"
        title="Apps"
        description="Productivity tools and integrations for Nexus"
      />

      <div className="px-6 pb-12 max-w-6xl space-y-8">

        {/* ── Built-in apps ── */}
        <div>
          <h2 className="text-sm font-semibold text-[#202124] mb-3">Built-in Apps</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {BUILTIN_APPS.map((app) => {
              const Icon = app.icon;
              return (
                <button key={app.id} onClick={() => router.push(app.href)}
                  className="group flex flex-col gap-3 rounded-xl p-5 bg-white border border-[#e8eaed] hover:border-[#1a56db]/30 hover:shadow-sm text-left transition-all">
                  <div className="flex items-center justify-between">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${app.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    {app.badge && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#1a56db] text-white">
                        {app.badge}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#202124]">{app.name}</p>
                    <p className="text-xs text-[#5f6368] mt-0.5 leading-relaxed line-clamp-2">{app.description}</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-medium text-[#1a56db] group-hover:gap-2 transition-all">
                    Open <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Integrations ── */}
        <div>
          <h2 className="text-sm font-semibold text-[#202124] mb-3">Integrations</h2>

          {!loading && enabledCount > 0 && (
            <div className="flex items-center gap-2 text-xs text-[#5f6368] mb-3">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              <span><span className="font-semibold text-emerald-600">{enabledCount}</span> {enabledCount === 1 ? "integration" : "integrations"} active</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mb-4">
            {CATEGORIES.map((cat) => (
              <button key={cat} onClick={() => setActiveTab(cat)}
                className={[
                  "px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors",
                  activeTab === cat
                    ? "bg-[#e8f0fe] text-[#1a56db] border-[#1a56db]/30"
                    : "bg-white text-[#5f6368] border-[#e8eaed] hover:text-[#202124] hover:border-[#d0d5dd]",
                ].join(" ")}>
                {cat}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-[#5f6368]">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-[#f1f3f4] flex items-center justify-center">
                <Zap className="w-7 h-7 text-[#bdc1c6]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#202124] mb-1">More integrations coming soon</p>
                <p className="text-xs text-[#5f6368]">
                  {activeTab === "All" ? "We're building new connections to Nexus." : `${activeTab} integrations are on the roadmap.`}
                </p>
              </div>
              {activeTab !== "All" && (
                <button onClick={() => setActiveTab("All")} className="px-4 py-2 text-sm font-medium rounded-lg bg-[#1a56db] text-white hover:bg-[#1648c7] transition-colors">
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
