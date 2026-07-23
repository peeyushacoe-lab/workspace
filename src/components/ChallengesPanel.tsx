"use client";

// Team Challenges — shared between the Intern Hub (/internship) and the Mentor
// console (/mentor). Extracted so both routes render the exact same UI instead
// of drifting into two different implementations.
//
// Visibility model: teams competing in a challenge cannot see each other's
// mission brief, submissions, or scores while the challenge is active/judging.
// The API already redacts this server-side (src/app/api/internship/challenges);
// this component also filters client-side as a second guard and to avoid
// rendering confusing empty panels for teams the viewer isn't part of.

import { useState, useEffect, useCallback } from "react";
import {
  Plus, Trash2, Loader2, Clock, CalendarClock, ArrowRight, Trophy, Users,
  Award, Crown, Swords, Star, FileText, Link2, Send, Lock, X, Paperclip, Download,
} from "lucide-react";
import { toast } from "sonner";
import { avatarGradient } from "@/lib/avatar";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HubUser { id: string; fullName: string; avatarUrl?: string | null; role?: string; }
interface ScoringCategory { key: string; label: string; maxPoints: number; }
interface ChallengeScore { id: string; teamId: string; category: string; points: number; maxPoints: number; comment?: string | null; scoredById: string; }
interface ChallengeSubmissionEntry {
  id: string; teamId: string; notes?: string | null; links: string[];
  files?: { name: string; url: string; type?: string; size?: number }[];
  submitter: HubUser; createdAt: string;
}
interface ChallengeTeam {
  id: string; challengeId: string; name: string; color?: string | null; mission?: string | null;
  leadId?: string | null; lead?: HubUser | null; memberIds: string[];
  scores: ChallengeScore[]; submissions: ChallengeSubmissionEntry[];
}
interface Challenge {
  id: string; title: string; description: string; status: string; deadline?: string | null;
  scoringSchema: ScoringCategory[]; winnerTeamId?: string | null;
  winnerTeam?: { id: string; name: string; color?: string | null } | null;
  teams: ChallengeTeam[]; createdBy: HubUser; createdAt: string;
}

// ─── Small local helpers (kept self-contained, no cross-import from page.tsx) ─

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function initials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}
function fmtBytes(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function fmtCountdown(iso: string): { label: string; overdue: boolean } {
  const diff = new Date(iso).getTime() - Date.now();
  const overdue = diff < 0;
  const mins = Math.abs(Math.floor(diff / 60000));
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const remMins = mins % 60;
  let label: string;
  if (days > 0) label = `${days}d ${hours}h`;
  else if (hours > 0) label = `${hours}h ${remMins}m`;
  else label = `${remMins}m`;
  return { label: overdue ? `${label} overdue` : `${label} left`, overdue };
}

function Avatar({ user, size = 8 }: { user: HubUser; size?: number }) {
  const s = `w-${size} h-${size}`;
  return user.avatarUrl
    ? <img src={user.avatarUrl} alt={user.fullName} className={`${s} rounded-full object-cover shrink-0`} />
    : <div className={`${s} rounded-full flex items-center justify-center text-white text-[11px] font-semibold shrink-0`} style={{ background: avatarGradient(user.fullName) }}>{initials(user.fullName)}</div>;
}

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

// ─── Status / color config ────────────────────────────────────────────────────

const CHALLENGE_STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  upcoming:  { label: "Upcoming",  color: "text-[#8A92A6]", bg: "bg-[#1B1F2A]" },
  active:    { label: "Active",    color: "text-[#00C2FF]", bg: "bg-[#0E2532]" },
  judging:   { label: "Judging",   color: "text-[#F59E0B]", bg: "bg-[#F59E0B]/12" },
  completed: { label: "Completed", color: "text-[#0f9d58]", bg: "bg-[#0f9d58]/12" },
  cancelled: { label: "Cancelled", color: "text-[#ea4335]", bg: "bg-[#ea4335]/12" },
};

const TEAM_COLOR_HEX: Record<string, string> = {
  red: "#ea4335", blue: "#4285f4", green: "#0f9d58", purple: "#a142f4",
  amber: "#f4b400", orange: "#ff6d00", cyan: "#00C2FF",
};
function teamColorHex(color?: string | null): string {
  return (color && TEAM_COLOR_HEX[color.toLowerCase()]) || "#8A92A6";
}

