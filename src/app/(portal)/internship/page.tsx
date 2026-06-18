"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Megaphone, ClipboardList, Upload, MessageSquare, Bug, BarChart2,
  Plus, Pin, ChevronDown, ChevronRight, Send, Loader2, X,
  CheckCircle2, Clock, AlertTriangle, ExternalLink, RefreshCw,
  Star, Flag, Lightbulb, Shield, Circle, ArrowUpRight, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/Shell";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "announcements" | "tasks" | "submissions" | "discussion" | "findings" | "progress";

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
  files?: { name: string; url: string; type: string; size?: number }[];
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
  low:    { label: "Low",    color: "text-[#5f6368]",  bg: "bg-[#f1f3f4]",         dot: "bg-[#9aa0a6]" },
  medium: { label: "Medium", color: "text-[#1a56db]",  bg: "bg-[#e8f0fe]",         dot: "bg-[#1a56db]" },
  high:   { label: "High",   color: "text-amber-700",  bg: "bg-amber-50",           dot: "bg-amber-500" },
  urgent: { label: "Urgent", color: "text-[#ea4335]",  bg: "bg-red-50",             dot: "bg-[#ea4335]" },
};

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  submitted:          { label: "Submitted",         color: "text-[#1a56db]",  bg: "bg-[#e8f0fe]",   icon: Upload },
  under_review:       { label: "Under Review",      color: "text-amber-700",  bg: "bg-amber-50",    icon: Clock },
  approved:           { label: "Approved",          color: "text-[#0f9d58]",  bg: "bg-green-50",    icon: CheckCircle2 },
  rejected:           { label: "Rejected",          color: "text-[#ea4335]",  bg: "bg-red-50",      icon: X },
  revision_requested: { label: "Revision Needed",   color: "text-[#ff6d00]",  bg: "bg-orange-50",   icon: RefreshCw },
};

const FINDING_SEVERITY: Record<string, { label: string; color: string; bg: string }> = {
  low:      { label: "Low",      color: "text-[#5f6368]", bg: "bg-[#f1f3f4]" },
  medium:   { label: "Medium",   color: "text-[#1a56db]", bg: "bg-[#e8f0fe]" },
  high:     { label: "High",     color: "text-amber-700", bg: "bg-amber-50"   },
  critical: { label: "Critical", color: "text-[#ea4335]", bg: "bg-red-50"     },
};

const FINDING_TYPE: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  bug_report:      { label: "Bug Report",      icon: Bug,       color: "text-[#ea4335]" },
  feature_request: { label: "Feature Request", icon: Lightbulb, color: "text-[#f4b400]" },
  finding:         { label: "Security Finding",icon: Shield,    color: "text-[#1a56db]" },
};

