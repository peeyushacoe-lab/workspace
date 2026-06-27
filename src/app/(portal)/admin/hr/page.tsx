"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Save, RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/Shell";
import { avatarGradient } from "@/lib/avatar";

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

const EMPLOYMENT_TYPES = ["", "Full-time", "Part-time", "Contract"];
const EMPLOYMENT_STATUSES = ["", "Active", "On leave", "Terminated"];

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

const fieldClass =
  "w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] placeholder:text-[#5A6275] focus:outline-none focus:border-[#00C2FF]/60";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-[#8A92A6] mb-1">{label}</label>
      {children}
    </div>
  );
}

export default function AdminHRPage() {
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);

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
    <div className="flex flex-col h-full">
      <PageHeader
        eyebrow="Admin"
        title="HR"
        description="Employee records for all staff. Interns are managed in the Mentor tab."
      />
      <div className="flex-1 overflow-auto bg-[#0B0D12] p-6">
        <div className="max-w-4xl mx-auto space-y-4">
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
                      {r.avatarUrl
                        ? <img src={r.avatarUrl} alt={r.fullName} className="w-7 h-7 rounded-full object-cover shrink-0" />
                        : <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-semibold shrink-0" style={{ background: avatarGradient(r.fullName) }}>{initials(r.fullName)}</div>}
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
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
