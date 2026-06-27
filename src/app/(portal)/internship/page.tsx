"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Megaphone, ClipboardList, Upload, MessageSquare, Bug, BarChart2,
  Plus, Pin, ChevronDown, ChevronRight, Send, Loader2, X,
  CheckCircle2, Clock, AlertTriangle, ExternalLink, RefreshCw,
  Star, Flag, Lightbulb, Shield, Circle, ArrowUpRight, Sparkles,
  BookOpen, Lock, Unlock, GraduationCap, Link2,
  FileText, Pencil, Save, Trash2, CalendarClock, LogIn, LogOut,
  AlertCircle, CheckCircle, UserCheck, Timer, Edit2, ChevronLeft, MapPin, Monitor,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/Shell";
import { avatarGradient } from "@/lib/avatar";

// ─── Markdown renderer ───────────────────────────────────────────────────────

function renderMarkdown(md: string): string {
  let html = md
    // Escape HTML entities first
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    // Fenced code blocks ```lang\n...\n```
    .replace(/```[\w]*\n?([\s\S]*?)```/g, (_m, code) =>
      `<pre style="background:#1B1F2A;border-radius:6px;padding:12px 16px;overflow-x:auto;margin:12px 0;font-size:13px;line-height:1.6;"><code style="font-family:monospace;color:#E6E9F0;">${code.trim()}</code></pre>`)
    // Headings
    .replace(/^### (.+)$/gm, '<h3 style="font-size:14px;font-weight:700;color:#E6E9F0;margin:20px 0 6px;">$1</h3>')
    .replace(/^## (.+)$/gm,  '<h2 style="font-size:15px;font-weight:700;color:#E6E9F0;margin:24px 0 8px;padding-bottom:4px;border-bottom:1px solid #262A35;">$1</h2>')
    .replace(/^# (.+)$/gm,   '<h1 style="font-size:17px;font-weight:700;color:#E6E9F0;margin:28px 0 10px;">$1</h1>')
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#E6E9F0;font-weight:600;">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em style="color:#C8CEDB;">$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code style="background:#1B1F2A;border-radius:4px;padding:1px 6px;font-size:12px;font-family:monospace;color:#00C2FF;">$1</code>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #262A35;margin:20px 0;"/>')
    // Unordered lists (- item or * item)
    .replace(/^[\-\*] (.+)$/gm, '<li style="margin:4px 0;color:#C8CEDB;font-size:14px;line-height:1.6;">$1</li>')
    // Ordered lists (1. item)
    .replace(/^\d+\. (.+)$/gm, '<li style="margin:4px 0;color:#C8CEDB;font-size:14px;line-height:1.6;list-style-type:decimal;">$1</li>')
    // Wrap consecutive <li> in <ul>/<ol>
    .replace(/(<li[^>]*>.*?<\/li>\n?)+/g, m => `<ul style="padding-left:20px;margin:8px 0;">${m}</ul>`)
    // Paragraphs — blank line separated blocks not already wrapped in HTML tags
    .replace(/\n{2,}/g, '\n\n')
    // Line breaks
    .replace(/\n/g, '<br/>');

  // Wrap bare text lines in <p>
  html = html.replace(/^(?!<[a-z])(.*?)(<br\/>|$)/gm, (m, text) =>
    text.trim() ? `<p style="margin:6px 0;color:#C8CEDB;font-size:14px;line-height:1.7;">${text}</p>` : m
  );

  return html;
}

function MarkdownBody({ content }: { content: string }) {
  return (
    <div
      className="text-sm leading-relaxed"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
    />
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "announcements" | "tasks" | "discussion" | "findings" | "progress" | "learning";

interface User { id: string; fullName: string; avatarUrl?: string | null; role?: string; }

interface Reaction { id: string; emoji: string; userId: string; user: User; }
interface Comment { id: string; body: string; author: User; createdAt: string; }

interface Announcement {
  id: string; title: string; body: string; isPinned: boolean;
  author: User; reactions: Reaction[]; comments: Comment[]; createdAt: string;
}

interface InternTask {
  id: string; title: string; description: string; priority: string;
  deadline?: string | null; assigneeIds: string[]; attachments?: { name: string; url: string; type: string }[];
  createdBy: User; submissions: Submission[]; _count: { discussions: number };
  createdAt: string;
}

interface Submission {
  id: string; taskId: string; status: string; notes?: string | null;
  files?: { name: string; url?: string | null; key?: string; type?: string; ext?: string; size?: number }[];
  links: string[]; version: number; submitter?: User;
  task?: { id: string; title: string; priority?: string; deadline?: string | null };
  reviews: Review[]; createdAt: string;
}

interface Review {
  id: string; verdict: string; comment?: string | null; score?: number | null;
  reviewer: User; createdAt: string;
}

interface Discussion {
  id: string; body: string; isPinned: boolean; taskId?: string | null;
  author: User; replies: Discussion[]; reactions: Reaction[]; createdAt: string;
}

interface Finding {
  id: string; type: string; title: string; description: string;
  severity?: string | null; status: string; steps?: string | null; useCase?: string | null;
  submitter: User; comments: Comment[]; createdAt: string;
}

interface InternStats {
  assigned: number; submitted: number; approved: number;
  pendingReview: number; findings: number;
  recentReviews: (Review & { submission: { taskId: string; task: { title: string } } })[];
}

// Week types
interface QuizQuestion { id: string; type: "mcq" | "text"; prompt: string; options?: string[]; answerIndex?: number; }
interface Quiz { questions: QuizQuestion[]; }
interface ModuleCompletion { id: string; topicId: string; score?: number | null; intern?: User; answers?: Record<string, number | string> | null; }
interface InternWeekTopic { id: string; title: string; body: string; order: number; quiz?: Quiz | null; completions?: ModuleCompletion[]; }
interface InternWeekResource { id: string; title: string; url: string; type: string; order: number; }
interface InternWeekCheckpoint { id: string; title: string; order: number; }
interface InternWeekMentorNote { id: string; body: string; createdAt: string; author: User; }
interface InternWeek {
  id: string; weekNumber: number; title: string; overview: string;
  isUnlocked: boolean; unlockedAt?: string | null;
  topics: InternWeekTopic[]; resources: InternWeekResource[];
  checkpoints: InternWeekCheckpoint[]; completions: { internId: string }[];
  mentorNotes: InternWeekMentorNote[];
}

interface MentorStats {
  internCount: number; taskCount: number; submissionCount: number;
  pendingReviews: number; openFindings: number;
  internStats: { intern: User & { email: string; createdAt: string }; assigned: number; submitted: number; approved: number; discussions: number }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
function initials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}
function isPast(d?: string | null) {
  return d ? new Date(d) < new Date() : false;
}

const PRIORITY_CFG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  low:    { label: "Low",    color: "text-[#8A92A6]",  bg: "bg-[#1B1F2A]",                dot: "bg-[#5A6275]" },
  medium: { label: "Medium", color: "text-[#00C2FF]",  bg: "bg-[#0E2532]",                dot: "bg-[#00C2FF]" },
  high:   { label: "High",   color: "text-[#F59E0B]",  bg: "bg-[#F59E0B]/12",             dot: "bg-[#F59E0B]" },
  urgent: { label: "Urgent", color: "text-[#ea4335]",  bg: "bg-[#ea4335]/12",             dot: "bg-[#ea4335]" },
};

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  submitted:          { label: "Submitted",         color: "text-[#00C2FF]",  bg: "bg-[#0E2532]",       icon: Upload },
  under_review:       { label: "Under Review",      color: "text-[#F59E0B]",  bg: "bg-[#F59E0B]/12",    icon: Clock },
  approved:           { label: "Approved",          color: "text-[#0f9d58]",  bg: "bg-[#0f9d58]/12",    icon: CheckCircle2 },
  rejected:           { label: "Rejected",          color: "text-[#ea4335]",  bg: "bg-[#ea4335]/12",    icon: X },
  revision_requested: { label: "Revision Needed",   color: "text-[#ff6d00]",  bg: "bg-[#ff6d00]/12",    icon: RefreshCw },
};

const FINDING_SEVERITY: Record<string, { label: string; color: string; bg: string }> = {
  low:      { label: "Low",      color: "text-[#8A92A6]", bg: "bg-[#1B1F2A]" },
  medium:   { label: "Medium",   color: "text-[#00C2FF]", bg: "bg-[#0E2532]" },
  high:     { label: "High",     color: "text-[#F59E0B]", bg: "bg-[#F59E0B]/12" },
  critical: { label: "Critical", color: "text-[#ea4335]", bg: "bg-[#ea4335]/12" },
};

const FINDING_TYPE: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  bug_report:      { label: "Bug Report",      icon: Bug,       color: "text-[#ea4335]" },
  feature_request: { label: "Feature Request", icon: Lightbulb, color: "text-[#f4b400]" },
  finding:         { label: "Security Finding",icon: Shield,    color: "text-[#00C2FF]" },
};

function Avatar({ user, size = 8 }: { user: User; size?: number }) {
  const s = `w-${size} h-${size}`;
  return user.avatarUrl
    ? <img src={user.avatarUrl} alt={user.fullName} className={`${s} rounded-full object-cover shrink-0`} />
    : <div className={`${s} rounded-full flex items-center justify-center text-white text-[11px] font-semibold shrink-0`} style={{ background: avatarGradient(user.fullName) }}>{initials(user.fullName)}</div>;
}

function PriorityBadge({ p }: { p: string }) {
  const cfg = PRIORITY_CFG[p] ?? PRIORITY_CFG.medium;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.color} ${cfg.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} /> {cfg.label}
    </span>
  );
}

function StatusBadge({ s }: { s: string }) {
  const cfg = STATUS_CFG[s];
  if (!cfg) return null;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.color} ${cfg.bg}`}>
      <Icon className="w-3 h-3" /> {cfg.label}
    </span>
  );
}

function SeverityBadge({ s }: { s?: string | null }) {
  if (!s) return null;
  const cfg = FINDING_SEVERITY[s] ?? FINDING_SEVERITY.medium;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.color} ${cfg.bg}`}>
      {cfg.label}
    </span>
  );
}