function Avatar({ user, size = 8 }: { user: User; size?: number }) {
  const s = `w-${size} h-${size}`;
  return user.avatarUrl
    ? <img src={user.avatarUrl} alt={user.fullName} className={`${s} rounded-full object-cover shrink-0`} />
    : <div className={`${s} rounded-full bg-[#1a56db] flex items-center justify-center text-white text-[11px] font-bold shrink-0`}>{initials(user.fullName)}</div>;
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
  { id: "submissions",   label: "Submissions",   icon: Upload },
  { id: "discussion",    label: "Discussion",    icon: MessageSquare },
  { id: "findings",      label: "Findings",      icon: Bug },
  { id: "progress",      label: "Progress",      icon: BarChart2 },
];

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function InternshipHubPage() {
  const [tab, setTab] = useState<Tab>("announcements");
  const [currentUser, setCurrentUser] = useState<(User & { role: string; id: string }) | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(setCurrentUser).catch(() => null);
  }, []);

  const isMentor = currentUser && ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"].includes(currentUser.role);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        eyebrow="Nexus"
        title="Internship Hub"
        description={isMentor ? "Manage interns, assign tasks, and review submissions." : "Your workspace — tasks, submissions, discussions, and more."}
      />

      {/* Tab bar */}
      <div className="border-b border-[#e8eaed] bg-white sticky top-0 z-10">
        <div className="flex gap-1 px-6 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t.id
                  ? "border-[#1a56db] text-[#1a56db]"
                  : "border-transparent text-[#5f6368] hover:text-[#202124] hover:border-[#e8eaed]"
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[#f8f9fa] p-6">
        {currentUser && (
          <>
            {tab === "announcements" && <AnnouncementsTab isMentor={!!isMentor} userId={currentUser.id} />}
            {tab === "tasks"         && <TasksTab isMentor={!!isMentor} userId={currentUser.id} />}
            {tab === "submissions"   && <SubmissionsTab isMentor={!!isMentor} userId={currentUser.id} />}
            {tab === "discussion"    && <DiscussionTab userId={currentUser.id} currentUser={currentUser} />}
            {tab === "findings"      && <FindingsTab isMentor={!!isMentor} userId={currentUser.id} currentUser={currentUser} />}
            {tab === "progress"      && <ProgressTab isMentor={!!isMentor} userId={currentUser.id} />}
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

  const addComment = async (annId: string) => {
    const text = commentText[annId]?.trim();
    if (!text) return;
    await fetch("/api/internship/findings/comment", { // reuse comment endpoint
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
            className="flex items-center gap-1.5 px-4 py-2 bg-[#1a56db] text-white text-sm font-semibold rounded-lg hover:bg-[#1648c7] transition-colors">
            <Plus className="w-4 h-4" /> Post Announcement
          </button>
        </div>
      )}

      {showForm && (
        <div className="bg-white border border-[#e8eaed] rounded-xl p-5 space-y-3">
          <input
            className="w-full px-3 py-2 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm text-[#202124] placeholder:text-[#80868b] focus:outline-none focus:border-[#1a56db]/60 focus:ring-2 focus:ring-[#1a56db]/20"
            placeholder="Announcement title…"
            value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
          />
          <textarea
            rows={4}
            className="w-full px-3 py-2 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm text-[#202124] placeholder:text-[#80868b] focus:outline-none focus:border-[#1a56db]/60 focus:ring-2 focus:ring-[#1a56db]/20 resize-none"
            placeholder="Write your announcement…"
            value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))}
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-[#5f6368] cursor-pointer">
              <input type="checkbox" checked={form.isPinned} onChange={e => setForm(p => ({ ...p, isPinned: e.target.checked }))} className="rounded" />
              <Pin className="w-3.5 h-3.5" /> Pin this announcement
            </label>
            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-[#5f6368] hover:bg-[#f1f3f4] rounded-lg">Cancel</button>
              <button onClick={post} disabled={posting} className="px-4 py-1.5 bg-[#1a56db] text-white text-sm font-semibold rounded-lg hover:bg-[#1648c7] disabled:opacity-50">
                {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Post"}
              </button>
            </div>
          </div>
        </div>
      )}

      {items.length === 0 && <EmptyState icon={Megaphone} title="No announcements yet" desc="Your mentor will post updates, tasks and notices here." />}

      {items.map(ann => (
        <div key={ann.id} className={`bg-white border rounded-xl overflow-hidden ${ann.isPinned ? "border-[#1a56db]/30 shadow-sm" : "border-[#e8eaed]"}`}>
          {ann.isPinned && (
            <div className="flex items-center gap-1.5 px-4 py-1.5 bg-[#e8f0fe] text-[#1a56db] text-xs font-semibold">
              <Pin className="w-3 h-3" /> Pinned
            </div>
          )}
          <div className="p-5">
            <div className="flex items-start justify-between gap-3 mb-2">
              <h3 className="font-semibold text-[#202124]">{ann.title}</h3>
              <span className="text-xs text-[#80868b] shrink-0">{fmt(ann.createdAt)}</span>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <Avatar user={ann.author} size={6} />
              <span className="text-xs text-[#5f6368]">{ann.author.fullName}</span>
            </div>
            <p className="text-sm text-[#3c4043] leading-relaxed whitespace-pre-wrap">{ann.body}</p>

            {/* Reactions */}
            <div className="flex items-center gap-2 mt-4">
              {["👍", "🙌", "❤️", "🎯"].map(emoji => {
                const count = ann.reactions.filter(r => r.emoji === emoji).length;
                const mine = ann.reactions.some(r => r.emoji === emoji && r.userId === userId);
                return (
                  <button key={emoji} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-sm border transition-colors ${mine ? "border-[#1a56db] bg-[#e8f0fe]" : "border-[#e8eaed] hover:bg-[#f1f3f4]"}`}>
                    {emoji} {count > 0 && <span className="text-xs text-[#5f6368]">{count}</span>}
                  </button>
                );
              })}
              <button onClick={() => setExpanded(p => ({ ...p, [ann.id]: !p[ann.id] }))}
                className="ml-auto text-xs text-[#5f6368] hover:text-[#202124] flex items-center gap-1">
                <MessageSquare className="w-3.5 h-3.5" />
                {ann.comments.length} comment{ann.comments.length !== 1 ? "s" : ""}
                {expanded[ann.id] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>
            </div>

            {expanded[ann.id] && (
              <div className="mt-4 space-y-3 border-t border-[#f1f3f4] pt-4">
                {ann.comments.map(c => (
                  <div key={c.id} className="flex gap-2">
                    <Avatar user={c.author} size={6} />
                    <div className="flex-1 bg-[#f8f9fa] rounded-lg px-3 py-2">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-xs font-semibold text-[#202124]">{c.author.fullName}</span>
                        <span className="text-[10px] text-[#80868b]">{fmtTime(c.createdAt)}</span>
                      </div>
                      <p className="text-sm text-[#3c4043]">{c.body}</p>
                    </div>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input
                    className="flex-1 px-3 py-1.5 bg-[#f1f3f4] border border-[#e8eaed] rounded-lg text-sm placeholder:text-[#80868b] focus:outline-none focus:border-[#1a56db]/60"
                    placeholder="Add a comment…"
                    value={commentText[ann.id] ?? ""}
                    onChange={e => setCommentText(p => ({ ...p, [ann.id]: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && addComment(ann.id)}
                  />
                  <button onClick={() => addComment(ann.id)} className="px-3 py-1.5 bg-[#1a56db] text-white rounded-lg hover:bg-[#1648c7]">
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
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", deadline: "", assigneeIds: [] as string[] });
  const [creating, setCreating] = useState(false);
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
      const res = await fetch("/api/internship/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, deadline: form.deadline || null }),
      });
      if (!res.ok) throw new Error();
      toast.success("Task created");
      setForm({ title: "", description: "", priority: "medium", deadline: "", assigneeIds: [] });
      setShowForm(false);
      load();
    } catch { toast.error("Failed to create task"); }
    finally { setCreating(false); }
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
            className="flex items-center gap-1.5 px-4 py-2 bg-[#1a56db] text-white text-sm font-semibold rounded-lg hover:bg-[#1648c7] transition-colors">
            <Plus className="w-4 h-4" /> New Task
          </button>
        </div>
      )}

      {showForm && (
        <div className="bg-white border border-[#e8eaed] rounded-xl p-5 space-y-3">
          <h3 className="font-semibold text-[#202124]">Create Task</h3>
          <input className="w-full px-3 py-2 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm text-[#202124] placeholder:text-[#80868b] focus:outline-none focus:border-[#1a56db]/60 focus:ring-2 focus:ring-[#1a56db]/20"
            placeholder="Task title…" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
          <textarea rows={3}
            className="w-full px-3 py-2 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm text-[#202124] placeholder:text-[#80868b] focus:outline-none focus:border-[#1a56db]/60 focus:ring-2 focus:ring-[#1a56db]/20 resize-none"
            placeholder="Description…" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#5f6368] mb-1">Priority</label>
              <select className="w-full px-3 py-2 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm text-[#202124] focus:outline-none focus:border-[#1a56db]/60"
                value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}>
                <option value="low">Low</option><option value="medium">Medium</option>
                <option value="high">High</option><option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5f6368] mb-1">Deadline</label>
              <input type="datetime-local" className="w-full px-3 py-2 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm text-[#202124] focus:outline-none focus:border-[#1a56db]/60"
                value={form.deadline} onChange={e => setForm(p => ({ ...p, deadline: e.target.value }))} />
            </div>
          </div>
          {interns.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-[#5f6368] mb-2">Assign to interns</label>
              <div className="flex flex-wrap gap-2">
                {interns.map(intern => (
                  <button key={intern.id}
                    onClick={() => setForm(p => ({
                      ...p, assigneeIds: p.assigneeIds.includes(intern.id)
                        ? p.assigneeIds.filter(id => id !== intern.id)
                        : [...p.assigneeIds, intern.id],
                    }))}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      form.assigneeIds.includes(intern.id)
                        ? "border-[#1a56db] bg-[#e8f0fe] text-[#1a56db]"
                        : "border-[#e8eaed] text-[#5f6368] hover:bg-[#f1f3f4]"
                    }`}>
                    {intern.fullName}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-[#5f6368] hover:bg-[#f1f3f4] rounded-lg">Cancel</button>
            <button onClick={createTask} disabled={creating} className="px-4 py-1.5 bg-[#1a56db] text-white text-sm font-semibold rounded-lg hover:bg-[#1648c7] disabled:opacity-50">
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
              <span className="text-xs text-[#80868b]">{group.length} task{group.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="space-y-2">
              {group.map(task => (
                <div key={task.id}
                  onClick={() => setSelected(task)}
                  className="bg-white border border-[#e8eaed] rounded-xl p-4 cursor-pointer hover:border-[#1a56db]/30 hover:shadow-sm transition-all group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-[#202124] group-hover:text-[#1a56db] transition-colors truncate">{task.title}</h4>
                      <p className="text-sm text-[#5f6368] mt-0.5 line-clamp-2">{task.description}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#9aa0a6] shrink-0 mt-0.5" />
                  </div>
                  <div className="flex items-center gap-3 mt-3 flex-wrap">
                    {task.deadline && (
                      <span className={`flex items-center gap-1 text-xs ${isPast(task.deadline) ? "text-[#ea4335]" : "text-[#80868b]"}`}>
                        <Clock className="w-3 h-3" />
                        {isPast(task.deadline) ? "Overdue — " : ""}{fmt(task.deadline)}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-xs text-[#80868b]">
                      <Upload className="w-3 h-3" /> {task.submissions.length} submission{task.submissions.length !== 1 ? "s" : ""}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-[#80868b]">
                      <MessageSquare className="w-3 h-3" /> {task._count.discussions}
                    </span>
                    {task.assigneeIds.length > 0 && (
                      <span className="text-xs text-[#80868b]">{task.assigneeIds.length} assignee{task.assigneeIds.length !== 1 ? "s" : ""}</span>
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
    if (!subForm.notes.trim() && !subForm.links.trim()) { toast.error("Add a note or link"); return; }
    setSubmitting(true);
    try {
      const links = subForm.links.split("\n").map(l => l.trim()).filter(Boolean);
      await fetch("/api/internship/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, notes: subForm.notes, links }),
      });
      toast.success("Submitted!");
      setSubForm({ notes: "", links: "" });
      const updated = await fetch(`/api/internship/tasks/${task.id}`).then(r => r.json());
      setTask(updated);
    } catch { toast.error("Submission failed"); }
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
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-[#5f6368] hover:text-[#202124] mb-4 transition-colors">
        ← Back to tasks
      </button>

      <div className="bg-white border border-[#e8eaed] rounded-xl p-6 mb-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <PriorityBadge p={task.priority} />
              {task.deadline && <span className={`text-xs ${isPast(task.deadline) ? "text-[#ea4335]" : "text-[#80868b]"}`}><Clock className="w-3 h-3 inline mr-0.5" />{fmt(task.deadline)}</span>}
            </div>
            <h2 className="text-lg font-semibold text-[#202124]">{task.title}</h2>
            <p className="text-sm text-[#5f6368] mt-2 leading-relaxed whitespace-pre-wrap">{task.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#80868b]">
          <Avatar user={task.createdBy} size={5} />
          Posted by {task.createdBy.fullName} · {fmt(task.createdAt)}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Submit / Submissions */}
        <div className="space-y-4">
          {!isMentor && (
            <div className="bg-white border border-[#e8eaed] rounded-xl p-5">
              <h3 className="font-semibold text-[#202124] mb-3 flex items-center gap-2"><Upload className="w-4 h-4 text-[#1a56db]" /> Submit Work</h3>
              <textarea rows={3}
                className="w-full px-3 py-2 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm text-[#202124] placeholder:text-[#80868b] focus:outline-none focus:border-[#1a56db]/60 resize-none mb-2"
                placeholder="Notes about your submission…"
                value={subForm.notes} onChange={e => setSubForm(p => ({ ...p, notes: e.target.value }))} />
              <textarea rows={2}
                className="w-full px-3 py-2 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm text-[#202124] placeholder:text-[#80868b] focus:outline-none focus:border-[#1a56db]/60 resize-none mb-3"
                placeholder="GitHub / links (one per line)…"
                value={subForm.links} onChange={e => setSubForm(p => ({ ...p, links: e.target.value }))} />
              <button onClick={submit} disabled={submitting}
                className="w-full px-4 py-2 bg-[#1a56db] text-white text-sm font-semibold rounded-lg hover:bg-[#1648c7] disabled:opacity-50 flex items-center justify-center gap-2">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Upload className="w-4 h-4" /> Submit</>}
              </button>
            </div>
          )}

          {/* Submissions list */}
          {mySubmissions.length > 0 && (
            <div className="bg-white border border-[#e8eaed] rounded-xl p-5">
              <h3 className="font-semibold text-[#202124] mb-3">Submissions</h3>
              <div className="space-y-3">
                {mySubmissions.map(sub => (
                  <SubmissionCard key={sub.id} sub={sub} isMentor={isMentor} onReview={reviewSub} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Discussion */}
        <div className="bg-white border border-[#e8eaed] rounded-xl p-5 flex flex-col">
          <h3 className="font-semibold text-[#202124] mb-3 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-[#1a56db]" /> Discussion</h3>
          {detailLoading ? <LoadingSpinner /> : (
            <>
              <div className="flex-1 space-y-3 max-h-80 overflow-y-auto mb-3">
                {discussions.length === 0 && <p className="text-sm text-[#9aa0a6] text-center py-4">No messages yet — start the conversation!</p>}
                {discussions.map(d => (
                  <div key={d.id} className="flex gap-2">
                    <Avatar user={d.author} size={7} />
                    <div className="flex-1">
                      <div className="flex items-baseline gap-2 mb-0.5">
                        <span className="text-xs font-semibold text-[#202124]">{d.author.fullName}</span>
                        {d.author.role && ["ADMIN","CEO","CISO","R_AND_D","COO","OPS_MANAGER"].includes(d.author.role) && (
                          <span className="text-[10px] bg-[#e8f0fe] text-[#1a56db] px-1.5 rounded font-medium">Mentor</span>
                        )}
                        <span className="text-[10px] text-[#80868b]">{fmtTime(d.createdAt)}</span>
                        {d.isPinned && <Pin className="w-3 h-3 text-[#1a56db]" />}
                      </div>
                      <div className="bg-[#f8f9fa] rounded-lg px-3 py-2 text-sm text-[#3c4043]">{d.body}</div>
                      {d.replies.length > 0 && (
                        <div className="mt-2 ml-4 space-y-2 border-l-2 border-[#e8eaed] pl-3">
                          {d.replies.map(r => (
                            <div key={r.id} className="flex gap-1.5">
                              <Avatar user={r.author} size={5} />
                              <div className="flex-1 bg-[#f8f9fa] rounded-lg px-2 py-1.5 text-xs text-[#3c4043]">{r.body}</div>
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
                  className="flex-1 px-3 py-2 bg-[#f1f3f4] border border-[#e8eaed] rounded-lg text-sm placeholder:text-[#80868b] focus:outline-none focus:border-[#1a56db]/60"
                  placeholder="Message…"
                  value={msgForm} onChange={e => setMsgForm(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMsg()}
                />
                <button onClick={sendMsg} disabled={sending}
                  className="px-3 py-2 bg-[#1a56db] text-white rounded-lg hover:bg-[#1648c7] disabled:opacity-50">
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

function SubmissionCard({ sub, isMentor, onReview }: { sub: Submission; isMentor: boolean; onReview: (id: string, verdict: string, comment: string) => void }) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [verdict, setVerdict] = useState("approved");
  const [comment, setComment] = useState("");
  const latestReview = sub.reviews?.[0];

  return (
    <div className="border border-[#e8eaed] rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {sub.submitter && <Avatar user={sub.submitter} size={5} />}
          <span className="text-xs font-medium text-[#202124]">v{sub.version}</span>
          <StatusBadge s={sub.status} />
        </div>
        <span className="text-[10px] text-[#80868b]">{fmt(sub.createdAt)}</span>
      </div>
      {sub.notes && <p className="text-xs text-[#5f6368] mb-2">{sub.notes}</p>}
      {sub.links.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {sub.links.map((l, i) => (
            <a key={i} href={l} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-xs text-[#1a56db] hover:underline">
              <ExternalLink className="w-3 h-3" /> {l.replace(/^https?:\/\//, "").slice(0, 30)}…
            </a>
          ))}
        </div>
      )}
      {latestReview && (
        <div className={`text-xs rounded p-2 mb-2 ${latestReview.verdict === "approved" ? "bg-green-50 text-[#0f9d58]" : latestReview.verdict === "rejected" ? "bg-red-50 text-[#ea4335]" : "bg-orange-50 text-[#ff6d00]"}`}>
          {latestReview.verdict.replace("_", " ")} by {latestReview.reviewer.fullName}
          {latestReview.comment && <span> — {latestReview.comment}</span>}
          {latestReview.score != null && <span className="ml-1 font-semibold">[{latestReview.score}/100]</span>}
        </div>
      )}
      {isMentor && sub.status === "submitted" && (
        reviewOpen ? (
          <div className="space-y-2 mt-2">
            <select className="w-full px-2 py-1 bg-[#f1f3f4] border border-[#d0d5dd] rounded text-xs"
              value={verdict} onChange={e => setVerdict(e.target.value)}>
              <option value="approved">Approve</option>
              <option value="revision_requested">Request Revision</option>
              <option value="rejected">Reject</option>
            </select>
            <input className="w-full px-2 py-1 bg-[#f1f3f4] border border-[#d0d5dd] rounded text-xs placeholder:text-[#80868b]"
              placeholder="Feedback (optional)…" value={comment} onChange={e => setComment(e.target.value)} />
            <div className="flex gap-1.5">
              <button onClick={() => onReview(sub.id, verdict, comment)}
                className="flex-1 px-2 py-1 bg-[#1a56db] text-white text-xs font-semibold rounded">Submit Review</button>
              <button onClick={() => setReviewOpen(false)} className="px-2 py-1 text-xs text-[#5f6368] hover:bg-[#f1f3f4] rounded">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setReviewOpen(true)}
            className="text-xs text-[#1a56db] hover:underline font-medium">Review this submission →</button>
        )
      )}
    </div>
  );
}

// ─── SUBMISSIONS TAB ──────────────────────────────────────────────────────────

function SubmissionsTab({ isMentor, userId }: { isMentor: boolean; userId: string }) {
  const [subs, setSubs] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/internship/submissions")
      .then(r => r.json()).then(setSubs).catch(() => setSubs([])).finally(() => setLoading(false));
  }, []);

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
          <h3 className="text-sm font-semibold text-[#202124] mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#1a56db]" /> Awaiting Review ({pending.length})
          </h3>
          <div className="space-y-3">
            {pending.map(s => <SubmissionRow key={s.id} sub={s} />)}
          </div>
        </div>
      )}
      {reviewed.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[#202124] mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#9aa0a6]" /> Reviewed ({reviewed.length})
          </h3>
          <div className="space-y-3">
            {reviewed.map(s => <SubmissionRow key={s.id} sub={s} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function SubmissionRow({ sub }: { sub: Submission }) {
  const latestReview = sub.reviews?.[0];
  return (
    <div className="bg-white border border-[#e8eaed] rounded-xl p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="font-medium text-[#202124] text-sm">{sub.task?.title ?? "—"}</p>
          <div className="flex items-center gap-2 mt-1">
            {sub.submitter && <><Avatar user={sub.submitter} size={5} /><span className="text-xs text-[#5f6368]">{sub.submitter.fullName}</span></>}
            <span className="text-xs text-[#80868b]">v{sub.version}</span>
          </div>
        </div>
        <StatusBadge s={sub.status} />
      </div>
      {sub.notes && <p className="text-xs text-[#5f6368] mt-1 mb-2">{sub.notes}</p>}
      {latestReview && (
        <div className="text-xs text-[#5f6368] mt-2 bg-[#f8f9fa] rounded p-2">
          {latestReview.reviewer.fullName}: {latestReview.comment ?? latestReview.verdict}
          {latestReview.score != null && <span className="ml-1 font-semibold text-[#1a56db]">[{latestReview.score}/100]</span>}
        </div>
      )}
      <div className="text-[10px] text-[#80868b] mt-2">{fmt(sub.createdAt)}</div>
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

  if (loading) return <LoadingSpinner />;

  return (
    <div className="max-w-2xl mx-auto flex flex-col h-[calc(100vh-280px)] min-h-96">
      <div className="flex-1 bg-white border border-[#e8eaed] rounded-xl overflow-y-auto p-4 space-y-3 mb-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <MessageSquare className="w-10 h-10 text-[#dadce0] mb-3" />
            <p className="text-sm font-medium text-[#202124]">General Discussion</p>
            <p className="text-xs text-[#80868b] mt-1">Start the conversation — ask questions, share updates, tag mentors.</p>
          </div>
        )}
        {messages.map(msg => {
          const isMe = msg.author.id === userId;
          return (
            <div key={msg.id} className={`flex gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
              <Avatar user={msg.author} size={7} />
              <div className={`max-w-[80%] ${isMe ? "items-end" : "items-start"} flex flex-col`}>
                <div className="flex items-center gap-2 mb-0.5">
                  {!isMe && <span className="text-xs font-semibold text-[#202124]">{msg.author.fullName}</span>}
                  {isMentorRole(msg.author.role) && <span className="text-[10px] bg-[#e8f0fe] text-[#1a56db] px-1.5 rounded font-medium">Mentor</span>}
                  {msg.isPinned && <Pin className="w-3 h-3 text-[#1a56db]" />}
                  <span className="text-[10px] text-[#80868b]">{fmtTime(msg.createdAt)}</span>
                </div>
                <div className={`px-3 py-2 rounded-2xl text-sm ${isMe ? "bg-[#1a56db] text-white rounded-tr-sm" : "bg-[#f1f3f4] text-[#202124] rounded-tl-sm"}`}>
                  {msg.body}
                </div>
                {msg.replies.length > 0 && (
                  <div className="mt-2 ml-2 space-y-1.5 w-full">
                    {msg.replies.map(r => (
                      <div key={r.id} className="flex gap-1.5">
                        <Avatar user={r.author} size={5} />
                        <div className="bg-[#f8f9fa] border border-[#e8eaed] rounded-xl px-3 py-1.5 text-xs text-[#3c4043] flex-1">
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
          className="flex-1 px-4 py-2.5 bg-white border border-[#e8eaed] rounded-xl text-sm placeholder:text-[#80868b] focus:outline-none focus:border-[#1a56db]/60 focus:ring-2 focus:ring-[#1a56db]/20"
          placeholder="Type a message… (Enter to send)"
          value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
        />
        <button onClick={send} disabled={sending}
          className="px-4 py-2.5 bg-[#1a56db] text-white rounded-xl hover:bg-[#1648c7] disabled:opacity-50 transition-colors">
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
  const [statusUpdate, setStatusUpdate] = useState<Record<string, string>>({});
  const [commentText, setCommentText] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const url = typeFilter !== "all" ? `/api/internship/findings?type=${typeFilter}` : "/api/internship/findings";
    const res = await fetch(url);
    setFindings(await res.json());
    setLoading(false);
  }, [typeFilter]);

  useEffect(() => { load(); }, [load]);

  const post = async () => {
    if (!form.title.trim() || !form.description.trim()) return;
    setPosting(true);
    try {
      await fetch("/api/internship/findings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      toast.success("Submitted!");
      setForm({ type: "bug_report", title: "", description: "", severity: "medium", steps: "", useCase: "" });
      setShowForm(false);
      load();
    } catch { toast.error("Failed"); }
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
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${typeFilter === t.id ? "bg-[#e8f0fe] text-[#1a56db]" : "text-[#5f6368] hover:bg-[#f1f3f4]"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a56db] text-white text-xs font-semibold rounded-lg hover:bg-[#1648c7] transition-colors">
          <Plus className="w-3.5 h-3.5" /> Report
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-[#e8eaed] rounded-xl p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#5f6368] mb-1">Type</label>
              <select className="w-full px-3 py-2 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm text-[#202124] focus:outline-none focus:border-[#1a56db]/60"
                value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                <option value="bug_report">Bug Report</option>
                <option value="feature_request">Feature Request</option>
                <option value="finding">Security Finding</option>
              </select>
            </div>
            {form.type !== "feature_request" && (
              <div>
                <label className="block text-xs font-medium text-[#5f6368] mb-1">Severity</label>
                <select className="w-full px-3 py-2 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm text-[#202124] focus:outline-none focus:border-[#1a56db]/60"
                  value={form.severity} onChange={e => setForm(p => ({ ...p, severity: e.target.value }))}>
                  <option value="low">Low</option><option value="medium">Medium</option>
                  <option value="high">High</option><option value="critical">Critical</option>
                </select>
              </div>
            )}
          </div>
          <input className="w-full px-3 py-2 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm text-[#202124] placeholder:text-[#80868b] focus:outline-none focus:border-[#1a56db]/60 focus:ring-2 focus:ring-[#1a56db]/20"
            placeholder="Title…" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
          <textarea rows={3}
            className="w-full px-3 py-2 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm text-[#202124] placeholder:text-[#80868b] focus:outline-none focus:border-[#1a56db]/60 resize-none"
            placeholder="Description…" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          {form.type === "bug_report" && (
            <textarea rows={2}
              className="w-full px-3 py-2 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm text-[#202124] placeholder:text-[#80868b] focus:outline-none focus:border-[#1a56db]/60 resize-none"
              placeholder="Steps to reproduce…" value={form.steps} onChange={e => setForm(p => ({ ...p, steps: e.target.value }))} />
          )}
          {form.type === "feature_request" && (
            <textarea rows={2}
              className="w-full px-3 py-2 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm text-[#202124] placeholder:text-[#80868b] focus:outline-none focus:border-[#1a56db]/60 resize-none"
              placeholder="Use case / expected benefit…" value={form.useCase} onChange={e => setForm(p => ({ ...p, useCase: e.target.value }))} />
          )}
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-[#5f6368] hover:bg-[#f1f3f4] rounded-lg">Cancel</button>
            <button onClick={post} disabled={posting} className="px-4 py-1.5 bg-[#1a56db] text-white text-sm font-semibold rounded-lg hover:bg-[#1648c7] disabled:opacity-50">
              {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit"}
            </button>
          </div>
        </div>
      )}

      {findings.length === 0 && <EmptyState icon={Bug} title="No findings yet" desc="Report bugs, feature ideas, or security observations." />}

      <div className="space-y-3">
        {findings.map(f => {
          const TypeIcon = FINDING_TYPE[f.type]?.icon ?? Bug;
          const typeColor = FINDING_TYPE[f.type]?.color ?? "text-[#5f6368]";
          const isExpanded = expanded === f.id;
          return (
            <div key={f.id} className="bg-white border border-[#e8eaed] rounded-xl overflow-hidden">
              <div className="p-4 cursor-pointer" onClick={() => setExpanded(isExpanded ? null : f.id)}>
                <div className="flex items-start gap-3">
                  <TypeIcon className={`w-4 h-4 mt-0.5 shrink-0 ${typeColor}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-xs font-semibold ${typeColor}`}>{FINDING_TYPE[f.type]?.label}</span>
                      <SeverityBadge s={f.severity} />
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        f.status === "open" ? "bg-[#e8f0fe] text-[#1a56db]" :
                        f.status === "resolved" ? "bg-green-50 text-[#0f9d58]" :
                        "bg-[#f1f3f4] text-[#5f6368]"
                      }`}>{f.status}</span>
                    </div>
                    <h4 className="font-semibold text-[#202124] text-sm">{f.title}</h4>
                    <p className="text-xs text-[#5f6368] mt-0.5 line-clamp-2">{f.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1">
                      <Avatar user={f.submitter} size={5} />
                      <span className="text-xs text-[#80868b] hidden sm:block">{f.submitter.fullName}</span>
                    </div>
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-[#9aa0a6]" /> : <ChevronRight className="w-4 h-4 text-[#9aa0a6]" />}
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-[#f1f3f4] p-4 space-y-4 bg-[#fafafa]">
                  <p className="text-sm text-[#3c4043] whitespace-pre-wrap">{f.description}</p>
                  {f.steps && <div><span className="text-xs font-semibold text-[#5f6368]">Steps to reproduce:</span><p className="text-sm text-[#3c4043] mt-1 whitespace-pre-wrap">{f.steps}</p></div>}
                  {f.useCase && <div><span className="text-xs font-semibold text-[#5f6368]">Use case:</span><p className="text-sm text-[#3c4043] mt-1">{f.useCase}</p></div>}

                  {/* Comments */}
                  {f.comments.length > 0 && (
                    <div className="space-y-2">
                      {f.comments.map(c => (
                        <div key={c.id} className="flex gap-2">
                          <Avatar user={c.author} size={6} />
                          <div className="flex-1 bg-white border border-[#e8eaed] rounded-lg px-3 py-2">
                            <div className="flex items-baseline gap-2 mb-0.5">
                              <span className="text-xs font-semibold text-[#202124]">{c.author.fullName}</span>
                              <span className="text-[10px] text-[#80868b]">{fmt(c.createdAt)}</span>
                            </div>
                            <p className="text-sm text-[#3c4043]">{c.body}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Mentor controls */}
                  {isMentor && (
                    <div className="flex gap-2 items-center flex-wrap">
                      <select className="px-2 py-1.5 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-xs text-[#202124]"
                        value={statusUpdate[f.id] ?? f.status}
                        onChange={e => setStatusUpdate(p => ({ ...p, [f.id]: e.target.value }))}>
                        <option value="open">Open</option><option value="in_review">In Review</option>
                        <option value="resolved">Resolved</option><option value="closed">Closed</option>
                      </select>
                      <input className="flex-1 min-w-32 px-2 py-1.5 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-xs placeholder:text-[#80868b]"
                        placeholder="Add comment…"
                        value={commentText[f.id] ?? ""} onChange={e => setCommentText(p => ({ ...p, [f.id]: e.target.value }))} />
                      <button onClick={() => updateFinding(f.id)}
                        className="px-3 py-1.5 bg-[#1a56db] text-white text-xs font-semibold rounded-lg">Update</button>
                    </div>
                  )}

                  {/* Intern can also add a comment */}
                  {!isMentor && (
                    <div className="flex gap-2">
                      <input className="flex-1 px-3 py-1.5 bg-white border border-[#e8eaed] rounded-lg text-xs placeholder:text-[#80868b]"
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
                      <button className="px-3 py-1.5 bg-[#1a56db] text-white rounded-lg" onClick={async () => {
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
            { label: "Active Interns", value: s.internCount, color: "text-[#1a56db]", bg: "bg-[#e8f0fe]", icon: Sparkles },
            { label: "Total Tasks",    value: s.taskCount,   color: "text-[#0f9d58]", bg: "bg-green-50",   icon: ClipboardList },
            { label: "Pending Review", value: s.pendingReviews, color: "text-amber-700", bg: "bg-amber-50", icon: Clock },
            { label: "Open Findings",  value: s.openFindings, color: "text-[#ea4335]",  bg: "bg-red-50",   icon: Bug },
          ].map(m => (
            <div key={m.label} className="bg-white border border-[#e8eaed] rounded-xl p-4">
              <div className={`inline-flex p-2 rounded-lg ${m.bg} mb-3`}><m.icon className={`w-4 h-4 ${m.color}`} /></div>
              <div className={`text-2xl font-bold ${m.color}`}>{m.value}</div>
              <div className="text-xs text-[#5f6368] mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>

        {/* Per-intern table */}
        <div className="bg-white border border-[#e8eaed] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#e8eaed]">
            <h3 className="font-semibold text-[#202124]">Intern Overview</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e8eaed] bg-[#f8f9fa]">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#5f6368]">Intern</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#5f6368]">Assigned</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#5f6368]">Submitted</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#5f6368]">Approved</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#5f6368]">Messages</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#5f6368]">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f3f4]">
                {s.internStats.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-[#9aa0a6]">No interns yet — create intern accounts from Users.</td></tr>
                )}
                {s.internStats.map(({ intern, assigned, submitted, approved, discussions }) => {
                  const score = assigned > 0 ? Math.round((approved / assigned) * 100) : null;
                  return (
                    <tr key={intern.id} className="hover:bg-[#f8f9fa]">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar user={intern} size={7} />
                          <div>
                            <p className="font-medium text-[#202124]">{intern.fullName}</p>
                            <p className="text-xs text-[#80868b]">{intern.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="text-center px-4 py-3 font-semibold text-[#202124]">{assigned}</td>
                      <td className="text-center px-4 py-3 font-semibold text-[#202124]">{submitted}</td>
                      <td className="text-center px-4 py-3">
                        <span className={`font-semibold ${approved > 0 ? "text-[#0f9d58]" : "text-[#9aa0a6]"}`}>{approved}</span>
                      </td>
                      <td className="text-center px-4 py-3 text-[#202124]">{discussions}</td>
                      <td className="text-center px-4 py-3">
                        {score !== null ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <div className="w-12 h-1.5 bg-[#e8eaed] rounded-full overflow-hidden">
                              <div className="h-full bg-[#1a56db] rounded-full" style={{ width: `${score}%` }} />
                            </div>
                            <span className="text-xs font-semibold text-[#1a56db]">{score}%</span>
                          </div>
                        ) : <span className="text-xs text-[#9aa0a6]">—</span>}
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
          { label: "Tasks Assigned",   value: s.assigned,     color: "text-[#1a56db]",  bg: "bg-[#e8f0fe]",  icon: ClipboardList },
          { label: "Submitted",        value: s.submitted,    color: "text-amber-700",  bg: "bg-amber-50",   icon: Upload },
          { label: "Approved",         value: s.approved,     color: "text-[#0f9d58]",  bg: "bg-green-50",   icon: CheckCircle2 },
          { label: "Pending Review",   value: s.pendingReview,color: "text-[#ff6d00]",  bg: "bg-orange-50",  icon: Clock },
          { label: "Findings Filed",   value: s.findings,     color: "text-[#ea4335]",  bg: "bg-red-50",     icon: Bug },
          { label: "Completion Rate",  value: `${completionRate}%`, color: "text-[#1a56db]", bg: "bg-[#e8f0fe]", icon: Star },
        ].map(m => (
          <div key={m.label} className="bg-white border border-[#e8eaed] rounded-xl p-4">
            <div className={`inline-flex p-2 rounded-lg ${m.bg} mb-3`}><m.icon className={`w-4 h-4 ${m.color}`} /></div>
            <div className={`text-2xl font-bold ${m.color}`}>{m.value}</div>
            <div className="text-xs text-[#5f6368] mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="bg-white border border-[#e8eaed] rounded-xl p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-[#202124]">Overall Progress</span>
          <span className="text-sm font-bold text-[#1a56db]">{completionRate}%</span>
        </div>
        <div className="w-full h-2.5 bg-[#e8eaed] rounded-full overflow-hidden">
          <div className="h-full bg-[#1a56db] rounded-full transition-all" style={{ width: `${completionRate}%` }} />
        </div>
        <p className="text-xs text-[#80868b] mt-2">{s.approved} of {s.assigned} tasks approved</p>
      </div>

      {/* Recent reviews */}
      {s.recentReviews.length > 0 && (
        <div className="bg-white border border-[#e8eaed] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#e8eaed]">
            <h3 className="font-semibold text-[#202124]">Recent Feedback</h3>
          </div>
          <div className="divide-y divide-[#f1f3f4]">
            {s.recentReviews.map(r => (
              <div key={r.id} className="px-5 py-4 flex items-start gap-3">
                <Avatar user={r.reviewer} size={7} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-[#202124]">{r.reviewer.fullName}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      r.verdict === "approved" ? "bg-green-50 text-[#0f9d58]" :
                      r.verdict === "rejected" ? "bg-red-50 text-[#ea4335]" : "bg-orange-50 text-[#ff6d00]"
                    }`}>{r.verdict.replace("_", " ")}</span>
                    {r.score != null && <span className="text-xs font-bold text-[#1a56db]">{r.score}/100</span>}
                  </div>
                  <p className="text-xs text-[#80868b]">on &ldquo;{r.submission.task.title}&rdquo;</p>
                  {r.comment && <p className="text-sm text-[#3c4043] mt-1">{r.comment}</p>}
                </div>
                <span className="text-[10px] text-[#80868b] shrink-0">{fmt(r.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-7 h-7 text-[#1a56db] animate-spin" />
    </div>
  );
}

function EmptyState({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[#e8f0fe] flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-[#1a56db]" />
      </div>
      <p className="font-semibold text-[#202124]">{title}</p>
      <p className="text-sm text-[#80868b] mt-1 max-w-xs">{desc}</p>
    </div>
  );
}
