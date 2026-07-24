"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CalendarDays, CalendarOff, CheckCircle2, ClipboardList, Download, FileText,
  Loader2, Plane, Plus, Send, ShieldCheck, Stethoscope, Upload, X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/Shell";

/* ── types ─────────────────────────────────────────────────────────────── */

interface Balance { type: string; allowance: number | null; used: number; remaining: number | null }
interface LeaveReq {
  id: string; type: string; startDate: string; endDate: string; days: number;
  reason?: string | null; status: string; reviewNote?: string | null;
  reviewer?: { fullName: string } | null; createdAt: string;
}
interface Holiday { id: string; name: string; date: string }
interface HRDoc {
  id: string; title: string; category: string; fileName: string; size: number;
  createdAt: string; uploadedBy?: { fullName: string } | null;
}
interface ChecklistItem {
  id: string; kind: string; title: string; description?: string | null;
  dueDate?: string | null; completedAt?: string | null;
}
interface Lifecycle {
  status?: "ONBOARDING" | "ACTIVE" | "OFFBOARDING" | "EXITED";
  type?: "RESIGNATION" | "TERMINATION";
  ref?: string; letterDocId?: string; letterSentAt?: string;
  signedDocId?: string; signedReturnedAt?: string; confidentialityAckAt?: string; signedVerifiedAt?: string;
  lastWorkingDay?: string; nocRef?: string; nocDocId?: string; nocIssuedAt?: string;
}

/* ── helpers ───────────────────────────────────────────────────────────── */

const LEAVE_META: Record<string, { label: string; icon: React.ElementType }> = {
  ANNUAL: { label: "Annual", icon: Plane },
  SICK: { label: "Sick", icon: Stethoscope },
  CASUAL: { label: "Casual", icon: CalendarOff },
  UNPAID: { label: "Unpaid", icon: CalendarDays },
  WFH: { label: "Work from home", icon: CalendarDays },
  OTHER: { label: "Other", icon: CalendarDays },
};

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  APPROVED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  REJECTED: "bg-red-500/10 text-red-400 border-red-500/20",
  CANCELLED: "bg-[#1B1F2A] text-[#5A6275] border-[#2E333F]",
};