// ─── TABS ─────────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ElementType; mentorOnly?: boolean }[] = [
  { id: "announcements", label: "Announcements", icon: Megaphone },
  { id: "tasks",         label: "Tasks",         icon: ClipboardList },
  { id: "discussion",    label: "Discussion",    icon: MessageSquare },
  { id: "findings",      label: "Findings",      icon: Bug },
  { id: "learning",      label: "Learning",      icon: BookOpen },
  { id: "progress",      label: "Progress",      icon: BarChart2 },
];

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function InternshipHubPage() {
  const [tab, setTab] = useState<Tab>("announcements");
  const [currentUser, setCurrentUser] = useState<(User & { role: string; id: string; isMentor?: boolean }) | null>(null);

  useEffect(() => {
    fetch("/api/internship/me").then(r => r.json()).then(setCurrentUser).catch(() => null);
  }, []);

  const isMentor = !!currentUser?.isMentor;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        eyebrow="Nexus"
        title="Internship Hub"
        description={isMentor ? "Manage interns, assign tasks, and review submissions." : "Your workspace — tasks, submissions, discussions, and more."}
      />

      {/* Tab bar */}
      <div className="border-b border-[#262A35] bg-[#0B0D12] sticky top-0 z-10">
        <div className="flex gap-1 px-6 py-2 overflow-x-auto">
          {TABS.filter(t => !t.mentorOnly || isMentor).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium whitespace-nowrap rounded-lg transition-colors ${
                tab === t.id
                  ? "bg-[#00C2FF]/10 text-[#00C2FF]"
                  : "text-[#8A92A6] hover:text-[#E6E9F0] hover:bg-[#1B1F2A]"
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[#0B0D12] p-6">
        {currentUser && (
          <>
            {tab === "announcements" && <AnnouncementsTab isMentor={isMentor} userId={currentUser.id} />}
            {tab === "tasks"         && <TasksTab isMentor={isMentor} userId={currentUser.id} />}
            {tab === "discussion"    && <DiscussionTab userId={currentUser.id} currentUser={currentUser} />}
            {tab === "findings"      && <FindingsTab isMentor={isMentor} userId={currentUser.id} currentUser={currentUser} />}
            {tab === "learning"      && <LearningTab isMentor={isMentor} userId={currentUser.id} />}
            {tab === "progress"      && (
              <div className="space-y-8">
                <ProgressTab isMentor={isMentor} userId={currentUser.id} />
                <div>
                  <h2 className="text-sm font-semibold text-[#E6E9F0] mb-4 flex items-center gap-2">
                    <Upload className="w-4 h-4 text-[#00C2FF]" /> Submissions
                  </h2>
                  <SubmissionsTab isMentor={isMentor} userId={currentUser.id} />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── ANNOUNCEMENTS TAB ────────────────────────────────────────────────────────

function AnnouncementsTab({ isMentor, userId }: { isMentor: boolean; userId: string }) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", isPinned: false });
  const [posting, setPosting] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [commentText, setCommentText] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/internship/announcements");
      setItems(await res.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const post = async () => {
    if (!form.title.trim() || !form.body.trim()) return;
    setPosting(true);
    try {
      const res = await fetch("/api/internship/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      toast.success("Announcement posted");
      setForm({ title: "", body: "", isPinned: false });
      setShowForm(false);
      load();
    } catch { toast.error("Failed to post"); }
    finally { setPosting(false); }
  };

  const deleteAnn = async (id: string) => {
    if (!confirm("Delete this announcement?")) return;
    await fetch(`/api/internship/announcements?id=${id}`, { method: "DELETE" });
    setItems(p => p.filter(a => a.id !== id));
    toast.success("Announcement deleted");
  };

  const toggleReaction = async (annId: string, emoji: string) => {
    await fetch("/api/internship/reactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji, announcementId: annId }),
    }).catch(() => {});
    load();
  };

  const addComment = async (annId: string) => {
    const text = commentText[annId]?.trim();
    if (!text) return;
    await fetch("/api/internship/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text, announcementId: annId }),
    }).catch(() => {});
    setCommentText(p => ({ ...p, [annId]: "" }));
    load();
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {isMentor && (
        <div className="flex justify-end">
          <button onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#00C2FF] text-[#06121A] text-sm font-semibold rounded-lg hover:bg-[#0098E6] transition-colors">
            <Plus className="w-4 h-4" /> Post Announcement
          </button>
        </div>
      )}

      {showForm && (
        <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-5 space-y-3">
          <input
            className="w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] placeholder:text-[#5A6275] focus:outline-none focus:border-[#00C2FF]/60 focus:ring-2 focus:ring-[#00C2FF]/20"
            placeholder="Announcement title…"
            value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
          />
          <textarea
            rows={4}
            className="w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] placeholder:text-[#5A6275] focus:outline-none focus:border-[#00C2FF]/60 focus:ring-2 focus:ring-[#00C2FF]/20 resize-none"
            placeholder="Write your announcement…"
            value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))}
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-[#8A92A6] cursor-pointer">
              <input type="checkbox" checked={form.isPinned} onChange={e => setForm(p => ({ ...p, isPinned: e.target.checked }))} className="rounded" />
              <Pin className="w-3.5 h-3.5" /> Pin this announcement
            </label>
            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-[#8A92A6] hover:bg-[#1B1F2A] rounded-lg">Cancel</button>
              <button onClick={post} disabled={posting} className="px-4 py-1.5 bg-[#00C2FF] text-[#06121A] text-sm font-semibold rounded-lg hover:bg-[#0098E6] disabled:opacity-50">
                {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Post"}
              </button>
            </div>
          </div>
        </div>
      )}

      {items.length === 0 && <EmptyState icon={Megaphone} title="No announcements yet" desc="Your mentor will post updates, tasks and notices here." />}

      {items.map(ann => (
        <div key={ann.id} className={`bg-[#12151D] border rounded-xl overflow-hidden ${ann.isPinned ? "border-[#00C2FF]/30 shadow-sm" : "border-[#262A35]"}`}>
          {ann.isPinned && (
            <div className="flex items-center gap-1.5 px-4 py-1.5 bg-[#0E2532] text-[#00C2FF] text-xs font-semibold">
              <Pin className="w-3 h-3" /> Pinned
            </div>
          )}
          <div className="p-5">
            <div className="flex items-start justify-between gap-3 mb-2">
              <h3 className="font-semibold text-[#E6E9F0]">{ann.title}</h3>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-[#5A6275] font-mono">{fmt(ann.createdAt)}</span>
                {isMentor && (
                  <button onClick={() => void deleteAnn(ann.id)} className="p-1 rounded text-[#5A6275] hover:text-[#ea4335] hover:bg-[#ea4335]/12 transition-colors" title="Delete announcement">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <Avatar user={ann.author} size={6} />
              <span className="text-xs text-[#8A92A6]">{ann.author.fullName}</span>
            </div>
            <MarkdownBody content={ann.body} />

            {/* Reactions — one per user, clicking same removes, clicking different switches */}
            <div className="flex items-center gap-2 mt-4">
              {["👍", "🙌", "❤️", "🎯"].map(emoji => {
                const count = ann.reactions.filter(r => r.emoji === emoji).length;
                const mine = ann.reactions.some(r => r.emoji === emoji && r.userId === userId);
                return (
                  <button key={emoji} onClick={() => void toggleReaction(ann.id, emoji)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-sm border transition-colors ${mine ? "border-[#00C2FF] bg-[#0E2532]" : "border-[#262A35] hover:bg-[#1B1F2A]"}`}>
                    {emoji} {count > 0 && <span className="text-xs text-[#8A92A6]">{count}</span>}
                  </button>
                );
              })}
              <button onClick={() => setExpanded(p => ({ ...p, [ann.id]: !p[ann.id] }))}
                className="ml-auto text-xs text-[#8A92A6] hover:text-[#E6E9F0] flex items-center gap-1">
                <MessageSquare className="w-3.5 h-3.5" />
                {ann.comments.length} comment{ann.comments.length !== 1 ? "s" : ""}
                {expanded[ann.id] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>
            </div>

            {expanded[ann.id] && (
              <div className="mt-4 space-y-3 border-t border-[#1B1F2A] pt-4">
                {ann.comments.map(c => (
                  <div key={c.id} className="flex gap-2">
                    <Avatar user={c.author} size={6} />
                    <div className="flex-1 bg-[#1B1F2A] rounded-lg px-3 py-2">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-xs font-semibold text-[#E6E9F0]">{c.author.fullName}</span>
                        <span className="text-[10px] text-[#5A6275] font-mono">{fmtTime(c.createdAt)}</span>
                      </div>
                      <p className="text-sm text-[#C8CEDB]">{c.body}</p>
                    </div>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input
                    className="flex-1 px-3 py-1.5 bg-[#1B1F2A] border border-[#262A35] rounded-lg text-sm placeholder:text-[#5A6275] focus:outline-none focus:border-[#00C2FF]/60"
                    placeholder="Add a comment…"
                    value={commentText[ann.id] ?? ""}
                    onChange={e => setCommentText(p => ({ ...p, [ann.id]: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && addComment(ann.id)}
                  />
                  <button onClick={() => addComment(ann.id)} className="px-3 py-1.5 bg-[#00C2FF] text-[#06121A] rounded-lg hover:bg-[#0098E6]">
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── TASKS TAB ────────────────────────────────────────────────────────────────

function TasksTab({ isMentor, userId }: { isMentor: boolean; userId: string }) {
  const [tasks, setTasks] = useState<InternTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<InternTask | null>(null);
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", deadline: "", assigneeIds: [] as string[], assignAll: false });
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [interns, setInterns] = useState<User[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = isMentor ? "/api/internship/tasks" : `/api/internship/tasks?assigneeId=${userId}`;
      const res = await fetch(url);
      setTasks(await res.json());
    } finally { setLoading(false); }
  }, [isMentor, userId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (isMentor) {
      fetch("/api/users?role=INTERNSHIP").then(r => r.json())
        .then((all: { id: string; fullName: string; avatarUrl?: string }[]) => setInterns(all.filter(u => u.fullName)))
        .catch(() => {});
    }
  }, [isMentor]);

  const createTask = async () => {
    if (!form.title.trim() || !form.description.trim()) return;
    setCreating(true);
    try {
      const assigneeIds = form.assignAll ? interns.map(i => i.id) : form.assigneeIds;
      const deadlineIso = form.deadline ? new Date(form.deadline).toISOString() : null;
      const res = await fetch("/api/internship/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.title, description: form.description, priority: form.priority, deadline: deadlineIso, assigneeIds }),
      });
      if (!res.ok) throw new Error();
      toast.success("Task created");
      setForm({ title: "", description: "", priority: "medium", deadline: "", assigneeIds: [], assignAll: false });
      setShowForm(false);
      load();
    } catch { toast.error("Failed to create task"); }
    finally { setCreating(false); }
  };

  const deleteTask = async (id: string) => {
    if (!confirm("Delete this task? This cannot be undone.")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/internship/tasks/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Task deleted");
      load();
    } catch { toast.error("Failed to delete task"); }
    finally { setDeleting(null); }
  };

  if (loading) return <LoadingSpinner />;

  if (selected) return (
    <TaskDetail task={selected} isMentor={isMentor} userId={userId}
      onBack={() => { setSelected(null); load(); }} />
  );

  const grouped = {
    urgent: tasks.filter(t => t.priority === "urgent"),
    high:   tasks.filter(t => t.priority === "high"),
    medium: tasks.filter(t => t.priority === "medium"),
    low:    tasks.filter(t => t.priority === "low"),
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {isMentor && (
        <div className="flex justify-end">
          <button onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#00C2FF] text-[#06121A] text-sm font-semibold rounded-lg hover:bg-[#0098E6] transition-colors">
            <Plus className="w-4 h-4" /> New Task
          </button>
        </div>
      )}

      {showForm && (
        <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-5 space-y-3">
          <h3 className="font-semibold text-[#E6E9F0]">Create Task</h3>
          <input className="w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] placeholder:text-[#5A6275] focus:outline-none focus:border-[#00C2FF]/60 focus:ring-2 focus:ring-[#00C2FF]/20"
            placeholder="Task title…" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
          <textarea rows={3}
            className="w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] placeholder:text-[#5A6275] focus:outline-none focus:border-[#00C2FF]/60 focus:ring-2 focus:ring-[#00C2FF]/20 resize-none"
            placeholder="Description…" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#8A92A6] mb-1">Priority</label>
              <select className="w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] focus:outline-none focus:border-[#00C2FF]/60"
                value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}>
                <option value="low">Low</option><option value="medium">Medium</option>
                <option value="high">High</option><option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#8A92A6] mb-1">Deadline</label>
              <input type="datetime-local" className="w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] focus:outline-none focus:border-[#00C2FF]/60"
                value={form.deadline} onChange={e => setForm(p => ({ ...p, deadline: e.target.value }))} />
            </div>
          </div>
          {interns.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-[#8A92A6]">Assign to interns</label>
                <button
                  type="button"
                  onClick={() => setForm(p => ({ ...p, assignAll: !p.assignAll, assigneeIds: [] }))}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                    form.assignAll ? "border-[#00C2FF] bg-[#0E2532] text-[#00C2FF]" : "border-[#262A35] text-[#8A92A6] hover:bg-[#1B1F2A]"
                  }`}>
                  {form.assignAll ? <><CheckCircle2 className="w-3 h-3" /> All interns</> : "Assign all"}
                </button>
              </div>
              {!form.assignAll && (
                <div className="flex flex-wrap gap-2">
                  {interns.map(intern => (
                    <button key={intern.id} type="button"
                      onClick={() => setForm(p => ({
                        ...p, assigneeIds: p.assigneeIds.includes(intern.id)
                          ? p.assigneeIds.filter(id => id !== intern.id)
                          : [...p.assigneeIds, intern.id],
                      }))}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        form.assigneeIds.includes(intern.id)
                          ? "border-[#00C2FF] bg-[#0E2532] text-[#00C2FF]"
                          : "border-[#262A35] text-[#8A92A6] hover:bg-[#1B1F2A]"
                      }`}>
                      {intern.fullName}
                    </button>
                  ))}
                </div>
              )}
              {form.assignAll && (
                <p className="text-xs text-[#8A92A6]">Task will be assigned to all {interns.length} intern{interns.length !== 1 ? "s" : ""}.</p>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-[#8A92A6] hover:bg-[#1B1F2A] rounded-lg">Cancel</button>
            <button onClick={createTask} disabled={creating} className="px-4 py-1.5 bg-[#00C2FF] text-[#06121A] text-sm font-semibold rounded-lg hover:bg-[#0098E6] disabled:opacity-50">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
            </button>
          </div>
        </div>
      )}

      {tasks.length === 0 && <EmptyState icon={ClipboardList} title="No tasks yet" desc={isMentor ? "Create a task to assign to interns." : "No tasks assigned to you yet."} />}

      {(["urgent", "high", "medium", "low"] as const).map(priority => {
        const group = grouped[priority];
        if (group.length === 0) return null;
        return (
          <div key={priority}>
            <div className="flex items-center gap-2 mb-2">
              <PriorityBadge p={priority} />
              <span className="text-xs text-[#5A6275]">{group.length} task{group.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="space-y-2">
              {group.map(task => (
                <div key={task.id}
                  className="bg-[#12151D] border border-[#262A35] rounded-xl p-4 hover:border-[#00C2FF]/30 hover:shadow-sm transition-all group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelected(task)}>
                      <h4 className="font-semibold text-[#E6E9F0] group-hover:text-[#00C2FF] transition-colors truncate">{task.title}</h4>
                      <p className="text-sm text-[#8A92A6] mt-0.5 line-clamp-2">{task.description}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {isMentor && (
                        <button onClick={e => { e.stopPropagation(); deleteTask(task.id); }} disabled={deleting === task.id}
                          className="p-1.5 text-[#5A6275] hover:text-[#ea4335] hover:bg-[#ea4335]/12 rounded-lg transition-colors">
                          {deleting === task.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      <ChevronRight className="w-4 h-4 text-[#5A6275] cursor-pointer" onClick={() => setSelected(task)} />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-3 flex-wrap">
                    {task.deadline && (
                      <span className={`flex items-center gap-1 text-xs font-mono ${isPast(task.deadline) ? "text-[#ea4335]" : "text-[#5A6275]"}`}>
                        <Clock className="w-3 h-3" />
                        {isPast(task.deadline) ? "Overdue — " : ""}{fmt(task.deadline)}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-xs text-[#5A6275]">
                      <Upload className="w-3 h-3" /> <span className="font-mono">{task.submissions.length}</span> submission{task.submissions.length !== 1 ? "s" : ""}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-[#5A6275]">
                      <MessageSquare className="w-3 h-3" /> <span className="font-mono">{task._count.discussions}</span>
                    </span>
                    {task.assigneeIds.length > 0 && (
                      <span className="text-xs text-[#5A6275]"><span className="font-mono">{task.assigneeIds.length}</span> assignee{task.assigneeIds.length !== 1 ? "s" : ""}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── TASK DETAIL ──────────────────────────────────────────────────────────────

function TaskDetail({ task: initialTask, isMentor, userId, onBack }: { task: InternTask; isMentor: boolean; userId: string; onBack: () => void }) {
  const [task, setTask] = useState<InternTask & { discussions?: Discussion[] }>(initialTask);
  const [subForm, setSubForm] = useState({ notes: "", links: "" });
  const [subFiles, setSubFiles] = useState<{ name: string; url: string | null; key?: string; type: string; ext?: string; size: number }[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msgForm, setMsgForm] = useState("");
  const [sending, setSending] = useState(false);
  const [detailLoading, setDetailLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/internship/tasks/${initialTask.id}`)
      .then(r => r.json()).then(setTask).catch(() => setTask(initialTask))
      .finally(() => setDetailLoading(false));
  }, [initialTask]);

  const mySubmissions = (task.submissions ?? []).filter(s => s.submitter?.id === userId || isMentor);

  const submit = async () => {
    if (!subForm.notes.trim() && !subForm.links.trim() && subFiles.length === 0) { toast.error("Add a note, link, or file"); return; }
    setSubmitting(true);
    try {
      const links = subForm.links.split("\n").map(l => l.trim()).filter(Boolean);
      const res = await fetch("/api/internship/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, notes: subForm.notes, links, files: subFiles }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || `Submission failed (HTTP ${res.status})`);
      }
      toast.success("Submitted!");
      setSubForm({ notes: "", links: "" });
      setSubFiles([]);
      const updated = await fetch(`/api/internship/tasks/${task.id}`).then(r => r.json());
      setTask(updated);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Submission failed"); }
    finally { setSubmitting(false); }
  };

  const sendMsg = async () => {
    if (!msgForm.trim()) return;
    setSending(true);
    await fetch("/api/internship/discussions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: msgForm, taskId: task.id }),
    });
    setMsgForm("");
    const updated = await fetch(`/api/internship/tasks/${task.id}`).then(r => r.json());
    setTask(updated);
    setSending(false);
  };

  const reviewSub = async (subId: string, verdict: string, comment: string) => {
    await fetch(`/api/internship/submissions/${subId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verdict, comment }),
    });
    toast.success("Review saved");
    const updated = await fetch(`/api/internship/tasks/${task.id}`).then(r => r.json());
    setTask(updated);
  };

  const discussions = (task as InternTask & { discussions?: Discussion[] }).discussions ?? [];

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-[#8A92A6] hover:text-[#E6E9F0] mb-4 transition-colors">
        ← Back to tasks
      </button>

      <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-6 mb-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <PriorityBadge p={task.priority} />
              {task.deadline && <span className={`text-xs font-mono ${isPast(task.deadline) ? "text-[#ea4335]" : "text-[#5A6275]"}`}><Clock className="w-3 h-3 inline mr-0.5" />{fmt(task.deadline)}</span>}
            </div>
            <h2 className="text-lg font-semibold text-[#E6E9F0]">{task.title}</h2>
            <div className="mt-2"><MarkdownBody content={task.description} /></div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#5A6275]">
          <Avatar user={task.createdBy} size={5} />
          Posted by {task.createdBy.fullName} · <span className="font-mono">{fmt(task.createdAt)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Submit / Submissions */}
        <div className="space-y-4">
          {!isMentor && (
            <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-5">
              <h3 className="font-semibold text-[#E6E9F0] mb-3 flex items-center gap-2"><Upload className="w-4 h-4 text-[#00C2FF]" /> Submit Work</h3>
              <textarea rows={3}
                className="w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] placeholder:text-[#5A6275] focus:outline-none focus:border-[#00C2FF]/60 resize-none mb-2"
                placeholder="Notes about your submission…"
                value={subForm.notes} onChange={e => setSubForm(p => ({ ...p, notes: e.target.value }))} />
              <textarea rows={2}
                className="w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] placeholder:text-[#5A6275] focus:outline-none focus:border-[#00C2FF]/60 resize-none mb-2"
                placeholder="GitHub / links (one per line)…"
                value={subForm.links} onChange={e => setSubForm(p => ({ ...p, links: e.target.value }))} />
              {/* File upload */}
              <div className="mb-3">
                <label className={`flex items-center gap-2 px-3 py-2 border border-dashed border-[#2E333F] rounded-lg text-sm text-[#8A92A6] cursor-pointer hover:border-[#00C2FF]/60 hover:bg-[#1B1F2A] transition-colors ${uploadingFile ? "opacity-50 pointer-events-none" : ""}`}>
                  {uploadingFile ? <Loader2 className="w-4 h-4 animate-spin text-[#00C2FF]" /> : <FileText className="w-4 h-4 text-[#8A92A6]" />}
                  {uploadingFile ? "Uploading…" : "Attach PDF or Word document"}
                  <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden" onChange={async e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploadingFile(true);
                      const fd = new FormData(); fd.append("file", file);
                      const res = await fetch("/api/internship/findings/upload", { method: "POST", body: fd }).catch(() => null);
                      if (res?.ok) {
                        const data = await res.json() as { name: string; url: string | null; key?: string; type: string; ext?: string; size: number };
                        setSubFiles(p => [...p, data]);
                        toast.success(`${file.name} attached`);
                      } else { toast.error("Upload failed"); }
                      setUploadingFile(false);
                      e.target.value = "";
                    }} />
                </label>
                {subFiles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {subFiles.map((f, i) => (
                      <div key={i} className="flex items-center justify-between bg-[#1B1F2A] rounded px-3 py-1.5 text-xs text-[#C8CEDB]">
                        <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-[#00C2FF]" />{f.name}</span>
                        <button onClick={() => setSubFiles(p => p.filter((_, j) => j !== i))} className="text-[#5A6275] hover:text-[#ea4335]"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={submit} disabled={submitting}
                className="w-full px-4 py-2 bg-[#00C2FF] text-[#06121A] text-sm font-semibold rounded-lg hover:bg-[#0098E6] disabled:opacity-50 flex items-center justify-center gap-2">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Upload className="w-4 h-4" /> Submit</>}
              </button>
            </div>
          )}

          {/* Submissions list */}
          {mySubmissions.length > 0 && (
            <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-5">
              <h3 className="font-semibold text-[#E6E9F0] mb-3">Submissions</h3>
              <div className="space-y-3">
                {mySubmissions.map(sub => (
                  <SubmissionCard key={sub.id} sub={sub} isMentor={isMentor} onReview={reviewSub} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Discussion */}
        <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-5 flex flex-col">
          <h3 className="font-semibold text-[#E6E9F0] mb-3 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-[#00C2FF]" /> Discussion</h3>
          {detailLoading ? <LoadingSpinner /> : (
            <>
              <div className="flex-1 space-y-3 max-h-80 overflow-y-auto mb-3">
                {discussions.length === 0 && <p className="text-sm text-[#5A6275] text-center py-4">No messages yet — start the conversation!</p>}
                {discussions.map(d => (
                  <div key={d.id} className="flex gap-2">
                    <Avatar user={d.author} size={7} />
                    <div className="flex-1">
                      <div className="flex items-baseline gap-2 mb-0.5">
                        <span className="text-xs font-semibold text-[#E6E9F0]">{d.author.fullName}</span>
                        {d.author.role && ["ADMIN","CEO","CISO","R_AND_D","COO","OPS_MANAGER"].includes(d.author.role) && (
                          <span className="text-[10px] bg-[#0E2532] text-[#00C2FF] px-1.5 rounded font-medium">Mentor</span>
                        )}
                        <span className="text-[10px] text-[#5A6275] font-mono">{fmtTime(d.createdAt)}</span>
                        {d.isPinned && <Pin className="w-3 h-3 text-[#00C2FF]" />}
                      </div>
                      <div className="bg-[#1B1F2A] rounded-lg px-3 py-2 text-sm text-[#C8CEDB]">{d.body}</div>
                      {d.replies.length > 0 && (
                        <div className="mt-2 ml-4 space-y-2 border-l-2 border-[#262A35] pl-3">
                          {d.replies.map(r => (
                            <div key={r.id} className="flex gap-1.5">
                              <Avatar user={r.author} size={5} />
                              <div className="flex-1 bg-[#1B1F2A] rounded-lg px-2 py-1.5 text-xs text-[#C8CEDB]">{r.body}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-auto">
                <input
                  className="flex-1 px-3 py-2 bg-[#1B1F2A] border border-[#262A35] rounded-lg text-sm placeholder:text-[#5A6275] focus:outline-none focus:border-[#00C2FF]/60"
                  placeholder="Message…"
                  value={msgForm} onChange={e => setMsgForm(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMsg()}
                />
                <button onClick={sendMsg} disabled={sending}
                  className="px-3 py-2 bg-[#00C2FF] text-[#06121A] rounded-lg hover:bg-[#0098E6] disabled:opacity-50">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SubmissionFiles({ files }: { files?: Submission["files"] }) {
  if (!files || files.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 mb-2">
      {files.map((f, i) => (
        <FindingAttachment key={i} att={{ name: f.name, url: f.url ?? null, key: f.key, type: f.type, ext: f.ext }} />
      ))}
    </div>
  );
}

function SubmissionCard({ sub, isMentor, onReview }: { sub: Submission; isMentor: boolean; onReview: (id: string, verdict: string, comment: string) => void }) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [verdict, setVerdict] = useState("approved");
  const [comment, setComment] = useState("");
  const latestReview = sub.reviews?.[0];

  return (
    <div className="border border-[#262A35] rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {sub.submitter && <Avatar user={sub.submitter} size={5} />}
          <span className="text-xs font-medium text-[#E6E9F0] font-mono">v{sub.version}</span>
          <StatusBadge s={sub.status} />
        </div>
        <span className="text-[10px] text-[#5A6275] font-mono">{fmt(sub.createdAt)}</span>
      </div>
      {sub.notes && <p className="text-xs text-[#8A92A6] mb-2">{sub.notes}</p>}
      <SubmissionFiles files={sub.files} />
      {(sub.links?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {(sub.links ?? []).map((l, i) => (
            <a key={i} href={l} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-xs text-[#00C2FF] hover:underline">
              <ExternalLink className="w-3 h-3" /> {l.replace(/^https?:\/\//, "").slice(0, 30)}…
            </a>
          ))}
        </div>
      )}
      {latestReview && (
        <div className={`text-xs rounded p-2 mb-2 ${latestReview.verdict === "approved" ? "bg-[#0f9d58]/12 text-[#0f9d58]" : latestReview.verdict === "rejected" ? "bg-[#ea4335]/12 text-[#ea4335]" : "bg-[#ff6d00]/12 text-[#ff6d00]"}`}>
          {latestReview.verdict.replace("_", " ")} by {latestReview.reviewer.fullName}
          {latestReview.comment && <span> — {latestReview.comment}</span>}
          {latestReview.score != null && <span className="ml-1 font-semibold">[{latestReview.score}/100]</span>}
        </div>
      )}
      {isMentor && sub.status === "submitted" && (
        reviewOpen ? (
          <div className="space-y-2 mt-2">
            <select className="w-full px-2 py-1 bg-[#1B1F2A] border border-[#2E333F] rounded text-xs"
              value={verdict} onChange={e => setVerdict(e.target.value)}>
              <option value="approved">Approve</option>
              <option value="revision_requested">Request Revision</option>
              <option value="rejected">Reject</option>
            </select>
            <input className="w-full px-2 py-1 bg-[#1B1F2A] border border-[#2E333F] rounded text-xs placeholder:text-[#5A6275]"
              placeholder="Feedback (optional)…" value={comment} onChange={e => setComment(e.target.value)} />
            <div className="flex gap-1.5">
              <button onClick={() => onReview(sub.id, verdict, comment)}
                className="flex-1 px-2 py-1 bg-[#00C2FF] text-[#06121A] text-xs font-semibold rounded">Submit Review</button>
              <button onClick={() => setReviewOpen(false)} className="px-2 py-1 text-xs text-[#8A92A6] hover:bg-[#1B1F2A] rounded">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setReviewOpen(true)}
            className="text-xs text-[#00C2FF] hover:underline font-medium">Review this submission →</button>
        )
      )}
    </div>
  );
}

// ─── SUBMISSIONS TAB ──────────────────────────────────────────────────────────

function SubmissionsTab({ isMentor }: { isMentor: boolean; userId: string }) {
  const [subs, setSubs] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/internship/submissions")
      .then(r => r.json()).then(setSubs).catch(() => setSubs([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const reviewSub = async (subId: string, verdict: string, comment: string) => {
    const res = await fetch(`/api/internship/submissions/${subId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verdict, comment }),
    });
    if (!res.ok) { toast.error("Could not save review"); return; }
    toast.success("Review saved");
    load();
  };

  if (loading) return <LoadingSpinner />;
  if (subs.length === 0) return (
    <div className="max-w-2xl mx-auto">
      <EmptyState icon={Upload} title="No submissions yet" desc={isMentor ? "Intern submissions will appear here once they submit work." : "Submit your work from the Tasks tab."} />
    </div>
  );

  const pending  = subs.filter(s => s.status === "submitted");
  const reviewed = subs.filter(s => s.status !== "submitted");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {pending.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[#E6E9F0] mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#00C2FF]" /> Awaiting Review ({pending.length})
          </h3>
          <div className="space-y-3">
            {pending.map(s => <SubmissionRow key={s.id} sub={s} isMentor={isMentor} onReview={reviewSub} />)}
          </div>
        </div>
      )}
      {reviewed.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[#E6E9F0] mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#5A6275]" /> Reviewed ({reviewed.length})
          </h3>
          <div className="space-y-3">
            {reviewed.map(s => <SubmissionRow key={s.id} sub={s} isMentor={isMentor} onReview={reviewSub} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function SubmissionRow({ sub, isMentor, onReview }: { sub: Submission; isMentor: boolean; onReview: (id: string, verdict: string, comment: string) => void }) {
  const latestReview = sub.reviews?.[0];
  const [reviewOpen, setReviewOpen] = useState(false);
  const [verdict, setVerdict] = useState("approved");
  const [comment, setComment] = useState("");
  return (
    <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="font-medium text-[#E6E9F0] text-sm">{sub.task?.title ?? "—"}</p>
          <div className="flex items-center gap-2 mt-1">
            {sub.submitter && <><Avatar user={sub.submitter} size={5} /><span className="text-xs text-[#8A92A6]">{sub.submitter.fullName}</span></>}
            <span className="text-xs text-[#5A6275] font-mono">v{sub.version}</span>
          </div>
        </div>
        <StatusBadge s={sub.status} />
      </div>
      {sub.notes && <p className="text-xs text-[#8A92A6] mt-1 mb-2">{sub.notes}</p>}
      <SubmissionFiles files={sub.files} />
      {sub.links?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {sub.links.map((l, i) => (
            <a key={i} href={l} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-xs text-[#00C2FF] hover:underline">
              <ExternalLink className="w-3 h-3" /> {l.replace(/^https?:\/\//, "").slice(0, 30)}…
            </a>
          ))}
        </div>
      )}
      {latestReview && (
        <div className="text-xs text-[#8A92A6] mt-2 bg-[#1B1F2A] rounded p-2">
          {latestReview.reviewer.fullName}: {latestReview.comment ?? latestReview.verdict}
          {latestReview.score != null && <span className="ml-1 font-semibold text-[#00C2FF] font-mono">[{latestReview.score}/100]</span>}
        </div>
      )}
      {isMentor && sub.status === "submitted" && (
        reviewOpen ? (
          <div className="space-y-2 mt-3 border-t border-[#262A35] pt-3">
            <select className="w-full px-2 py-1.5 bg-[#1B1F2A] border border-[#2E333F] rounded text-xs"
              value={verdict} onChange={e => setVerdict(e.target.value)}>
              <option value="approved">Approve</option>
              <option value="revision_requested">Request Revision</option>
              <option value="rejected">Reject</option>
            </select>
            <input className="w-full px-2 py-1.5 bg-[#1B1F2A] border border-[#2E333F] rounded text-xs placeholder:text-[#5A6275]"
              placeholder="Feedback (optional)…" value={comment} onChange={e => setComment(e.target.value)} />
            <div className="flex gap-1.5">
              <button onClick={() => { onReview(sub.id, verdict, comment); setReviewOpen(false); }}
                className="flex-1 px-2 py-1.5 bg-[#00C2FF] text-[#06121A] text-xs font-semibold rounded">Submit Review</button>
              <button onClick={() => setReviewOpen(false)} className="px-2 py-1.5 text-xs text-[#8A92A6] hover:bg-[#1B1F2A] rounded">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setReviewOpen(true)}
            className="text-xs text-[#00C2FF] hover:underline font-medium mt-2">Review / mark this submission →</button>
        )
      )}
      <div className="text-[10px] text-[#5A6275] mt-2 font-mono">{fmt(sub.createdAt)}</div>
    </div>
  );
}

// ─── DISCUSSION TAB ───────────────────────────────────────────────────────────

function DiscussionTab({ userId, currentUser }: { userId: string; currentUser: User & { role: string } }) {
  const [messages, setMessages] = useState<Discussion[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/internship/discussions?taskId=");
    setMessages(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    await fetch("/api/internship/discussions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text, taskId: null }),
    });
    setText("");
    await load();
    setSending(false);
  };

  const isMentorRole = (role?: string) => role && ["ADMIN","CEO","CISO","R_AND_D","COO","OPS_MANAGER"].includes(role);

  const canDelete = (_msg: Discussion) => currentUser.role === "ADMIN";
  const remove = async (id: string) => {
    if (!window.confirm("Delete this message?")) return;
    setMessages(prev => prev.filter(m => m.id !== id));
    await fetch(`/api/internship/discussions/${id}`, { method: "DELETE" }).catch(() => {});
    await load();
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="max-w-2xl mx-auto flex flex-col h-[calc(100vh-280px)] min-h-96">
      <div className="flex-1 bg-[#12151D] border border-[#262A35] rounded-xl overflow-y-auto p-4 space-y-3 mb-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <MessageSquare className="w-10 h-10 text-[#3A4150] mb-3" />
            <p className="text-sm font-medium text-[#E6E9F0]">General Discussion</p>
            <p className="text-xs text-[#5A6275] mt-1">Start the conversation — ask questions, share updates, tag mentors.</p>
          </div>
        )}
        {messages.map(msg => {
          const isMe = msg.author.id === userId;
          return (
            <div key={msg.id} className={`flex gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
              <Avatar user={msg.author} size={7} />
              <div className={`max-w-[80%] ${isMe ? "items-end" : "items-start"} flex flex-col`}>
                <div className="flex items-center gap-2 mb-0.5">
                  {!isMe && <span className="text-xs font-semibold text-[#E6E9F0]">{msg.author.fullName}</span>}
                  {isMentorRole(msg.author.role) && <span className="text-[10px] bg-[#0E2532] text-[#00C2FF] px-1.5 rounded font-medium">Mentor</span>}
                  {msg.isPinned && <Pin className="w-3 h-3 text-[#00C2FF]" />}
                  <span className="text-[10px] text-[#5A6275] font-mono">{fmtTime(msg.createdAt)}</span>
                  {canDelete(msg) && (
                    <button onClick={() => void remove(msg.id)} title="Delete message" className="text-[#5A6275] hover:text-[#ea4335] transition-colors">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <div className={`px-3 py-2 rounded-2xl text-sm ${isMe ? "bg-[#00C2FF] text-[#06121A] rounded-tr-sm" : "bg-[#1B1F2A] text-[#E6E9F0] rounded-tl-sm"}`}>
                  {msg.body}
                </div>
                {msg.replies.length > 0 && (
                  <div className="mt-2 ml-2 space-y-1.5 w-full">
                    {msg.replies.map(r => (
                      <div key={r.id} className="flex gap-1.5">
                        <Avatar user={r.author} size={5} />
                        <div className="bg-[#12151D] border border-[#262A35] rounded-xl px-3 py-1.5 text-xs text-[#C8CEDB] flex-1">
                          <span className="font-medium">{r.author.fullName}</span> {r.body}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 px-4 py-2.5 bg-[#12151D] border border-[#262A35] rounded-xl text-sm placeholder:text-[#5A6275] focus:outline-none focus:border-[#00C2FF]/60 focus:ring-2 focus:ring-[#00C2FF]/20"
          placeholder="Type a message… (Enter to send)"
          value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
        />
        <button onClick={send} disabled={sending}
          className="px-4 py-2.5 bg-[#00C2FF] text-[#06121A] rounded-xl hover:bg-[#0098E6] disabled:opacity-50 transition-colors">
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

// ─── FINDINGS TAB ─────────────────────────────────────────────────────────────

function FindingsTab({ isMentor, userId, currentUser }: { isMentor: boolean; userId: string; currentUser: User & { role: string } }) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({ type: "bug_report", title: "", description: "", severity: "medium", steps: "", useCase: "" });
  const [posting, setPosting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<{ name: string; url: string | null; key?: string; type: string; ext?: string; size?: number }[]>([]);
  const [statusUpdate, setStatusUpdate] = useState<Record<string, string>>({});
  const [commentText, setCommentText] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = typeFilter !== "all" ? `/api/internship/findings?type=${typeFilter}` : "/api/internship/findings";
      const res = await fetch(url);
      if (res.ok) setFindings(await res.json());
      else setFindings([]);
    } catch { setFindings([]); }
    finally { setLoading(false); }
  }, [typeFilter]);

  useEffect(() => { load(); }, [load]);

  const post = async () => {
    if (!form.title.trim() || !form.description.trim()) return;
    setPosting(true);
    try {
      const payload = {
        type: form.type, title: form.title, description: form.description,
        severity: form.severity, steps: form.steps || undefined, useCase: form.useCase || undefined,
        attachments: pendingFiles,
      };
      const res = await fetch("/api/internship/findings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Server error");
      }
      toast.success("Finding submitted!");
      setForm({ type: "bug_report", title: "", description: "", severity: "medium", steps: "", useCase: "" });
      setPendingFiles([]);
      setShowForm(false);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to submit");
    }
    finally { setPosting(false); }
  };

  const updateFinding = async (id: string) => {
    await fetch(`/api/internship/findings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: statusUpdate[id], comment: commentText[id] }),
    });
    toast.success("Updated");
    load();
  };

  if (loading) return <LoadingSpinner />;

  const TYPE_TABS = [
    { id: "all", label: "All" },
    { id: "bug_report", label: "Bugs" },
    { id: "feature_request", label: "Feature Requests" },
    { id: "finding", label: "Security Findings" },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {TYPE_TABS.map(t => (
            <button key={t.id} onClick={() => setTypeFilter(t.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${typeFilter === t.id ? "bg-[#0E2532] text-[#00C2FF]" : "text-[#8A92A6] hover:bg-[#1B1F2A]"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <button onClick={() => {
            if (!showForm && typeFilter !== "all") setForm(p => ({ ...p, type: typeFilter }));
            setShowForm(v => !v);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#00C2FF] text-[#06121A] text-xs font-semibold rounded-lg hover:bg-[#0098E6] transition-colors">
          <Plus className="w-3.5 h-3.5" /> Report
        </button>
      </div>

      {showForm && (
        <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#8A92A6] mb-1">Type</label>
              <select className="w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] focus:outline-none focus:border-[#00C2FF]/60"
                value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                <option value="bug_report">Bug Report</option>
                <option value="feature_request">Feature Request</option>
                <option value="finding">Security Finding</option>
              </select>
            </div>
            {form.type !== "feature_request" && (
              <div>
                <label className="block text-xs font-medium text-[#8A92A6] mb-1">Severity</label>
                <select className="w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] focus:outline-none focus:border-[#00C2FF]/60"
                  value={form.severity} onChange={e => setForm(p => ({ ...p, severity: e.target.value }))}>
                  <option value="low">Low</option><option value="medium">Medium</option>
                  <option value="high">High</option><option value="critical">Critical</option>
                </select>
              </div>
            )}
          </div>
          <input className="w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] placeholder:text-[#5A6275] focus:outline-none focus:border-[#00C2FF]/60 focus:ring-2 focus:ring-[#00C2FF]/20"
            placeholder="Title…" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
          <textarea rows={3}
            className="w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] placeholder:text-[#5A6275] focus:outline-none focus:border-[#00C2FF]/60 resize-none"
            placeholder="Description…" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          {form.type === "bug_report" && (
            <textarea rows={2}
              className="w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] placeholder:text-[#5A6275] focus:outline-none focus:border-[#00C2FF]/60 resize-none"
              placeholder="Steps to reproduce…" value={form.steps} onChange={e => setForm(p => ({ ...p, steps: e.target.value }))} />
          )}
          {form.type === "feature_request" && (
            <textarea rows={2}
              className="w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] placeholder:text-[#5A6275] focus:outline-none focus:border-[#00C2FF]/60 resize-none"
              placeholder="Use case / expected benefit…" value={form.useCase} onChange={e => setForm(p => ({ ...p, useCase: e.target.value }))} />
          )}

          {/* File attachment */}
          <div>
            <label className="block text-xs font-medium text-[#8A92A6] mb-1.5">Attach PDF or Word file (optional)</label>
            <label className={`flex items-center gap-2 px-3 py-2 border border-dashed rounded-lg cursor-pointer text-sm transition-colors ${uploading ? "opacity-50 pointer-events-none" : "border-[#2E333F] hover:border-[#00C2FF] hover:bg-[#1B1F2A]"}`}>
              {uploading
                ? <><Loader2 className="w-4 h-4 animate-spin text-[#00C2FF]" /><span className="text-[#8A92A6]">Uploading…</span></>
                : <><Upload className="w-4 h-4 text-[#5A6275]" /><span className="text-[#5A6275]">Click to attach PDF or Word doc</span></>}
              <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden" onChange={async e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploading(true);
                  try {
                    const fd = new FormData();
                    fd.append("file", file);
                    const res = await fetch("/api/internship/findings/upload", { method: "POST", body: fd });
                    if (!res.ok) { const err = await res.json().catch(() => ({})); toast.error(err.error ?? "Upload failed"); return; }
                    const data = await res.json();
                    setPendingFiles(p => [...p, data]);
                    toast.success("File attached");
                  } catch { toast.error("Upload failed"); }
                  finally { setUploading(false); e.target.value = ""; }
                }} />
            </label>
            {pendingFiles.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {pendingFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-[#12151D] border border-[#262A35] rounded-lg">
                    <FileText className="w-3.5 h-3.5 text-[#00C2FF] shrink-0" />
                    <span className="text-xs text-[#E6E9F0] flex-1 truncate">{f.name}</span>
                    <span className="text-[10px] text-[#5A6275]">{f.ext?.toUpperCase()}</span>
                    <button onClick={() => setPendingFiles(p => p.filter((_, j) => j !== i))}
                      className="text-[#5A6275] hover:text-[#ea4335]"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => { setShowForm(false); setPendingFiles([]); }} className="px-3 py-1.5 text-sm text-[#8A92A6] hover:bg-[#1B1F2A] rounded-lg">Cancel</button>
            <button onClick={post} disabled={posting || uploading} className="px-4 py-1.5 bg-[#00C2FF] text-[#06121A] text-sm font-semibold rounded-lg hover:bg-[#0098E6] disabled:opacity-50">
              {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit"}
            </button>
          </div>
        </div>
      )}

      {findings.length === 0 && <EmptyState icon={Bug} title="No findings yet" desc="Report bugs, feature ideas, or security observations." />}

      <div className="space-y-3">
        {findings.map(f => {
          const TypeIcon = FINDING_TYPE[f.type]?.icon ?? Bug;
          const typeColor = FINDING_TYPE[f.type]?.color ?? "text-[#8A92A6]";
          const isExpanded = expanded === f.id;
          return (
            <div key={f.id} className="bg-[#12151D] border border-[#262A35] rounded-xl overflow-hidden">
              <div className="p-4 cursor-pointer" onClick={() => setExpanded(isExpanded ? null : f.id)}>
                <div className="flex items-start gap-3">
                  <TypeIcon className={`w-4 h-4 mt-0.5 shrink-0 ${typeColor}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-xs font-semibold ${typeColor}`}>{FINDING_TYPE[f.type]?.label}</span>
                      <SeverityBadge s={f.severity} />
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        f.status === "open" ? "bg-[#0E2532] text-[#00C2FF]" :
                        f.status === "resolved" ? "bg-[#0f9d58]/12 text-[#0f9d58]" :
                        "bg-[#1B1F2A] text-[#8A92A6]"
                      }`}>{f.status}</span>
                    </div>
                    <h4 className="font-semibold text-[#E6E9F0] text-sm">{f.title}</h4>
                    <p className="text-xs text-[#8A92A6] mt-0.5 line-clamp-2">{f.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1">
                      <Avatar user={f.submitter} size={5} />
                      <span className="text-xs text-[#5A6275] hidden sm:block">{f.submitter.fullName}</span>
                    </div>
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-[#5A6275]" /> : <ChevronRight className="w-4 h-4 text-[#5A6275]" />}
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-[#262A35] p-4 space-y-4 bg-[#1B1F2A]">
                  <p className="text-sm text-[#C8CEDB] whitespace-pre-wrap">{f.description}</p>
                  {f.steps && <div><span className="text-xs font-semibold text-[#8A92A6]">Steps to reproduce:</span><p className="text-sm text-[#C8CEDB] mt-1 whitespace-pre-wrap">{f.steps}</p></div>}
                  {f.useCase && <div><span className="text-xs font-semibold text-[#8A92A6]">Use case:</span><p className="text-sm text-[#C8CEDB] mt-1">{f.useCase}</p></div>}

                  {/* Attachments with in-Nexus preview */}
                  {Array.isArray((f as Finding & { attachments?: { name: string; url: string | null; key?: string; type?: string; ext?: string }[] }).attachments) &&
                    ((f as Finding & { attachments?: { name: string; url: string | null; key?: string; type?: string; ext?: string }[] }).attachments ?? []).length > 0 && (
                    <div>
                      <span className="text-xs font-semibold text-[#8A92A6]">Attachments</span>
                      <div className="mt-2 space-y-2">
                        {((f as Finding & { attachments?: { name: string; url: string | null; key?: string; type?: string; ext?: string }[] }).attachments ?? []).map((att, ai) => (
                          <FindingAttachment key={ai} att={att} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Comments */}
                  {f.comments.length > 0 && (
                    <div className="space-y-2">
                      {f.comments.map(c => (
                        <div key={c.id} className="flex gap-2">
                          <Avatar user={c.author} size={6} />
                          <div className="flex-1 bg-[#12151D] border border-[#262A35] rounded-lg px-3 py-2">
                            <div className="flex items-baseline gap-2 mb-0.5">
                              <span className="text-xs font-semibold text-[#E6E9F0]">{c.author.fullName}</span>
                              <span className="text-[10px] text-[#5A6275] font-mono">{fmt(c.createdAt)}</span>
                            </div>
                            <p className="text-sm text-[#C8CEDB]">{c.body}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Mentor controls */}
                  {isMentor && (
                    <div className="flex gap-2 items-center flex-wrap">
                      <select className="px-2 py-1.5 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-xs text-[#E6E9F0]"
                        value={statusUpdate[f.id] ?? f.status}
                        onChange={e => setStatusUpdate(p => ({ ...p, [f.id]: e.target.value }))}>
                        <option value="open">Open</option><option value="in_review">In Review</option>
                        <option value="resolved">Resolved</option><option value="closed">Closed</option>
                      </select>
                      <input className="flex-1 min-w-32 px-2 py-1.5 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-xs placeholder:text-[#5A6275]"
                        placeholder="Add comment…"
                        value={commentText[f.id] ?? ""} onChange={e => setCommentText(p => ({ ...p, [f.id]: e.target.value }))} />
                      <button onClick={() => updateFinding(f.id)}
                        className="px-3 py-1.5 bg-[#00C2FF] text-[#06121A] text-xs font-semibold rounded-lg">Update</button>
                    </div>
                  )}

                  {/* Intern can also add a comment */}
                  {!isMentor && (
                    <div className="flex gap-2">
                      <input className="flex-1 px-3 py-1.5 bg-[#12151D] border border-[#262A35] rounded-lg text-xs placeholder:text-[#5A6275]"
                        placeholder="Add a comment…"
                        value={commentText[f.id] ?? ""} onChange={e => setCommentText(p => ({ ...p, [f.id]: e.target.value }))}
                        onKeyDown={async e => {
                          if (e.key === "Enter" && commentText[f.id]?.trim()) {
                            await fetch(`/api/internship/findings/${f.id}`, {
                              method: "PATCH", headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ comment: commentText[f.id] }),
                            });
                            setCommentText(p => ({ ...p, [f.id]: "" }));
                            load();
                          }
                        }} />
                      <button className="px-3 py-1.5 bg-[#00C2FF] text-[#06121A] rounded-lg" onClick={async () => {
                        if (!commentText[f.id]?.trim()) return;
                        await fetch(`/api/internship/findings/${f.id}`, {
                          method: "PATCH", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ comment: commentText[f.id] }),
                        });
                        setCommentText(p => ({ ...p, [f.id]: "" }));
                        load();
                      }}><Send className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── PROGRESS TAB ─────────────────────────────────────────────────────────────

function ProgressTab({ isMentor, userId }: { isMentor: boolean; userId: string }) {
  const [stats, setStats] = useState<InternStats | MentorStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/internship/stats").then(r => r.json()).then(setStats).catch(() => null).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;
  if (!stats) return null;

  if (isMentor) {
    const s = stats as MentorStats;
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Headline metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Active Interns", value: s.internCount, color: "text-[#00C2FF]", bg: "bg-[#0E2532]", icon: Sparkles },
            { label: "Total Tasks",    value: s.taskCount,   color: "text-[#0f9d58]", bg: "bg-[#0f9d58]/12",   icon: ClipboardList },
            { label: "Pending Review", value: s.pendingReviews, color: "text-[#F59E0B]", bg: "bg-[#F59E0B]/12", icon: Clock },
            { label: "Open Findings",  value: s.openFindings, color: "text-[#ea4335]",  bg: "bg-[#ea4335]/12",   icon: Bug },
          ].map(m => (
            <div key={m.label} className="bg-[#12151D] border border-[#262A35] rounded-xl p-4">
              <div className={`inline-flex p-2 rounded-lg ${m.bg} mb-3`}><m.icon className={`w-4 h-4 ${m.color}`} /></div>
              <div className={`text-2xl font-bold font-mono ${m.color}`}>{m.value}</div>
              <div className="text-xs text-[#8A92A6] mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>

        {/* Per-intern table */}
        <div className="bg-[#12151D] border border-[#262A35] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#262A35]">
            <h3 className="font-semibold text-[#E6E9F0]">Intern Overview</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#262A35] bg-[#1B1F2A]">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#8A92A6]">Intern</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#8A92A6]">Assigned</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#8A92A6]">Submitted</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#8A92A6]">Approved</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#8A92A6]">Messages</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#8A92A6]">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1B1F2A]">
                {s.internStats.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-[#5A6275]">No interns yet — create intern accounts from Users.</td></tr>
                )}
                {s.internStats.map(({ intern, assigned, submitted, approved, discussions }) => {
                  const score = assigned > 0 ? Math.round((approved / assigned) * 100) : null;
                  return (
                    <tr key={intern.id} className="hover:bg-[#1B1F2A]">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar user={intern} size={7} />
                          <div>
                            <p className="font-medium text-[#E6E9F0]">{intern.fullName}</p>
                            <p className="text-xs text-[#5A6275]">{intern.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="text-center px-4 py-3 font-semibold font-mono text-[#E6E9F0]">{assigned}</td>
                      <td className="text-center px-4 py-3 font-semibold font-mono text-[#E6E9F0]">{submitted}</td>
                      <td className="text-center px-4 py-3">
                        <span className={`font-semibold font-mono ${approved > 0 ? "text-[#0f9d58]" : "text-[#5A6275]"}`}>{approved}</span>
                      </td>
                      <td className="text-center px-4 py-3 text-[#E6E9F0] font-mono">{discussions}</td>
                      <td className="text-center px-4 py-3">
                        {score !== null ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <div className="w-12 h-1.5 bg-[#262A35] rounded-full overflow-hidden">
                              <div className="h-full bg-[#00C2FF] rounded-full" style={{ width: `${score}%` }} />
                            </div>
                            <span className="text-xs font-semibold text-[#00C2FF] font-mono">{score}%</span>
                          </div>
                        ) : <span className="text-xs text-[#5A6275]">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  const s = stats as InternStats;
  const completionRate = s.assigned > 0 ? Math.round((s.approved / s.assigned) * 100) : 0;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Personal stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: "Tasks Assigned",   value: s.assigned,     color: "text-[#00C2FF]",  bg: "bg-[#0E2532]",  icon: ClipboardList },
          { label: "Submitted",        value: s.submitted,    color: "text-[#F59E0B]",  bg: "bg-[#F59E0B]/12",   icon: Upload },
          { label: "Approved",         value: s.approved,     color: "text-[#0f9d58]",  bg: "bg-[#0f9d58]/12",   icon: CheckCircle2 },
          { label: "Pending Review",   value: s.pendingReview,color: "text-[#ff6d00]",  bg: "bg-[#ff6d00]/12",  icon: Clock },
          { label: "Findings Filed",   value: s.findings,     color: "text-[#ea4335]",  bg: "bg-[#ea4335]/12",     icon: Bug },
          { label: "Completion Rate",  value: `${completionRate}%`, color: "text-[#00C2FF]", bg: "bg-[#0E2532]", icon: Star },
        ].map(m => (
          <div key={m.label} className="bg-[#12151D] border border-[#262A35] rounded-xl p-4">
            <div className={`inline-flex p-2 rounded-lg ${m.bg} mb-3`}><m.icon className={`w-4 h-4 ${m.color}`} /></div>
            <div className={`text-2xl font-bold font-mono ${m.color}`}>{m.value}</div>
            <div className="text-xs text-[#8A92A6] mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-[#E6E9F0]">Overall Progress</span>
          <span className="text-sm font-bold text-[#00C2FF] font-mono">{completionRate}%</span>
        </div>
        <div className="w-full h-2.5 bg-[#262A35] rounded-full overflow-hidden">
          <div className="h-full bg-[#00C2FF] rounded-full transition-all" style={{ width: `${completionRate}%` }} />
        </div>
        <p className="text-xs text-[#5A6275] mt-2">{s.approved} of {s.assigned} tasks approved</p>
      </div>

      {/* Recent reviews */}
      {s.recentReviews.length > 0 && (
        <div className="bg-[#12151D] border border-[#262A35] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#262A35]">
            <h3 className="font-semibold text-[#E6E9F0]">Recent Feedback</h3>
          </div>
          <div className="divide-y divide-[#1B1F2A]">
            {s.recentReviews.map(r => (
              <div key={r.id} className="px-5 py-4 flex items-start gap-3">
                <Avatar user={r.reviewer} size={7} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-[#E6E9F0]">{r.reviewer.fullName}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      r.verdict === "approved" ? "bg-[#0f9d58]/12 text-[#0f9d58]" :
                      r.verdict === "rejected" ? "bg-[#ea4335]/12 text-[#ea4335]" : "bg-[#ff6d00]/12 text-[#ff6d00]"
                    }`}>{r.verdict.replace("_", " ")}</span>
                    {r.score != null && <span className="text-xs font-bold text-[#00C2FF] font-mono">{r.score}/100</span>}
                  </div>
                  <p className="text-xs text-[#5A6275]">on &ldquo;{r.submission.task.title}&rdquo;</p>
                  {r.comment && <p className="text-sm text-[#C8CEDB] mt-1">{r.comment}</p>}
                </div>
                <span className="text-[10px] text-[#5A6275] shrink-0 font-mono">{fmt(r.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── FINDING ATTACHMENT PREVIEW ───────────────────────────────────────────────

type AttachmentMeta = { name: string; url: string | null; key?: string; type?: string; ext?: string };

function FindingAttachment({ att }: { att: AttachmentMeta }) {
  const [expanded, setExpanded] = useState(false);
  const [wordHtml, setWordHtml] = useState<string | null>(null);
  const [loadingWord, setLoadingWord] = useState(false);

  const fileUrl = att.key
    ? `/api/internship/findings/file?key=${encodeURIComponent(att.key)}`
    : att.url;
  // Inline variant so the browser renders the file (esp. PDFs) instead of forcing a download.
  const inlineUrl = att.key
    ? `/api/internship/findings/file?key=${encodeURIComponent(att.key)}&inline=1`
    : att.url;
  const isPdf = att.type === "application/pdf" || att.ext === "pdf" || att.name?.toLowerCase().endsWith(".pdf");
  const isWord = att.type === "application/msword" ||
    att.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    att.name?.toLowerCase().endsWith(".doc") || att.name?.toLowerCase().endsWith(".docx");

  const loadWordPreview = async () => {
    if (wordHtml !== null || !fileUrl) return;
    setLoadingWord(true);
    try {
      const res = await fetch(fileUrl);
      const buf = await res.arrayBuffer();
      // Dynamically import mammoth to keep bundle lean
      const mammoth = await import("mammoth");
      const result = await mammoth.convertToHtml({ arrayBuffer: buf });
      setWordHtml(result.value);
    } catch {
      setWordHtml("<p class='text-red-500'>Preview unavailable — download to view.</p>");
    } finally { setLoadingWord(false); }
  };

  const handleExpand = () => {
    setExpanded(v => !v);
    if (!expanded && isWord) loadWordPreview();
  };

  return (
    <div className="border border-[#262A35] rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-[#1B1F2A]">
        <FileText className="w-4 h-4 text-[#00C2FF] shrink-0" />
        <span className="text-sm text-[#E6E9F0] flex-1 truncate font-medium">{att.name}</span>
        {fileUrl && (
          <>
            <button onClick={handleExpand}
              className="text-xs text-[#00C2FF] hover:underline font-medium px-2 py-0.5">
              {expanded ? "Hide preview" : "Preview"}
            </button>
            <a href={isPdf ? (inlineUrl ?? fileUrl) : fileUrl} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-xs text-[#8A92A6] hover:text-[#E6E9F0] px-2 py-0.5 rounded hover:bg-[#262A35]">
              <ExternalLink className="w-3 h-3" /> Open
            </a>
          </>
        )}
      </div>

      {expanded && fileUrl && (
        <div className="border-t border-[#262A35]">
          {isPdf && (
            <iframe
              src={inlineUrl ?? fileUrl}
              className="w-full h-[500px] bg-[#12151D]"
              title={att.name}
            />
          )}
          {isWord && (
            <div className="p-4 bg-[#12151D] max-h-[500px] overflow-y-auto">
              {loadingWord
                ? <div className="flex items-center gap-2 text-sm text-[#8A92A6]"><Loader2 className="w-4 h-4 animate-spin text-[#00C2FF]" /> Converting document…</div>
                : wordHtml
                  ? <div className="prose prose-sm max-w-none text-[#E6E9F0]" dangerouslySetInnerHTML={{ __html: wordHtml }} />
                  : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── LEARNING TAB ─────────────────────────────────────────────────────────────

function LearningTab({ isMentor, userId }: { isMentor: boolean; userId: string }) {
  const [weeks, setWeeks] = useState<InternWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<InternWeek | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/internship/weeks");
      setWeeks(await res.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markComplete = async (weekId: string, done: boolean) => {
    await fetch(`/api/internship/weeks/${weekId}/complete`, {
      method: done ? "DELETE" : "POST",
    });
    load();
  };

  if (loading) return <LoadingSpinner />;

  if (selected) {
    const week = weeks.find(w => w.id === selected.id) ?? selected;
    const completed = week.completions.some(c => c.internId === userId);
    return <WeekDetail week={week} userId={userId} isMentor={isMentor} completed={completed}
      onMarkComplete={() => markComplete(week.id, completed)}
      onRefresh={load}
      onBack={() => { setSelected(null); load(); }} />;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <p className="text-sm text-[#8A92A6]">
        Complete each week in order. Prerequisites are always available — later weeks unlock when your mentor opens them.
      </p>

      {weeks.length === 0 && (
        <EmptyState icon={BookOpen} title="No content yet"
          desc={isMentor ? "Use the Mentor Panel → Seed Handbook to load the curriculum." : "Your mentor hasn't loaded the curriculum yet. Check back soon."} />
      )}

      <div className="space-y-3">
        {weeks.map(week => {
          const isPrereq = week.weekNumber === 0;
          const locked = !week.isUnlocked;
          const completed = week.completions.some(c => c.internId === userId);
          const quizTopics = week.topics.filter(t => (t.quiz?.questions?.length ?? 0) > 0);
          const doneModules = quizTopics.filter(t => (t.completions?.length ?? 0) > 0).length;
          const progress = quizTopics.length > 0
            ? Math.round((doneModules / quizTopics.length) * 100)
            : completed ? 100 : 0;
          const hasProgress = quizTopics.length > 0;

          return (
            <div key={week.id}
              onClick={() => !locked && setSelected(week)}
              className={`bg-[#12151D] border rounded-xl p-5 transition-all ${
                locked ? "border-[#262A35] opacity-60 cursor-not-allowed" :
                "border-[#262A35] hover:border-[#00C2FF]/30 hover:shadow-sm cursor-pointer group"
              }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className={`mt-0.5 shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold ${
                    isPrereq ? "bg-[#0E2532] text-[#00C2FF]" :
                    completed ? "bg-green-500/10 text-[#0f9d58]" :
                    locked ? "bg-[#1B1F2A] text-[#5A6275]" :
                    "bg-[#0E2532] text-[#00C2FF]"
                  }`}>
                    {isPrereq ? "P" : week.weekNumber}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <h3 className={`font-semibold text-sm ${locked ? "text-[#5A6275]" : "text-[#E6E9F0] group-hover:text-[#00C2FF] transition-colors"}`}>
                        {week.title}
                      </h3>
                      {isPrereq && <span className="text-[10px] bg-green-500/10 text-[#0f9d58] px-1.5 py-0.5 rounded font-semibold">Always open</span>}
                      {completed && <span className="text-[10px] bg-green-500/10 text-[#0f9d58] px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5"><CheckCircle2 className="w-2.5 h-2.5" /> Complete</span>}
                    </div>
                    <p className="text-xs text-[#8A92A6] line-clamp-2">{week.overview}</p>
                    {!locked && (hasProgress || week.checkpoints.length > 0) && (
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 h-1.5 bg-[#262A35] rounded-full overflow-hidden max-w-32">
                          <div className="h-full bg-[#00C2FF] rounded-full transition-all" style={{ width: `${progress}%` }} />
                        </div>
                        <span className="text-[10px] text-[#5A6275] font-mono">
                          {hasProgress ? `${doneModules}/${quizTopics.length} quizzes done` : `${week.topics.length} modules · ${week.checkpoints.length} checkpoints`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="shrink-0">
                  {locked ? <Lock className="w-4 h-4 text-[#5A6275]" /> : <ChevronRight className="w-4 h-4 text-[#5A6275] group-hover:text-[#00C2FF]" />}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekDetail({ week, userId, isMentor, completed, onMarkComplete, onRefresh, onBack }: {
  week: InternWeek; userId: string; isMentor: boolean;
  completed: boolean; onMarkComplete: () => void; onRefresh: () => void; onBack: () => void;
}) {
  const [expandedTopic, setExpandedTopic] = useState<string | null>(week.topics[0]?.id ?? null);
  const [responses, setResponses] = useState<ModuleCompletion[]>([]);

  useEffect(() => {
    if (!isMentor) return;
    fetch(`/api/internship/modules?weekId=${week.id}`)
      .then(r => r.json()).then(d => setResponses(Array.isArray(d) ? d : [])).catch(() => setResponses([]));
  }, [isMentor, week.id]);

  const isTopicDone = (t: InternWeekTopic) => (t.completions?.length ?? 0) > 0;
  const doneCount = week.topics.filter(isTopicDone).length;

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-[#8A92A6] hover:text-[#E6E9F0] mb-4 transition-colors">
        ← Back to curriculum
      </button>

      {/* Header */}
      <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-6 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold bg-[#0E2532] text-[#00C2FF] px-2 py-0.5 rounded">
                {week.weekNumber === 0 ? "Prerequisites" : `Week ${week.weekNumber}`}
              </span>
              {completed && <span className="text-xs font-semibold bg-green-500/10 text-[#0f9d58] px-2 py-0.5 rounded flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Complete</span>}
            </div>
            <h2 className="text-lg font-semibold text-[#E6E9F0] mb-2">{week.title}</h2>
            <p className="text-sm text-[#8A92A6] leading-relaxed">{week.overview}</p>
          </div>
          {!isMentor && (
            <button onClick={onMarkComplete}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
                completed
                  ? "bg-green-500/10 text-[#0f9d58] hover:bg-[#ea4335]/12 hover:text-[#ea4335]"
                  : "bg-[#00C2FF] text-[#06121A] hover:bg-[#0098E6]"
              }`}>
              {completed ? <><CheckCircle2 className="w-3.5 h-3.5" /> Completed</> : <><Circle className="w-3.5 h-3.5" /> Mark Complete</>}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Topics (2/3 width) */}
        <div className="lg:col-span-2 space-y-3">
          <h3 className="text-xs font-semibold text-[#8A92A6]">Modules</h3>
          {week.topics.map(topic => {
            const hasQuiz = (topic.quiz?.questions?.length ?? 0) > 0;
            const done = isTopicDone(topic);
            return (
            <div key={topic.id} className="bg-[#12151D] border border-[#262A35] rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandedTopic(expandedTopic === topic.id ? null : topic.id)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#1B1F2A] transition-colors">
                <div className="flex items-center gap-2">
                  {!isMentor && done
                    ? <span className="w-5 h-5 rounded-full bg-green-500/10 text-[#0f9d58] flex items-center justify-center shrink-0"><CheckCircle2 className="w-3.5 h-3.5" /></span>
                    : <span className="w-5 h-5 rounded-full bg-[#0E2532] text-[#00C2FF] text-[10px] font-bold flex items-center justify-center shrink-0">{topic.order + 1}</span>}
                  <span className="text-sm font-semibold text-[#E6E9F0]">{topic.title}</span>
                  {hasQuiz && <span className="text-[10px] text-[#5A6275] bg-[#1B1F2A] px-1.5 py-0.5 rounded">Quiz</span>}
                </div>
                {expandedTopic === topic.id
                  ? <ChevronDown className="w-4 h-4 text-[#5A6275] shrink-0" />
                  : <ChevronRight className="w-4 h-4 text-[#5A6275] shrink-0" />}
              </button>
              {expandedTopic === topic.id && (
                <div className="px-5 pb-5 pt-3 border-t border-[#1B1F2A]">
                  <MarkdownBody content={topic.body} />
                  {!isMentor && hasQuiz && (
                    <ModuleQuiz topic={topic} completed={done} onCompleted={onRefresh} />
                  )}
                  {isMentor && hasQuiz && (
                    <MentorQuizResponses topic={topic} responses={responses.filter(r => r.topicId === topic.id)} />
                  )}
                </div>
              )}
            </div>
            );
          })}
        </div>

        {/* Sidebar (1/3 width) */}
        <div className="space-y-4">
          {/* Your progress */}
          {!isMentor && week.topics.length > 0 && (
            <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold text-[#8A92A6]">Your progress</h4>
                <span className="text-xs font-semibold text-[#00C2FF] font-mono">{doneCount}/{week.topics.length}</span>
              </div>
              <div className="space-y-2">
                {week.topics.map(t => (
                  <div key={t.id} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${isTopicDone(t) ? "text-[#0f9d58]" : "text-[#3A4150]"}`} />
                    <span className={isTopicDone(t) ? "text-[#C8CEDB]" : "text-[#5A6275]"}>{t.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resources */}
          {week.resources.length > 0 && (
            <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-4">
              <h4 className="text-xs font-semibold text-[#8A92A6] mb-3">Resources</h4>
              <div className="space-y-2">
                {week.resources.map(r => (
                  <a key={r.id} href={r.url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 text-sm text-[#00C2FF] hover:underline">
                    <Link2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{r.title}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Checkpoints */}
          {week.checkpoints.length > 0 && (
            <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-4">
              <h4 className="text-xs font-semibold text-[#8A92A6] mb-3">Checkpoints</h4>
              <div className="space-y-2">
                {week.checkpoints.map((cp, idx) => {
                  const cpDone = !isMentor && idx < doneCount;
                  return (
                  <div key={cp.id} className="flex items-start gap-2 text-sm text-[#C8CEDB]">
                    <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${cpDone ? "text-[#0f9d58]" : "text-[#3A4150]"}`} />
                    {cp.title}
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Mentor notes */}
          {week.mentorNotes.length > 0 && (
            <div className="bg-[#1B1F2A] border border-[#F59E0B]/30 rounded-xl p-4">
              <h4 className="text-xs font-semibold text-[#F59E0B] mb-3 flex items-center gap-1.5"><Lightbulb className="w-3.5 h-3.5" /> Mentor Notes</h4>
              <div className="space-y-3">
                {week.mentorNotes.map(note => (
                  <div key={note.id} className="border-l-2 border-[#F59E0B]/40 pl-3">
                    <p className="text-xs text-[#C2C8D6] leading-relaxed">{note.body}</p>
                    <p className="text-[10px] text-[#8A92A6] mt-1">— {note.author.fullName}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MODULE QUIZ (intern) ─────────────────────────────────────────────────────

function ModuleQuiz({ topic, completed, onCompleted }: { topic: InternWeekTopic; completed: boolean; onCompleted: () => void }) {
  const questions = topic.quiz?.questions ?? [];
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [wrong, setWrong] = useState<string[]>([]);
  const [retaking, setRetaking] = useState(false);

  if (questions.length === 0) return null;

  if (completed && !retaking) {
    return (
      <div className="mt-4 border-t border-[#1B1F2A] pt-4">
        <div className="flex items-center justify-between bg-green-500/10 rounded-lg px-3 py-2">
          <span className="text-xs font-semibold text-[#0f9d58] flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Quiz passed — module complete</span>
          <button onClick={() => { setRetaking(true); setAnswers({}); setWrong([]); }} className="text-xs text-[#00C2FF] hover:underline font-medium">Retake</button>
        </div>
      </div>
    );
  }

  const setAns = (qid: string, val: number | string) => setAnswers(p => ({ ...p, [qid]: val }));

  const allAnswered = questions.every(q => {
    const a = answers[q.id];
    return q.type === "mcq" ? typeof a === "number" : (typeof a === "string" && a.trim().length > 0);
  });

  const submit = async () => {
    setSubmitting(true); setWrong([]);
    try {
      const res = await fetch("/api/internship/modules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: topic.id, answers }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { toast.error(data?.error || "Could not submit quiz"); return; }
      if (data.passed) {
        toast.success(data.weekCompleted ? "Module complete — week finished! 🎉" : "Module complete ✓");
        setRetaking(false);
        onCompleted();
      } else {
        setWrong(data.wrongIds ?? []);
        toast.error("Not quite — review the highlighted questions and try again.");
      }
    } catch { toast.error("Could not submit quiz"); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="mt-4 border-t border-[#1B1F2A] pt-4">
      <h5 className="text-xs font-semibold text-[#00C2FF] mb-3">Module Quiz</h5>
      <div className="space-y-4">
        {questions.map((q, i) => {
          const isWrong = wrong.includes(q.id);
          return (
            <div key={q.id} className={`rounded-lg p-3 border ${isWrong ? "border-[#ea4335]/40 bg-[#ea4335]/10" : "border-[#262A35] bg-[#1B1F2A]"}`}>
              <p className="text-sm font-medium text-[#E6E9F0] mb-2">{i + 1}. {q.prompt}</p>
              {q.type === "mcq" ? (
                <div className="space-y-1.5">
                  {(q.options ?? []).map((opt, oi) => (
                    <label key={oi} className="flex items-center gap-2 text-sm text-[#C8CEDB] cursor-pointer">
                      <input type="radio" name={`ans-${q.id}`} checked={answers[q.id] === oi}
                        onChange={() => setAns(q.id, oi)} className="accent-[#00C2FF]" />
                      {opt}
                    </label>
                  ))}
                </div>
              ) : (
                <textarea rows={3}
                  className="w-full px-3 py-2 bg-[#12151D] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] resize-y focus:outline-none focus:border-[#00C2FF]/60"
                  placeholder="Your answer…"
                  value={typeof answers[q.id] === "string" ? (answers[q.id] as string) : ""}
                  onChange={e => setAns(q.id, e.target.value)} />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-3">
        <button onClick={submit} disabled={submitting || !allAnswered}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#00C2FF] text-[#06121A] text-sm font-semibold rounded-lg hover:bg-[#0098E6] disabled:opacity-50">
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          Submit quiz
        </button>
        {!allAnswered && <span className="text-xs text-[#5A6275]">Answer all questions to submit.</span>}
      </div>
    </div>
  );
}

// ─── MENTOR QUIZ RESPONSES ────────────────────────────────────────────────────

function MentorQuizResponses({ topic, responses }: { topic: InternWeekTopic; responses: ModuleCompletion[] }) {
  const questions = topic.quiz?.questions ?? [];
  const textQs = questions.filter(q => q.type === "text");
  return (
    <div className="mt-4 border-t border-[#1B1F2A] pt-4 space-y-4">
      {/* Quiz preview — what interns must answer (correct option marked) */}
      <div>
        <h5 className="text-xs font-semibold text-[#8A92A6] mb-2">Quiz ({questions.length} {questions.length === 1 ? "question" : "questions"})</h5>
        <div className="space-y-2">
          {questions.map((q, i) => (
            <div key={q.id} className="bg-[#1B1F2A] border border-[#262A35] rounded-lg p-2.5">
              <p className="text-xs font-medium text-[#E6E9F0] mb-1">{i + 1}. {q.prompt}
                <span className="ml-1 text-[10px] font-semibold text-[#5A6275]">{q.type === "mcq" ? "(MCQ)" : "(short answer)"}</span>
              </p>
              {q.type === "mcq" && (
                <ul className="space-y-0.5">
                  {(q.options ?? []).map((opt, oi) => (
                    <li key={oi} className={`text-xs flex items-center gap-1.5 ${oi === q.answerIndex ? "text-[#0f9d58] font-semibold" : "text-[#8A92A6]"}`}>
                      {oi === q.answerIndex ? <CheckCircle2 className="w-3 h-3 shrink-0" /> : <Circle className="w-3 h-3 shrink-0 text-[#3A4150]" />}
                      {opt}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {questions.length === 0 && <p className="text-xs text-[#5A6275]">No quiz on this module yet.</p>}
        </div>
      </div>

      {/* Intern responses */}
      {responses.length === 0 ? (
        <p className="text-xs text-[#5A6275]">No intern responses yet.</p>
      ) : (
      <div>
      <h5 className="text-xs font-semibold text-[#8A92A6] mb-3">Quiz Responses ({responses.length})</h5>
      <div className="space-y-3">
        {responses.map(r => (
          <div key={r.id} className="bg-[#12151D] border border-[#262A35] rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1.5">
              {r.intern && <Avatar user={r.intern} size={5} />}
              <span className="text-xs font-medium text-[#E6E9F0]">{r.intern?.fullName ?? "Intern"}</span>
              {r.score != null && <span className="text-[10px] font-semibold text-[#00C2FF] bg-[#0E2532] px-1.5 py-0.5 rounded font-mono">MCQ {r.score}%</span>}
            </div>
            {textQs.length > 0 ? (
              <div className="space-y-1.5">
                {textQs.map(q => {
                  const a = r.answers?.[q.id];
                  return (
                    <div key={q.id} className="text-xs">
                      <p className="text-[#8A92A6]">{q.prompt}</p>
                      <p className="text-[#E6E9F0] whitespace-pre-wrap">{typeof a === "string" && a.trim() ? a : <span className="text-[#5A6275] italic">— no answer —</span>}</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] text-[#5A6275]">All MCQ — no free-text answers to review.</p>
            )}
          </div>
        ))}
      </div>
      </div>
      )}
    </div>
  );
}

// ─── QUIZ EDITOR (mentor) ─────────────────────────────────────────────────────

const qid = () => `q_${Math.random().toString(36).slice(2, 10)}`;

// ─── ATTENDANCE TAB (intern-facing) ───────────────────────────────────────────

interface AttendanceSchedule {
  startTime: string;
  endTime: string;
  timezone: string;
  lateGraceMinutes: number;
  defaultBreakFrom: string;
  defaultBreakTo: string;
  updatedBy: string | null;
  updatedAt: string | null;
}

interface AttendanceSession {
  punchIn: string;
  punchOut: string | null;
  sessionId: string;
  location: { lat: number; lng: number; accuracy: number } | null;
  device: string | null;
}

interface BreakPeriod {
  from: string;
  to: string;
  label?: string | null;
}

interface AttendanceRecord {
  intern: { id: string; fullName: string; avatarUrl?: string | null };
  date: string;
  sessions: AttendanceSession[];
  firstPunchIn: string | null;
  lastPunchOut: string | null;
  totalMinutes: number;
  breakMinutes: number;
  autoBreakMinutes: number;
  breakWindow: { from: string; to: string } | null;
  breaks: BreakPeriod[];
  isCurrentlyIn: boolean;
  isLate: boolean;
  idleFlag: boolean;
  activityCount: number;
  hasOverride: boolean;
  overrideReason: string | null;
  // Mentor-only — never shown in intern UI
  punchLocation: { lat: number; lng: number; accuracy: number } | null;
  punchDevice: string | null;
}

function fmtDuration(minutes: number) {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtHHMM(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/** Convert a UTC ISO string to the "YYYY-MM-DDTHH:MM" format that datetime-local inputs expect (local time). */
function toLocalDatetimeInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── Attendance helpers ────────────────────────────────────────────────────────

/** Parse UA string into a short human-readable "Browser on OS" label */
function parseUserAgent(ua: string): string {
  let browser = "Unknown browser";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = "Safari";
  else if (/Firefox\//.test(ua)) browser = "Firefox";

  let os = "Unknown OS";
  if (/Windows NT 10/.test(ua)) os = "Windows 10/11";
  else if (/Windows NT/.test(ua)) os = "Windows";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/iPhone|iPad/.test(ua)) os = "iOS";
  else if (/Linux/.test(ua)) os = "Linux";

  return `${browser} on ${os}`;
}

/** Request geolocation with a 5-second timeout. Returns null on denial or timeout. */
function getGeoLocation(): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return; }
    const timer = setTimeout(() => resolve(null), 5000);
    navigator.geolocation.getCurrentPosition(
      pos => {
        clearTimeout(timer);
        resolve({
          lat: Math.round(pos.coords.latitude * 1e6) / 1e6,
          lng: Math.round(pos.coords.longitude * 1e6) / 1e6,
          accuracy: Math.round(pos.coords.accuracy),
        });
      },
      () => { clearTimeout(timer); resolve(null); },
      { timeout: 5000, maximumAge: 300000 },
    );
  });
}

function AttendanceTab({ isMentor, userId }: { isMentor: boolean; userId: string }) {
  const [schedule, setSchedule] = useState<AttendanceSchedule | null>(null);
  const [record, setRecord] = useState<AttendanceRecord | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [punching, setPunching] = useState(false);
  const [loadingRecord, setLoadingRecord] = useState(true);

  const today = todayStr();

  const loadSchedule = useCallback(async () => {
    const res = await fetch("/api/internship/attendance/schedule");
    if (res.ok) setSchedule(await res.json());
  }, []);

  const loadToday = useCallback(async () => {
    setLoadingRecord(true);
    try {
      const res = await fetch(`/api/internship/attendance?date=${today}`);
      if (res.ok) {
        const data = await res.json() as AttendanceRecord[];
        const mine = data.find(r => r.intern.id === userId);
        setRecord(mine ?? null);
      }
    } finally { setLoadingRecord(false); }
  }, [today, userId]);

  const loadHistory = useCallback(async () => {
    const dateStrings = Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (i + 1));
      return d.toISOString().slice(0, 10);
    });
    const results = await Promise.all(
      dateStrings.map(dateStr =>
        fetch(`/api/internship/attendance?date=${dateStr}`)
          .then(r => r.ok ? r.json() as Promise<AttendanceRecord[]> : Promise.resolve([]))
          .catch(() => [] as AttendanceRecord[])
      )
    );
    const days = results.map((data, i) => {
      const mine = data.find(r => r.intern.id === userId);
      return mine ? { ...mine, date: dateStrings[i] } : null;
    }).filter((r): r is AttendanceRecord => r !== null);
    setHistory(days);
  }, [userId]);

  useEffect(() => {
    loadSchedule();
    loadToday();
    loadHistory();
  }, [loadSchedule, loadToday, loadHistory]);

  const punch = async () => {
    setPunching(true);
    try {
      // Collect device + location silently — punch fires regardless of outcome
      const device = parseUserAgent(navigator.userAgent);
      const location = await getGeoLocation();

      const res = await fetch("/api/internship/attendance/punch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device, location }),
      });
      const data = await res.json() as { action?: string; error?: string; message?: string };
      if (res.status === 409) {
        toast.error(data.message ?? "You've already completed attendance for today.");
        await loadToday();
        return;
      }
      if (!res.ok) throw new Error();
      toast.success(data.action === "INTERN_PUNCH_IN" ? "Punched in — have a productive session!" : "Punched out — good work today!");
      await loadToday();
      await loadHistory();
    } catch { toast.error("Failed to record punch"); }
    finally { setPunching(false); }
  };

  const isPunchedIn = record?.isCurrentlyIn ?? false;

  // Live elapsed timer — deducts auto-break overlap for the active session
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isPunchedIn || !record?.sessions.length) return;
    const lastIn = [...record.sessions].reverse().find(s => !s.punchOut)?.punchIn;
    if (!lastIn) return;
    const update = () => {
      const rawMs = Date.now() - new Date(lastIn).getTime();
      let breakMs = 0;
      if (record.breakWindow) {
        const today = new Date().toISOString().slice(0, 10);
        const bStart = new Date(`${today}T${record.breakWindow.from}:00`).getTime();
        const bEnd   = new Date(`${today}T${record.breakWindow.to}:00`).getTime();
        const sStart = new Date(lastIn).getTime();
        const now    = Date.now();
        const overlapStart = Math.max(sStart, bStart);
        const overlapEnd   = Math.min(now,    bEnd);
        if (overlapEnd > overlapStart) breakMs = overlapEnd - overlapStart;
      }
      setElapsed(Math.max(0, Math.floor((rawMs - breakMs) / 60000)));
    };
    update();
    const timer = setInterval(update, 30000);
    return () => clearInterval(timer);
  }, [isPunchedIn, record]);

  return (
    <div className="max-w-xl mx-auto space-y-5">
      {/* Working hours banner */}
      {schedule && (
        <div className="px-4 py-3 bg-[#0E2532] border border-[#00C2FF]/20 rounded-xl space-y-1">
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-[#00C2FF] shrink-0" />
            <div className="text-sm text-[#C8CEDB]">
              Working hours: <span className="text-[#00C2FF] font-semibold">{schedule.startTime} – {schedule.endTime}</span>
              <span className="ml-2 text-[#5A6275] text-xs">({schedule.lateGraceMinutes}min grace)</span>
            </div>
          </div>
          {schedule.defaultBreakFrom && schedule.defaultBreakTo && (
            <div className="flex items-center gap-3 pl-7">
              <span className="text-xs text-[#5A6275]">
                Break: <span className="text-[#C8CEDB] font-mono font-medium">{schedule.defaultBreakFrom} – {schedule.defaultBreakTo}</span>
                <span className="ml-1.5 text-[#3A4150]">· automatically deducted, no punch-out needed</span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Punch card */}
      <div className="bg-[#12151D] border border-[#262A35] rounded-2xl p-6 text-center space-y-4">
        <div className="flex items-center justify-center gap-2 mb-1">
          <div className={`w-2.5 h-2.5 rounded-full ${isPunchedIn ? "bg-[#0f9d58] animate-pulse" : "bg-[#5A6275]"}`} />
          <span className={`text-sm font-semibold ${isPunchedIn ? "text-[#0f9d58]" : "text-[#5A6275]"}`}>
            {isPunchedIn ? "Currently clocked in" : "Not clocked in"}
          </span>
        </div>

        {isPunchedIn && record && (
          <div className="text-4xl font-mono font-bold text-[#E6E9F0] tabular-nums">
            {fmtDuration(record.totalMinutes + elapsed)}
          </div>
        )}

        {!isPunchedIn && record?.totalMinutes != null && record.totalMinutes > 0 && (
          <div className="text-sm text-[#8A92A6]">
            Total today: <span className="text-[#E6E9F0] font-semibold font-mono">{fmtDuration(record.totalMinutes)}</span>
          </div>
        )}

        {record?.firstPunchIn && (
          <div className="flex justify-center gap-6 text-xs text-[#5A6275]">
            <span><LogIn className="w-3 h-3 inline mr-1 text-[#0f9d58]" />In: <span className="text-[#C8CEDB] font-mono">{fmtHHMM(record.firstPunchIn)}</span></span>
            {record.lastPunchOut && (
              <span><LogOut className="w-3 h-3 inline mr-1 text-[#ea4335]" />Out: <span className="text-[#C8CEDB] font-mono">{fmtHHMM(record.lastPunchOut)}</span></span>
            )}
          </div>
        )}

        {record?.isLate && (
          <div className="flex items-center justify-center gap-1.5 text-xs text-[#F59E0B]">
            <AlertCircle className="w-3.5 h-3.5" /> Punched in late
          </div>
        )}

        {/* Punch button — desktop only */}
        <div className="hidden sm:block">
          {record?.firstPunchIn && record?.lastPunchOut ? (
            // Attendance complete — both punches done, no more allowed today
            <div className="w-full py-3 rounded-xl border border-[#0f9d58]/30 bg-[#0f9d58]/10 flex items-center justify-center gap-2 text-[#0f9d58] text-sm font-semibold">
              <CheckCircle className="w-4 h-4" /> Attendance complete for today
            </div>
          ) : (
            <button
              onClick={punch}
              disabled={punching || loadingRecord}
              className={`w-full py-3 rounded-xl text-base font-bold flex items-center justify-center gap-2 transition-all ${
                isPunchedIn
                  ? "bg-[#ea4335]/15 border border-[#ea4335]/40 text-[#ea4335] hover:bg-[#ea4335]/25"
                  : "bg-[#00C2FF] text-[#06121A] hover:bg-[#0098E6]"
              } disabled:opacity-50`}
            >
              {punching ? <Loader2 className="w-5 h-5 animate-spin" /> : isPunchedIn ? <><LogOut className="w-5 h-5" /> Punch Out</> : <><LogIn className="w-5 h-5" /> Punch In</>}
            </button>
          )}
        </div>

        {/* Mobile — no punch allowed */}
        <div className="sm:hidden flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#2E333F] bg-[#1B1F2A] text-[#5A6275] text-sm">
          <Monitor className="w-4 h-4" />
          Attendance can only be recorded on desktop
        </div>

        {isMentor && (
          <p className="text-[11px] text-[#5A6275]">As a mentor, your attendance is optional. Full timesheet view is in Mentor Panel → Attendance.</p>
        )}
      </div>

      {/* History — last 6 days */}
      {history.length > 0 && (
        <div className="bg-[#12151D] border border-[#262A35] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#262A35]">
            <h3 className="text-sm font-semibold text-[#E6E9F0]">Last 6 days</h3>
          </div>
          <div className="divide-y divide-[#262A35]">
            {history.map(h => (
              <div key={h.date} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${h.firstPunchIn ? (h.isLate ? "bg-[#F59E0B]" : "bg-[#0f9d58]") : "bg-[#3A4150]"}`} />
                  <div>
                    <p className="text-xs font-medium text-[#C8CEDB]">
                      {new Date(h.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                    </p>
                    {h.firstPunchIn && (
                      <p className="text-[11px] text-[#5A6275] font-mono">
                        {fmtHHMM(h.firstPunchIn)} {h.lastPunchOut ? `→ ${fmtHHMM(h.lastPunchOut)}` : "(no punch out)"}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {h.idleFlag && <span title="No activity detected"><AlertCircle className="w-3.5 h-3.5 text-[#F59E0B]" /></span>}
                  {h.hasOverride && <span title="Manually adjusted"><Edit2 className="w-3 h-3 text-[#5A6275]" /></span>}
                  {h.firstPunchIn ? (
                    <div className="text-right">
                      <span className={`text-xs font-mono font-semibold ${h.isLate ? "text-[#F59E0B]" : "text-[#E6E9F0]"}`}>{fmtDuration(h.totalMinutes)}</span>
                      {h.breakMinutes > 0 && (
                        <p className="text-[10px] text-[#5A6275]">−{fmtDuration(h.breakMinutes)} break</p>
                      )}
                    </div>
                  ) : <span className="text-xs text-[#3A4150]">—</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MENTOR ATTENDANCE SUB-TAB ────────────────────────────────────────────────


// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-7 h-7 text-[#00C2FF] animate-spin" />
    </div>
  );
}

function EmptyState({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[#0E2532] flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-[#00C2FF]" />
      </div>
      <p className="font-semibold text-[#E6E9F0]">{title}</p>
      <p className="text-sm text-[#5A6275] mt-1 max-w-xs">{desc}</p>
    </div>
  );
}
