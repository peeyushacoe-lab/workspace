"use client";

// Mentor workspace — intern roster, per-intern profile (evaluations, 1:1 notes,
// certificates, mentor assignment) and the cohort overview dashboard.

import React, { useState, useEffect, useCallback } from "react";
import {
  Award, BookOpen, ChevronLeft, ClipboardCheck, FileCheck,
  Loader2, MessageSquare, Plus, Star, Trash2, TrendingUp, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import { avatarGradient } from "@/lib/avatar";

/* ── types ─────────────────────────────────────────────────────────────── */

interface Person { id: string; fullName: string; avatarUrl?: string | null; role?: string }

interface InternRow {
  id: string; fullName: string; email: string; avatarUrl?: string | null;
  isActive: boolean; joinedAt: string; employeeId: string | null;
  startDate: string | null; endDate: string | null;
  mentor: Person | null;
  quizAvg: number | null; modulesDone: number;
  weeksDone: number; weekCount: number;
  taskAvg: number | null; reviewedTasks: number; pendingSubmissions: number;
  latestEval: { overall: number; period: string; isFinal: boolean; createdAt: string } | null;
  certificates: number;
}

interface Evaluation {
  id: string; period: string; isFinal: boolean; overall: number;
  scores: Record<string, number>;
  strengths?: string | null; improvements?: string | null; comment?: string | null;
  createdAt: string; mentor: Person;
}

interface Note {
  id: string; meetingDate: string; note: string; actionItems?: string | null;
  isPrivate: boolean; mentor: Person; createdAt: string;
}

interface Certificate {
  id: string; title: string; serial: string; grade?: string | null;
  issuedAt: string; issuedBy?: Person | null;
}

interface Submission {
  id: string; status: string; createdAt: string;
  task: { id: string; title: string };
  reviews: { verdict: string; score?: number | null; createdAt: string }[];
}

interface Profile {
  intern: {
    id: string; fullName: string; email: string; avatarUrl?: string | null;
    isActive: boolean; joinedAt: string; bio?: string | null; phone?: string | null;
    location?: string | null; hr: Record<string, string>;
  };
  assignment: { mentor: Person } | null;
  evaluations: Evaluation[];
  notes: Note[];
  certificates: Certificate[];
  submissions: Submission[];
  moduleCompletions: { score?: number | null; createdAt: string; topic: { title: string } }[];
  weeksDone: number;
  weekCount: number;
}

const RUBRIC: { key: string; label: string }[] = [
  { key: "technical", label: "Technical skill" },
  { key: "communication", label: "Communication" },
  { key: "initiative", label: "Initiative" },
  { key: "reliability", label: "Reliability" },
  { key: "teamwork", label: "Teamwork" },
];

/* ── helpers ───────────────────────────────────────────────────────────── */

function initials(name: string) { return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2); }
function fmt(iso: string) { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }

const inputClass =
  "w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] placeholder:text-[#5A6275] focus:outline-none focus:border-[#00C2FF]/60";

function Avatar({ user, size = 8 }: { user: { fullName: string; avatarUrl?: string | null }; size?: number }) {
  const px = size * 4;
  return user.avatarUrl
    ? <img src={user.avatarUrl} alt={user.fullName} style={{ width: px, height: px }} className="rounded-full object-cover shrink-0" />
    : <div style={{ width: px, height: px, background: avatarGradient(user.fullName) }} className="rounded-full flex items-center justify-center text-white text-[11px] font-semibold shrink-0">{initials(user.fullName)}</div>;
}

function scoreColor(v: number | null, outOf = 100) {
  if (v == null) return "text-[#5A6275]";
  const pct = (v / outOf) * 100;
  if (pct >= 80) return "text-emerald-400";
  if (pct >= 60) return "text-amber-400";
  return "text-red-400";
}

function StatPill({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-4">
      <p className="text-xs font-medium text-[#8A92A6]">{label}</p>
      <p className={`text-2xl font-semibold tracking-tight mt-1 ${color ?? "text-[#E6E9F0]"}`}>{value}</p>
    </div>
  );
}

/* ── Overview (cohort dashboard) ───────────────────────────────────────── */