function ChallengeStatusBadge({ s }: { s: string }) {
  const cfg = CHALLENGE_STATUS_CFG[s] ?? CHALLENGE_STATUS_CFG.upcoming;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.color} ${cfg.bg}`}>{cfg.label}</span>;
}

function teamTotal(team: ChallengeTeam): number {
  return team.scores.reduce((sum, s) => sum + s.points, 0);
}
function schemaMax(schema: ScoringCategory[]): number {
  return schema.reduce((sum, c) => sum + c.maxPoints, 0);
}
function isOnTeam(team: ChallengeTeam, userId: string): boolean {
  return team.memberIds.includes(userId) || team.leadId === userId;
}

// datetime-local inputs want "YYYY-MM-DDTHH:mm" in the browser's local time,
// with no timezone suffix — Date#toISOString() is always UTC, so convert by
// subtracting the local offset before slicing.
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export function ChallengesTab({ isMentor, userId }: { isMentor: boolean; userId: string }) {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Challenge | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [interns, setInterns] = useState<HubUser[]>([]);
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/internship/challenges");
      const data: Challenge[] = await res.json();
      setChallenges(data);
      setSelected(prev => (prev ? data.find(c => c.id === prev.id) ?? null : null));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/users?role=INTERNSHIP").then(r => r.json())
      .then((all: { id: string; fullName: string; avatarUrl?: string }[]) => setInterns(all.filter(u => u.fullName)))
      .catch(() => {});
  }, []);

  if (loading) return <LoadingSpinner />;

  if (selected) {
    return (
      <ChallengeDetail
        challenge={selected}
        isMentor={isMentor}
        userId={userId}
        interns={interns}
        onBack={() => { setSelected(null); load(); }}
        onRefresh={load}
      />
    );
  }

  const seedWeek4 = async () => {
    setSeeding(true);
    try {
      const res = await fetch("/api/internship/seed-week4-challenge", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(data.message ?? "Week 4 challenge ready");
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to seed challenge"); }
    finally { setSeeding(false); }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {isMentor && (
        <div className="flex justify-end gap-2">
          <button onClick={seedWeek4} disabled={seeding}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg border border-[#262A35] text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0] transition-colors disabled:opacity-50">
            {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />} Seed Week 4: Red vs Blue
          </button>
          <button onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#00C2FF] text-[#06121A] text-sm font-semibold rounded-lg hover:bg-[#0098E6] transition-colors">
            <Plus className="w-4 h-4" /> New Challenge
          </button>
        </div>
      )}

      {showForm && (
        <NewChallengeForm
          interns={interns}
          onCancel={() => setShowForm(false)}
          onCreated={() => { setShowForm(false); load(); }}
        />
      )}

      {challenges.length === 0 && (
        <EmptyState icon={Trophy} title="No challenges yet"
          desc={isMentor ? "Create a team-based competition — pentesting vs. forensics, red vs. blue, and more." : "No team challenges have been announced yet."} />
      )}

      <div className="space-y-3">
        {challenges.map(c => {
          const cd = c.deadline ? fmtCountdown(c.deadline) : null;
          const max = schemaMax(c.scoringSchema);
          const revealScores = isMentor || c.status === "completed";
          return (
            <div key={c.id} onClick={() => setSelected(c)}
              className="bg-[#12151D] border border-[#262A35] rounded-xl p-4 hover:border-[#00C2FF]/40 hover:shadow-sm transition-all cursor-pointer group">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Swords className="w-4 h-4 text-[#00C2FF] shrink-0" />
                  <h4 className="font-semibold text-sm text-[#E6E9F0] group-hover:text-[#00C2FF] transition-colors truncate">{c.title}</h4>
                </div>
                <ChallengeStatusBadge s={c.status} />
              </div>
              <p className="text-sm text-[#8A92A6] mt-1 line-clamp-2">{c.description}</p>
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                {c.teams.map(t => (
                  <span key={t.id} className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: teamColorHex(t.color) }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: teamColorHex(t.color) }} />
                    {t.name}{revealScores ? ` · ${teamTotal(t)}/${max}` : ""}
                  </span>
                ))}
                {cd && (
                  <span className={`flex items-center gap-1 text-[11px] font-mono ml-auto ${cd.overdue ? "text-[#ea4335]" : "text-[#5A6275]"}`}>
                    <Clock className="w-3 h-3" /> {cd.label}
                  </span>
                )}
                {c.winnerTeam && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-[#f4b400]">
                    <Crown className="w-3 h-3" /> {c.winnerTeam.name} won
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── New challenge form ───────────────────────────────────────────────────────

function NewChallengeForm({ interns, onCancel, onCreated }: {
  interns: HubUser[]; onCancel: () => void; onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [categories, setCategories] = useState<ScoringCategory[]>([
    { key: "technical", label: "Technical Understanding", maxPoints: 30 },
    { key: "analysis", label: "Quality of Analysis", maxPoints: 25 },
    { key: "documentation", label: "Documentation & Report", maxPoints: 20 },
    { key: "mitre", label: "MITRE ATT&CK Mapping", maxPoints: 15 },
    { key: "presentation", label: "Presentation & Teamwork", maxPoints: 10 },
  ]);
  const [teams, setTeams] = useState<{ name: string; color: string; mission: string; leadId: string; memberIds: string[] }[]>([
    { name: "Team Red", color: "red", mission: "", leadId: "", memberIds: [] },
    { name: "Team Blue", color: "blue", mission: "", leadId: "", memberIds: [] },
  ]);
  const [saving, setSaving] = useState(false);

  const totalPoints = categories.reduce((s, c) => s + (Number(c.maxPoints) || 0), 0);

  const updateCategory = (i: number, patch: Partial<ScoringCategory>) =>
    setCategories(prev => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const updateTeam = (i: number, patch: Partial<(typeof teams)[number]>) =>
    setTeams(prev => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));

  const create = async () => {
    if (!title.trim() || !description.trim()) { toast.error("Title and description are required"); return; }
    if (totalPoints !== 100) { toast.error(`Scoring categories must sum to 100 (currently ${totalPoints})`); return; }
    if (teams.some(t => !t.name.trim())) { toast.error("Every team needs a name"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/internship/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title, description,
          deadline: deadline ? new Date(deadline).toISOString() : undefined,
          scoringSchema: categories.map(c => ({ key: c.key, label: c.label, maxPoints: Number(c.maxPoints) })),
          teams: teams.map(t => ({
            name: t.name, color: t.color, mission: t.mission || undefined,
            leadId: t.leadId || undefined, memberIds: t.memberIds,
          })),
        }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed"); }
      toast.success("Challenge created");
      onCreated();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to create challenge"); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-5 space-y-4">
      <h3 className="font-semibold text-[#E6E9F0]">Create Challenge</h3>

      <input className="w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] placeholder:text-[#5A6275] focus:outline-none focus:border-[#00C2FF]/60 focus:ring-2 focus:ring-[#00C2FF]/20"
        placeholder="Challenge title… e.g. Week 4: Red vs Blue" value={title} onChange={e => setTitle(e.target.value)} />
      <textarea rows={3}
        className="w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] placeholder:text-[#5A6275] focus:outline-none focus:border-[#00C2FF]/60 focus:ring-2 focus:ring-[#00C2FF]/20 resize-none"
        placeholder="Objective / brief…" value={description} onChange={e => setDescription(e.target.value)} />
      <div>
        <label className="block text-xs font-medium text-[#8A92A6] mb-1">Submission deadline</label>
        <input type="datetime-local" className="w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] focus:outline-none focus:border-[#00C2FF]/60"
          value={deadline} onChange={e => setDeadline(e.target.value)} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-[#8A92A6]">Evaluation criteria</label>
          <span className={`text-xs font-mono ${totalPoints === 100 ? "text-[#0f9d58]" : "text-[#ea4335]"}`}>{totalPoints} / 100 pts</span>
        </div>
        <div className="space-y-2">
          {categories.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className="flex-1 px-2.5 py-1.5 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-xs text-[#E6E9F0] focus:outline-none focus:border-[#00C2FF]/60"
                value={c.label} onChange={e => updateCategory(i, { label: e.target.value })} placeholder="Category name" />
              <input type="number" className="w-20 px-2.5 py-1.5 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-xs text-[#E6E9F0] focus:outline-none focus:border-[#00C2FF]/60"
                value={c.maxPoints} onChange={e => updateCategory(i, { maxPoints: Number(e.target.value) })} />
              <button type="button" onClick={() => setCategories(prev => prev.filter((_, idx) => idx !== i))}
                className="p-1.5 text-[#5A6275] hover:text-[#ea4335] hover:bg-[#ea4335]/12 rounded transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button type="button"
            onClick={() => setCategories(prev => [...prev, { key: `cat_${prev.length}`, label: "", maxPoints: 0 }])}
            className="flex items-center gap-1 text-xs text-[#00C2FF] hover:text-[#0098E6]">
            <Plus className="w-3 h-3" /> Add category
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <label className="text-xs font-medium text-[#8A92A6]">Teams</label>
        {teams.map((t, i) => (
          <div key={i} className="bg-[#1B1F2A] border border-[#2E333F] rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <input className="flex-1 px-2.5 py-1.5 bg-[#0E1018] border border-[#2E333F] rounded-lg text-xs text-[#E6E9F0] focus:outline-none focus:border-[#00C2FF]/60"
                value={t.name} onChange={e => updateTeam(i, { name: e.target.value })} placeholder="Team name" />
              <select className="px-2.5 py-1.5 bg-[#0E1018] border border-[#2E333F] rounded-lg text-xs text-[#E6E9F0] focus:outline-none focus:border-[#00C2FF]/60"
                value={t.color} onChange={e => updateTeam(i, { color: e.target.value })}>
                {Object.keys(TEAM_COLOR_HEX).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {teams.length > 2 && (
                <button type="button" onClick={() => setTeams(prev => prev.filter((_, idx) => idx !== i))}
                  className="p-1.5 text-[#5A6275] hover:text-[#ea4335] hover:bg-[#ea4335]/12 rounded transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <textarea rows={2} className="w-full px-2.5 py-1.5 bg-[#0E1018] border border-[#2E333F] rounded-lg text-xs text-[#E6E9F0] placeholder:text-[#5A6275] focus:outline-none focus:border-[#00C2FF]/60 resize-none"
              placeholder="Mission brief for this team… (only this team + mentors will see it)" value={t.mission} onChange={e => updateTeam(i, { mission: e.target.value })} />
            <div>
              <label className="block text-[11px] text-[#5A6275] mb-1">Team lead</label>
              <select className="w-full px-2.5 py-1.5 bg-[#0E1018] border border-[#2E333F] rounded-lg text-xs text-[#E6E9F0] focus:outline-none focus:border-[#00C2FF]/60"
                value={t.leadId} onChange={e => updateTeam(i, { leadId: e.target.value })}>
                <option value="">— none yet —</option>
                {interns.map(intern => <option key={intern.id} value={intern.id}>{intern.fullName}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-[#5A6275] mb-1">Members</label>
              <div className="flex flex-wrap gap-1.5">
                {interns.map(intern => (
                  <button key={intern.id} type="button"
                    onClick={() => updateTeam(i, {
                      memberIds: t.memberIds.includes(intern.id)
                        ? t.memberIds.filter(id => id !== intern.id)
                        : [...t.memberIds, intern.id],
                    })}
                    className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                      t.memberIds.includes(intern.id)
                        ? "border-[#00C2FF] bg-[#0E2532] text-[#00C2FF]"
                        : "border-[#262A35] text-[#8A92A6] hover:bg-[#12151D]"
                    }`}>
                    {intern.fullName}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-[#5A6275] mt-1">You can leave this empty and add members later from the challenge page.</p>
            </div>
          </div>
        ))}
        <button type="button"
          onClick={() => setTeams(prev => [...prev, { name: `Team ${prev.length + 1}`, color: "amber", mission: "", leadId: "", memberIds: [] }])}
          className="flex items-center gap-1 text-xs text-[#00C2FF] hover:text-[#0098E6]">
          <Plus className="w-3 h-3" /> Add team
        </button>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-[#8A92A6] hover:bg-[#1B1F2A] rounded-lg">Cancel</button>
        <button onClick={create} disabled={saving} className="px-4 py-1.5 bg-[#00C2FF] text-[#06121A] text-sm font-semibold rounded-lg hover:bg-[#0098E6] disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
        </button>
      </div>
    </div>
  );
}

