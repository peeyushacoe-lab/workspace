"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart3, CalendarDays, CalendarOff, Check, ChevronDown, ChevronRight, ClipboardList,
  Download, FileText, Loader2, Network, Plus, RefreshCw, Save, Trash2, Upload, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/Shell";
import { avatarGradient } from "@/lib/avatar";

/* ── shared types & helpers ────────────────────────────────────────────── */

interface StaffRow {
  id: string;
  fullName: string;
  email: string;
  role: string;
  avatarUrl?: string | null;
  jobTitle: string;
  department: string;
  employeeId: string | null;
  hr: {
    startDate?: string; endDate?: string; phone?: string;
    emergencyContactName?: string; emergencyContactPhone?: string;
    reportingManager?: string; employmentType?: string; employmentStatus?: string;
  };
}

type Draft = {
  employeeId: string; jobTitle: string; department: string;
  reportingManager: string; employmentType: string; employmentStatus: string;
  startDate: string; endDate: string;
  phone: string; emergencyContactName: string; emergencyContactPhone: string;
};

interface LeaveRow {
  id: string; type: string; startDate: string; endDate: string; days: number;
  reason?: string | null; status: string; reviewNote?: string | null; createdAt: string;
  user: { id: string; fullName: string; avatarUrl?: string | null; role: string };
  reviewer?: { fullName: string } | null;
}

interface Holiday { id: string; name: string; date: string }
interface HRDoc { id: string; title: string; category: string; fileName: string; size: number; createdAt: string }
interface ChecklistItem { id: string; kind: string; title: string; description?: string | null; completedAt?: string | null }

const EMPLOYMENT_TYPES = ["", "Full-time", "Part-time", "Contract"];
const EMPLOYMENT_STATUSES = ["", "Active", "On leave", "Terminated"];
const DOC_CATEGORIES = ["CONTRACT", "OFFER_LETTER", "ID_DOCUMENT", "CERTIFICATE", "POLICY", "PAYSLIP", "OTHER"];

function rowToDraft(r: StaffRow): Draft {
  return {
    employeeId: r.employeeId ?? "",
    jobTitle: r.jobTitle ?? "",
    department: r.department ?? "",
    reportingManager: r.hr.reportingManager ?? "",
    employmentType: r.hr.employmentType ?? "",
    employmentStatus: r.hr.employmentStatus ?? "",
    startDate: r.hr.startDate ?? "",
    endDate: r.hr.endDate ?? "",
    phone: r.hr.phone ?? "",
    emergencyContactName: r.hr.emergencyContactName ?? "",
    emergencyContactPhone: r.hr.emergencyContactPhone ?? "",
  };
}

function initials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}
function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const fieldClass =
  "w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] placeholder:text-[#5A6275] focus:outline-none focus:border-[#00C2FF]/60";

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  APPROVED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  REJECTED: "bg-red-500/10 text-red-400 border-red-500/20",
  CANCELLED: "bg-[#1B1F2A] text-[#5A6275] border-[#2E333F]",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-[#8A92A6] mb-1">{label}</label>
      {children}
    </div>
  );
}

function AvatarChip({ name, avatarUrl, size = 7 }: { name: string; avatarUrl?: string | null; size?: number }) {
  return avatarUrl
    ? <img src={avatarUrl} alt={name} className={`w-${size} h-${size} rounded-full object-cover shrink-0`} />
    : <div className={`w-${size} h-${size} rounded-full flex items-center justify-center text-white text-[11px] font-semibold shrink-0`} style={{ background: avatarGradient(name) }}>{initials(name)}</div>;
}

/* ── page shell with tabs ──────────────────────────────────────────────── */

type Tab = "dashboard" | "people" | "leave" | "holidays" | "orgchart";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "people", label: "People", icon: Users },
  { id: "leave", label: "Leave", icon: CalendarDays },
  { id: "holidays", label: "Holidays", icon: CalendarOff },
  { id: "orgchart", label: "Org chart", icon: Network },
];