export function MentorOverviewSubTab({ onOpenIntern }: { onOpenIntern: (id: string) => void }) {
  const [interns, setInterns] = useState<InternRow[] | null>(null);

  useEffect(() => {
    fetch("/api/mentor/interns").then(r => (r.ok ? r.json() : { interns: [] })).then(d => setInterns(d.interns)).catch(() => setInterns([]));
  }, []);

  if (!interns) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-[#00C2FF]" /></div>;

  const active = interns.filter(i => i.isActive);
  const quizScores = interns.filter(i => i.quizAvg != null).map(i => i.quizAvg as number);
  const taskScores = interns.filter(i => i.taskAvg != null).map(i => i.taskAvg as number);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const pendingTotal = interns.reduce((s, i) => s + i.pendingSubmissions, 0);
  const unassigned = interns.filter(i => !i.mentor).length;
  const cohortQuiz = avg(quizScores);
  const cohortTask = avg(taskScores);

  const ranked = [...interns].sort((a, b) => ((b.quizAvg ?? 0) + (b.taskAvg ?? 0)) - ((a.quizAvg ?? 0) + (a.taskAvg ?? 0)));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatPill label="Active interns" value={String(active.length)} />
        <StatPill label="Cohort quiz avg" value={cohortQuiz != null ? `${cohortQuiz}%` : "—"} color={scoreColor(cohortQuiz)} />
        <StatPill label="Cohort task avg" value={cohortTask != null ? `${cohortTask}%` : "—"} color={scoreColor(cohortTask)} />
        <StatPill label="Pending reviews" value={String(pendingTotal)} color={pendingTotal > 0 ? "text-amber-400" : undefined} />
        <StatPill label="Without mentor" value={String(unassigned)} color={unassigned > 0 ? "text-amber-400" : undefined} />
      </div>

      <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-4">
        <h3 className="text-sm font-semibold text-[#E6E9F0] mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-[#00C2FF]" /> Leaderboard</h3>
        {ranked.length === 0 ? (
          <p className="text-sm text-[#5A6275]">No interns yet.</p>
        ) : (
          <div className="space-y-1">
            {ranked.map((i, idx) => (
              <button key={i.id} onClick={() => onOpenIntern(i.id)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#1B1F2A] text-left transition-colors">
                <span className={`w-5 text-center text-xs font-mono ${idx < 3 ? "text-[#00C2FF]" : "text-[#5A6275]"}`}>{idx + 1}</span>
                <Avatar user={i} size={7} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[#E6E9F0] truncate">{i.fullName}</p>
                  <p className="text-[11px] text-[#5A6275]">
                    {i.weeksDone}/{i.weekCount} weeks · {i.modulesDone} modules{i.mentor ? ` · mentor ${i.mentor.fullName}` : " · no mentor"}
                  </p>
                </div>
                <div className="flex items-center gap-4 shrink-0 font-mono text-xs">
                  <span className={scoreColor(i.quizAvg)} title="Quiz average">{i.quizAvg != null ? `${i.quizAvg}%` : "—"} quiz</span>
                  <span className={scoreColor(i.taskAvg)} title="Task average">{i.taskAvg != null ? `${i.taskAvg}%` : "—"} tasks</span>
                  {i.pendingSubmissions > 0 && <span className="text-amber-400">{i.pendingSubmissions} pending</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Interns roster + profile ──────────────────────────────────────────── */

export function MentorInternsSubTab({ openInternId, onOpenIntern, onBack }: {
  openInternId: string | null;
  onOpenIntern: (id: string) => void;
  onBack: () => void;
}) {
  if (openInternId) return <InternProfile internId={openInternId} onBack={onBack} />;
  return <InternRoster onOpen={onOpenIntern} />;
}

function InternRoster({ onOpen }: { onOpen: (id: string) => void }) {
  const [interns, setInterns] = useState<InternRow[] | null>(null);

  useEffect(() => {
    fetch("/api/mentor/interns").then(r => (r.ok ? r.json() : { interns: [] })).then(d => setInterns(d.interns)).catch(() => setInterns([]));
  }, []);

  if (!interns) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-[#00C2FF]" /></div>;
  if (interns.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#0E2532] flex items-center justify-center mb-4"><Users className="w-7 h-7 text-[#00C2FF]" /></div>
        <p className="font-semibold text-[#E6E9F0]">No interns yet</p>
        <p className="text-sm text-[#5A6275] mt-1">Intern accounts appear here automatically.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {interns.map(i => (
        <button key={i.id} onClick={() => onOpen(i.id)}
          className="bg-[#12151D] border border-[#262A35] rounded-xl p-4 text-left hover:border-[#00C2FF]/40 transition-colors">
          <div className="flex items-center gap-3">
            <Avatar user={i} size={10} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[#E6E9F0] truncate">{i.fullName}{!i.isActive && <span className="ml-2 text-[10px] text-red-400">inactive</span>}</p>
              <p className="text-[11px] text-[#5A6275] truncate font-mono">{i.employeeId ?? "no ID"} · joined {fmt(i.joinedAt)}</p>
            </div>
            {i.certificates > 0 && <Award className="w-4 h-4 text-amber-400 shrink-0" />}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3 text-center">
            <div className="bg-[#1B1F2A]/60 rounded-lg py-1.5">
              <p className={`text-sm font-semibold font-mono ${scoreColor(i.quizAvg)}`}>{i.quizAvg != null ? `${i.quizAvg}%` : "—"}</p>
              <p className="text-[10px] text-[#5A6275]">quiz avg</p>
            </div>
            <div className="bg-[#1B1F2A]/60 rounded-lg py-1.5">
              <p className={`text-sm font-semibold font-mono ${scoreColor(i.taskAvg)}`}>{i.taskAvg != null ? `${i.taskAvg}%` : "—"}</p>
              <p className="text-[10px] text-[#5A6275]">task avg</p>
            </div>
            <div className="bg-[#1B1F2A]/60 rounded-lg py-1.5">
              <p className="text-sm font-semibold font-mono text-[#E6E9F0]">{i.weeksDone}/{i.weekCount}</p>
              <p className="text-[10px] text-[#5A6275]">weeks</p>
            </div>
          </div>
          <div className="flex items-center justify-between mt-3">
            <span className="text-[11px] text-[#8A92A6]">{i.mentor ? `Mentor: ${i.mentor.fullName}` : "No mentor assigned"}</span>
            {i.latestEval && (
              <span className="flex items-center gap-1 text-[11px] font-mono text-[#00C2FF]">
                <Star className="w-3 h-3" />{i.latestEval.overall}/5 · {i.latestEval.period}
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

/* ── Intern profile ────────────────────────────────────────────────────── */

function InternProfile({ internId, onBack }: { internId: string; onBack: () => void }) {
  const [data, setData] = useState<Profile | null>(null);
  const [mentors, setMentors] = useState<Person[]>([]);
  const [showEvalForm, setShowEvalForm] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [showCertForm, setShowCertForm] = useState(false);

  const load = useCallback(async () => {
    const [pRes, aRes] = await Promise.all([
      fetch(`/api/mentor/interns/${internId}`),
      fetch("/api/mentor/assignments"),
    ]);
    if (pRes.ok) setData(await pRes.json());
    if (aRes.ok) setMentors((await aRes.json()).mentors ?? []);
  }, [internId]);

  useEffect(() => { void load(); }, [load]);

  if (!data) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-[#00C2FF]" /></div>;

  const { intern } = data;
  const quizScores = data.moduleCompletions.filter(m => m.score != null);
  const quizAvg = quizScores.length ? Math.round(quizScores.reduce((s, m) => s + (m.score as number), 0) / quizScores.length) : null;

  async function assignMentor(mentorId: string) {
    const res = await fetch("/api/mentor/assignments", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ internId, mentorId: mentorId || null }),
    });
    if (res.ok) { toast.success(mentorId ? "Mentor assigned" : "Mentor unassigned"); void load(); }
    else toast.error((await res.json()).error ?? "Failed");
  }

  async function deleteEval(id: string) {
    const res = await fetch(`/api/mentor/evaluations?id=${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Evaluation deleted"); void load(); }
  }
  async function deleteNote(id: string) {
    const res = await fetch(`/api/mentor/notes?id=${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Note deleted"); void load(); }
  }
  async function deleteCert(id: string) {
    const res = await fetch(`/api/internship/certificates?id=${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Certificate revoked"); void load(); }
  }

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-[#8A92A6] hover:text-[#E6E9F0] transition-colors">
        <ChevronLeft className="w-4 h-4" /> All interns
      </button>

      {/* Header card */}
      <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-5">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar user={intern} size={14} />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-tight text-[#E6E9F0]">{intern.fullName}</h2>
            <p className="text-sm text-[#8A92A6]">{intern.email}{intern.location ? ` · ${intern.location}` : ""}</p>
            <p className="text-xs font-mono text-[#5A6275] mt-0.5">
              {intern.hr.employeeId ?? "no employee ID"} · joined {fmt(intern.joinedAt)}
              {intern.hr.startDate ? ` · starts ${intern.hr.startDate}` : ""}{intern.hr.endDate ? ` · ends ${intern.hr.endDate}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-[#8A92A6]">Mentor</label>
            <select value={data.assignment?.mentor.id ?? ""} onChange={e => void assignMentor(e.target.value)}
              className="px-2.5 py-1.5 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-xs text-[#E6E9F0]">
              <option value="">Unassigned</option>
              {mentors.map(m => <option key={m.id} value={m.id}>{m.fullName}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          <StatPill label="Quiz average" value={quizAvg != null ? `${quizAvg}%` : "—"} color={scoreColor(quizAvg)} />
          <StatPill label="Modules done" value={String(data.moduleCompletions.length)} />
          <StatPill label="Weeks complete" value={`${data.weeksDone}/${data.weekCount}`} />
          <StatPill label="Certificates" value={String(data.certificates.length)} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Evaluations */}
        <section className="bg-[#12151D] border border-[#262A35] rounded-xl">
          <header className="flex items-center justify-between px-4 py-3 border-b border-[#262A35]">
            <h3 className="text-sm font-semibold text-[#E6E9F0] flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-[#00C2FF]" /> Evaluations</h3>
            <button onClick={() => setShowEvalForm(v => !v)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-[#0E2532] text-[#00C2FF] hover:bg-[#133347] transition-colors">
              {showEvalForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}{showEvalForm ? "Close" : "Evaluate"}
            </button>
          </header>
          <div className="p-4 space-y-3">
            {showEvalForm && <EvalForm internId={internId} onSaved={() => { setShowEvalForm(false); void load(); }} />}
            {data.evaluations.length === 0 && !showEvalForm && <p className="text-sm text-[#5A6275] py-4 text-center">No evaluations yet.</p>}
            {data.evaluations.map(ev => (
              <div key={ev.id} className="border border-[#262A35] rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[#E6E9F0]">{ev.period}</span>
                    {ev.isFinal && <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-[#0E2532] text-[#00C2FF]">FINAL</span>}
                    <span className={`text-sm font-mono ${scoreColor(ev.overall, 5)}`}>{ev.overall}/5</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[#5A6275]">{ev.mentor.fullName} · {fmt(ev.createdAt)}</span>
                    <button onClick={() => void deleteEval(ev.id)} className="p-1 text-[#5A6275] hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <div className="grid grid-cols-5 gap-1.5 mt-2">
                  {RUBRIC.map(r => (
                    <div key={r.key} className="text-center bg-[#1B1F2A]/60 rounded py-1">
                      <p className={`text-xs font-mono ${scoreColor(ev.scores[r.key] ?? null, 5)}`}>{ev.scores[r.key] ?? "—"}</p>
                      <p className="text-[9px] text-[#5A6275] truncate px-0.5">{r.label.split(" ")[0]}</p>
                    </div>
                  ))}
                </div>
                {ev.strengths && <p className="text-xs text-[#8A92A6] mt-2"><span className="text-emerald-400">Strengths:</span> {ev.strengths}</p>}
                {ev.improvements && <p className="text-xs text-[#8A92A6] mt-1"><span className="text-amber-400">Improve:</span> {ev.improvements}</p>}
                {ev.comment && <p className="text-xs text-[#8A92A6] mt-1">{ev.comment}</p>}
              </div>
            ))}
          </div>
        </section>

        {/* 1:1 notes */}
        <section className="bg-[#12151D] border border-[#262A35] rounded-xl">
          <header className="flex items-center justify-between px-4 py-3 border-b border-[#262A35]">
            <h3 className="text-sm font-semibold text-[#E6E9F0] flex items-center gap-2"><MessageSquare className="w-4 h-4 text-[#00C2FF]" /> 1:1 notes</h3>
            <button onClick={() => setShowNoteForm(v => !v)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-[#0E2532] text-[#00C2FF] hover:bg-[#133347] transition-colors">
              {showNoteForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}{showNoteForm ? "Close" : "Add note"}
            </button>
          </header>
          <div className="p-4 space-y-3">
            {showNoteForm && <NoteForm internId={internId} onSaved={() => { setShowNoteForm(false); void load(); }} />}
            {data.notes.length === 0 && !showNoteForm && <p className="text-sm text-[#5A6275] py-4 text-center">No 1:1 notes yet.</p>}
            {data.notes.map(n => (
              <div key={n.id} className="border border-[#262A35] rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-[#8A92A6]">{fmt(n.meetingDate)} · {n.mentor.fullName}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${n.isPrivate ? "bg-[#1B1F2A] text-[#5A6275]" : "bg-emerald-500/10 text-emerald-400"}`}>
                      {n.isPrivate ? "mentors only" : "shared with intern"}
                    </span>
                    <button onClick={() => void deleteNote(n.id)} className="p-1 text-[#5A6275] hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <p className="text-sm text-[#E6E9F0] mt-1.5 whitespace-pre-wrap">{n.note}</p>
                {n.actionItems && <p className="text-xs text-[#8A92A6] mt-1.5"><span className="text-[#00C2FF]">Actions:</span> {n.actionItems}</p>}
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Recent submissions */}
        <section className="bg-[#12151D] border border-[#262A35] rounded-xl">
          <header className="px-4 py-3 border-b border-[#262A35]">
            <h3 className="text-sm font-semibold text-[#E6E9F0] flex items-center gap-2"><FileCheck className="w-4 h-4 text-[#00C2FF]" /> Recent submissions</h3>
          </header>
          <div className="p-4 space-y-1.5">
            {data.submissions.length === 0 && <p className="text-sm text-[#5A6275] py-4 text-center">No submissions yet.</p>}
            {data.submissions.map(s => (
              <div key={s.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[#1B1F2A]">
                <div className="min-w-0">
                  <p className="text-sm text-[#E6E9F0] truncate">{s.task.title}</p>
                  <p className="text-[11px] text-[#5A6275]">{fmt(s.createdAt)} · {s.status.replace("_", " ")}</p>
                </div>
                {s.reviews[0]?.score != null && (
                  <span className={`text-sm font-mono shrink-0 ${scoreColor(s.reviews[0].score)}`}>{s.reviews[0].score}%</span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Certificates + quiz history */}
        <div className="space-y-5">
          <section className="bg-[#12151D] border border-[#262A35] rounded-xl">
            <header className="flex items-center justify-between px-4 py-3 border-b border-[#262A35]">
              <h3 className="text-sm font-semibold text-[#E6E9F0] flex items-center gap-2"><Award className="w-4 h-4 text-[#00C2FF]" /> Certificates</h3>
              <button onClick={() => setShowCertForm(v => !v)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-[#0E2532] text-[#00C2FF] hover:bg-[#133347] transition-colors">
                {showCertForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}{showCertForm ? "Close" : "Issue"}
              </button>
            </header>
            <div className="p-4 space-y-2">
              {showCertForm && <CertForm internId={internId} onSaved={() => { setShowCertForm(false); void load(); }} />}
              {data.certificates.length === 0 && !showCertForm && <p className="text-sm text-[#5A6275] py-3 text-center">No certificates issued.</p>}
              {data.certificates.map(c => (
                <div key={c.id} className="flex items-center justify-between gap-2 border border-[#262A35] rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-[#E6E9F0] truncate">{c.title}{c.grade ? ` — ${c.grade}` : ""}</p>
                    <p className="text-[11px] font-mono text-[#5A6275]">{c.serial} · {fmt(c.issuedAt)}</p>
                  </div>
                  <button onClick={() => void deleteCert(c.id)} className="p-1 text-[#5A6275] hover:text-red-400 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-[#12151D] border border-[#262A35] rounded-xl">
            <header className="px-4 py-3 border-b border-[#262A35]">
              <h3 className="text-sm font-semibold text-[#E6E9F0] flex items-center gap-2"><BookOpen className="w-4 h-4 text-[#00C2FF]" /> Quiz history</h3>
            </header>
            <div className="p-4 space-y-1">
              {quizScores.length === 0 && <p className="text-sm text-[#5A6275] py-3 text-center">No quizzes completed.</p>}
              {quizScores.slice(-10).reverse().map((m, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-1.5 rounded hover:bg-[#1B1F2A]">
                  <span className="text-xs text-[#E6E9F0] truncate">{m.topic.title}</span>
                  <span className={`text-xs font-mono shrink-0 ${scoreColor(m.score ?? null)}`}>{m.score}%</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ── forms ─────────────────────────────────────────────────────────────── */

function EvalForm({ internId, onSaved }: { internId: string; onSaved: () => void }) {
  const [period, setPeriod] = useState("");
  const [isFinal, setIsFinal] = useState(false);
  const [scores, setScores] = useState<Record<string, number>>(Object.fromEntries(RUBRIC.map(r => [r.key, 3])));
  const [strengths, setStrengths] = useState("");
  const [improvements, setImprovements] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!period.trim()) { toast.error("Period is required (e.g. Week 4, Final)"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/mentor/evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ internId, period, isFinal, scores, strengths, improvements }),
      });
      if (res.ok) { toast.success("Evaluation saved"); onSaved(); }
      else toast.error((await res.json()).error ?? "Failed");
    } finally { setSaving(false); }
  }

  return (
    <div className="border border-[#00C2FF]/30 rounded-lg p-3 space-y-3">
      <div className="flex gap-2">
        <input value={period} onChange={e => setPeriod(e.target.value)} placeholder='Period — e.g. "Week 4" or "Final"' className={inputClass} />
        <label className="flex items-center gap-1.5 text-xs text-[#8A92A6] shrink-0">
          <input type="checkbox" checked={isFinal} onChange={e => setIsFinal(e.target.checked)} className="accent-[#00C2FF]" /> Final
        </label>
      </div>
      <div className="space-y-2">
        {RUBRIC.map(r => (
          <div key={r.key} className="flex items-center gap-3">
            <span className="text-xs text-[#8A92A6] w-32 shrink-0">{r.label}</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(v => (
                <button key={v} onClick={() => setScores(s => ({ ...s, [r.key]: v }))}
                  className={`w-7 h-7 rounded text-xs font-mono transition-colors ${
                    scores[r.key] === v ? "bg-[#00C2FF] text-[#06121A] font-semibold" : "bg-[#1B1F2A] text-[#8A92A6] hover:bg-[#262A35]"
                  }`}>{v}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <input value={strengths} onChange={e => setStrengths(e.target.value)} placeholder="Strengths" className={inputClass} />
      <input value={improvements} onChange={e => setImprovements(e.target.value)} placeholder="Areas to improve" className={inputClass} />
      <button onClick={() => void save()} disabled={saving}
        className="w-full py-2 text-sm font-semibold rounded-lg bg-[#00C2FF] text-[#06121A] hover:bg-[#33cfff] disabled:opacity-50 transition-colors">
        {saving ? "Saving…" : "Save evaluation"}
      </button>
    </div>
  );
}

function NoteForm({ internId, onSaved }: { internId: string; onSaved: () => void }) {
  const [note, setNote] = useState("");
  const [actionItems, setActionItems] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!note.trim()) { toast.error("Note text required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/mentor/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ internId, note, actionItems, isPrivate }),
      });
      if (res.ok) { toast.success("Note saved"); onSaved(); }
      else toast.error((await res.json()).error ?? "Failed");
    } finally { setSaving(false); }
  }

  return (
    <div className="border border-[#00C2FF]/30 rounded-lg p-3 space-y-2">
      <textarea rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="What was discussed in the 1:1…" className={inputClass} />
      <input value={actionItems} onChange={e => setActionItems(e.target.value)} placeholder="Action items (optional)" className={inputClass} />
      <label className="flex items-center gap-1.5 text-xs text-[#8A92A6]">
        <input type="checkbox" checked={!isPrivate} onChange={e => setIsPrivate(!e.target.checked)} className="accent-[#00C2FF]" />
        Share with intern
      </label>
      <button onClick={() => void save()} disabled={saving}
        className="w-full py-2 text-sm font-semibold rounded-lg bg-[#00C2FF] text-[#06121A] hover:bg-[#33cfff] disabled:opacity-50 transition-colors">
        {saving ? "Saving…" : "Save note"}
      </button>
    </div>
  );
}

function CertForm({ internId, onSaved }: { internId: string; onSaved: () => void }) {
  const [title, setTitle] = useState("Cybersecurity Internship — Certificate of Completion");
  const [grade, setGrade] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim()) { toast.error("Title required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/internship/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ internId, title, grade }),
      });
      if (res.ok) { toast.success("Certificate issued"); onSaved(); }
      else toast.error((await res.json()).error ?? "Failed");
    } finally { setSaving(false); }
  }

  return (
    <div className="border border-[#00C2FF]/30 rounded-lg p-3 space-y-2">
      <input value={title} onChange={e => setTitle(e.target.value)} className={inputClass} />
      <select value={grade} onChange={e => setGrade(e.target.value)} className={inputClass}>
        <option value="">No grade</option>
        <option>Distinction</option>
        <option>Merit</option>
        <option>Pass</option>
      </select>
      <button onClick={() => void save()} disabled={saving}
        className="w-full py-2 text-sm font-semibold rounded-lg bg-[#00C2FF] text-[#06121A] hover:bg-[#33cfff] disabled:opacity-50 transition-colors">
        {saving ? "Issuing…" : "Issue certificate"}
      </button>
    </div>
  );
}
