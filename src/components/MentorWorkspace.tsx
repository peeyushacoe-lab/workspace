"use client";

// Mentor workspace — curriculum (weeks), attendance management, and HR records.
// Extracted from the Internship Hub page so it can be mounted at the /mentor route
// (Next.js does not allow non-default exports from a page.tsx module).

import React, { useState, useEffect, useCallback } from "react";
import {
  Plus, Trash2, X, BookOpen, CalendarClock, UserCheck, GraduationCap,
  Pencil, Loader2, Save, AlertTriangle, CheckCircle2, Lock, Unlock,
  RefreshCw, Clock, ChevronLeft, ChevronRight, AlertCircle, Timer,
  Edit2, MapPin, Monitor, CheckCircle,
} from "lucide-react";
import { toast } from "sonner";
import { avatarGradient } from "@/lib/avatar";

// ─── Types ────────────────────────────────────────────────────────────────────

interface User { id: string; fullName: string; avatarUrl?: string | null; role?: string; }
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
interface AttendanceSchedule {
  startTime: string; endTime: string; timezone: string; lateGraceMinutes: number;
  defaultBreakFrom: string; defaultBreakTo: string; updatedBy: string | null; updatedAt: string | null;
}
interface AttendanceSession { punchIn: string; punchOut: string | null; sessionId: string; location: { lat: number; lng: number; accuracy: number } | null; device: string | null; }
interface BreakPeriod { from: string; to: string; label?: string | null; }
interface AttendanceRecord {
  intern: { id: string; fullName: string; avatarUrl?: string | null };
  date: string; sessions: AttendanceSession[];
  firstPunchIn: string | null; lastPunchOut: string | null;
  totalMinutes: number; breakMinutes: number; autoBreakMinutes: number;
  breakWindow: { from: string; to: string } | null; breaks: BreakPeriod[];
  isCurrentlyIn: boolean; isLate: boolean; idleFlag: boolean; activityCount: number;
  hasOverride: boolean; overrideReason: string | null;
  punchLocation: { lat: number; lng: number; accuracy: number } | null; punchDevice: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const qid = () => `q_${Math.random().toString(36).slice(2, 10)}`;
function initials(name: string) { return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2); }
function fmt(iso: string) { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
function fmtHHMM(iso: string) { return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); }
function fmtDuration(minutes: number) { if (minutes <= 0) return "0m"; const h = Math.floor(minutes / 60); const m = minutes % 60; return h > 0 ? `${h}h ${m}m` : `${m}m`; }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function toLocalDatetimeInput(iso: string): string { const d = new Date(iso); const pad = (n: number) => n.toString().padStart(2, "0"); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }

