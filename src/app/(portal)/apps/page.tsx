"use client";

import { useState, useEffect, useCallback } from "react";
import {
  GitBranch, Layers, LayoutGrid, MessageSquare, Briefcase, Zap,
  Link, Code, CheckCircle2, Loader2,
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

// ─── Icon map ────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  github:          GitBranch,
  layers:          Layers,
  trello:          LayoutGrid,
  "message-square": MessageSquare,
  briefcase:       Briefcase,
  zap:             Zap,
  webhook:         Link,
  code:            Code,
};

function AppIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] ?? Code;
  return <Icon className={className} />;
}

// ─── Category colours ────────────────────────────────────────────────────────

const CATEGORY_COLOURS: Record<string, string> = {
  Developer:            "bg-[#1a56db]/10 text-[#1a56db] border-[#1a56db]/20",
  "Project Management": "bg-violet-500/10 text-violet-300 border-violet-500/20",
  Communication:        "bg-sky-500/10 text-sky-300 border-sky-500/20",
  CRM:                  "bg-amber-500/10 text-amber-300 border-amber-500/20",
  Automation:           "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
};

function CategoryBadge({ category }: { category: string }) {
  const cls = CATEGORY_COLOURS[category] ?? "bg-[#5d6579]/20 text-[#9aa0a6] border-[#5d6579]/20";
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      {category}
    </span>
  );
}

// ─── App Card ────────────────────────────────────────────────────────────────

function AppCard({
  app,
  isAdmin,
  onToggle,
}: {
  app: AppEntry;
  isAdmin: boolean;
  onToggle: (id: string, next: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const isComingSoon = app.status === "coming_soon";
  const isEnabled    = app.enabled;

  const handleClick = async () => {
    if (isComingSoon || !isAdmin) return;
    setBusy(true);
    try {
      await onToggle(app.id, !isEnabled);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={[
        "group relative flex flex-col gap-4 rounded-xl p-5",
        "bg-white border transition-all duration-200",
        isComingSoon
          ? "opacity-60 border-[#e8eaed]"
          : isEnabled
            ? "border-emerald-500/30 hover:border-emerald-400/60"
            : "border-[#e8eaed] hover:border-[rgba(255,255,255,0.22)]",
      ].join(" ")}
    >
      {/* Active glow strip */}
      {isEnabled && (
        <span className="absolute inset-x-0 top-0 h-[2px] rounded-t-xl bg-gradient-to-r from-emerald-400/0 via-emerald-400/60 to-emerald-400/0" />
      )}

      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className={[
            "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg",
            isEnabled
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-[#1a56db]/10 text-[#1a56db]",
          ].join(" ")}
        >
          <AppIcon name={app.icon} className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[#202124]">{app.name}</span>
            {isEnabled && (
              <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 className="h-2.5 w-2.5" />
                Active
              </span>
            )}
          </div>
          <div className="mt-1">
            <CategoryBadge category={app.category} />
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="text-xs leading-relaxed text-[#9aa0a6] flex-1">
        {app.description}
      </p>

      {/* Action row */}
      <div className="flex items-center justify-between gap-2">
        {isComingSoon ? (
          <span className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-[#5d6579]/10 text-[#9aa0a6] border border-[#5d6579]/20 cursor-default">
            Coming Soon
          </span>
        ) : isAdmin ? (
          <button
            onClick={() => void handleClick()}
            disabled={busy}
            className={[
              "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors disabled:opacity-50",
              isEnabled
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                : "bg-[#1a56db]/10 text-[#1a56db] border-[#1a56db]/20 hover:bg-[#1a56db]/20",
            ].join(" ")}
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : isEnabled ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : null}
            {busy ? "Saving…" : isEnabled ? "Disable" : "Enable"}
          </button>
        ) : (
          <button
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#5d6579]/10 text-[#9aa0a6] border border-[#5d6579]/20 hover:bg-[#5d6579]/20 transition-colors"
          >
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
  const [apps, setApps]           = useState<AppEntry[]>([]);
  const [loading, setLoading]     = useState(true);
  const [isAdmin, setIsAdmin]     = useState(false);
  const [activeTab, setActiveTab] = useState<Category>("All");

  // ── Fetch apps + current user role ─────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [appsRes, meRes] = await Promise.all([
        fetch("/api/apps"),
        fetch("/api/me"),
      ]);

      if (appsRes.ok) {
        const data = await appsRes.json() as { apps: AppEntry[] };
        setApps(data.apps);
      }

      if (meRes.ok) {
        const me = await meRes.json() as { role?: string };
        setIsAdmin(me.role === "ADMIN");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Toggle handler ──────────────────────────────────────────────────────
  const handleToggle = async (appId: string, next: boolean) => {
    const res = await fetch("/api/apps", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId, enabled: next }),
    });

    if (!res.ok) {
      toast.error("Failed to update app");
      return;
    }

    setApps((prev) =>
      prev.map((a) => (a.id === appId ? { ...a, enabled: next } : a))
    );

    toast.success(next ? "App enabled" : "App disabled");
  };

  // ── Derived lists ───────────────────────────────────────────────────────
  const filtered = apps.filter(
    (a) => activeTab === "All" || a.category === activeTab
  );

  // Enabled apps float to the top within the filtered list
  const sorted = [
    ...filtered.filter((a) => a.enabled),
    ...filtered.filter((a) => !a.enabled),
  ];

  const enabledCount = apps.filter((a) => a.enabled).length;

  return (
    <div className="min-h-screen bg-white text-[#202124]">
      <PageHeader
        eyebrow="Workspace"
        title="App Marketplace"
        description="Connect Nexus to your favourite tools"
      />

      <div className="px-6 pb-12 max-w-6xl space-y-6">

        {/* Stats strip */}
        {!loading && enabledCount > 0 && (
          <div className="flex items-center gap-2 text-xs text-[#9aa0a6]">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            <span>
              <span className="font-semibold text-emerald-400">{enabledCount}</span>{" "}
              {enabledCount === 1 ? "integration" : "integrations"} active
            </span>
          </div>
        )}

        {/* Category filter tabs */}
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveTab(cat)}
              className={[
                "px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors",
                activeTab === cat
                  ? "bg-[#1a56db]/15 text-[#1a56db] border-[#1a56db]/30"
                  : "bg-white text-[#9aa0a6] border-[#e8eaed] hover:text-[#5f6368] hover:border-[#d0d5dd]",
              ].join(" ")}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-24 gap-3 text-[#9aa0a6]">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading integrations…</span>
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-2">
            <Code className="h-10 w-10 text-[#bdc1c6]" />
            <p className="text-sm text-[#9aa0a6]">No integrations found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map((app) => (
              <AppCard
                key={app.id}
                app={app}
                isAdmin={isAdmin}
                onToggle={handleToggle}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
