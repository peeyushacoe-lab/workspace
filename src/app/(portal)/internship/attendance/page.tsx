"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Clock, LogIn, LogOut, AlertCircle, CheckCircle, CheckCircle2,
  Loader2, Edit2, Monitor, MapPin, UserCheck, Timer,
  CalendarClock, ChevronLeft, ChevronRight, Plus, X, Pencil, Save,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/Shell";
import { avatarGradient } from "@/lib/avatar";

// ─── Types ────────────────────────────────────────────────────────────────────

interface User { id: string; fullName: string; avatarUrl?: string | null; }

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
  punchLocation: { lat: number; lng: number; accuracy: number } | null;
  punchDevice: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
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

function toLocalDatetimeInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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

// ─── Shared components ────────────────────────────────────────────────────────

function Avatar({ user, size = 8 }: { user: { fullName: string; avatarUrl?: string | null }; size?: number }) {
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

// ─── Intern punch card ─────────────────────────────────────────────────────────

function InternAttendanceView({ userId }: { userId: string }) {
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

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isPunchedIn || !record?.sessions.length) return;
    const lastIn = [...record.sessions].reverse().find(s => !s.punchOut)?.punchIn;
    if (!lastIn) return;
    const update = () => {
      const rawMs = Date.now() - new Date(lastIn).getTime();
      let breakMs = 0;
      if (record.breakWindow) {
        const todayDate = new Date().toISOString().slice(0, 10);
        const bStart = new Date(`${todayDate}T${record.breakWindow.from}:00`).getTime();
        const bEnd   = new Date(`${todayDate}T${record.breakWindow.to}:00`).getTime();
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

        <div className="hidden sm:block">
          {record?.firstPunchIn && record?.lastPunchOut ? (
            <div className="w-full py-3 rounded-xl border border-[#0f9d58]/30 bg-[#0f9d58]/10 flex items-center justify-center gap-2 text-[#0f9d58] text-sm font-semibold">
              <CheckCircle2 className="w-4 h-4" /> Attendance complete for today
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

        <div className="sm:hidden flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#2E333F] bg-[#1B1F2A] text-[#5A6275] text-sm">
          <Monitor className="w-4 h-4" />
          Attendance can only be recorded on desktop
        </div>
      </div>

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

// ─── Mentor timesheet view ─────────────────────────────────────────────────────

function MentorAttendanceView() {
  const [schedule, setSchedule] = useState<AttendanceSchedule | null>(null);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({ startTime: "09:00", endTime: "17:00", lateGraceMinutes: 15, defaultBreakFrom: "12:00", defaultBreakTo: "13:00" });
  const [editingSchedule, setEditingSchedule] = useState(false);

  const [date, setDate] = useState(todayStr());
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);

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
            <p className="text-[11px] text-[#5A6275]">Saving will notify all interns immediately and update their Attendance banner.</p>
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

      {/* Date nav + stats */}
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
          {idleCount > 0 && <span className="text-[#ff6d00]"><AlertCircle className="w-3.5 h-3.5 inline mr-1" />{idleCount} idle flag</span>}
        </div>
      </div>

      {/* Timesheet */}
      {loadingRecords ? <LoadingSpinner /> : records.length === 0 ? (
        <EmptyState icon={CalendarClock} title="No interns found" desc="No intern accounts exist yet." />
      ) : (
        <div className="bg-[#12151D] border border-[#262A35] rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_60px_60px_54px_1fr_auto_auto] text-[11px] font-semibold text-[#5A6275] px-4 py-2 border-b border-[#262A35] gap-3">
            <span>Intern</span><span>In</span><span>Out</span><span>Total</span><span>Location / Device</span><span>Status</span><span></span>
          </div>
          <div className="divide-y divide-[#262A35]">
            {records.map(r => (
              <div key={r.intern.id}
                className="grid grid-cols-[1fr_60px_60px_54px_1fr_auto_auto] items-center px-4 py-3 gap-3 hover:bg-[#1B1F2A]/40 transition-colors">
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar user={r.intern} size={7} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#E6E9F0] truncate">{r.intern.fullName}</p>
                    {r.hasOverride && (
                      <p className="text-[10px] text-[#5A6275] flex items-center gap-1"><Edit2 className="w-2.5 h-2.5" /> Adjusted</p>
                    )}
                  </div>
                </div>
                <span className="text-xs font-mono text-[#C8CEDB] whitespace-nowrap">
                  {r.firstPunchIn ? fmtHHMM(r.firstPunchIn) : <span className="text-[#3A4150]">—</span>}
                </span>
                <span className="text-xs font-mono text-[#C8CEDB] whitespace-nowrap">
                  {r.lastPunchOut ? fmtHHMM(r.lastPunchOut) : r.isCurrentlyIn
                    ? <span className="text-[#0f9d58] text-[11px]">● live</span>
                    : <span className="text-[#3A4150]">—</span>}
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className={`text-xs font-mono font-semibold whitespace-nowrap ${r.totalMinutes > 0 ? "text-[#E6E9F0]" : "text-[#3A4150]"}`}>
                    {r.totalMinutes > 0 ? fmtDuration(r.totalMinutes) : "—"}
                  </span>
                  {r.breakMinutes > 0 && (
                    <span className="text-[10px] text-[#5A6275] whitespace-nowrap">−{fmtDuration(r.breakMinutes)} break</span>
                  )}
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  {r.punchLocation ? (
                    <a href={`https://www.google.com/maps?q=${r.punchLocation.lat},${r.punchLocation.lng}`} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-[11px] text-[#00C2FF] hover:underline truncate">
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
                <div className="flex items-center gap-1.5">
                  {!r.firstPunchIn && <span className="text-[11px] text-[#3A4150]">Absent</span>}
                  {r.firstPunchIn && !r.isLate && !r.idleFlag && (
                    <span className="flex items-center gap-0.5 text-[11px] text-[#0f9d58]"><CheckCircle className="w-3 h-3" /> On time</span>
                  )}
                  {r.isLate && <span className="flex items-center gap-0.5 text-[11px] text-[#F59E0B]"><AlertCircle className="w-3 h-3" /> Late</span>}
                  {r.idleFlag && <span className="flex items-center gap-0.5 text-[11px] text-[#ff6d00]"><Timer className="w-3 h-3" /> Idle?</span>}
                </div>
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
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-medium text-[#8A92A6]">Breaks</label>
                  <button type="button"
                    onClick={() => setOverrideBreaks(p => [...p, { from: `${date}T${scheduleForm.defaultBreakFrom}`, to: `${date}T${scheduleForm.defaultBreakTo}`, label: "" }])}
                    className="flex items-center gap-1 text-[11px] text-[#00C2FF] hover:underline">
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
                          value={b.from} onChange={e => setOverrideBreaks(p => p.map((x, j) => j === i ? { ...x, from: e.target.value } : x))} />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] text-[#5A6275] mb-0.5">To</p>
                        <input type="datetime-local"
                          className="w-full px-2 py-1.5 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-xs text-[#E6E9F0] focus:outline-none focus:border-[#00C2FF]/60"
                          value={b.to} onChange={e => setOverrideBreaks(p => p.map((x, j) => j === i ? { ...x, to: e.target.value } : x))} />
                      </div>
                      <div className="w-24">
                        <p className="text-[10px] text-[#5A6275] mb-0.5">Label</p>
                        <input type="text"
                          className="w-full px-2 py-1.5 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-xs text-[#E6E9F0] placeholder:text-[#3A4150] focus:outline-none focus:border-[#00C2FF]/60"
                          placeholder="Lunch…" value={b.label}
                          onChange={e => setOverrideBreaks(p => p.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                      </div>
                      <button type="button"
                        onClick={() => setOverrideBreaks(p => p.filter((_, j) => j !== i))}
                        className="mb-0.5 p-1.5 text-[#5A6275] hover:text-[#ea4335] hover:bg-[#ea4335]/10 rounded-lg transition-colors">
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const [currentUser, setCurrentUser] = useState<(User & { isMentor?: boolean }) | null>(null);

  useEffect(() => {
    fetch("/api/internship/me").then(r => r.json()).then(setCurrentUser).catch(() => null);
  }, []);

  const isMentor = !!currentUser?.isMentor;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        eyebrow="Internship Hub"
        title="Attendance"
        description={isMentor ? "View and manage intern timesheets." : "Track your daily punch-in and punch-out."}
      />
      <div className="flex-1 overflow-auto bg-[#0B0D12] p-6">
        {!currentUser ? (
          <LoadingSpinner />
        ) : isMentor ? (
          <MentorAttendanceView />
        ) : (
          <InternAttendanceView userId={currentUser.id} />
        )}
      </div>
    </div>
  );
}
