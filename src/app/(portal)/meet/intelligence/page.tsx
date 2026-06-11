"use client";

import { useState } from "react";
import {
  Sparkles, FileText, CheckSquare, Users,
  Loader2, ChevronDown, ChevronRight, Copy, Download
} from "lucide-react";
import { PageHeader } from "@/components/Shell";
import { toast } from "sonner";

type MeetingResult = {
  summary: string;
  actionItems: { owner: string; task: string; due: string }[];
  decisions: string[];
  attendees: string[];
  sentiment: string;
  tags: string[];
  duration_minutes: number | null;
};

const SENTIMENT_COLOR: Record<string, string> = {
  positive: "text-emerald-400",
  negative: "text-red-400",
  neutral: "text-[#9aa3b8]",
  mixed: "text-yellow-400",
};

export default function MeetingIntelligencePage() {
  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MeetingResult | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({ summary: true, actions: true, decisions: true });

  const toggle = (k: string) => setOpen((p) => ({ ...p, [k]: !p[k] }));

  const analyze = async () => {
    if (!transcript.trim()) { toast.error("Paste a transcript first"); return; }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/ai/meeting-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, title }),
      });
      if (!res.ok) throw new Error((await res.json() as { error: string }).error);
      setResult(await res.json() as MeetingResult);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  const exportMd = () => {
    if (!result) return;
    const md = [
      `# ${title || "Meeting Summary"}`,
      `**Sentiment:** ${result.sentiment}  `,
      `**Attendees:** ${result.attendees.join(", ") || "—"}  `,
      `**Tags:** ${result.tags.join(", ") || "—"}`,
      "",
      "## Summary",
      result.summary,
      "",
      "## Action Items",
      ...result.actionItems.map((a) => `- [ ] **${a.owner}**: ${a.task}${a.due ? ` *(by ${a.due})*` : ""}`),
      "",
      "## Decisions",
      ...result.decisions.map((d) => `- ${d}`),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url; a.download = `meeting-${Date.now()}.md`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#0f1321] text-[#dfe1f6]">
      <PageHeader
        eyebrow="Meet · AI · Phase 36"
        title="Meeting Intelligence"
        description="Paste a meeting transcript to extract summary, action items, decisions, and sentiment."
      />

      <div className="px-6 pb-8 max-w-3xl space-y-4">
        <div className="bg-[#1b1f2e] border border-[rgba(255,255,255,0.06)] rounded-xl p-5 space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Meeting title (optional)"
            className="w-full bg-[#0c0e1a] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-[#dfe1f6] placeholder-[#5d6579] focus:outline-none focus:border-[#00d2ff]/40"
          />
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Paste your meeting transcript or notes here…"
            rows={10}
            className="w-full bg-[#0c0e1a] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-[#dfe1f6] placeholder-[#5d6579] focus:outline-none focus:border-[#00d2ff]/40 resize-none font-mono"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#5d6579]">{transcript.length.toLocaleString()} / 80,000 chars</span>
            <button
              onClick={analyze}
              disabled={loading || !transcript.trim()}
              className="flex items-center gap-2 px-5 py-2 bg-[#00d2ff] text-[#003543] font-semibold text-sm rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {loading ? "Analysing…" : "Analyse with AI"}
            </button>
          </div>
        </div>

        {result && (
          <div className="space-y-3">
            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-3 text-xs bg-[#1b1f2e] border border-[rgba(255,255,255,0.06)] rounded-xl px-4 py-3">
              <span className={`font-semibold capitalize ${SENTIMENT_COLOR[result.sentiment] ?? "text-[#9aa3b8]"}`}>
                {result.sentiment} sentiment
              </span>
              {result.attendees.length > 0 && (
                <span className="text-[#5d6579] flex items-center gap-1">
                  <Users className="w-3 h-3" />{result.attendees.join(", ")}
                </span>
              )}
              <div className="flex gap-1.5 flex-wrap">
                {result.tags.map((t) => (
                  <span key={t} className="bg-[#00d2ff]/10 text-[#7dd8f5] px-2 py-0.5 rounded-full">{t}</span>
                ))}
              </div>
              <div className="flex-1" />
              <button onClick={exportMd} className="flex items-center gap-1 text-[#5d6579] hover:text-[#00d2ff] transition-colors">
                <Download className="w-3.5 h-3.5" /> Export .md
              </button>
              <button
                onClick={() => navigator.clipboard.writeText(JSON.stringify(result, null, 2)).then(() => toast.success("Copied")).catch(() => {})}
                className="flex items-center gap-1 text-[#5d6579] hover:text-[#00d2ff] transition-colors"
              >
                <Copy className="w-3.5 h-3.5" /> JSON
              </button>
            </div>

            {/* Collapsible sections */}
            {[
              { key: "summary", label: "Summary", icon: FileText, content: (
                <p className="text-sm text-[#9aa3b8] leading-relaxed">{result.summary}</p>
              )},
              { key: "actions", label: `Action Items (${result.actionItems.length})`, icon: CheckSquare, content: (
                <ul className="space-y-2">
                  {result.actionItems.length === 0 ? (
                    <li className="text-xs text-[#5d6579]">None identified</li>
                  ) : result.actionItems.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="w-4 h-4 border border-[rgba(255,255,255,0.14)] rounded flex-shrink-0 mt-0.5" />
                      <span>
                        <strong className="text-[#00d2ff]">{a.owner}:</strong>{" "}
                        {a.task}
                        {a.due && <span className="text-[#5d6579] ml-1">· {a.due}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )},
              { key: "decisions", label: `Decisions (${result.decisions.length})`, icon: CheckSquare, content: (
                <ul className="space-y-1.5">
                  {result.decisions.length === 0 ? (
                    <li className="text-xs text-[#5d6579]">None recorded</li>
                  ) : result.decisions.map((d, i) => (
                    <li key={i} className="text-sm text-[#9aa3b8] flex items-start gap-2">
                      <span className="text-emerald-400 flex-shrink-0">✓</span>{d}
                    </li>
                  ))}
                </ul>
              )},
            ].map(({ key, label, icon: Icon, content }) => (
              <div key={key} className="bg-[#1b1f2e] border border-[rgba(255,255,255,0.06)] rounded-xl overflow-hidden">
                <button
                  onClick={() => toggle(key)}
                  className="flex items-center gap-2 w-full px-4 py-3 text-sm font-medium hover:bg-[#262939]/30 transition-colors"
                >
                  <Icon className="w-4 h-4 text-[#00d2ff]" />
                  {label}
                  <div className="flex-1" />
                  {open[key] ? <ChevronDown className="w-4 h-4 text-[#5d6579]" /> : <ChevronRight className="w-4 h-4 text-[#5d6579]" />}
                </button>
                {open[key] && <div className="px-4 pb-4">{content}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