// ─── Challenge detail ─────────────────────────────────────────────────────────

function ChallengeDetail({ challenge, isMentor, userId, interns, onBack, onRefresh }: {
  challenge: Challenge; isMentor: boolean; userId: string; interns: HubUser[];
  onBack: () => void; onRefresh: () => void;
}) {
  const [savingStatus, setSavingStatus] = useState(false);
  const [announcing, setAnnouncing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingDeadline, setEditingDeadline] = useState(false);
  const [deadlineDraft, setDeadlineDraft] = useState(challenge.deadline ? toLocalInputValue(challenge.deadline) : "");
  const [savingDeadline, setSavingDeadline] = useState(false);
  const max = schemaMax(challenge.scoringSchema);
  const cd = challenge.deadline ? fmtCountdown(challenge.deadline) : null;

  // Team-vs-team secrecy: mentors see every team; interns only see the team(s)
  // they belong to. The API already redacts mission/submissions/scores for
  // teams the requester isn't on — this filter also hides the panel entirely
  // so it's obvious you're not meant to see it, rather than showing an
  // oddly-empty card.
  const visibleTeams = isMentor ? challenge.teams : challenge.teams.filter(t => isOnTeam(t, userId));
  const onNoTeam = !isMentor && visibleTeams.length === 0;

  // Scores stay hidden from interns (even for their own team's leaderboard
  // ranking against the opponent) until the challenge is marked completed —
  // otherwise seeing your own running total already reveals relative pace.
  const canSeeLeaderboard = isMentor || challenge.status === "completed";
  const ranked = [...challenge.teams].sort((a, b) => teamTotal(b) - teamTotal(a));

  const updateStatus = async (status: string) => {
    setSavingStatus(true);
    try {
      const res = await fetch(`/api/internship/challenges/${challenge.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      onRefresh();
    } catch { toast.error("Failed to update status"); }
    finally { setSavingStatus(false); }
  };

  const setWinner = async (winnerTeamId: string | null) => {
    setAnnouncing(true);
    try {
      const res = await fetch(`/api/internship/challenges/${challenge.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ winnerTeamId }),
      });
      if (!res.ok) throw new Error();
      toast.success(winnerTeamId ? "Winner announced" : "Winner cleared — challenge reopened");
      onRefresh();
    } catch { toast.error("Failed to update winner"); }
    finally { setAnnouncing(false); }
  };

  const saveDeadline = async () => {
    setSavingDeadline(true);
    try {
      const res = await fetch(`/api/internship/challenges/${challenge.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deadline: deadlineDraft ? new Date(deadlineDraft).toISOString() : null }),
      });
      if (!res.ok) throw new Error();
      toast.success("Deadline updated");
      setEditingDeadline(false);
      onRefresh();
    } catch { toast.error("Failed to update deadline"); }
    finally { setSavingDeadline(false); }
  };

  const deleteChallenge = async () => {
    if (!confirm(`Delete "${challenge.title}"? This removes both teams, all scores, and all submissions permanently.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/internship/challenges/${challenge.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Challenge deleted");
      onBack();
    } catch { toast.error("Failed to delete challenge"); }
    finally { setDeleting(false); }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-[#8A92A6] hover:text-[#E6E9F0] transition-colors">
        <ArrowRight className="w-4 h-4 rotate-180" /> Back to Challenges
      </button>

      <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold text-[#E6E9F0]">{challenge.title}</h2>
              <ChallengeStatusBadge s={challenge.status} />
              {challenge.winnerTeam && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-[#f4b400] bg-[#f4b400]/12">
                  <Crown className="w-3 h-3" /> {challenge.winnerTeam.name} won
                </span>
              )}
            </div>
            <p className="text-sm text-[#8A92A6] mt-2 whitespace-pre-wrap">{challenge.description}</p>
          </div>
          {!editingDeadline && (
            <div className="flex items-center gap-1.5 shrink-0">
              {cd ? (
                <span className={`flex items-center gap-1.5 text-sm font-mono ${cd.overdue ? "text-[#ea4335]" : "text-[#00C2FF]"}`}>
                  <CalendarClock className="w-4 h-4" /> {cd.label}
                </span>
              ) : (
                <span className="text-sm text-[#5A6275]">No deadline set</span>
              )}
              {isMentor && (
                <button onClick={() => setEditingDeadline(true)} className="text-[11px] text-[#00C2FF] hover:underline">
                  Edit
                </button>
              )}
            </div>
          )}
        </div>

        {isMentor && editingDeadline && (
          <div className="flex items-center gap-2 mt-3 flex-wrap bg-[#1B1F2A] border border-[#2E333F] rounded-lg p-2.5">
            <label className="text-xs text-[#8A92A6]">Deadline:</label>
            <input type="datetime-local" value={deadlineDraft} onChange={e => setDeadlineDraft(e.target.value)}
              className="px-2.5 py-1 bg-[#0E1018] border border-[#2E333F] rounded-lg text-xs text-[#E6E9F0] focus:outline-none focus:border-[#00C2FF]/60" />
            <button onClick={saveDeadline} disabled={savingDeadline}
              className="flex items-center gap-1 px-2.5 py-1 bg-[#00C2FF] text-[#06121A] text-xs font-semibold rounded-lg hover:bg-[#0098E6] disabled:opacity-50">
              {savingDeadline ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
            </button>
            {deadlineDraft && (
              <button onClick={() => setDeadlineDraft("")} className="text-xs text-[#8A92A6] hover:text-[#ea4335]">
                Clear
              </button>
            )}
            <button onClick={() => { setEditingDeadline(false); setDeadlineDraft(challenge.deadline ? toLocalInputValue(challenge.deadline) : ""); }}
              className="text-xs text-[#8A92A6] hover:text-[#E6E9F0] ml-auto">
              Cancel
            </button>
          </div>
        )}

        {isMentor && (
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <label className="text-xs text-[#8A92A6]">Status:</label>
            <select disabled={savingStatus} value={challenge.status} onChange={e => updateStatus(e.target.value)}
              className="px-2.5 py-1 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-xs text-[#E6E9F0] focus:outline-none focus:border-[#00C2FF]/60">
              {Object.keys(CHALLENGE_STATUS_CFG).map(s => <option key={s} value={s}>{CHALLENGE_STATUS_CFG[s].label}</option>)}
            </select>
            {!challenge.winnerTeamId ? (
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-xs text-[#8A92A6]">Announce winner:</span>
                {challenge.teams.map(t => (
                  <button key={t.id} disabled={announcing} onClick={() => setWinner(t.id)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors hover:bg-[#1B1F2A]"
                    style={{ borderColor: teamColorHex(t.color), color: teamColorHex(t.color) }}>
                    <Trophy className="w-3 h-3" /> {t.name}
                  </button>
                ))}
              </div>
            ) : (
              <button disabled={announcing} onClick={() => setWinner(null)}
                className="flex items-center gap-1.5 ml-auto px-2.5 py-1 rounded-full text-xs font-semibold text-[#8A92A6] border border-[#262A35] hover:text-[#ea4335] hover:border-[#ea4335]/40 transition-colors">
                {announcing ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />} Undo winner
              </button>
            )}
          </div>
        )}
      </div>

      {isMentor && (
        <div className="flex justify-end">
          <button onClick={deleteChallenge} disabled={deleting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#5A6275] hover:text-[#ea4335] hover:bg-[#ea4335]/10 rounded-lg transition-colors disabled:opacity-50">
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Delete challenge
          </button>
        </div>
      )}

      {/* Leaderboard — hidden from interns until judging is complete */}
      {canSeeLeaderboard ? (
        <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-[#E6E9F0] mb-3 flex items-center gap-2"><Award className="w-4 h-4 text-[#00C2FF]" /> Leaderboard</h3>
          <div className="space-y-2">
            {ranked.map((t, i) => {
              const total = teamTotal(t);
              const pct = max > 0 ? Math.min(100, (total / max) * 100) : 0;
              return (
                <div key={t.id} className="flex items-center gap-3">
                  <span className="w-5 text-xs font-mono text-[#5A6275]">{i === 0 && total > 0 ? <Crown className="w-3.5 h-3.5 text-[#f4b400]" /> : `#${i + 1}`}</span>
                  <span className="w-28 text-xs font-medium truncate" style={{ color: teamColorHex(t.color) }}>{t.name}</span>
                  <div className="flex-1 h-2 rounded-full bg-[#1B1F2A] overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: teamColorHex(t.color) }} />
                  </div>
                  <span className="w-16 text-right text-xs font-mono text-[#8A92A6]">{total}/{max}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-4 flex items-center gap-3 text-sm text-[#5A6275]">
          <Lock className="w-4 h-4 shrink-0" /> Leaderboard and scores are revealed once judging is complete — teams can{"'"}t see how they compare while the challenge is live.
        </div>
      )}

      {onNoTeam && (
        <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-4 text-sm text-[#8A92A6]">
          You{"'"}re not assigned to a team for this challenge yet.
        </div>
      )}

      {/* Team panels — an intern only ever sees their own team's card */}
      <div className={`grid grid-cols-1 ${visibleTeams.length > 1 ? "md:grid-cols-2" : ""} gap-4`}>
        {visibleTeams.map(team => (
          <TeamPanel key={team.id} team={team} challenge={challenge} isMentor={isMentor} userId={userId} interns={interns} onRefresh={onRefresh} />
        ))}
      </div>
    </div>
  );
}

// ─── Team panel (mission, scorecard, submissions, mentor roster editor) ──────

function TeamPanel({ team, challenge, isMentor, userId, interns, onRefresh }: {
  team: ChallengeTeam; challenge: Challenge; isMentor: boolean; userId: string; interns: HubUser[]; onRefresh: () => void;
}) {
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({});
  const [savingCategory, setSavingCategory] = useState<string | null>(null);
  const [submitNotes, setSubmitNotes] = useState("");
  const [submitLinks, setSubmitLinks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitFiles, setSubmitFiles] = useState<{ name: string; url: string; type?: string; size?: number }[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<string[]>([]);
  const [editingRoster, setEditingRoster] = useState(false);
  const [rosterLeadId, setRosterLeadId] = useState(team.leadId ?? "");
  const [rosterMemberIds, setRosterMemberIds] = useState<string[]>(team.memberIds);
  const [savingRoster, setSavingRoster] = useState(false);

  const isMember = isOnTeam(team, userId);
  const color = teamColorHex(team.color);
  const memberUsers = interns.filter(i => team.memberIds.includes(i.id));
  const revealScores = isMentor || challenge.status === "completed";

  const scoreFor = (category: string) => team.scores.find(s => s.category === category);

  const saveScore = async (cat: ScoringCategory) => {
    const draft = scoreDrafts[cat.key];
    const existing = scoreFor(cat.key);
    const points = draft !== undefined ? Number(draft) : existing?.points ?? 0;
    if (Number.isNaN(points) || points < 0 || points > cat.maxPoints) {
      toast.error(`Points must be between 0 and ${cat.maxPoints}`); return;
    }
    setSavingCategory(cat.key);
    try {
      const res = await fetch(`/api/internship/challenges/${challenge.id}/scores`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: team.id, category: cat.key, points, maxPoints: cat.maxPoints }),
      });
      if (!res.ok) throw new Error();
      onRefresh();
    } catch { toast.error("Failed to save score"); }
    finally { setSavingCategory(null); }
  };

  const submitReport = async () => {
    if (!submitNotes.trim() && !submitLinks.trim() && submitFiles.length === 0) {
      toast.error("Add a note, a link, or attach your report file before submitting"); return;
    }
    setSubmitting(true);
    try {
      const links = submitLinks.split(/\s|,/).map(l => l.trim()).filter(Boolean);
      const res = await fetch(`/api/internship/challenges/${challenge.id}/submissions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: team.id, notes: submitNotes || undefined, links, files: submitFiles }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error); }
      toast.success("Submitted");
      setSubmitNotes(""); setSubmitLinks(""); setSubmitFiles([]);
      onRefresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to submit"); }
    finally { setSubmitting(false); }
  };

  const uploadReportFile = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    for (const file of Array.from(fileList)) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!["pdf", "doc", "docx"].includes(ext ?? "")) {
        toast.error(`${file.name}: only PDF or Word files can be attached`); continue;
      }
      setUploadingFiles(prev => [...prev, file.name]);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("teamId", team.id);
        const res = await fetch(`/api/internship/challenges/${challenge.id}/submissions/upload`, {
          method: "POST", body: formData,
        });
        if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Upload failed"); }
        const uploaded = await res.json();
        setSubmitFiles(prev => [...prev, uploaded]);
        toast.success(`${file.name} attached`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Failed to upload ${file.name}`);
      } finally {
        setUploadingFiles(prev => prev.filter(n => n !== file.name));
      }
    }
  };

  const saveRoster = async () => {
    setSavingRoster(true);
    try {
      const res = await fetch(`/api/internship/challenges/${challenge.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teams: [{ id: team.id, leadId: rosterLeadId || null, memberIds: rosterMemberIds }] }),
      });
      if (!res.ok) throw new Error();
      toast.success("Roster updated");
      setEditingRoster(false);
      onRefresh();
    } catch { toast.error("Failed to update roster"); }
    finally { setSavingRoster(false); }
  };

  return (
    <div className="bg-[#12151D] border rounded-xl p-4 space-y-3" style={{ borderColor: `${color}44` }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
          <h4 className="font-semibold text-sm" style={{ color }}>{team.name}</h4>
        </div>
        <div className="flex items-center gap-2">
          {revealScores && <span className="text-xs font-mono text-[#8A92A6]">{teamTotal(team)}/{schemaMax(challenge.scoringSchema)}</span>}
          {isMentor && (
            <button onClick={() => setEditingRoster(v => !v)} className="text-[11px] text-[#00C2FF] hover:underline">
              {editingRoster ? "Cancel" : "Edit roster"}
            </button>
          )}
        </div>
      </div>

      {team.mission && <p className="text-xs text-[#8A92A6] whitespace-pre-wrap">{team.mission}</p>}

      {isMentor && editingRoster ? (
        <div className="bg-[#1B1F2A] border border-[#2E333F] rounded-lg p-3 space-y-2">
          <div>
            <label className="block text-[11px] text-[#5A6275] mb-1">Team lead</label>
            <select className="w-full px-2.5 py-1.5 bg-[#0E1018] border border-[#2E333F] rounded-lg text-xs text-[#E6E9F0] focus:outline-none focus:border-[#00C2FF]/60"
              value={rosterLeadId} onChange={e => setRosterLeadId(e.target.value)}>
              <option value="">— none —</option>
              {interns.map(intern => <option key={intern.id} value={intern.id}>{intern.fullName}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-[#5A6275] mb-1">Members</label>
            <div className="flex flex-wrap gap-1.5">
              {interns.map(intern => (
                <button key={intern.id} type="button"
                  onClick={() => setRosterMemberIds(prev => prev.includes(intern.id) ? prev.filter(id => id !== intern.id) : [...prev, intern.id])}
                  className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                    rosterMemberIds.includes(intern.id)
                      ? "border-[#00C2FF] bg-[#0E2532] text-[#00C2FF]"
                      : "border-[#262A35] text-[#8A92A6] hover:bg-[#12151D]"
                  }`}>
                  {intern.fullName}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={saveRoster} disabled={savingRoster}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold bg-[#00C2FF] text-[#06121A] rounded-lg hover:bg-[#0098E6] disabled:opacity-50">
              {savingRoster ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save roster"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 flex-wrap">
          {team.lead && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#1B1F2A] text-[#E6E9F0]">
              <Star className="w-3 h-3 text-[#f4b400]" /> {team.lead.fullName} (Lead)
            </span>
          )}
          {memberUsers.filter(m => m.id !== team.leadId).map(m => (
            <span key={m.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#1B1F2A] text-[#8A92A6]">
              <Users className="w-3 h-3" /> {m.fullName}
            </span>
          ))}
          {team.memberIds.length === 0 && !team.leadId && (
            <span className="text-[11px] text-[#5A6275]">No members assigned yet</span>
          )}
        </div>
      )}

      {/* Scorecard */}
      <div className="space-y-1.5 pt-1 border-t border-[#262A35]">
        {challenge.scoringSchema.map(cat => {
          const existing = scoreFor(cat.key);
          return (
            <div key={cat.key} className="flex items-center gap-2">
              <span className="flex-1 text-xs text-[#8A92A6] truncate">{cat.label}</span>
              {isMentor ? (
                <>
                  <input type="number" min={0} max={cat.maxPoints}
                    className="w-14 px-1.5 py-1 bg-[#1B1F2A] border border-[#2E333F] rounded text-xs text-[#E6E9F0] text-right focus:outline-none focus:border-[#00C2FF]/60"
                    placeholder={String(existing?.points ?? 0)}
                    value={scoreDrafts[cat.key] ?? ""}
                    onChange={e => setScoreDrafts(p => ({ ...p, [cat.key]: e.target.value }))}
                  />
                  <span className="text-[11px] text-[#5A6275]">/ {cat.maxPoints}</span>
                  <button onClick={() => saveScore(cat)} disabled={savingCategory === cat.key}
                    className="px-2 py-1 text-[11px] font-semibold bg-[#1B1F2A] text-[#00C2FF] rounded hover:bg-[#0E2532] disabled:opacity-50">
                    {savingCategory === cat.key ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                  </button>
                </>
              ) : revealScores ? (
                <span className="text-xs font-mono text-[#E6E9F0]">{existing ? `${existing.points}/${cat.maxPoints}` : <span className="text-[#5A6275]">— / {cat.maxPoints}</span>}</span>
              ) : (
                <span className="text-xs text-[#5A6275] flex items-center gap-1"><Lock className="w-3 h-3" /> hidden</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Submissions */}
      <div className="pt-1 border-t border-[#262A35] space-y-2">
        <p className="text-[11px] font-medium text-[#5A6275] flex items-center gap-1"><FileText className="w-3 h-3" /> Submissions</p>
        {team.submissions.length === 0 && <p className="text-[11px] text-[#3A4150]">Nothing submitted yet</p>}
        {team.submissions.map(s => (
          <div key={s.id} className="text-xs bg-[#1B1F2A] rounded-lg p-2">
            <div className="flex items-center gap-1.5 text-[#8A92A6]">
              <Avatar user={s.submitter} size={4} /> <span>{s.submitter.fullName}</span>
              <span className="text-[10px] text-[#5A6275] ml-auto">{fmt(s.createdAt)}</span>
            </div>
            {s.notes && <p className="text-[#C8CEDB] mt-1">{s.notes}</p>}
            {s.files && s.files.length > 0 && (
              <div className="flex flex-col gap-0.5 mt-1">
                {s.files.map((f, i) => (
                  <a key={i} href={f.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-[#00C2FF] hover:underline truncate">
                    <FileText className="w-3 h-3 shrink-0" /> {f.name}
                    {f.size ? <span className="text-[10px] text-[#5A6275]">({fmtBytes(f.size)})</span> : null}
                    <Download className="w-3 h-3 shrink-0 ml-auto" />
                  </a>
                ))}
              </div>
            )}
            {s.links.length > 0 && (
              <div className="flex flex-col gap-0.5 mt-1">
                {s.links.map((l, i) => (
                  <a key={i} href={l} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[#00C2FF] hover:underline truncate">
                    <Link2 className="w-3 h-3 shrink-0" /> {l}
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}

        {(isMentor || isMember) && (
          <div className="space-y-1.5">
            <textarea rows={2} className="w-full px-2 py-1.5 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-xs text-[#E6E9F0] placeholder:text-[#5A6275] focus:outline-none focus:border-[#00C2FF]/60 resize-none"
              placeholder="Report notes…" value={submitNotes} onChange={e => setSubmitNotes(e.target.value)} />
            <input className="w-full px-2 py-1.5 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-xs text-[#E6E9F0] placeholder:text-[#5A6275] focus:outline-none focus:border-[#00C2FF]/60"
              placeholder="Links (space or comma separated)" value={submitLinks} onChange={e => setSubmitLinks(e.target.value)} />

            {/* Report file attachment — PDF/Word only, uploaded straight to this page */}
            <label className="flex items-center gap-1.5 px-2 py-1.5 bg-[#1B1F2A] border border-dashed border-[#2E333F] rounded-lg text-xs text-[#8A92A6] hover:border-[#00C2FF]/60 hover:text-[#00C2FF] cursor-pointer transition-colors">
              <Paperclip className="w-3.5 h-3.5" />
              Attach report (PDF or Word)
              <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                multiple className="hidden" onChange={e => { uploadReportFile(e.target.files); e.target.value = ""; }} />
            </label>

            {uploadingFiles.length > 0 && (
              <div className="space-y-1">
                {uploadingFiles.map(name => (
                  <div key={name} className="flex items-center gap-1.5 text-[11px] text-[#8A92A6]">
                    <Loader2 className="w-3 h-3 animate-spin" /> Uploading {name}…
                  </div>
                ))}
              </div>
            )}

            {submitFiles.length > 0 && (
              <div className="space-y-1">
                {submitFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-[#1B1F2A] rounded-lg text-[11px] text-[#E6E9F0]">
                    <FileText className="w-3 h-3 text-[#00C2FF] shrink-0" />
                    <span className="truncate flex-1">{f.name}</span>
                    <span className="text-[10px] text-[#5A6275]">{fmtBytes(f.size)}</span>
                    <button type="button" onClick={() => setSubmitFiles(prev => prev.filter((_, idx) => idx !== i))}
                      className="text-[#5A6275] hover:text-[#ea4335]">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end">
              <button onClick={submitReport} disabled={submitting || uploadingFiles.length > 0}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold bg-[#00C2FF] text-[#06121A] rounded-lg hover:bg-[#0098E6] disabled:opacity-50">
                {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Send className="w-3 h-3" /> Submit</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
