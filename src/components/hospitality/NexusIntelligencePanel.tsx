"use client";

import { useState, useCallback } from "react";
import {
  Brain, CheckCircle2, AlertTriangle, AlertCircle, TrendingUp,
  Lightbulb, RefreshCw, Loader2, Info, ChevronDown, ChevronUp,
  Sparkles,
} from "lucide-react";
import type { AIBriefing, BriefingType, InsightSection } from "@/lib/hospitality/types";

// ─── Insight section config ───────────────────────────────────────────────────

const SECTION_CONFIG: Record<InsightSection["type"], {
  icon:  React.ComponentType<{ className?: string }>;
  chip:  string;
  label: string;
}> = {
  GOOD:        { icon: CheckCircle2,  chip: "bg-ok-soft text-ok border-ok/20",           label: "Good"        },
  ATTENTION:   { icon: AlertTriangle, chip: "bg-warn-soft text-warn border-warn/20",      label: "Attention"   },
  RISK:        { icon: AlertCircle,   chip: "bg-crit-soft text-crit border-crit/20",     label: "Risk"        },
  FINANCIAL:   { icon: TrendingUp,    chip: "bg-violet-soft text-violet border-violet/20", label: "Financial"   },
  RECOMMENDED: { icon: Lightbulb,     chip: "bg-accent-soft text-accent-strong border-accent/20", label: "Recommended" },
};

const PRIORITY_LABEL: Record<InsightSection["priority"], string> = {
  normal: "",
  high:   "High priority",
  urgent: "Urgent",
};

// ─── InsightCard ─────────────────────────────────────────────────────────────

function InsightCard({ section }: { section: InsightSection }) {
  const cfg  = SECTION_CONFIG[section.type] ?? SECTION_CONFIG.ATTENTION;
  const Icon = cfg.icon;

  return (
    <div className={`rounded-xl border px-4 py-3 ${cfg.chip}`}>
      <div className="flex items-start gap-2.5">
        <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{cfg.label}</span>
            {section.priority !== "normal" && (
              <span className="text-[10px] font-semibold opacity-60">{PRIORITY_LABEL[section.priority]}</span>
            )}
          </div>
          <p className="text-[13px] font-semibold leading-snug mb-1">{section.title}</p>
          <p className="text-[12px] leading-relaxed opacity-85">{section.body}</p>
        </div>
      </div>
    </div>
  );
}

// ─── RecommendationCard ───────────────────────────────────────────────────────

function RecommendationCard({ section }: { section: InsightSection }) {
  return (
    <div className="bg-accent-soft border border-accent/20 rounded-xl px-4 py-3">
      <div className="flex items-start gap-2.5">
        <Lightbulb className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-[13px] font-semibold text-accent-strong leading-snug mb-1">{section.title}</p>
          <p className="text-[12px] text-accent/80 leading-relaxed">{section.body}</p>
        </div>
      </div>
    </div>
  );
}

// ─── BriefingTypeSelector ─────────────────────────────────────────────────────

const BRIEFING_TYPES: { value: BriefingType; label: string }[] = [
  { value: "morning",    label: "Morning Briefing"    },
  { value: "operations", label: "Operations Summary"  },
  { value: "management", label: "Management Summary"  },
  { value: "incident",   label: "Incident Summary"    },
];

// ─── NexusIntelligencePanel ───────────────────────────────────────────────────

