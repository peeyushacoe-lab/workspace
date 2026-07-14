"use client";

import { useEffect, useRef, useState } from "react";
import {
  Mail,
  Loader2,
  Plug,
  CheckCircle2,
  XCircle,
  StopCircle,
  Users,
  CalendarDays,
  Upload,
  ChevronRight,
  Inbox,
  Archive,
  Trash2,
  FolderPlus,
} from "lucide-react";
import { PageHeader } from "@/components/Shell";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────

type Provider = "GMAIL" | "OUTLOOK" | "YAHOO" | "IMAP";

type SourceFolder = { path: string; name: string; specialUse: string | null };

type FolderTarget = "inbox" | "archive" | "trash" | "custom";

type FolderRow = { source: string; include: boolean; target: FolderTarget; label: string };

type ImportJob = {
  id: string;
  provider: Provider;
  host: string;
  username: string;
  status: "PENDING" | "CONNECTING" | "IMPORTING" | "COMPLETED" | "FAILED" | "CANCELLED";
  totalMessages: number;
  importedMessages: number;
  skippedMessages: number;
  failedMessages: number;
  currentFolder: string | null;
  errorLog: string[] | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

const PROVIDER_PRESETS: Record<Provider, { host: string; port: number; secure: boolean; label: string; hint: string }> = {
  GMAIL: { host: "imap.gmail.com", port: 993, secure: true, label: "Gmail", hint: "Use a 16-character Google App Password, not your normal password." },
  OUTLOOK: { host: "outlook.office365.com", port: 993, secure: true, label: "Outlook / Microsoft 365", hint: "Use an app password if your tenant has MFA enforced." },
  YAHOO: { host: "imap.mail.yahoo.com", port: 993, secure: true, label: "Yahoo Mail", hint: "Generate an app password from Yahoo Account Security settings." },
  IMAP: { host: "", port: 993, secure: true, label: "Other IMAP server", hint: "Ask your current provider for their IMAP host and port." },
};

const inputClass =
  "bg-[#12151D] border border-[#262A35] rounded-lg text-sm text-[#E6E9F0] placeholder-[#454e63] focus:outline-none focus:border-[#00C2FF]/50 px-3 py-2 w-full transition";

const cardClass = "bg-[#12151D] border border-[#262A35] rounded-xl";

const primaryBtn =
  "inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#00C2FF] text-[#06121A] hover:bg-[#0098E6] transition disabled:opacity-50 disabled:cursor-not-allowed";

const ghostBtn =
  "inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg text-[#8A92A6] border border-[#262A35] hover:text-[#E6E9F0] hover:bg-[#1B1F2A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

function statusBadge(status: ImportJob["status"]) {
  const map: Record<ImportJob["status"], { label: string; cls: string }> = {
    PENDING: { label: "Queued", cls: "text-[#8A92A6] bg-[#8A92A6]/10 border-[#8A92A6]/20" },
    CONNECTING: { label: "Connecting", cls: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
    IMPORTING: { label: "Importing", cls: "text-[#00C2FF] bg-[#00C2FF]/10 border-[#00C2FF]/20" },
    COMPLETED: { label: "Completed", cls: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
    FAILED: { label: "Failed", cls: "text-[#ea4335] bg-[#ea4335]/10 border-[#ea4335]/20" },
    CANCELLED: { label: "Cancelled", cls: "text-[#8A92A6] bg-[#8A92A6]/10 border-[#8A92A6]/20" },
  };
  const { label, cls } = map[status];
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${cls}`}>{label}</span>;
}

// ─── Page ────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const [provider, setProvider] = useState<Provider>("GMAIL");
  const [host, setHost] = useState(PROVIDER_PRESETS.GMAIL.host);
  const [port, setPort] = useState(PROVIDER_PRESETS.GMAIL.port);
  const [secure, setSecure] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [testing, setTesting] = useState(false);
  const [folders, setFolders] = useState<FolderRow[] | null>(null);
  const [starting, setStarting] = useState(false);

  const [activeJob, setActiveJob] = useState<ImportJob | null>(null);
  const [history, setHistory] = useState<ImportJob[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const [contactsFile, setContactsFile] = useState<File | null>(null);
  const [calendarFile, setCalendarFile] = useState<File | null>(null);
  const [uploadingContacts, setUploadingContacts] = useState(false);
  const [uploadingCalendar, setUploadingCalendar] = useState(false);
  const contactsInputRef = useRef<HTMLInputElement>(null);
  const calendarInputRef = useRef<HTMLInputElement>(null);

  // ── Load history + detect an already-running job ──────────────────────
  const loadHistory = () => {
    fetch("/api/settings/import")
      .then((r) => r.json())
      .then((d: { jobs: ImportJob[] }) => {
        setHistory(d.jobs ?? []);
        const running = (d.jobs ?? []).find((j) => ["PENDING", "CONNECTING", "IMPORTING"].includes(j.status));
        if (running) setActiveJob(running);
      })
      .catch(() => toast.error("Failed to load import history"))
      .finally(() => setLoadingHistory(false));
  };

  // Intentionally run once on mount to load import history.
  useEffect(() => {
    loadHistory();
  }, []);

  // ── Poll active job every 3s ────────────────────────────────────────
  useEffect(() => {
    if (!activeJob || !["PENDING", "CONNECTING", "IMPORTING"].includes(activeJob.status)) return;
    const interval = setInterval(() => {
      fetch(`/api/settings/import/${activeJob.id}`)
        .then((r) => r.json())
        .then((d: { job: ImportJob }) => {
          if (!d.job) return;
          setActiveJob(d.job);
          if (!["PENDING", "CONNECTING", "IMPORTING"].includes(d.job.status)) {
            loadHistory();
          }
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJob?.id, activeJob?.status]);

  const applyPreset = (p: Provider) => {
    setProvider(p);
    setHost(PROVIDER_PRESETS[p].host);
    setPort(PROVIDER_PRESETS[p].port);
    setSecure(PROVIDER_PRESETS[p].secure);
    setFolders(null);
  };

  const handleTest = async () => {
    if (!host || !username || !password) {
      toast.error("Fill in host, username, and password first");
      return;
    }
    setTesting(true);
    setFolders(null);
    try {
      const res = await fetch("/api/settings/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", host, port, secure, username, password }),
      });
      const data = (await res.json()) as { ok?: boolean; folders?: SourceFolder[]; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Connection failed");

      const rows: FolderRow[] = (data.folders ?? []).map((f) => {
        const su = (f.specialUse ?? "").toLowerCase();
        let target: FolderTarget = "custom";
        let include = false;
        let label = f.name;
        if (su.includes("inbox") || f.path.toUpperCase() === "INBOX") {
          target = "inbox";
          include = true;
          label = "Inbox";
        } else if (su.includes("sent")) {
          target = "inbox"; // sender address will auto-classify it into Sent
          include = true;
          label = "Sent";
        } else if (su.includes("archive")) {
          target = "archive";
          include = true;
          label = "Archive";
        } else if (su.includes("trash") || su.includes("junk") || su.includes("spam") || su.includes("drafts")) {
          target = "custom";
          include = false;
        }
        return { source: f.path, include, target, label };
      });
      setFolders(rows);
      toast.success(`Connected — found ${rows.length} folders`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setTesting(false);
    }
  };

  const updateFolder = (source: string, patch: Partial<FolderRow>) => {
    setFolders((prev) => (prev ? prev.map((f) => (f.source === source ? { ...f, ...patch } : f)) : prev));
  };

  const handleStart = async () => {
    const selected = (folders ?? []).filter((f) => f.include);
    if (selected.length === 0) {
      toast.error("Select at least one folder to import");
      return;
    }
    setStarting(true);
    try {
      const res = await fetch("/api/settings/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          host,
          port,
          secure,
          username,
          password,
          provider,
          folderMapping: selected.map((f) => ({ source: f.source, target: f.target, label: f.label })),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; jobId?: string; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not start import");
      toast.success("Import started — this can take a while for large mailboxes");
      setPassword("");
      setFolders(null);
      loadHistory();
      fetch(`/api/settings/import/${data.jobId}`)
        .then((r) => r.json())
        .then((d: { job: ImportJob }) => d.job && setActiveJob(d.job))
        .catch(() => {});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start import");
    } finally {
      setStarting(false);
    }
  };

  const handleCancel = async () => {
    if (!activeJob) return;
    try {
      await fetch(`/api/settings/import/${activeJob.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      toast.success("Cancelling import…");
    } catch {
      toast.error("Failed to cancel");
    }
  };

  const handleUpload = async (kind: "contacts" | "calendar") => {
    const file = kind === "contacts" ? contactsFile : calendarFile;
    if (!file) return;
    const setUploading = kind === "contacts" ? setUploadingContacts : setUploadingCalendar;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/settings/import/${kind}`, { method: "POST", body: fd });
      const data = (await res.json()) as { ok?: boolean; created?: number; updated?: number; skipped?: number; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Import failed");
      toast.success(
        kind === "contacts"
          ? `Imported ${data.created ?? 0} new contacts, updated ${data.updated ?? 0}`
          : `Imported ${data.created ?? 0} calendar events`,
      );
      if (kind === "contacts") {
        setContactsFile(null);
        if (contactsInputRef.current) contactsInputRef.current.value = "";
      } else {
        setCalendarFile(null);
        if (calendarInputRef.current) calendarInputRef.current.value = "";
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setUploading(false);
    }
  };

  const jobRunning = activeJob && ["PENDING", "CONNECTING", "IMPORTING"].includes(activeJob.status);
  const progressPct =
    activeJob && activeJob.totalMessages > 0
      ? Math.min(100, Math.round(((activeJob.importedMessages + activeJob.skippedMessages + activeJob.failedMessages) / activeJob.totalMessages) * 100))
      : 0;

  return (
    <div className="bg-[#0B0D13] min-h-screen">
      <PageHeader
        eyebrow="Mailbox Settings"
        title="Import from Gmail or IMAP"
        description="Bring your existing mail, contacts, and calendar into Nexus. Nothing on your old account is deleted."
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* ── Active job progress ─────────────────────────────────────── */}
        {activeJob && (
          <section className={`${cardClass} p-5`}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-[#E6E9F0]">
                  Import from {activeJob.host} <span className="text-[#5A6275]">({activeJob.username})</span>
                </h2>
                <p className="text-xs text-[#8A92A6] mt-0.5">
                  {activeJob.currentFolder ? `Currently importing "${activeJob.currentFolder}"` : "Import status"}
                </p>
              </div>
              {statusBadge(activeJob.status)}
            </div>

            <div className="w-full h-2 rounded-full bg-[#1B1F2A] overflow-hidden mb-3">
              <div
                className="h-full bg-[#00C2FF] transition-all duration-500"
                style={{ width: `${activeJob.totalMessages > 0 ? progressPct : jobRunning ? 8 : 0}%` }}
              />
            </div>

            <div className="grid grid-cols-3 gap-3 text-center mb-3">
              <div>
                <p className="text-lg font-semibold text-[#E6E9F0]">{activeJob.importedMessages}</p>
                <p className="text-[11px] text-[#8A92A6]">Imported</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-[#8A92A6]">{activeJob.skippedMessages}</p>
                <p className="text-[11px] text-[#8A92A6]">Skipped / dupes</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-[#ea4335]">{activeJob.failedMessages}</p>
                <p className="text-[11px] text-[#8A92A6]">Failed</p>
              </div>
            </div>

            {activeJob.errorLog && activeJob.errorLog.length > 0 && (
              <div className="mt-2 max-h-32 overflow-y-auto bg-[#1B1F2A] border border-[#262A35] rounded-lg p-2 space-y-1">
                {activeJob.errorLog.slice(-8).map((e, i) => (
                  <p key={i} className="text-[11px] text-[#ea4335] font-mono truncate">{e}</p>
                ))}
              </div>
            )}

            {jobRunning && (
              <div className="mt-4">
                <button onClick={() => void handleCancel()} className={ghostBtn}>
                  <StopCircle className="h-3.5 w-3.5" />
                  Cancel import
                </button>
              </div>
            )}
          </section>
        )}

        {/* ── Connect form ─────────────────────────────────────────────── */}
        {!jobRunning && (
          <section className={`${cardClass} p-5`}>
            <h2 className="text-sm font-semibold text-[#E6E9F0] mb-1">Connect a mailbox</h2>
            <p className="text-xs text-[#8A92A6] mb-4">
              We connect over IMAP with an app password — your existing provider&apos;s password is never stored, and you can revoke the app password any time.
            </p>

            <div className="flex flex-wrap gap-2 mb-4">
              {(Object.keys(PROVIDER_PRESETS) as Provider[]).map((p) => (
                <button
                  key={p}
                  onClick={() => applyPreset(p)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    provider === p
                      ? "bg-[#00C2FF]/10 border-[#00C2FF]/30 text-[#00C2FF]"
                      : "border-[#262A35] text-[#8A92A6] hover:text-[#E6E9F0] hover:bg-[#1B1F2A]"
                  }`}
                >
                  {PROVIDER_PRESETS[p].label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-[#5A6275] mb-4">{PROVIDER_PRESETS[provider].hint}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs font-medium text-[#8A92A6] mb-1 block">IMAP host</label>
                <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="imap.example.com" className={inputClass} />
              </div>
              <div>
                <label className="text-xs font-medium text-[#8A92A6] mb-1 block">Port</label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value) || 993)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[#8A92A6] mb-1 block">Username / email</label>
                <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="you@gmail.com" className={inputClass} />
              </div>
              <div>
                <label className="text-xs font-medium text-[#8A92A6] mb-1 block">App password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••••••••" className={inputClass} />
              </div>
            </div>

            <label className="flex items-center gap-2 mb-4 text-xs text-[#8A92A6]">
              <input type="checkbox" checked={secure} onChange={(e) => setSecure(e.target.checked)} className="accent-[#00C2FF]" />
              Use TLS (recommended — leave checked unless your provider says otherwise)
            </label>

            <button onClick={() => void handleTest()} disabled={testing} className={primaryBtn}>
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
              {testing ? "Connecting…" : "Test connection"}
            </button>

            {/* ── Folder mapping ───────────────────────────────────────── */}
            {folders && (
              <div className="mt-6 pt-5 border-t border-[#262A35]">
                <h3 className="text-sm font-semibold text-[#E6E9F0] mb-1 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  Connected — choose what to import
                </h3>
                <p className="text-xs text-[#8A92A6] mb-3">
                  Map each source folder to where it should land in Nexus. Sent mail is detected automatically by sender address.
                </p>

                <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                  {folders.map((f) => (
                    <div key={f.source} className="flex items-center gap-3 p-2.5 rounded-lg bg-[#1B1F2A] border border-[#262A35]">
                      <input
                        type="checkbox"
                        checked={f.include}
                        onChange={(e) => updateFolder(f.source, { include: e.target.checked })}
                        className="accent-[#00C2FF] flex-shrink-0"
                      />
                      <span className="text-sm text-[#E6E9F0] flex-1 min-w-0 truncate">{f.source}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-[#5A6275] flex-shrink-0" />
                      <select
                        value={f.target}
                        onChange={(e) => updateFolder(f.source, { target: e.target.value as FolderTarget })}
                        disabled={!f.include}
                        className="bg-[#12151D] border border-[#262A35] rounded-md text-xs text-[#E6E9F0] px-2 py-1.5 disabled:opacity-40"
                      >
                        <option value="inbox">Inbox</option>
                        <option value="archive">Archive</option>
                        <option value="trash">Trash</option>
                        <option value="custom">Custom folder</option>
                      </select>
                      {f.target === "custom" && (
                        <input
                          value={f.label}
                          onChange={(e) => updateFolder(f.source, { label: e.target.value })}
                          disabled={!f.include}
                          placeholder="Folder name"
                          className="bg-[#12151D] border border-[#262A35] rounded-md text-xs text-[#E6E9F0] px-2 py-1.5 w-28 disabled:opacity-40"
                        />
                      )}
                      {f.target === "inbox" && <Inbox className="h-3.5 w-3.5 text-[#5A6275] flex-shrink-0" />}
                      {f.target === "archive" && <Archive className="h-3.5 w-3.5 text-[#5A6275] flex-shrink-0" />}
                      {f.target === "trash" && <Trash2 className="h-3.5 w-3.5 text-[#5A6275] flex-shrink-0" />}
                      {f.target === "custom" && <FolderPlus className="h-3.5 w-3.5 text-[#5A6275] flex-shrink-0" />}
                    </div>
                  ))}
                </div>

                <button onClick={() => void handleStart()} disabled={starting} className={`${primaryBtn} mt-4`}>
                  {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                  {starting ? "Starting…" : "Start import"}
                </button>
              </div>
            )}
          </section>
        )}

        {/* ── Contacts + calendar upload ──────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <section className={`${cardClass} p-5`}>
            <h2 className="text-sm font-semibold text-[#E6E9F0] mb-1 flex items-center gap-2">
              <Users className="h-4 w-4 text-[#00C2FF]" />
              Import contacts
            </h2>
            <p className="text-xs text-[#8A92A6] mb-3">
              Upload a Google Takeout contacts CSV (or similar export). We match by email — existing contacts are updated, not duplicated.
            </p>
            <input
              ref={contactsInputRef}
              type="file"
              accept=".csv"
              onChange={(e) => setContactsFile(e.target.files?.[0] ?? null)}
              className="text-xs text-[#8A92A6] mb-3 w-full"
            />
            <button onClick={() => void handleUpload("contacts")} disabled={!contactsFile || uploadingContacts} className={primaryBtn}>
              {uploadingContacts ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {uploadingContacts ? "Importing…" : "Import CSV"}
            </button>
          </section>

          <section className={`${cardClass} p-5`}>
            <h2 className="text-sm font-semibold text-[#E6E9F0] mb-1 flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-[#00C2FF]" />
              Import calendar
            </h2>
            <p className="text-xs text-[#8A92A6] mb-3">
              Upload a Google Takeout calendar export (.ics). Recurring events import as their first occurrence.
            </p>
            <input
              ref={calendarInputRef}
              type="file"
              accept=".ics"
              onChange={(e) => setCalendarFile(e.target.files?.[0] ?? null)}
              className="text-xs text-[#8A92A6] mb-3 w-full"
            />
            <button onClick={() => void handleUpload("calendar")} disabled={!calendarFile || uploadingCalendar} className={primaryBtn}>
              {uploadingCalendar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {uploadingCalendar ? "Importing…" : "Import .ics"}
            </button>
          </section>
        </div>

        {/* ── History ──────────────────────────────────────────────────── */}
        <section>
          <h2 className="text-sm font-semibold text-[#E6E9F0] mb-3">Import history</h2>
          <div className={`${cardClass} overflow-hidden`}>
            {loadingHistory ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-[#00C2FF]" />
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-center px-6">
                <XCircle className="h-8 w-8 text-[#5A6275] mb-2" />
                <p className="text-sm text-[#8A92A6]">No imports yet</p>
              </div>
            ) : (
              <div className="divide-y divide-[#262A35]">
                {history.map((j) => (
                  <div key={j.id} className="flex items-center justify-between p-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#E6E9F0] truncate">{j.host} · {j.username}</p>
                      <p className="text-xs text-[#8A92A6]">
                        {j.importedMessages} imported, {j.skippedMessages} skipped, {j.failedMessages} failed
                      </p>
                    </div>
                    {statusBadge(j.status)}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