function Avatar({ user, size = 8 }: { user: User; size?: number }) {
  const s = `w-${size} h-${size}`;
  return user.avatarUrl
    ? <img src={user.avatarUrl} alt={user.fullName} className={`${s} rounded-full object-cover shrink-0`} />
    : <div className={`${s} rounded-full flex items-center justify-center text-white text-[11px] font-semibold shrink-0`} style={{ background: avatarGradient(user.fullName) }}>{initials(user.fullName)}</div>;
}
function LoadingSpinner() {
  return (<div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-[#00C2FF] animate-spin" /></div>);
}
function EmptyState({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[#0E2532] flex items-center justify-center mb-4"><Icon className="w-7 h-7 text-[#00C2FF]" /></div>
      <p className="font-semibold text-[#E6E9F0]">{title}</p>
      <p className="text-sm text-[#5A6275] mt-1 max-w-xs">{desc}</p>
    </div>
  );
}

// ─── Mentor components (sliced from the Internship Hub) ─────────────────────────

function QuizEditor({ quiz, onChange }: { quiz: Quiz; onChange: (q: Quiz) => void }) {
  const questions = quiz.questions ?? [];
  const update = (qs: QuizQuestion[]) => onChange({ questions: qs });

  const addMcq = () => update([...questions, { id: qid(), type: "mcq", prompt: "", options: ["", ""], answerIndex: 0 }]);
  const addText = () => update([...questions, { id: qid(), type: "text", prompt: "" }]);
  const patch = (i: number, p: Partial<QuizQuestion>) => update(questions.map((q, j) => j === i ? { ...q, ...p } : q));
  const remove = (i: number) => update(questions.filter((_, j) => j !== i));

  return (
    <div className="mt-3 border border-[#262A35] bg-[#1B1F2A] rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-[#00C2FF]">Module Quiz ({questions.length})</span>
        <div className="flex gap-1.5">
          <button onClick={addMcq} className="flex items-center gap-1 px-2 py-1 bg-[#12151D] border border-[#2E333F] text-[#00C2FF] text-[11px] font-semibold rounded hover:bg-[#0E2532]"><Plus className="w-3 h-3" /> MCQ</button>
          <button onClick={addText} className="flex items-center gap-1 px-2 py-1 bg-[#12151D] border border-[#2E333F] text-[#00C2FF] text-[11px] font-semibold rounded hover:bg-[#0E2532]"><Plus className="w-3 h-3" /> Text</button>
        </div>
      </div>
      {questions.length === 0 && <p className="text-[11px] text-[#5A6275]">No quiz yet — add MCQ or text questions. Interns must answer all MCQs correctly to complete this module.</p>}
      <div className="space-y-3">
        {questions.map((q, i) => (
          <div key={q.id} className="bg-[#12151D] border border-[#262A35] rounded-lg p-2.5">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${q.type === "mcq" ? "bg-[#0E2532] text-[#00C2FF]" : "bg-[#F59E0B]/12 text-[#F59E0B]"}`}>{q.type === "mcq" ? "MCQ" : "TEXT"}</span>
              <input
                className="flex-1 px-2 py-1 bg-[#1B1F2A] border border-[#2E333F] rounded text-xs text-[#E6E9F0] focus:outline-none focus:border-[#00C2FF]/60"
                placeholder="Question prompt…" value={q.prompt}
                onChange={e => patch(i, { prompt: e.target.value })} />
              <button onClick={() => remove(i)} className="p-1 text-[#5A6275] hover:text-[#ea4335] hover:bg-[#ea4335]/12 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            {q.type === "mcq" && (
              <div className="pl-1 space-y-1.5">
                {(q.options ?? []).map((opt, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <input type="radio" name={`correct-${q.id}`} checked={q.answerIndex === oi}
                      onChange={() => patch(i, { answerIndex: oi })} title="Mark as correct answer"
                      className="accent-[#0f9d58]" />
                    <input
                      className="flex-1 px-2 py-1 bg-[#12151D] border border-[#262A35] rounded text-xs text-[#C8CEDB] focus:outline-none focus:border-[#00C2FF]/60"
                      placeholder={`Option ${oi + 1}`} value={opt}
                      onChange={e => patch(i, { options: (q.options ?? []).map((o, j) => j === oi ? e.target.value : o) })} />
                    {(q.options?.length ?? 0) > 2 && (
                      <button onClick={() => {
                        const opts = (q.options ?? []).filter((_, j) => j !== oi);
                        const ai = q.answerIndex ?? 0;
                        patch(i, { options: opts, answerIndex: ai >= opts.length ? 0 : ai > oi ? ai - 1 : ai });
                      }} className="p-0.5 text-[#5A6275] hover:text-[#ea4335]"><X className="w-3 h-3" /></button>
                    )}
                  </div>
                ))}
                <button onClick={() => patch(i, { options: [...(q.options ?? []), ""] })}
                  className="text-[11px] text-[#00C2FF] hover:underline font-medium">+ Add option</button>
                <p className="text-[10px] text-[#5A6275]">Select the radio next to the correct option.</p>
              </div>
            )}
            {q.type === "text" && <p className="pl-1 text-[10px] text-[#5A6275]">Free-text answer — counts as done once the intern writes a non-empty response. You can review answers in the Quiz Responses panel.</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MENTOR PANEL TAB ─────────────────────────────────────────────────────────

type MentorSubTab = "weeks" | "edit_week" | "new_week" | "seed" | "attendance" | "hr";

export function MentorPanelTab() {
  const [subTab, setSubTab] = useState<MentorSubTab>("weeks");
  const [weeks, setWeeks] = useState<InternWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [seedLoading, setSeedLoading] = useState(false);
  const [noteText, setNoteText] = useState<Record<string, string>>({});
  const [savingNote, setSavingNote] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  // Full week editor state
  const [editingWeek, setEditingWeek] = useState<InternWeek | null>(null);
  const [editTopics, setEditTopics] = useState<{ id?: string; title: string; body: string; order: number; quiz?: Quiz }[]>([]);
  const [editResources, setEditResources] = useState<{ id?: string; title: string; url: string; type: string; order: number }[]>([]);
  const [editCheckpoints, setEditCheckpoints] = useState<{ id?: string; title: string; order: number }[]>([]);
  const [editMeta, setEditMeta] = useState<{ title: string; overview: string }>({ title: "", overview: "" });
  const [savingContent, setSavingContent] = useState(false);
  // New week form
  const [newWeek, setNewWeek] = useState({ weekNumber: "", title: "", overview: "" });
  const [creatingWeek, setCreatingWeek] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await fetch("/api/internship/weeks"); setWeeks(await res.json()); }
    catch { setWeeks([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEditor = (week: InternWeek) => {
    setEditingWeek(week);
    setEditMeta({ title: week.title, overview: week.overview });
    setEditTopics(week.topics.map(t => ({ id: t.id, title: t.title, body: t.body, order: t.order, quiz: t.quiz ?? { questions: [] } })));
    setEditResources(week.resources.map(r => ({ id: r.id, title: r.title, url: r.url, type: r.type, order: r.order })));
    setEditCheckpoints(week.checkpoints.map(c => ({ id: c.id, title: c.title, order: c.order })));
    setSubTab("edit_week");
  };

  const saveFullContent = async () => {
    if (!editingWeek) return;
    setSavingContent(true);
    try {
      const res = await fetch(`/api/internship/weeks/${editingWeek.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editMeta.title,
          overview: editMeta.overview,
          topics: editTopics.map((t, i) => ({ ...t, order: i })),
          resources: editResources.map((r, i) => ({ ...r, order: i })),
          checkpoints: editCheckpoints.map((c, i) => ({ ...c, order: i })),
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Week content saved");
      load();
    } catch { toast.error("Failed to save"); }
    finally { setSavingContent(false); }
  };

  const toggleLock = async (week: InternWeek) => {
    setToggling(week.id);
    try {
      const res = await fetch(`/api/internship/weeks/${week.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isUnlocked: !week.isUnlocked }),
      });
      if (!res.ok) throw new Error();
      toast.success(week.isUnlocked ? "Week locked" : "Week unlocked — interns notified");
      load();
    } catch { toast.error("Failed"); }
    finally { setToggling(null); }
  };

  const saveNote = async (weekId: string) => {
    const body = noteText[weekId]?.trim();
    if (!body) return;
    setSavingNote(weekId);
    try {
      await fetch(`/api/internship/weeks/${weekId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mentorNote: body }),
      });
      toast.success("Note added");
      setNoteText(p => ({ ...p, [weekId]: "" }));
      load();
    } catch { toast.error("Failed"); }
    finally { setSavingNote(null); }
  };

  const createWeek = async () => {
    if (!newWeek.title.trim() || !newWeek.overview.trim() || newWeek.weekNumber === "") return;
    setCreatingWeek(true);
    try {
      const res = await fetch("/api/internship/weeks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekNumber: Number(newWeek.weekNumber), title: newWeek.title, overview: newWeek.overview, isUnlocked: false }),
      });
      if (!res.ok) throw new Error();
      toast.success("Week created");
      setNewWeek({ weekNumber: "", title: "", overview: "" });
      setSubTab("weeks");
      load();
    } catch { toast.error("Failed to create week"); }
    finally { setCreatingWeek(false); }
  };

  const seedHandbook = async () => {
    setSeedLoading(true);
    try {
      const res = await fetch("/api/internship/seed-handbook", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Seed failed"); return; }
      toast.success(`${data.seeded} weeks loaded from handbook`);
      setSubTab("weeks");
      load();
    } catch { toast.error("Seed failed"); }
    finally { setSeedLoading(false); }
  };

  const [quizSeedLoading, setQuizSeedLoading] = useState(false);
  const seedQuizzes = async () => {
    setQuizSeedLoading(true);
    try {
      const res = await fetch("/api/internship/seed-quizzes", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed to add quizzes"); return; }
      toast.success(data.message ?? `Quizzes applied to ${data.updated} modules`);
      load();
    } catch { toast.error("Failed to add quizzes"); }
    finally { setQuizSeedLoading(false); }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Sub-tab bar */}
      <div className="flex gap-1 border-b border-[#262A35] pb-0 flex-wrap">
        {([
          { id: "weeks" as MentorSubTab, label: "Weeks", icon: BookOpen },
          { id: "attendance" as MentorSubTab, label: "Attendance", icon: CalendarClock },
          { id: "hr" as MentorSubTab, label: "HR", icon: UserCheck },
          { id: "new_week" as MentorSubTab, label: "Add Week", icon: Plus },
          { id: "seed" as MentorSubTab, label: "Seed Handbook", icon: GraduationCap },
        ]).map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              subTab === t.id ? "border-[#00C2FF] text-[#00C2FF]" : "border-transparent text-[#8A92A6] hover:text-[#E6E9F0]"
            }`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
        {subTab === "edit_week" && editingWeek && (
          <button className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 border-[#00C2FF] text-[#00C2FF]">
            <Pencil className="w-4 h-4" />Editing: {editingWeek.title.slice(0, 30)}{editingWeek.title.length > 30 ? "…" : ""}
          </button>
        )}
      </div>

      {/* Attendance sub-tab */}
      {subTab === "attendance" && <MentorAttendanceSubTab />}

      {/* HR sub-tab */}
      {subTab === "hr" && <MentorHRSubTab />}

      {/* New week form */}
      {subTab === "new_week" && (
        <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-6 space-y-4">
          <h3 className="font-semibold text-[#E6E9F0]">Create New Week</h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#8A92A6] mb-1">Week Number</label>
              <input type="number" min="0"
                className="w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] focus:outline-none focus:border-[#00C2FF]/60 focus:ring-2 focus:ring-[#00C2FF]/20"
                placeholder="e.g. 5" value={newWeek.weekNumber}
                onChange={e => setNewWeek(p => ({ ...p, weekNumber: e.target.value }))} />
              <p className="text-[10px] text-[#5A6275] mt-1">0 = Prerequisites</p>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-[#8A92A6] mb-1">Title</label>
              <input
                className="w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] focus:outline-none focus:border-[#00C2FF]/60 focus:ring-2 focus:ring-[#00C2FF]/20"
                placeholder="Week title…" value={newWeek.title}
                onChange={e => setNewWeek(p => ({ ...p, title: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#8A92A6] mb-1">Overview</label>
            <textarea rows={3}
              className="w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] resize-none focus:outline-none focus:border-[#00C2FF]/60 focus:ring-2 focus:ring-[#00C2FF]/20"
              placeholder="What will interns learn this week?" value={newWeek.overview}
              onChange={e => setNewWeek(p => ({ ...p, overview: e.target.value }))} />
          </div>
          <p className="text-xs text-[#8A92A6]">After creating the week, open it in the Weeks tab to add modules, resources, and checkpoints.</p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setSubTab("weeks")} className="px-3 py-1.5 text-sm text-[#8A92A6] hover:bg-[#1B1F2A] rounded-lg">Cancel</button>
            <button onClick={createWeek} disabled={creatingWeek || !newWeek.title.trim() || !newWeek.overview.trim() || newWeek.weekNumber === ""}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-[#00C2FF] text-[#06121A] text-sm font-semibold rounded-lg hover:bg-[#0098E6] disabled:opacity-50">
              {creatingWeek ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4" /> Create Week</>}
            </button>
          </div>
        </div>
      )}

      {/* Seed panel */}
      {subTab === "seed" && (
        <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-6 space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#0E2532] flex items-center justify-center shrink-0">
              <GraduationCap className="w-6 h-6 text-[#00C2FF]" />
            </div>
            <div>
              <h3 className="font-semibold text-[#E6E9F0] mb-1">Seed CyberSage Handbook</h3>
              <p className="text-sm text-[#8A92A6]">
                Loads the full curriculum from the CyberSage Intern Handbook — Prerequisites, Weeks 1–4 with all modules, resources, and checkpoints. This can only be run once. If weeks already exist this will fail.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2 bg-[#F59E0B]/12 border border-[#F59E0B]/25 rounded-lg px-4 py-3 text-sm text-[#F59E0B]">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>This will populate the database with all handbook content. Run only on a fresh install or after clearing existing weeks.</span>
          </div>
          <button onClick={seedHandbook} disabled={seedLoading}
            className="flex items-center gap-2 px-4 py-2 bg-[#00C2FF] text-[#06121A] text-sm font-semibold rounded-lg hover:bg-[#0098E6] disabled:opacity-50 transition-colors">
            {seedLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Seeding…</> : <><GraduationCap className="w-4 h-4" /> Seed Handbook</>}
          </button>

          <div className="border-t border-[#262A35] pt-4 mt-2">
            <h3 className="font-semibold text-[#E6E9F0] mb-1">Add module quizzes</h3>
            <p className="text-sm text-[#8A92A6] mb-3">
              Adds a ready-made MCQ/short-answer quiz to every handbook module. Interns must pass each module&apos;s quiz to tick it off, and the week auto-completes once all are passed. Safe to run on already-seeded weeks — re-running just refreshes the quizzes.
            </p>
            <button onClick={seedQuizzes} disabled={quizSeedLoading}
              className="flex items-center gap-2 px-4 py-2 bg-[#0f9d58] text-white text-sm font-semibold rounded-lg hover:bg-[#0c7c46] disabled:opacity-50 transition-colors">
              {quizSeedLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Adding quizzes…</> : <><CheckCircle2 className="w-4 h-4" /> Add quizzes to all modules</>}
            </button>
          </div>
        </div>
      )}

      {/* Full week content editor */}
      {subTab === "edit_week" && editingWeek && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <button onClick={() => setSubTab("weeks")} className="flex items-center gap-1.5 text-sm text-[#8A92A6] hover:text-[#E6E9F0]">
              ← Back to weeks
            </button>
            <button onClick={saveFullContent} disabled={savingContent}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#00C2FF] text-[#06121A] text-sm font-semibold rounded-lg hover:bg-[#0098E6] disabled:opacity-50">
              {savingContent ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> Save all changes</>}
            </button>
          </div>

          {/* Meta */}
          <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-5 space-y-3">
            <h3 className="text-xs font-semibold text-[#8A92A6]">Week info</h3>
            <input
              className="w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] focus:outline-none focus:border-[#00C2FF]/60 focus:ring-2 focus:ring-[#00C2FF]/20"
              value={editMeta.title} onChange={e => setEditMeta(p => ({ ...p, title: e.target.value }))} placeholder="Week title…" />
            <textarea rows={4}
              className="w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] resize-y focus:outline-none focus:border-[#00C2FF]/60 focus:ring-2 focus:ring-[#00C2FF]/20"
              value={editMeta.overview} onChange={e => setEditMeta(p => ({ ...p, overview: e.target.value }))} placeholder="Overview…" />
          </div>

          {/* Topics / Modules */}
          <div className="bg-[#12151D] border border-[#262A35] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#262A35] bg-[#1B1F2A]">
              <h3 className="text-xs font-semibold text-[#8A92A6]">Modules ({editTopics.length})</h3>
              <button onClick={() => setEditTopics(p => [...p, { title: "New Module", body: "", order: p.length }])}
                className="flex items-center gap-1 px-2.5 py-1 bg-[#00C2FF] text-[#06121A] text-xs font-semibold rounded-lg hover:bg-[#0098E6]">
                <Plus className="w-3 h-3" /> Add Module
              </button>
            </div>
            <div className="divide-y divide-[#1B1F2A]">
              {editTopics.length === 0 && (
                <p className="px-5 py-4 text-sm text-[#5A6275]">No modules yet. Click &ldquo;Add Module&rdquo; to create the first one.</p>
              )}
              {editTopics.map((topic, i) => (
                <div key={i} className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#0E2532] text-[#00C2FF] text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                    <input
                      className="flex-1 px-3 py-1.5 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm font-semibold text-[#E6E9F0] focus:outline-none focus:border-[#00C2FF]/60"
                      value={topic.title}
                      onChange={e => setEditTopics(p => p.map((t, j) => j === i ? { ...t, title: e.target.value } : t))}
                      placeholder="Module title…" />
                    <button onClick={() => setEditTopics(p => p.filter((_, j) => j !== i))}
                      className="p-1.5 text-[#5A6275] hover:text-[#ea4335] hover:bg-[#ea4335]/12 rounded-lg transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <textarea rows={18}
                    className="w-full min-h-[340px] px-4 py-3 bg-[#12151D] border border-[#262A35] rounded-lg text-sm leading-relaxed text-[#C8CEDB] font-mono resize-y focus:outline-none focus:border-[#00C2FF]/60 focus:ring-1 focus:ring-[#00C2FF]/20"
                    value={topic.body}
                    onChange={e => setEditTopics(p => p.map((t, j) => j === i ? { ...t, body: e.target.value } : t))}
                    placeholder="Module content (Markdown supported)…" />
                  <QuizEditor
                    quiz={topic.quiz ?? { questions: [] }}
                    onChange={quiz => setEditTopics(p => p.map((t, j) => j === i ? { ...t, quiz } : t))} />
                </div>
              ))}
            </div>
          </div>

          {/* Resources */}
          <div className="bg-[#12151D] border border-[#262A35] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#262A35] bg-[#1B1F2A]">
              <h3 className="text-xs font-semibold text-[#8A92A6]">Resources ({editResources.length})</h3>
              <button onClick={() => setEditResources(p => [...p, { title: "", url: "", type: "link", order: p.length }])}
                className="flex items-center gap-1 px-2.5 py-1 bg-[#00C2FF] text-[#06121A] text-xs font-semibold rounded-lg hover:bg-[#0098E6]">
                <Plus className="w-3 h-3" /> Add Link
              </button>
            </div>
            <div className="p-4 space-y-2">
              {editResources.length === 0 && (
                <p className="text-sm text-[#5A6275]">No resources yet.</p>
              )}
              {editResources.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className="flex-1 px-3 py-1.5 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] focus:outline-none focus:border-[#00C2FF]/60"
                    value={r.title} onChange={e => setEditResources(p => p.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                    placeholder="Link label…" />
                  <input
                    className="flex-1 px-3 py-1.5 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] focus:outline-none focus:border-[#00C2FF]/60"
                    value={r.url} onChange={e => setEditResources(p => p.map((x, j) => j === i ? { ...x, url: e.target.value } : x))}
                    placeholder="https://…" />
                  <button onClick={() => setEditResources(p => p.filter((_, j) => j !== i))}
                    className="p-1.5 text-[#5A6275] hover:text-[#ea4335] hover:bg-[#ea4335]/12 rounded-lg">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Checkpoints */}
          <div className="bg-[#12151D] border border-[#262A35] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#262A35] bg-[#1B1F2A]">
              <h3 className="text-xs font-semibold text-[#8A92A6]">Checkpoints ({editCheckpoints.length})</h3>
              <button onClick={() => setEditCheckpoints(p => [...p, { title: "", order: p.length }])}
                className="flex items-center gap-1 px-2.5 py-1 bg-[#00C2FF] text-[#06121A] text-xs font-semibold rounded-lg hover:bg-[#0098E6]">
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            <div className="p-4 space-y-2">
              {editCheckpoints.length === 0 && <p className="text-sm text-[#5A6275]">No checkpoints yet.</p>}
              {editCheckpoints.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#3A4150] shrink-0" />
                  <input
                    className="flex-1 px-3 py-1.5 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] focus:outline-none focus:border-[#00C2FF]/60"
                    value={c.title} onChange={e => setEditCheckpoints(p => p.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                    placeholder="e.g. Kali Linux VM installed and updated" />
                  <button onClick={() => setEditCheckpoints(p => p.filter((_, j) => j !== i))}
                    className="p-1.5 text-[#5A6275] hover:text-[#ea4335] hover:bg-[#ea4335]/12 rounded-lg">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={saveFullContent} disabled={savingContent}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-[#00C2FF] text-[#06121A] text-sm font-semibold rounded-lg hover:bg-[#0098E6] disabled:opacity-50">
              {savingContent ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> Save all changes</>}
            </button>
          </div>
        </div>
      )}

      {/* Weeks panel */}
      {subTab === "weeks" && (
        loading ? <LoadingSpinner /> :
        weeks.length === 0 ? (
          <EmptyState icon={BookOpen} title="No weeks yet"
            desc="Use the Seed Handbook tab to load curriculum, or create weeks manually via the API." />
        ) : (
          <div className="space-y-4">
            {weeks.map(week => {
              return (
                <div key={week.id} className="bg-[#12151D] border border-[#262A35] rounded-xl overflow-hidden">
                  {/* Week header */}
                  <div className="flex items-center justify-between px-5 py-4 border-b border-[#1B1F2A]">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                        week.weekNumber === 0 ? "bg-[#0E2532] text-[#00C2FF]" :
                        week.isUnlocked ? "bg-green-500/10 text-[#0f9d58]" : "bg-[#1B1F2A] text-[#5A6275]"
                      }`}>
                        {week.weekNumber === 0 ? "P" : week.weekNumber}
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-[#E6E9F0]">{week.title}</p>
                        <p className="text-xs text-[#5A6275] font-mono">
                          {week.topics.length} modules · {week.checkpoints.length} checkpoints · {week.completions.length} completed
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Edit content button */}
                      <button onClick={() => openEditor(week)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#8A92A6] hover:text-[#00C2FF] hover:bg-[#0E2532] rounded-lg transition-colors">
                        <Pencil className="w-3 h-3" /> Edit content
                      </button>
                      {/* Lock/unlock (only for non-prerequisites) */}
                      {week.weekNumber !== 0 && (
                        <button
                          onClick={() => toggleLock(week)}
                          disabled={toggling === week.id}
                          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                            week.isUnlocked
                              ? "bg-green-500/10 text-[#0f9d58] hover:bg-[#ea4335]/12 hover:text-[#ea4335]"
                              : "bg-[#1B1F2A] text-[#8A92A6] hover:bg-[#0E2532] hover:text-[#00C2FF]"
                          }`}>
                          {toggling === week.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : week.isUnlocked ? <><Unlock className="w-3 h-3" /> Unlocked</> : <><Lock className="w-3 h-3" /> Locked</>}
                        </button>
                      )}
                      {week.weekNumber === 0 && (
                        <span className="text-xs bg-green-500/10 text-[#0f9d58] px-2 py-1 rounded font-semibold">Always open</span>
                      )}
                    </div>
                  </div>

                  {/* Mentor note input */}
                  <div className="px-5 py-4">
                    <p className="text-xs font-semibold text-[#8A92A6] mb-2">Add a mentor note for interns</p>
                    <div className="flex gap-2">
                      <input
                        className="flex-1 px-3 py-2 bg-[#1B1F2A] border border-[#262A35] rounded-lg text-sm text-[#E6E9F0] placeholder:text-[#5A6275] focus:outline-none focus:border-[#00C2FF]/60"
                        placeholder="Tip, warning, or extra context for interns…"
                        value={noteText[week.id] ?? ""}
                        onChange={e => setNoteText(p => ({ ...p, [week.id]: e.target.value }))}
                        onKeyDown={e => e.key === "Enter" && saveNote(week.id)}
                      />
                      <button onClick={() => saveNote(week.id)} disabled={savingNote === week.id}
                        className="px-3 py-2 bg-[#00C2FF] text-[#06121A] rounded-lg hover:bg-[#0098E6] disabled:opacity-50 text-sm font-semibold">
                        {savingNote === week.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
                      </button>
                    </div>
                    {/* Existing notes preview */}
                    {week.mentorNotes.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        {week.mentorNotes.slice(0, 2).map(note => (
                          <div key={note.id} className="text-xs text-[#C2C8D6] bg-[#1B1F2A] border-l-2 border-[#F59E0B]/40 rounded px-3 py-2">
                            {note.body} <span className="text-[#5A6275]">— {note.author.fullName}</span>
                          </div>
                        ))}
                        {week.mentorNotes.length > 2 && (
                          <p className="text-[10px] text-[#5A6275]">+{week.mentorNotes.length - 2} more notes</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

// ─── HR SUB-TAB (mentor-facing) ───────────────────────────────────────────────

interface HRRow {
  id: string;
  fullName: string;
  email: string;
  role: string;
  avatarUrl?: string | null;
  employeeId: string | null;
  hr: {
    startDate?: string;
    endDate?: string;
    phone?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
  };
}

type HRDraft = { employeeId: string; startDate: string; endDate: string; phone: string; emergencyContactName: string; emergencyContactPhone: string };

function rowToDraft(r: HRRow): HRDraft {
  return {
    employeeId: r.employeeId ?? "",
    startDate: r.hr.startDate ?? "",
    endDate: r.hr.endDate ?? "",
    phone: r.hr.phone ?? "",
    emergencyContactName: r.hr.emergencyContactName ?? "",
    emergencyContactPhone: r.hr.emergencyContactPhone ?? "",
  };
}

function MentorHRSubTab() {
  // Mentor HR is scoped to interns only. Staff HR lives in the admin HR tab.
  const [rows, setRows] = useState<HRRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, HRDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/internship/hr?scope=interns`);
      const data = res.ok ? (await res.json() as HRRow[]) : [];
      setRows(data);
      setDrafts(Object.fromEntries(data.map(r => [r.id, rowToDraft(r)])));
    } catch { setRows([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setField = (id: string, field: keyof HRDraft, value: string) =>
    setDrafts(p => ({ ...p, [id]: { ...p[id], [field]: value } }));

  const saveRow = async (id: string) => {
    const d = drafts[id];
    if (!d) return;
    setSavingId(id);
    try {
      const res = await fetch("/api/internship/hr", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id, ...d }),
      });
      if (!res.ok) throw new Error();
      toast.success("HR record saved");
      setRows(p => p.map(r => r.id === id ? { ...r, employeeId: d.employeeId || null, hr: { ...d } } : r));
    } catch { toast.error("Failed to save"); }
    finally { setSavingId(null); }
  };

  const backfill = async () => {
    setBackfilling(true);
    try {
      const res = await fetch("/api/internship/hr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "backfill", scope: "interns" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      toast.success(data.assigned > 0 ? `Assigned ${data.assigned} employee ID${data.assigned !== 1 ? "s" : ""}` : "Everyone already has an ID");
      await load();
    } catch { toast.error("Backfill failed"); }
    finally { setBackfilling(false); }
  };

  const missingCount = rows.filter(r => !r.employeeId).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-[#8A92A6]">Intern HR records · <span className="text-[#E6E9F0] font-medium">{rows.length}</span></p>
        <button onClick={backfill} disabled={backfilling || missingCount === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#0E2532] text-[#00C2FF] hover:bg-[#133347] disabled:opacity-50 transition-colors">
          {backfilling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {missingCount > 0 ? `Assign ${missingCount} missing ID${missingCount !== 1 ? "s" : ""}` : "All IDs assigned"}
        </button>
      </div>

      {loading ? <LoadingSpinner /> : rows.length === 0 ? (
        <EmptyState icon={UserCheck} title="No people found" desc="No accounts match this filter." />
      ) : (
        <div className="space-y-3">
          {rows.map(r => {
            const d = drafts[r.id] ?? rowToDraft(r);
            return (
              <div key={r.id} className="bg-[#12151D] border border-[#262A35] rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Avatar user={r} size={7} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#E6E9F0] truncate">{r.fullName}</p>
                    <p className="text-[11px] text-[#5A6275] truncate">{r.email} · {r.role}</p>
                  </div>
                  <button onClick={() => saveRow(r.id)} disabled={savingId === r.id}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-[#00C2FF] text-[#06121A] text-xs font-semibold rounded-lg hover:bg-[#0098E6] disabled:opacity-50">
                    {savingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <HRField label="Employee number" value={d.employeeId} onChange={v => setField(r.id, "employeeId", v)} placeholder="SI00012026" mono />
                  <HRField label="Start date" type="date" value={d.startDate} onChange={v => setField(r.id, "startDate", v)} />
                  <HRField label="End date" type="date" value={d.endDate} onChange={v => setField(r.id, "endDate", v)} />
                  <HRField label="Phone" value={d.phone} onChange={v => setField(r.id, "phone", v)} placeholder="+44…" />
                  <HRField label="Emergency contact" value={d.emergencyContactName} onChange={v => setField(r.id, "emergencyContactName", v)} placeholder="Name" />
                  <HRField label="Emergency phone" value={d.emergencyContactPhone} onChange={v => setField(r.id, "emergencyContactPhone", v)} placeholder="+44…" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HRField({ label, value, onChange, type = "text", placeholder, mono }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; mono?: boolean;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-[#8A92A6] mb-1">{label}</label>
      <input type={type} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className={`w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] placeholder:text-[#5A6275] focus:outline-none focus:border-[#00C2FF]/60 ${mono ? "font-mono" : ""}`} />
    </div>
  );
}

function MentorAttendanceSubTab() {
  const [schedule, setSchedule] = useState<AttendanceSchedule | null>(null);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({ startTime: "09:00", endTime: "17:00", lateGraceMinutes: 15, defaultBreakFrom: "12:00", defaultBreakTo: "13:00" });
  const [editingSchedule, setEditingSchedule] = useState(false);

  const [date, setDate] = useState(todayStr());
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);

  // Override modal
  const [overrideFor, setOverrideFor] = useState<AttendanceRecord | null>(null);
  const [overrideForm, setOverrideForm] = useState({ punchIn: "", punchOut: "", reason: "" });
  const [overrideBreaks, setOverrideBreaks] = useState<{ from: string; to: string; label: string }[]>([]);
  const [savingOverride, setSavingOverride] = useState(false);

  const loadSchedule = useCallback(async () => {
    const res = await fetch("/api/internship/attendance/schedule");
    if (res.ok) {
      const s = await res.json() as AttendanceSchedule;
      setSchedule(s);
      setScheduleForm({ startTime: s.startTime, endTime: s.endTime, lateGraceMinutes: s.lateGraceMinutes, defaultBreakFrom: s.defaultBreakFrom ?? "12:00", defaultBreakTo: s.defaultBreakTo ?? "13:00" });
    }
  }, []);

  const loadRecords = useCallback(async () => {
    setLoadingRecords(true);
    try {
      const res = await fetch(`/api/internship/attendance?date=${date}`);
      if (res.ok) setRecords(await res.json());
    } finally { setLoadingRecords(false); }
  }, [date]);

  useEffect(() => { loadSchedule(); }, [loadSchedule]);
  useEffect(() => { loadRecords(); }, [loadRecords]);

  const saveSchedule = async () => {
    setSavingSchedule(true);
    try {
      const res = await fetch("/api/internship/attendance/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scheduleForm),
      });
      if (!res.ok) throw new Error();
      toast.success("Working hours updated — all interns notified!");
      setEditingSchedule(false);
      await loadSchedule();
    } catch { toast.error("Failed to save"); }
    finally { setSavingSchedule(false); }
  };

  const openOverride = (r: AttendanceRecord) => {
    setOverrideFor(r);
    setOverrideForm({
      punchIn: r.firstPunchIn ? toLocalDatetimeInput(r.firstPunchIn) : `${date}T09:00`,
      punchOut: r.lastPunchOut ? toLocalDatetimeInput(r.lastPunchOut) : `${date}T17:00`,
      reason: r.overrideReason ?? "",
    });
    setOverrideBreaks(
      (r.breaks ?? []).map(b => ({
        from: toLocalDatetimeInput(b.from),
        to: toLocalDatetimeInput(b.to),
        label: b.label ?? "",
      }))
    );
  };

  const saveOverride = async () => {
    if (!overrideFor) return;
    setSavingOverride(true);
    try {
      const res = await fetch("/api/internship/attendance/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          internId: overrideFor.intern.id,
          date,
          punchIn: overrideForm.punchIn ? new Date(overrideForm.punchIn).toISOString() : null,
          punchOut: overrideForm.punchOut ? new Date(overrideForm.punchOut).toISOString() : null,
          reason: overrideForm.reason || null,
          breaks: overrideBreaks
            .filter(b => b.from && b.to)
            .map(b => ({
              from: new Date(b.from).toISOString(),
              to: new Date(b.to).toISOString(),
              label: b.label || null,
            })),
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Attendance manually adjusted");
      setOverrideFor(null);
      setOverrideBreaks([]);
      await loadRecords();
    } catch { toast.error("Failed to save override"); }
    finally { setSavingOverride(false); }
  };

  const shiftDate = (days: number) => {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().slice(0, 10));
  };

  const presentCount = records.filter(r => r.firstPunchIn).length;
  const lateCount = records.filter(r => r.isLate).length;
  const idleCount = records.filter(r => r.idleFlag).length;

  return (
    <div className="space-y-5">
      {/* Working hours config */}
      <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[#E6E9F0] flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#00C2FF]" /> Official Working Hours
          </h3>
          <button onClick={() => setEditingSchedule(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-[#00C2FF] bg-[#0E2532] rounded-lg hover:bg-[#133347] transition-colors">
            <Pencil className="w-3 h-3" /> {editingSchedule ? "Cancel" : "Edit"}
          </button>
        </div>

        {editingSchedule ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#8A92A6] mb-1">Start time</label>
                <input type="time"
                  className="w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] focus:outline-none focus:border-[#00C2FF]/60"
                  value={scheduleForm.startTime} onChange={e => setScheduleForm(p => ({ ...p, startTime: e.target.value }))} />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#8A92A6] mb-1">End time</label>
                <input type="time"
                  className="w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] focus:outline-none focus:border-[#00C2FF]/60"
                  value={scheduleForm.endTime} onChange={e => setScheduleForm(p => ({ ...p, endTime: e.target.value }))} />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#8A92A6] mb-1">Grace (mins)</label>
                <input type="number" min={0} max={60}
                  className="w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] focus:outline-none focus:border-[#00C2FF]/60"
                  value={scheduleForm.lateGraceMinutes} onChange={e => setScheduleForm(p => ({ ...p, lateGraceMinutes: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#8A92A6] mb-1">Default break start</label>
                <input type="time"
                  className="w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] focus:outline-none focus:border-[#00C2FF]/60"
                  value={scheduleForm.defaultBreakFrom} onChange={e => setScheduleForm(p => ({ ...p, defaultBreakFrom: e.target.value }))} />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#8A92A6] mb-1">Default break end</label>
                <input type="time"
                  className="w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] focus:outline-none focus:border-[#00C2FF]/60"
                  value={scheduleForm.defaultBreakTo} onChange={e => setScheduleForm(p => ({ ...p, defaultBreakTo: e.target.value }))} />
              </div>
            </div>
            <p className="text-[11px] text-[#5A6275]">Saving will notify all interns immediately and update their Attendance tab banner.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditingSchedule(false)} className="px-3 py-1.5 text-xs text-[#8A92A6] hover:bg-[#1B1F2A] rounded-lg">Cancel</button>
              <button onClick={saveSchedule} disabled={savingSchedule}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-[#00C2FF] text-[#06121A] text-xs font-semibold rounded-lg hover:bg-[#0098E6] disabled:opacity-50">
                {savingSchedule ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Save className="w-3.5 h-3.5" /> Save & Notify All</>}
              </button>
            </div>
          </div>
        ) : schedule ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <span className="text-[#C8CEDB]"><span className="text-[#00C2FF] font-semibold font-mono">{schedule.startTime}</span> – <span className="text-[#00C2FF] font-semibold font-mono">{schedule.endTime}</span></span>
            <span className="text-[#5A6275]">{schedule.lateGraceMinutes} min grace</span>
            {(schedule.defaultBreakFrom && schedule.defaultBreakTo) && (
              <span className="text-[#5A6275]">Break: <span className="font-mono text-[#C8CEDB]">{schedule.defaultBreakFrom} – {schedule.defaultBreakTo}</span></span>
            )}
            {schedule.updatedAt && <span className="text-[#3A4150] text-xs">Updated {fmt(schedule.updatedAt)}</span>}
          </div>
        ) : <LoadingSpinner />}
      </div>

      {/* Date picker + stats bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => shiftDate(-1)} className="p-1.5 rounded-lg text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0] transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input type="date"
            className="px-3 py-1.5 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] focus:outline-none focus:border-[#00C2FF]/60"
            value={date} onChange={e => setDate(e.target.value)} max={todayStr()} />
          <button onClick={() => shiftDate(1)} disabled={date >= todayStr()}
            className="p-1.5 rounded-lg text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0] transition-colors disabled:opacity-30">
            <ChevronRight className="w-4 h-4" />
          </button>
          {date !== todayStr() && (
            <button onClick={() => setDate(todayStr())} className="text-xs text-[#00C2FF] hover:underline ml-1">Today</button>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-[#0f9d58]"><UserCheck className="w-3.5 h-3.5 inline mr-1" />{presentCount} present</span>
          {lateCount > 0 && <span className="text-[#F59E0B]"><Clock className="w-3.5 h-3.5 inline mr-1" />{lateCount} late</span>}
          {idleCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#ff6d00]/20 text-[#ff6d00] font-semibold text-xs">
              <Timer className="w-3 h-3" />{idleCount} idle {idleCount === 1 ? "flag" : "flags"}
            </span>
          )}
        </div>
      </div>

      {/* Timesheet table */}
      {loadingRecords ? <LoadingSpinner /> : records.length === 0 ? (
        <EmptyState icon={CalendarClock} title="No interns found" desc="No intern accounts exist yet." />
      ) : (
        <div className="bg-[#12151D] border border-[#262A35] rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_60px_60px_54px_1fr_auto_auto] text-[11px] font-semibold text-[#5A6275] px-4 py-2 border-b border-[#262A35] gap-3">
            <span>Intern</span>
            <span>In</span>
            <span>Out</span>
            <span>Total</span>
            <span>Location / Device</span>
            <span>Status</span>
            <span></span>
          </div>
          <div className="divide-y divide-[#262A35]">
            {records.map(r => (
              <div key={r.intern.id}
                className={`grid grid-cols-[1fr_60px_60px_54px_1fr_auto_auto] items-center px-4 py-3 gap-3 transition-colors ${r.idleFlag ? "bg-[#ff6d00]/5 hover:bg-[#ff6d00]/8" : "hover:bg-[#1B1F2A]/40"}`}>
                {/* Intern */}
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar user={r.intern} size={7} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#E6E9F0] truncate">{r.intern.fullName}</p>
                    {r.hasOverride && (
                      <p className="text-[10px] text-[#5A6275] flex items-center gap-1"><Edit2 className="w-2.5 h-2.5" /> Adjusted</p>
                    )}
                  </div>
                </div>

                {/* Punch In */}
                <span className="text-xs font-mono text-[#C8CEDB] whitespace-nowrap">
                  {r.firstPunchIn ? fmtHHMM(r.firstPunchIn) : <span className="text-[#3A4150]">—</span>}
                </span>

                {/* Punch Out */}
                <span className="text-xs font-mono text-[#C8CEDB] whitespace-nowrap">
                  {r.lastPunchOut ? fmtHHMM(r.lastPunchOut) : r.isCurrentlyIn
                    ? <span className="text-[#0f9d58] text-[11px]">● live</span>
                    : <span className="text-[#3A4150]">—</span>}
                </span>

                {/* Total (net of breaks) */}
                <div className="flex flex-col gap-0.5">
                  <span className={`text-xs font-mono font-semibold whitespace-nowrap ${r.totalMinutes > 0 ? "text-[#E6E9F0]" : "text-[#3A4150]"}`}>
                    {r.totalMinutes > 0 ? fmtDuration(r.totalMinutes) : "—"}
                  </span>
                  {r.breakMinutes > 0 && (
                    <span className="text-[10px] text-[#5A6275] whitespace-nowrap">−{fmtDuration(r.breakMinutes)} break</span>
                  )}
                </div>

                {/* Location + Device — mentor-only column */}
                <div className="flex flex-col gap-0.5 min-w-0">
                  {r.punchLocation ? (
                    <a
                      href={`https://www.google.com/maps?q=${r.punchLocation.lat},${r.punchLocation.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-[11px] text-[#00C2FF] hover:underline truncate"
                    >
                      <MapPin className="w-3 h-3 shrink-0" />
                      {r.punchLocation.lat.toFixed(4)}, {r.punchLocation.lng.toFixed(4)}
                      <span className="text-[#5A6275] ml-0.5">±{r.punchLocation.accuracy}m</span>
                    </a>
                  ) : r.firstPunchIn ? (
                    <span className="text-[11px] text-[#3A4150] flex items-center gap-1"><MapPin className="w-3 h-3" /> No location</span>
                  ) : null}
                  {r.punchDevice && (
                    <span className="text-[11px] text-[#5A6275] flex items-center gap-1 truncate">
                      <Monitor className="w-3 h-3 shrink-0" />{r.punchDevice}
                    </span>
                  )}
                </div>

                {/* Flags */}
                <div className="flex flex-col gap-1">
                  {!r.firstPunchIn && (
                    <span className="text-xs text-[#3A4150]">Absent</span>
                  )}
                  {r.firstPunchIn && !r.isLate && !r.idleFlag && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#0f9d58]/15 text-[#0f9d58] text-xs font-medium">
                      <CheckCircle className="w-3 h-3" /> On time
                    </span>
                  )}
                  {r.isLate && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#F59E0B]/15 text-[#F59E0B] text-xs font-medium">
                      <AlertCircle className="w-3 h-3" /> Late
                    </span>
                  )}
                  {r.idleFlag && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#ff6d00]/20 text-[#ff6d00] text-xs font-semibold">
                      <Timer className="w-3 h-3" /> Idle flag
                    </span>
                  )}
                </div>

                {/* Actions */}
                <button onClick={() => openOverride(r)}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] text-[#8A92A6] hover:text-[#00C2FF] hover:bg-[#0E2532] rounded-lg transition-colors whitespace-nowrap">
                  <Edit2 className="w-3 h-3" /> Adjust
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Override modal */}
      {overrideFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setOverrideFor(null); setOverrideBreaks([]); }} />
          <div className="relative bg-[#12151D] border border-[#262A35] rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold text-[#E6E9F0] flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-[#00C2FF]" /> Adjust Attendance
            </h3>
            <p className="text-xs text-[#8A92A6]">
              Manually set punch times for <span className="text-[#E6E9F0] font-medium">{overrideFor.intern.fullName}</span> on {date}.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-[#8A92A6] mb-1">Punch In</label>
                <input type="datetime-local"
                  className="w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] focus:outline-none focus:border-[#00C2FF]/60"
                  value={overrideForm.punchIn} onChange={e => setOverrideForm(p => ({ ...p, punchIn: e.target.value }))} />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#8A92A6] mb-1">Punch Out</label>
                <input type="datetime-local"
                  className="w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] focus:outline-none focus:border-[#00C2FF]/60"
                  value={overrideForm.punchOut} onChange={e => setOverrideForm(p => ({ ...p, punchOut: e.target.value }))} />
              </div>
              {/* Breaks */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-medium text-[#8A92A6]">Breaks</label>
                  <button
                    type="button"
                    onClick={() => setOverrideBreaks(p => [...p, { from: `${date}T${scheduleForm.defaultBreakFrom}`, to: `${date}T${scheduleForm.defaultBreakTo}`, label: "" }])}
                    className="flex items-center gap-1 text-[11px] text-[#00C2FF] hover:underline"
                  >
                    <Plus className="w-3 h-3" /> Add break
                  </button>
                </div>
                {overrideBreaks.length === 0 && (
                  <p className="text-[11px] text-[#3A4150]">No breaks set — click &ldquo;Add break&rdquo; to record one.</p>
                )}
                <div className="space-y-2">
                  {overrideBreaks.map((b, i) => (
                    <div key={i} className="flex items-end gap-2">
                      <div className="flex-1">
                        <p className="text-[10px] text-[#5A6275] mb-0.5">From</p>
                        <input type="datetime-local"
                          className="w-full px-2 py-1.5 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-xs text-[#E6E9F0] focus:outline-none focus:border-[#00C2FF]/60"
                          value={b.from}
                          onChange={e => setOverrideBreaks(p => p.map((x, j) => j === i ? { ...x, from: e.target.value } : x))} />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] text-[#5A6275] mb-0.5">To</p>
                        <input type="datetime-local"
                          className="w-full px-2 py-1.5 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-xs text-[#E6E9F0] focus:outline-none focus:border-[#00C2FF]/60"
                          value={b.to}
                          onChange={e => setOverrideBreaks(p => p.map((x, j) => j === i ? { ...x, to: e.target.value } : x))} />
                      </div>
                      <div className="w-24">
                        <p className="text-[10px] text-[#5A6275] mb-0.5">Label</p>
                        <input type="text"
                          className="w-full px-2 py-1.5 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-xs text-[#E6E9F0] placeholder:text-[#3A4150] focus:outline-none focus:border-[#00C2FF]/60"
                          placeholder="Lunch…"
                          value={b.label}
                          onChange={e => setOverrideBreaks(p => p.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                      </div>
                      <button
                        type="button"
                        onClick={() => setOverrideBreaks(p => p.filter((_, j) => j !== i))}
                        className="mb-0.5 p-1.5 text-[#5A6275] hover:text-[#ea4335] hover:bg-[#ea4335]/10 rounded-lg transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#8A92A6] mb-1">Reason (optional)</label>
                <input type="text"
                  className="w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] placeholder:text-[#5A6275] focus:outline-none focus:border-[#00C2FF]/60"
                  placeholder="e.g. Forgot to punch in"
                  value={overrideForm.reason} onChange={e => setOverrideForm(p => ({ ...p, reason: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => { setOverrideFor(null); setOverrideBreaks([]); }} className="px-3 py-1.5 text-sm text-[#8A92A6] hover:bg-[#1B1F2A] rounded-lg">Cancel</button>
              <button onClick={saveOverride} disabled={savingOverride}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-[#00C2FF] text-[#06121A] text-sm font-semibold rounded-lg hover:bg-[#0098E6] disabled:opacity-50">
                {savingOverride ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Save</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