export function NexusIntelligencePanel() {
  const [briefingType,  setBriefingType]  = useState<BriefingType>("morning");
  const [briefing,      setBriefing]      = useState<AIBriefing | null>(null);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [expanded,      setExpanded]      = useState(true);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/hospitality/ai/briefing", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ type: briefingType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Briefing failed");
      setBriefing(data.briefing ?? null);
      setExpanded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate briefing");
    } finally {
      setLoading(false);
    }
  }, [briefingType]);

  const recommendations = briefing?.sections.filter(s => s.type === "RECOMMENDED") ?? [];
  const insights        = briefing?.sections.filter(s => s.type !== "RECOMMENDED") ?? [];

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between gap-3 border-b border-border-soft">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent-soft flex items-center justify-center flex-shrink-0">
            <Brain className="w-4 h-4 text-accent" />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-foreground flex items-center gap-1.5">
              Nexus Intelligence
              <Sparkles className="w-3.5 h-3.5 text-accent opacity-70" />
            </p>
            <p className="text-[11px] text-subtle">AI-powered operational briefings</p>
          </div>
        </div>
        {briefing && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-subtle hover:text-muted transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="px-5 py-3 flex items-center gap-3 flex-wrap border-b border-border-soft bg-surface-sunken">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          {BRIEFING_TYPES.map(bt => (
            <button
              key={bt.value}
              onClick={() => setBriefingType(bt.value)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                briefingType === bt.value
                  ? "bg-accent text-accent-foreground"
                  : "bg-hover text-muted hover:text-foreground"
              }`}
            >
              {bt.label}
            </button>
          ))}
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-1.5 text-[13px] font-semibold rounded-lg bg-accent text-accent-foreground hover:bg-accent-hover transition-colors disabled:opacity-60"
        >
          {loading
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Brain className="w-3.5 h-3.5" />}
          {loading ? "Generating…" : briefing ? "Regenerate" : "Generate Briefing"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="px-5 py-3 flex items-start gap-2.5 bg-crit-soft border-b border-crit/20">
          <AlertCircle className="w-4 h-4 text-crit flex-shrink-0 mt-0.5" />
          <p className="text-[12px] text-crit">{error}</p>
        </div>
      )}

      {/* No briefing yet — intro state */}
      {!briefing && !loading && !error && (
        <div className="px-5 py-8 text-center">
          <Brain className="w-8 h-8 text-subtle mx-auto mb-3" />
          <p className="text-[13px] font-medium text-foreground mb-1">Ready to brief you</p>
          <p className="text-[12px] text-muted max-w-xs mx-auto">
            Select a briefing type above and click Generate. Nexus Intelligence will analyse your current operational data and surface what matters.
          </p>
          <div className="mt-4 flex items-center justify-center gap-1 text-[11px] text-subtle">
            <Info className="w-3 h-3" />
            Briefings use operational data only — no guest PII is included
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="px-5 py-6 space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="h-16 rounded-xl bg-surface-sunken animate-pulse" />
          ))}
        </div>
      )}

      {/* Briefing content */}
      {briefing && expanded && !loading && (
        <div className="px-5 py-4 space-y-4">
          {/* Demo notice */}
          {briefing.isDemo && (
            <div className="flex items-center gap-2 text-[11px] text-accent bg-accent-soft border border-accent/20 rounded-lg px-3 py-2">
              <Info className="w-3.5 h-3.5 flex-shrink-0" />
              Briefing generated from demo data — connect live integrations for real operational context
            </div>
          )}

          {/* Summary */}
          <div className="px-4 py-3 bg-surface-sunken rounded-xl border border-border-soft">
            <p className="text-[11px] font-semibold text-subtle uppercase tracking-wide mb-1">Executive Summary</p>
            <p className="text-[13px] text-foreground leading-relaxed">{briefing.summary}</p>
          </div>

          {/* Insight sections (not recommendations) */}
          {insights.length > 0 && (
            <div className="grid grid-cols-1 gap-2.5">
              {insights.map((s, i) => <InsightCard key={i} section={s} />)}
            </div>
          )}

          {/* Recommendations */}
          {recommendations.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-subtle uppercase tracking-wide">Recommendations</p>
              {recommendations.map((s, i) => <RecommendationCard key={i} section={s} />)}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between text-[10px] text-subtle pt-1">
            <span>Generated {new Date(briefing.generatedAt).toLocaleTimeString()} · via Nexus Intelligence</span>
            <span className="flex items-center gap-1">
              <RefreshCw className="w-2.5 h-2.5" />
              {briefing.modelUsed !== "none" ? `Model: ${briefing.modelUsed}` : "Fallback mode"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