const CATEGORY_LABEL: Record<string, string> = {
  CONTRACT: "Contract", OFFER_LETTER: "Offer letter", ID_DOCUMENT: "ID document",
  CERTIFICATE: "Certificate", POLICY: "Policy", PAYSLIP: "Payslip", OTHER: "Other",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const inputClass =
  "w-full px-3 py-2 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-sm text-[#E6E9F0] placeholder:text-[#5A6275] focus:outline-none focus:border-[#00C2FF]/60";

function Card({ title, icon: Icon, action, children }: {
  title: string; icon: React.ElementType; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="bg-[#12151D] border border-[#262A35] rounded-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#262A35]">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-[#00C2FF]" />
          <h2 className="text-sm font-semibold text-[#E6E9F0] tracking-tight">{title}</h2>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

/* ── Lifecycle card (onboarding / exit letter → sign & return → NOC) ──── */

function LifecycleCard({ lifecycle: lc, onChanged }: { lifecycle: Lifecycle; onChanged: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [ack, setAck] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!lc.status || lc.status === "ACTIVE") return null;

  const isOnboarding = lc.status === "ONBOARDING";
  const isExited = lc.status === "EXITED";
  const returned = !!lc.signedReturnedAt;

  async function submit() {
    if (!file) { toast.error("Attach your signed letter first"); return; }
    if (!ack) { toast.error("You must acknowledge the confidentiality declaration"); return; }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("ack", "true");
      const res = await fetch("/api/hr/lifecycle/return", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed to submit"); return; }
      toast.success("Signed letter returned — HR has been notified");
      setFile(null); setAck(false);
      onChanged();
    } finally { setSubmitting(false); }
  }

  // ── exited: show the NOC ──
  if (isExited) {
    return (
      <div className="bg-[#12151D] border border-emerald-500/30 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-[#E6E9F0]">Exit complete — NOC issued</h2>
          <span className="px-2 py-0.5 text-[11px] font-medium rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Cleared</span>
        </div>
        <p className="text-xs text-[#8A92A6] mb-3">
          You are no longer associated with Cybersage{lc.nocRef ? ` · Ref ${lc.nocRef}` : ""}. The certificate was also emailed to you.
        </p>
        {lc.nocDocId && (
          <a href={`/api/hr/documents/${lc.nocDocId}`} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-[#1B1F2A] border border-[#262A35] text-[#E6E9F0] hover:border-emerald-500/40 transition-colors">
            <Download className="w-4 h-4 text-emerald-400" /> Download NOC
          </a>
        )}
      </div>
    );
  }

  // ── onboarding / offboarding: letter + sign & return ──
  return (
    <div className="bg-[#12151D] border border-[#00C2FF]/30 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <FileText className="w-4 h-4 text-[#00C2FF]" />
        <h2 className="text-sm font-semibold text-[#E6E9F0]">
          {isOnboarding ? "Your onboarding letter" : lc.type === "TERMINATION" ? "Your termination letter" : "Your exit letter"}
        </h2>
        {lc.ref && <span className="text-[11px] font-mono text-[#5A6275]">{lc.ref}</span>}
        {returned && (
          <span className="px-2 py-0.5 text-[11px] font-medium rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
            Returned ✓ {isOnboarding ? "— awaiting HR verification" : "— NOC on its way"}
          </span>
        )}
      </div>

      <p className="text-xs text-[#8A92A6]">
        {isOnboarding
          ? "Download the letter, sign it, and return it below within 7 days."
          : `Download the letter, sign it, and return it below.${lc.lastWorkingDay ? ` Last working day: ${fmt(lc.lastWorkingDay)}.` : ""} Your NOC is issued once HR verifies the signed copy.`}
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        {lc.letterDocId && (
          <a href={`/api/hr/documents/${lc.letterDocId}`} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-[#1B1F2A] border border-[#262A35] text-[#E6E9F0] hover:border-[#00C2FF]/40 transition-colors">
            <Download className="w-4 h-4 text-[#00C2FF]" /> Download letter
          </a>
        )}
        {lc.signedDocId && (
          <a href={`/api/hr/documents/${lc.signedDocId}`} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-[#1B1F2A] border border-[#262A35] text-[#8A92A6] hover:text-[#E6E9F0] transition-colors">
            <FileText className="w-4 h-4 text-emerald-400" /> Your signed copy
          </a>
        )}
      </div>

      {!returned && (
        <div className="space-y-3 pt-1">
          <label className={`flex items-center gap-2 px-3 py-3 border border-dashed rounded-lg cursor-pointer text-sm transition-colors ${
            file ? "border-[#00C2FF]/50 text-[#E6E9F0]" : "border-[#2E333F] text-[#5A6275] hover:border-[#00C2FF]/40"}`}>
            <Upload className="w-4 h-4 shrink-0" />
            {file ? file.name : "Attach your signed letter (PDF or photo/scan)"}
            <input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" className="hidden"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
          </label>

          <label className="flex items-start gap-2.5 px-3 py-2.5 bg-amber-500/5 border border-amber-500/25 rounded-lg cursor-pointer">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 accent-[#00C2FF]" />
            <span className="text-xs text-[#C8CEDB] leading-relaxed">
              <b className="text-amber-400">Confidentiality acknowledgment (required)</b> — I acknowledge that I must not leak,
              disclose, use or retain any product details, source code, security research, client information or internal data
              belonging to Cybersage, during or after my association with the company.
            </span>
          </label>

          <button onClick={() => void submit()} disabled={submitting || !file || !ack}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-[#00C2FF] text-[#06121A] hover:bg-[#33cfff] disabled:opacity-40 transition-colors">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Submit signed letter
          </button>
        </div>
      )}
    </div>
  );
}

/* ── page ──────────────────────────────────────────────────────────────── */

export default function MyHRPage() {
  const [loading, setLoading] = useState(true);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [requests, setRequests] = useState<LeaveReq[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [docs, setDocs] = useState<HRDoc[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [lifecycle, setLifecycle] = useState<Lifecycle>({});

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "ANNUAL", startDate: "", endDate: "", reason: "" });
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [leaveRes, holRes, docRes, obRes, lcRes] = await Promise.all([
        fetch("/api/hr/leave"),
        fetch("/api/hr/holidays"),
        fetch("/api/hr/documents"),
        fetch("/api/hr/onboarding"),
        fetch("/api/hr/lifecycle"),
      ]);
      if (lcRes.ok) setLifecycle((await lcRes.json()).lifecycle ?? {});
      if (leaveRes.ok) {
        const d = await leaveRes.json();
        setBalances(d.balances ?? []);
        setRequests(d.requests ?? []);
      }
      if (holRes.ok) setHolidays((await holRes.json()).holidays ?? []);
      if (docRes.ok) setDocs((await docRes.json()).documents ?? []);
      if (obRes.ok) setChecklist((await obRes.json()).items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function submitLeave() {
    if (!form.startDate || !form.endDate) { toast.error("Pick start and end dates"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/hr/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed to submit"); return; }
      toast.success("Leave request submitted");
      setShowForm(false);
      setForm({ type: "ANNUAL", startDate: "", endDate: "", reason: "" });
      void load();
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelRequest(id: string) {
    const res = await fetch("/api/hr/leave", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "cancel" }),
    });
    if (res.ok) { toast.success("Request cancelled"); void load(); }
    else toast.error((await res.json()).error ?? "Failed");
  }

  async function uploadDoc(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", file.name);
      fd.append("category", "OTHER");
      const res = await fetch("/api/hr/documents", { method: "POST", body: fd });
      if (res.ok) { toast.success("Document uploaded"); void load(); }
      else toast.error((await res.json()).error ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function toggleItem(item: ChecklistItem) {
    const res = await fetch("/api/hr/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, completed: !item.completedAt }),
    });
    if (res.ok) void load();
  }

  const tracked = balances.filter((b) => b.allowance != null);

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto space-y-5">
      <PageHeader
        eyebrow="People"
        title="My HR"
        description="Leave, holidays, documents and onboarding — all in one place."
        action={
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-[#00C2FF] text-[#06121A] hover:bg-[#33cfff] transition-colors"
          >
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showForm ? "Close" : "Request leave"}
          </button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[#00C2FF]" /></div>
      ) : (
        <>
          <LifecycleCard lifecycle={lifecycle} onChanged={() => void load()} />

          {/* Leave balances */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {tracked.map((b) => {
              const meta = LEAVE_META[b.type] ?? LEAVE_META.OTHER;
              const pct = b.allowance ? Math.min(100, Math.round((b.used / b.allowance) * 100)) : 0;
              return (
                <div key={b.type} className="bg-[#12151D] border border-[#262A35] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-[#E6E9F0]">
                      <meta.icon className="w-4 h-4 text-[#00C2FF]" />{meta.label} leave
                    </div>
                    <span className="text-xs font-mono text-[#8A92A6]">{b.used}/{b.allowance}d used</span>
                  </div>
                  <div className="text-2xl font-semibold tracking-tight text-[#E6E9F0]">
                    {b.remaining}<span className="text-sm text-[#8A92A6] ml-1">days left</span>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full bg-[#1B1F2A] overflow-hidden">
                    <div className="h-full rounded-full bg-[#00C2FF]" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Request form */}
          {showForm && (
            <div className="bg-[#12151D] border border-[#00C2FF]/30 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#8A92A6] mb-1">Type</label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={inputClass}>
                    {Object.entries(LEAVE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#8A92A6] mb-1">First day</label>
                  <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#8A92A6] mb-1">Last day</label>
                  <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className={inputClass} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#8A92A6] mb-1">Reason (optional)</label>
                <textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className={inputClass} placeholder="Short note for the approver" />
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => void submitLeave()}
                  disabled={submitting}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-[#00C2FF] text-[#06121A] hover:bg-[#33cfff] disabled:opacity-50 transition-colors"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Submit request
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* My requests */}
            <div className="lg:col-span-2">
              <Card title="My leave requests" icon={CalendarDays}>
                {requests.length === 0 ? (
                  <p className="text-sm text-[#5A6275] py-6 text-center">No leave requests yet.</p>
                ) : (
                  <div className="space-y-2">
                    {requests.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-[#1B1F2A]/50 border border-[#262A35] rounded-lg">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-[#E6E9F0]">{LEAVE_META[r.type]?.label ?? r.type}</span>
                            <span className="text-xs font-mono text-[#8A92A6]">{fmt(r.startDate)} → {fmt(r.endDate)} · {r.days}d</span>
                          </div>
                          {r.reviewNote && <p className="text-xs text-[#8A92A6] mt-0.5 truncate">Note: {r.reviewNote}</p>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`px-2 py-0.5 text-[11px] font-medium rounded-full border ${STATUS_STYLE[r.status] ?? STATUS_STYLE.CANCELLED}`}>
                            {r.status.toLowerCase()}
                          </span>
                          {(r.status === "PENDING" || r.status === "APPROVED") && (
                            <button onClick={() => void cancelRequest(r.id)} title="Cancel"
                              className="p-1.5 rounded-md text-[#5A6275] hover:text-red-400 hover:bg-red-500/10 transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* Holidays */}
            <Card title="Company holidays" icon={CalendarOff}>
              {holidays.length === 0 ? (
                <p className="text-sm text-[#5A6275] py-6 text-center">No holidays configured.</p>
              ) : (
                <div className="space-y-1.5">
                  {holidays.map((h) => (
                    <div key={h.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[#1B1F2A] transition-colors">
                      <span className="text-sm text-[#E6E9F0]">{h.name}</span>
                      <span className="text-xs font-mono text-[#8A92A6]">{fmt(h.date)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Documents */}
            <Card
              title="My documents"
              icon={FileText}
              action={
                <label className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-md text-[#8A92A6] hover:text-[#E6E9F0] hover:bg-[#1B1F2A] cursor-pointer transition-colors">
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Upload
                  <input type="file" className="hidden" disabled={uploading}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadDoc(f); e.target.value = ""; }} />
                </label>
              }
            >
              {docs.length === 0 ? (
                <p className="text-sm text-[#5A6275] py-6 text-center">No documents on file.</p>
              ) : (
                <div className="space-y-1.5">
                  {docs.map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-[#1B1F2A] transition-colors">
                      <div className="min-w-0">
                        <p className="text-sm text-[#E6E9F0] truncate">{d.title}</p>
                        <p className="text-xs text-[#5A6275]">
                          {CATEGORY_LABEL[d.category] ?? d.category} · {fmtSize(d.size)} · {fmt(d.createdAt)}
                        </p>
                      </div>
                      <a href={`/api/hr/documents/${d.id}`} target="_blank" rel="noreferrer" title="Download"
                        className="p-1.5 rounded-md text-[#5A6275] hover:text-[#00C2FF] hover:bg-[#0E2532] shrink-0 transition-colors">
                        <Download className="w-4 h-4" />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Onboarding checklist */}
            <Card title="My onboarding" icon={ClipboardList}>
              {checklist.length === 0 ? (
                <p className="text-sm text-[#5A6275] py-6 text-center">No checklist assigned.</p>
              ) : (
                <div className="space-y-1.5">
                  {checklist.map((item) => (
                    <button key={item.id} onClick={() => void toggleItem(item)}
                      className="w-full flex items-start gap-3 px-3 py-2 rounded-lg text-left hover:bg-[#1B1F2A] transition-colors">
                      {item.completedAt
                        ? <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400 shrink-0 mt-0.5" />
                        : <div className="w-4.5 h-4.5 rounded-full border-2 border-[#2E333F] shrink-0 mt-0.5" />}
                      <div className="min-w-0">
                        <p className={`text-sm ${item.completedAt ? "text-[#5A6275] line-through" : "text-[#E6E9F0]"}`}>{item.title}</p>
                        {item.description && <p className="text-xs text-[#5A6275]">{item.description}</p>}
                      </div>
                    </button>
                  ))}
                  <p className="text-xs text-[#5A6275] pt-2 text-right font-mono">
                    {checklist.filter((i) => i.completedAt).length}/{checklist.length} complete
                  </p>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