export default function AdminHRPage() {
  const [tab, setTab] = useState<Tab>("dashboard");

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (t && TABS.some(x => x.id === t)) setTab(t);
  }, []);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        eyebrow="Admin"
        title="HR"
        description="People records, leave, holidays, onboarding and the org chart. Interns are managed in Mentor."
      />
      <div className="px-6 border-b border-[#1C1F28] flex gap-1 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              tab === t.id ? "border-[#00C2FF] text-[#00C2FF]" : "border-transparent text-[#8A92A6] hover:text-[#E6E9F0]"
            }`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto bg-[#0B0D12] p-6">
        <div className="max-w-5xl mx-auto">
          {tab === "dashboard" && <DashboardTab />}
          {tab === "people" && <PeopleTab />}
          {tab === "leave" && <LeaveTab />}
          {tab === "holidays" && <HolidaysTab />}
          {tab === "orgchart" && <OrgChartTab />}
        </div>
      </div>
    </div>
  );
}

/* ── Dashboard ─────────────────────────────────────────────────────────── */

interface Summary {
  staffCount: number; internCount: number; pendingLeave: number; newLast30d: number;
  openOnboardingUsers: number;
  onLeaveToday: (LeaveRow & { user: { id: string; fullName: string; avatarUrl?: string | null; role: string } })[];
  upcomingHolidays: Holiday[];
  byDepartment: Record<string, number>;
  byRole: Record<string, number>;
}

function StatCard({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-4">
      <p className="text-xs font-medium text-[#8A92A6]">{label}</p>
      <p className={`text-2xl font-semibold tracking-tight mt-1 ${accent ? "text-[#00C2FF]" : "text-[#E6E9F0]"}`}>{value}</p>
    </div>
  );
}

function DashboardTab() {
  const [data, setData] = useState<Summary | null>(null);

  useEffect(() => {
    fetch("/api/hr/summary").then(r => (r.ok ? r.json() : null)).then(setData).catch(() => setData(null));
  }, []);

  if (!data) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-[#00C2FF]" /></div>;

  const deptEntries = Object.entries(data.byDepartment).sort((a, b) => b[1] - a[1]);
  const maxDept = Math.max(1, ...deptEntries.map(([, v]) => v));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Staff" value={data.staffCount} />
        <StatCard label="Interns" value={data.internCount} />
        <StatCard label="Pending leave" value={data.pendingLeave} accent={data.pendingLeave > 0} />
        <StatCard label="Joined last 30d" value={data.newLast30d} />
        <StatCard label="Open onboarding" value={data.openOnboardingUsers} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-[#E6E9F0] mb-3">On leave today</h3>
          {data.onLeaveToday.length === 0 ? (
            <p className="text-sm text-[#5A6275]">Everyone is in — no approved leave covers today.</p>
          ) : (
            <div className="space-y-2">
              {data.onLeaveToday.map(l => (
                <div key={l.id} className="flex items-center gap-3">
                  <AvatarChip name={l.user.fullName} avatarUrl={l.user.avatarUrl} />
                  <div className="min-w-0">
                    <p className="text-sm text-[#E6E9F0] truncate">{l.user.fullName}</p>
                    <p className="text-xs text-[#5A6275]">{l.type.toLowerCase()} · until {fmt(l.endDate)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <h3 className="text-sm font-semibold text-[#E6E9F0] mt-5 mb-2">Upcoming holidays</h3>
          {data.upcomingHolidays.length === 0 ? (
            <p className="text-sm text-[#5A6275]">None in the next 30 days.</p>
          ) : (
            data.upcomingHolidays.map(h => (
              <div key={h.id} className="flex items-center justify-between py-1.5">
                <span className="text-sm text-[#E6E9F0]">{h.name}</span>
                <span className="text-xs font-mono text-[#8A92A6]">{fmt(h.date)}</span>
              </div>
            ))
          )}
        </div>

        <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-[#E6E9F0] mb-3">Headcount by department</h3>
          <div className="space-y-2.5">
            {deptEntries.map(([dept, count]) => (
              <div key={dept}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#8A92A6]">{dept}</span>
                  <span className="font-mono text-[#E6E9F0]">{count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-[#1B1F2A] overflow-hidden">
                  <div className="h-full rounded-full bg-[#00C2FF]" style={{ width: `${(count / maxDept) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── People (records + per-person docs & onboarding) ───────────────────── */

function PeopleTab() {
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/hr");
      const data = res.ok ? (await res.json() as StaffRow[]) : [];
      setRows(data);
      setDrafts(Object.fromEntries(data.map(r => [r.id, rowToDraft(r)])));
    } catch { setRows([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setField = (id: string, field: keyof Draft, value: string) =>
    setDrafts(p => ({ ...p, [id]: { ...p[id], [field]: value } }));

  const saveRow = async (id: string) => {
    const d = drafts[id];
    if (!d) return;
    setSavingId(id);
    try {
      const res = await fetch("/api/admin/hr", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id, ...d }),
      });
      if (!res.ok) throw new Error();
      toast.success("HR record saved");
      setRows(p => p.map(r => r.id === id ? {
        ...r, employeeId: d.employeeId || null, jobTitle: d.jobTitle, department: d.department,
        hr: { startDate: d.startDate, endDate: d.endDate, phone: d.phone, emergencyContactName: d.emergencyContactName, emergencyContactPhone: d.emergencyContactPhone, reportingManager: d.reportingManager, employmentType: d.employmentType, employmentStatus: d.employmentStatus },
      } : r));
    } catch { toast.error("Failed to save"); }
    finally { setSavingId(null); }
  };

  const backfill = async () => {
    setBackfilling(true);
    try {
      const res = await fetch("/api/admin/hr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "backfill" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      toast.success(data.assigned > 0 ? `Assigned ${data.assigned} employee ID${data.assigned !== 1 ? "s" : ""}` : "Everyone already has an ID");
      await load();
    } catch { toast.error("Backfill failed"); }
    finally { setBackfilling(false); }
  };

  const missingCount = rows.filter(r => !r.employeeId).length;
  const managerOptions = rows.map(r => r.fullName);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-[#8A92A6]">Staff records · <span className="text-[#E6E9F0] font-medium">{rows.length}</span></p>
        <button onClick={backfill} disabled={backfilling || missingCount === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#0E2532] text-[#00C2FF] hover:bg-[#133347] disabled:opacity-50 transition-colors">
          {backfilling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {missingCount > 0 ? `Assign ${missingCount} missing ID${missingCount !== 1 ? "s" : ""}` : "All IDs assigned"}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-[#00C2FF] animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#0E2532] flex items-center justify-center mb-4"><Users className="w-7 h-7 text-[#00C2FF]" /></div>
          <p className="font-semibold text-[#E6E9F0]">No staff found</p>
          <p className="text-sm text-[#5A6275] mt-1 max-w-xs">No non-intern accounts exist yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(r => {
            const d = drafts[r.id] ?? rowToDraft(r);
            return (
              <div key={r.id} className="bg-[#12151D] border border-[#262A35] rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <AvatarChip name={r.fullName} avatarUrl={r.avatarUrl} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#E6E9F0] truncate">{r.fullName}</p>
                    <p className="text-[11px] text-[#5A6275] truncate">{r.email} · {r.role}</p>
                  </div>
                  <button onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                    className="ml-auto flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg text-[#8A92A6] hover:text-[#E6E9F0] hover:bg-[#1B1F2A] transition-colors">
                    {expanded === r.id ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    Docs & onboarding
                  </button>
                  <button onClick={() => saveRow(r.id)} disabled={savingId === r.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#00C2FF] text-[#06121A] text-xs font-semibold rounded-lg hover:bg-[#0098E6] disabled:opacity-50">
                    {savingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Field label="Employee number">
                    <input value={d.employeeId} onChange={e => setField(r.id, "employeeId", e.target.value)} placeholder="SE0112026" className={`${fieldClass} font-mono`} />
                  </Field>
                  <Field label="Job title">
                    <input value={d.jobTitle} onChange={e => setField(r.id, "jobTitle", e.target.value)} placeholder="e.g. Security Engineer" className={fieldClass} />
                  </Field>
                  <Field label="Department">
                    <input value={d.department} onChange={e => setField(r.id, "department", e.target.value)} placeholder="e.g. Engineering" className={fieldClass} />
                  </Field>
                  <Field label="Reporting manager">
                    <select value={d.reportingManager} onChange={e => setField(r.id, "reportingManager", e.target.value)} className={fieldClass}>
                      <option value="">—</option>
                      {managerOptions.filter(n => n !== r.fullName).map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </Field>
                  <Field label="Employment type">
                    <select value={d.employmentType} onChange={e => setField(r.id, "employmentType", e.target.value)} className={fieldClass}>
                      {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t || "—"}</option>)}
                    </select>
                  </Field>
                  <Field label="Status">
                    <select value={d.employmentStatus} onChange={e => setField(r.id, "employmentStatus", e.target.value)} className={fieldClass}>
                      {EMPLOYMENT_STATUSES.map(s => <option key={s} value={s}>{s || "—"}</option>)}
                    </select>
                  </Field>
                  <Field label="Start date">
                    <input type="date" value={d.startDate} onChange={e => setField(r.id, "startDate", e.target.value)} className={fieldClass} />
                  </Field>
                  <Field label="End date">
                    <input type="date" value={d.endDate} onChange={e => setField(r.id, "endDate", e.target.value)} className={fieldClass} />
                  </Field>
                  <Field label="Phone">
                    <input value={d.phone} onChange={e => setField(r.id, "phone", e.target.value)} placeholder="+44…" className={fieldClass} />
                  </Field>
                  <Field label="Emergency contact">
                    <input value={d.emergencyContactName} onChange={e => setField(r.id, "emergencyContactName", e.target.value)} placeholder="Name" className={fieldClass} />
                  </Field>
                  <Field label="Emergency phone">
                    <input value={d.emergencyContactPhone} onChange={e => setField(r.id, "emergencyContactPhone", e.target.value)} placeholder="+44…" className={fieldClass} />
                  </Field>
                </div>
                {expanded === r.id && <PersonExtras userId={r.id} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Per-person HR documents + onboarding checklist (admin view). */
function PersonExtras({ userId }: { userId: string }) {
  const [docs, setDocs] = useState<HRDoc[]>([]);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [docCategory, setDocCategory] = useState("CONTRACT");
  const [newItem, setNewItem] = useState("");

  const load = useCallback(async () => {
    const [dRes, oRes] = await Promise.all([
      fetch(`/api/hr/documents?userId=${userId}`),
      fetch(`/api/hr/onboarding?userId=${userId}`),
    ]);
    if (dRes.ok) setDocs((await dRes.json()).documents ?? []);
    if (oRes.ok) setItems((await oRes.json()).items ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  async function upload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", file.name);
      fd.append("category", docCategory);
      fd.append("userId", userId);
      const res = await fetch("/api/hr/documents", { method: "POST", body: fd });
      if (res.ok) { toast.success("Uploaded"); void load(); }
      else toast.error((await res.json()).error ?? "Upload failed");
    } finally { setUploading(false); }
  }

  async function removeDoc(id: string) {
    const res = await fetch(`/api/hr/documents?id=${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Deleted"); void load(); }
  }

  async function applyTemplate() {
    const res = await fetch("/api/hr/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, applyTemplate: "ONBOARDING" }),
    });
    if (res.ok) { toast.success("Onboarding checklist created"); void load(); }
    else toast.error((await res.json()).error ?? "Failed");
  }

  async function addItem() {
    if (!newItem.trim()) return;
    const res = await fetch("/api/hr/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, title: newItem.trim() }),
    });
    if (res.ok) { setNewItem(""); void load(); }
  }

  async function toggle(item: ChecklistItem) {
    const res = await fetch("/api/hr/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, completed: !item.completedAt }),
    });
    if (res.ok) void load();
  }

  async function removeItem(id: string) {
    const res = await fetch(`/api/hr/onboarding?id=${id}`, { method: "DELETE" });
    if (res.ok) void load();
  }

  if (loading) return <div className="mt-4 pt-4 border-t border-[#262A35] flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#00C2FF]" /></div>;

  return (
    <div className="mt-4 pt-4 border-t border-[#262A35] grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Documents */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-[#E6E9F0] flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-[#00C2FF]" /> Documents</p>
          <div className="flex items-center gap-2">
            <select value={docCategory} onChange={e => setDocCategory(e.target.value)}
              className="px-2 py-1 bg-[#1B1F2A] border border-[#2E333F] rounded-md text-[11px] text-[#E6E9F0]">
              {DOC_CATEGORIES.map(c => <option key={c} value={c}>{c.replace("_", " ").toLowerCase()}</option>)}
            </select>
            <label className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md bg-[#0E2532] text-[#00C2FF] hover:bg-[#133347] cursor-pointer transition-colors">
              {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} Upload
              <input type="file" className="hidden" disabled={uploading}
                onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
            </label>
          </div>
        </div>
        {docs.length === 0 ? (
          <p className="text-xs text-[#5A6275] py-3">No documents on file.</p>
        ) : (
          docs.map(d => (
            <div key={d.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-[#1B1F2A]">
              <div className="min-w-0">
                <p className="text-xs text-[#E6E9F0] truncate">{d.title}</p>
                <p className="text-[10px] text-[#5A6275]">{d.category.replace("_", " ").toLowerCase()} · {fmtSize(d.size)} · {fmt(d.createdAt)}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <a href={`/api/hr/documents/${d.id}`} target="_blank" rel="noreferrer" className="p-1 rounded text-[#5A6275] hover:text-[#00C2FF]"><Download className="w-3.5 h-3.5" /></a>
                <button onClick={() => void removeDoc(d.id)} className="p-1 rounded text-[#5A6275] hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Onboarding */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-[#E6E9F0] flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5 text-[#00C2FF]" /> Onboarding</p>
          {items.length === 0 && (
            <button onClick={() => void applyTemplate()}
              className="px-2 py-1 text-[11px] font-medium rounded-md bg-[#0E2532] text-[#00C2FF] hover:bg-[#133347] transition-colors">
              Apply default checklist
            </button>
          )}
        </div>
        {items.map(item => (
          <div key={item.id} className="group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[#1B1F2A]">
            <button onClick={() => void toggle(item)} className="shrink-0">
              {item.completedAt
                ? <Check className="w-3.5 h-3.5 text-emerald-400" />
                : <div className="w-3.5 h-3.5 rounded-full border-2 border-[#2E333F]" />}
            </button>
            <span className={`text-xs flex-1 ${item.completedAt ? "text-[#5A6275] line-through" : "text-[#E6E9F0]"}`}>{item.title}</span>
            <button onClick={() => void removeItem(item.id)} className="opacity-0 group-hover:opacity-100 p-0.5 text-[#5A6275] hover:text-red-400"><X className="w-3 h-3" /></button>
          </div>
        ))}
        <div className="flex gap-2 mt-2">
          <input value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => e.key === "Enter" && void addItem()}
            placeholder="Add checklist item…" className={`${fieldClass} !py-1.5 !text-xs`} />
          <button onClick={() => void addItem()} className="px-2.5 rounded-lg bg-[#0E2532] text-[#00C2FF] hover:bg-[#133347]"><Plus className="w-3.5 h-3.5" /></button>
        </div>
      </div>
    </div>
  );
}

/* ── Leave approvals ───────────────────────────────────────────────────── */

function LeaveTab() {
  const [requests, setRequests] = useState<LeaveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/hr/leave?scope=all");
    if (res.ok) setRequests((await res.json()).requests ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function review(id: string, action: "approve" | "reject") {
    let note: string | null = null;
    if (action === "reject") {
      note = window.prompt("Reason for rejection (optional):");
      if (note === null) return;
    }
    setActingId(id);
    try {
      const res = await fetch("/api/hr/leave", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, note: note || undefined }),
      });
      if (res.ok) { toast.success(`Request ${action}d`); void load(); }
      else toast.error((await res.json()).error ?? "Failed");
    } finally { setActingId(null); }
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-[#00C2FF]" /></div>;

  const pending = requests.filter(r => r.status === "PENDING");
  const history = requests.filter(r => r.status !== "PENDING");

  const Row = ({ r, actions }: { r: LeaveRow; actions?: boolean }) => (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-[#12151D] border border-[#262A35] rounded-lg">
      <div className="flex items-center gap-3 min-w-0">
        <AvatarChip name={r.user.fullName} avatarUrl={r.user.avatarUrl} />
        <div className="min-w-0">
          <p className="text-sm text-[#E6E9F0] truncate">
            {r.user.fullName} <span className="text-[#8A92A6]">· {r.type.toLowerCase()}</span>
          </p>
          <p className="text-xs font-mono text-[#5A6275]">{fmt(r.startDate)} → {fmt(r.endDate)} · {r.days}d{r.reason ? ` · ${r.reason}` : ""}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {actions ? (
          <>
            <button onClick={() => void review(r.id, "approve")} disabled={actingId === r.id}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors">
              <Check className="w-3.5 h-3.5" /> Approve
            </button>
            <button onClick={() => void review(r.id, "reject")} disabled={actingId === r.id}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 disabled:opacity-50 transition-colors">
              <X className="w-3.5 h-3.5" /> Reject
            </button>
          </>
        ) : (
          <span className={`px-2 py-0.5 text-[11px] font-medium rounded-full border ${STATUS_STYLE[r.status] ?? STATUS_STYLE.CANCELLED}`}>{r.status.toLowerCase()}</span>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-[#E6E9F0] mb-2">Pending approval · {pending.length}</h3>
        {pending.length === 0
          ? <p className="text-sm text-[#5A6275]">Nothing waiting for review.</p>
          : <div className="space-y-2">{pending.map(r => <Row key={r.id} r={r} actions />)}</div>}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-[#E6E9F0] mb-2">History</h3>
        {history.length === 0
          ? <p className="text-sm text-[#5A6275]">No reviewed requests yet.</p>
          : <div className="space-y-2">{history.slice(0, 50).map(r => <Row key={r.id} r={r} />)}</div>}
      </div>
    </div>
  );
}

/* ── Holidays ──────────────────────────────────────────────────────────── */

function HolidaysTab() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", date: "" });

  const load = useCallback(async () => {
    const res = await fetch("/api/hr/holidays");
    if (res.ok) setHolidays((await res.json()).holidays ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function add() {
    if (!form.name.trim() || !form.date) { toast.error("Name and date required"); return; }
    const res = await fetch("/api/hr/holidays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) { toast.success("Holiday added"); setForm({ name: "", date: "" }); void load(); }
    else toast.error((await res.json()).error ?? "Failed");
  }

  async function remove(id: string) {
    const res = await fetch(`/api/hr/holidays?id=${id}`, { method: "DELETE" });
    if (res.ok) void load();
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex gap-2">
        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Holiday name (e.g. Christmas Day)" className={fieldClass} />
        <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className={`${fieldClass} !w-44`} />
        <button onClick={() => void add()} className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg bg-[#00C2FF] text-[#06121A] hover:bg-[#33cfff] shrink-0 transition-colors">
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-[#00C2FF]" /></div>
      ) : holidays.length === 0 ? (
        <p className="text-sm text-[#5A6275] py-6 text-center">No holidays for this year yet. Holidays are excluded from leave-day counts.</p>
      ) : (
        <div className="space-y-1.5">
          {holidays.map(h => (
            <div key={h.id} className="group flex items-center justify-between px-3 py-2.5 bg-[#12151D] border border-[#262A35] rounded-lg">
              <span className="text-sm text-[#E6E9F0]">{h.name}</span>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-[#8A92A6]">{fmt(h.date)}</span>
                <button onClick={() => void remove(h.id)} className="opacity-0 group-hover:opacity-100 p-1 text-[#5A6275] hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Org chart (built from reporting manager) ──────────────────────────── */

function OrgChartTab() {
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/hr").then(r => (r.ok ? r.json() : [])).then(d => { setRows(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-[#00C2FF]" /></div>;

  const byManager: Record<string, StaffRow[]> = {};
  const names = new Set(rows.map(r => r.fullName));
  const roots: StaffRow[] = [];
  for (const r of rows) {
    const mgr = r.hr.reportingManager?.trim();
    if (mgr && names.has(mgr) && mgr !== r.fullName) (byManager[mgr] ??= []).push(r);
    else roots.push(r);
  }

  const Node = ({ person, depth }: { person: StaffRow; depth: number }) => (
    <div style={{ marginLeft: depth === 0 ? 0 : 24 }}>
      <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border mb-1.5 ${depth === 0 ? "bg-[#0E2532] border-[#00C2FF]/30" : "bg-[#12151D] border-[#262A35]"}`}>
        <AvatarChip name={person.fullName} avatarUrl={person.avatarUrl} />
        <div className="min-w-0">
          <p className="text-sm text-[#E6E9F0] truncate">{person.fullName}</p>
          <p className="text-[11px] text-[#5A6275] truncate">{person.jobTitle || person.role}{person.department ? ` · ${person.department}` : ""}</p>
        </div>
        {byManager[person.fullName]?.length ? (
          <span className="ml-auto text-[10px] font-mono text-[#8A92A6] shrink-0">{byManager[person.fullName].length} report{byManager[person.fullName].length !== 1 ? "s" : ""}</span>
        ) : null}
      </div>
      {(byManager[person.fullName] ?? []).map(c => <Node key={c.id} person={c} depth={depth + 1} />)}
    </div>
  );

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-[#8A92A6] mb-4">Built from the “Reporting manager” field in People. Anyone without a manager appears at the top level.</p>
      {roots.map(r => <Node key={r.id} person={r} depth={0} />)}
    </div>
  );
}
