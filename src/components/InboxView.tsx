/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Inbox, Search, RefreshCw, Clock, ChevronLeft, ChevronRight,
Reply, Forward, Trash2, Star, Archive, X, Send,
  AlertCircle, AlertTriangle, Info, ShieldAlert, FileText,
  Sparkles, Loader2, ChevronDown, CalendarClock, FolderPlus,
  Folder, BellOff, Zap, Plus, MailOpen,
  Shield, ShieldCheck, ShieldX, Globe, Lock, } from "lucide-react";
import { formatDistanceToNow, isPast, addHours, addDays, nextMonday, format, isToday, isThisYear } from "date-fns";
import { toast } from "sonner";
import { SimpleComposer } from "./WorkspaceDashboard";
import { UserProfileModal } from "./UserProfileModal";
import type { UserRole } from "@/generated/prisma/enums";
import { avatarGradient } from "@/lib/avatar";

type ThreadPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

type ThreadSummary = {
  id: string;
  subject: string;
  mailbox: string;
  mailboxName: string;
  lastMessage: { from: string; snippet: string; receivedAt: string } | null;
  unreadCount: number;
  isStarred: boolean;
  isArchived: boolean;
  isTrashed: boolean;
  isSnoozed: boolean;
  snoozedUntil: string | null;
  priority: ThreadPriority;
  folderId: string | null;
  assignedToId: string | null;
  slaDeadline: string | null;
  labels: string[];
  createdAt: string;
};

type CustomFolder = {
  id: string;
  name: string;
  color: string | null;
  _count?: { threads: number };
};

type ScheduledEmail = {
  id: string;
  subject: string;
  toAddresses: string[];
  scheduledAt: string;
  fromEmail: string;
};

type Draft = {
  id: string; to: string; cc: string; bcc: string;
  subject: string; body: string; signatureId: string | null; savedAt: string;
};

type Attachment = { id: string; filename: string; storageUrl: string | null; key?: string | null; mimeType: string; size?: number };
type ThreatScan  = { riskScore: number; findings: string[] };

type MailRule = {
  id: string;
  name: string;
  isActive: boolean;
  conditions: { field: string; op: string; value: string }[];
  action: string;
  actionData?: Record<string, unknown> | null;
};

type Message = {
  id: string; from: string; to: string; subject: string;
  textBody?: string; htmlBody?: string; isRead: boolean; receivedAt: string;
  attachments?: Attachment[]; threatScan?: ThreatScan | null;
};

type ThreadDetail = { id: string; subject: string; mailboxId: string; messages: Message[] };

type WorkspaceMember = { id: string; email: string; fullName: string; displayName: string | null; avatarUrl: string | null };

// Render a sender avatar — shows profile pic if available, falls back to initial
// Deterministic per-sender avatar tint (Gmail-style) — hash the email into a palette
// Compact Outlook-style timestamp: 14:32 today, "Wed 3 Jun" this year, else date
function smartTime(date: Date | string): string {
  const d = new Date(date);
  if (isToday(d)) return format(d, "HH:mm");
  if (isThisYear(d)) return format(d, "d MMM");
  return format(d, "dd/MM/yyyy");
}

function SenderAvatar({ member, email, size = 8, onClick }: { member?: WorkspaceMember; email: string; size?: number; onClick?: (e?: React.MouseEvent) => void }) {
  const [imgFailed, setImgFailed] = useState(false);
  const label = (member?.displayName ?? member?.fullName ?? email).charAt(0).toUpperCase();
  const cls = `w-${size} h-${size} rounded-full object-cover flex-shrink-0`;
  const wrap = `cursor-pointer hover:opacity-80 transition-opacity`;
  if (member?.avatarUrl && !imgFailed) {
    return (
      <img
        src={member.avatarUrl}
        alt={label}
        className={`${cls} ${onClick ? wrap : ""}`}
        onClick={onClick}
        onError={() => setImgFailed(true)}
      />
    );
  }
  return (
    <div className={`${cls} flex items-center justify-center font-semibold text-sm text-white ${onClick ? wrap : ""}`} style={{ background: avatarGradient(email.toLowerCase()) }} onClick={onClick}>
      {label}
    </div>
  );
}

// Display name for an email address — shows display/full name for workspace members
function senderName(member?: WorkspaceMember, fallback?: string): string {
  return member?.displayName ?? member?.fullName ?? fallback ?? "Unknown";
}

// ── HTML sanitiser ──────────────────────────────────────────────────────────
const ALLOWED_TAGS = new Set([
  "a","abbr","address","article","aside","b","bdi","bdo","blockquote","br",
  "caption","cite","code","col","colgroup","data","dd","del","details","dfn",
  "div","dl","dt","em","figcaption","figure","footer","h1","h2","h3","h4","h5",
  "h6","header","hr","i","img","ins","kbd","li","mark","ol","p","pre","q","rp",
  "rt","ruby","s","samp","section","small","span","strong","sub","summary","sup",
  "table","tbody","td","tfoot","th","thead","time","tr","u","ul","var","wbr",
]);
const ALLOWED_ATTRS: Record<string, string[]> = {
  "*": ["class","dir","id","lang","title","style"],
  a: ["href","name","target","rel"],
  blockquote: ["cite"], col: ["span","width"], colgroup: ["span","width"],
  del: ["datetime"], img: ["alt","height","src","width"], ins: ["datetime"],
  li: ["value"], ol: ["reversed","start","type"], q: ["cite"],
  table: ["border","cellpadding","cellspacing","width"],
  td: ["align","colspan","rowspan","valign","width"],
  th: ["align","colspan","rowspan","scope","valign","width"],
  time: ["datetime"], ul: ["type"],
};
const DANGEROUS_PROTO = /^(javascript|vbscript|data):/i;
// Strip CSS constructs that can execute code: expression(), javascript:, -moz-binding, behavior
const DANGEROUS_CSS = /expression\s*\(|javascript\s*:|vbscript\s*:|-moz-binding\s*:|behavior\s*:/gi;

function sanitizeHtml(html: string): string {
  if (typeof window === "undefined") return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  function clean(node: Node) {
    for (const child of [...node.childNodes]) {
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const el = child as Element;
      const tag = el.tagName.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) { el.remove(); continue; }
      const allowed = new Set([...(ALLOWED_ATTRS["*"] ?? []), ...(ALLOWED_ATTRS[tag] ?? [])]);
      for (const attr of [...el.attributes]) {
        if (!allowed.has(attr.name.toLowerCase())) { el.removeAttribute(attr.name); continue; }
        if ((attr.name === "href" || attr.name === "src") && DANGEROUS_PROTO.test(attr.value.trim())) {
          el.removeAttribute(attr.name); continue;
        }
        if (attr.name === "style") {
          const safe = attr.value.replace(DANGEROUS_CSS, "");
          el.setAttribute("style", safe);
          continue;
        }
        if (tag === "a" && attr.name === "href") {
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noopener noreferrer");
        }
      }
      clean(el);
    }
  }
  clean(doc.body);
  return doc.body.innerHTML;
}

// ── Priority helpers ─────────────────────────────────────────────────────────
const PRIORITY_CONFIG: Record<ThreadPriority, { label: string; color: string; dot: string }> = {
  URGENT: { label: "Urgent", color: "text-[#ea4335]",   dot: "bg-[#ea4335]" },
  HIGH:   { label: "High",   color: "text-amber-400",    dot: "bg-amber-400" },
  NORMAL: { label: "Normal", color: "text-[#8A92A6]",    dot: "bg-[#9aa3b8]" },
  LOW:    { label: "Low",    color: "text-[#262b3a]",    dot: "bg-[#262A35]" },
};

function PriorityBadge({ priority }: { priority: ThreadPriority }) {
  if (priority === "NORMAL") return null;
  const { dot } = PRIORITY_CONFIG[priority];
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} title={PRIORITY_CONFIG[priority].label} />;
}

function SlaIndicator({ deadline }: { deadline: string }) {
  const d = new Date(deadline);
  const overdue = isPast(d);
  const soonMs = 2 * 60 * 60 * 1000;
  const soon = !overdue && (d.getTime() - Date.now()) < soonMs;
  if (overdue) return (
    <span className="text-[10px] font-semibold text-[#ea4335] flex items-center gap-0.5">
      <Zap className="w-2.5 h-2.5" />SLA
    </span>
  );
  if (soon) return (
    <span className="text-[10px] font-semibold text-amber-400 flex items-center gap-0.5">
      <Clock className="w-2.5 h-2.5" />SLA
    </span>
  );
  return null;
}

// ── Security helpers ─────────────────────────────────────────────────────────

const ORG_DOMAINS = ["cybersage.uk"];

function isExternalSender(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return domain.length > 0 && !ORG_DOMAINS.some(d => domain === d || domain.endsWith(`.${d}`));
}

type ThreatLevel = "secure" | "caution" | "elevated" | "critical";

function getThreatLevel(externalCount: number, urgentCount: number): ThreatLevel {
  if (urgentCount >= 3) return "critical";
  if (urgentCount >= 1 || externalCount >= 10) return "elevated";
  if (externalCount >= 3) return "caution";
  return "secure";
}

const THREAT_CONFIG: Record<ThreatLevel, { label: string; color: string; bg: string; border: string; Icon: React.ElementType }> = {
  secure:   { label: "Secure",   color: "text-[#0f9d58]", bg: "bg-transparent",   border: "border-[#262A35]", Icon: ShieldCheck },
  caution:  { label: "Caution",  color: "text-[#b06000]", bg: "bg-[#b06000]/[0.04]", border: "border-[#b06000]/15", Icon: Shield      },
  elevated: { label: "Elevated", color: "text-[#ff9f43]", bg: "bg-[#ff9f43]/[0.05]", border: "border-[#ff9f43]/15", Icon: AlertTriangle },
  critical: { label: "Critical", color: "text-[#ea4335]", bg: "bg-[#ea4335]/[0.06]", border: "border-[#ea4335]/20", Icon: ShieldX     },
};

function SecurityPostureBar({ threads, totalScanned }: {
  threads: { lastMessage?: { from: string } | null; priority: string }[];
  totalScanned: number;
}) {
  const externalCount = threads.filter(t => isExternalSender(t.lastMessage?.from ?? "")).length;
  const urgentCount   = threads.filter(t => t.priority === "URGENT").length;
  const level         = getThreatLevel(externalCount, urgentCount);
  const cfg           = THREAT_CONFIG[level];

  return (
    <div className={`flex items-center gap-3 px-3 py-1.5 border-b ${cfg.border} ${cfg.bg} text-[11px] font-medium`}>
      <cfg.Icon className={`w-3 h-3 flex-shrink-0 ${cfg.color}`} />
      <span className={cfg.color}>{cfg.label}</span>
      <span className="w-px h-3 bg-current opacity-20" />
      <span className="text-[#5A6275] font-normal">{totalScanned} scanned</span>
      {externalCount > 0 && (
        <>
          <span className="w-px h-3 bg-current opacity-20" />
          <span className="flex items-center gap-1 text-[#b06000]">
            <Globe className="w-2.5 h-2.5" />
            {externalCount} external
          </span>
        </>
      )}
      {urgentCount > 0 && (
        <>
          <span className="w-px h-3 bg-current opacity-20" />
          <span className="flex items-center gap-1 text-[#ea4335]">
            <AlertTriangle className="w-2.5 h-2.5" />
            {urgentCount} urgent
          </span>
        </>
      )}
      <div className="flex-1" />
      <span className="flex items-center gap-1 text-[#bdc1c6] font-normal">
        <Lock className="w-2.5 h-2.5" />
        SPF · DKIM · DMARC
      </span>
    </div>
  );
}

// ── Snooze modal ─────────────────────────────────────────────────────────────
function SnoozeModal({ onClose, onSnooze }: {
  onClose: () => void;
  onSnooze: (date: Date) => void;
}) {
  const [custom, setCustom] = useState(false);
  const [customVal, setCustomVal] = useState("");

  const presets = [
    { label: "Tonight (6 PM)",  date: () => { const d = new Date(); d.setHours(18,0,0,0); return d; } },
    { label: "Tomorrow morning", date: () => addHours(addDays(new Date(), 1), 8) },
    { label: "Next Monday",      date: () => { const d = nextMonday(new Date()); d.setHours(8,0,0,0); return d; } },
    { label: "In 3 days",        date: () => addDays(new Date(), 3) },
  ];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 " onClick={onClose} />
      <div className="relative z-10 w-72 bg-[#12151D] border border-[#262A35] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#262A35] bg-[#12151D]">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#E6E9F0]">
            <BellOff className="w-4 h-4 text-[#00C2FF]" /> Snooze until…
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3 space-y-1">
          {presets.map(p => (
            <button
              key={p.label}
              onClick={() => { onSnooze(p.date()); onClose(); }}
              className="w-full text-left px-3 py-2.5 text-sm text-[#E6E9F0] hover:bg-[#1B1F2A] rounded-lg transition-colors"
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setCustom(v => !v)}
            className="w-full text-left px-3 py-2.5 text-sm text-[#8A92A6] hover:bg-[#1B1F2A] rounded-lg transition-colors flex items-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" /> Custom time
          </button>
          {custom && (
            <div className="pt-1 flex gap-2">
              <input
                type="datetime-local"
                value={customVal}
                onChange={e => setCustomVal(e.target.value)}
                className="flex-1 bg-[#12151D] border border-[#262A35] rounded-lg px-2.5 py-1.5 text-xs text-[#E6E9F0] focus:outline-none focus:ring-1 focus:ring-[#00d2ff]/40"
              />
              <button
                onClick={() => { if (customVal) { onSnooze(new Date(customVal)); onClose(); } }}
                disabled={!customVal}
                className="bg-[#00C2FF] text-[#06121A] px-3 rounded-lg text-xs font-semibold disabled:opacity-40"
              >
                Set
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── New Folder modal ──────────────────────────────────────────────────────────
function NewFolderModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (folder: CustomFolder) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#00d2ff");
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/inbox/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), color }),
      });
      const data = await res.json() as CustomFolder & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      onCreate(data);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create folder");
    } finally {
      setLoading(false);
    }
  };

  const COLORS = ["#00d2ff","#0f9d58","#ea4335","#a78bfa","#f59e0b","#3b82f6","#10b981","#ec4899"];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 " onClick={onClose} />
      <div className="relative z-10 w-72 bg-[#12151D] border border-[#262A35] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#262A35] bg-[#12151D]">
          <span className="text-sm font-semibold text-[#E6E9F0]">New Folder</span>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[#8A92A6] hover:bg-[#1B1F2A] transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-4">
          <input
            type="text"
            placeholder="Folder name"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && void handle()}
            className="w-full bg-[#12151D] border border-[#262A35] rounded-lg px-3 py-2 text-sm text-[#E6E9F0] focus:outline-none focus:ring-1 focus:ring-[#00d2ff]/40"
            autoFocus
          />
          <div>
            <p className="text-xs text-[#8A92A6] mb-2">Color</p>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{ background: c }}
                  className={`w-6 h-6 rounded-full transition-transform ${color === c ? "scale-125 ring-2 ring-white/30" : ""}`}
                />
              ))}
            </div>
          </div>
          <button
            onClick={() => void handle()}
            disabled={!name.trim() || loading}
            className="w-full bg-[#00C2FF] text-[#06121A] py-2 rounded-lg text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Create Folder
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Rules modal ───────────────────────────────────────────────────────────────
function RulesModal({ customFolders, onClose }: {
  customFolders: CustomFolder[];
  onClose: () => void;
}) {
  const [rules, setRules] = useState<MailRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [field, setField] = useState<"from" | "to" | "subject" | "body">("from");
  const [op, setOp] = useState<"contains" | "equals" | "startsWith" | "endsWith" | "notContains">("contains");
  const [condValue, setCondValue] = useState("");
  const [action, setAction] = useState<"MOVE_FOLDER" | "MARK_READ" | "STAR" | "ARCHIVE" | "TRASH">("MOVE_FOLDER");
  const [folderId, setFolderId] = useState("");

  useEffect(() => {
    fetch("/api/inbox/rules")
      .then(r => r.json())
      .then((data: MailRule[]) => setRules(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!name.trim() || !condValue.trim()) return;
    if (action === "MOVE_FOLDER" && !folderId) { toast.error("Pick a folder"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/inbox/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          conditions: [{ field, op, value: condValue.trim() }],
          action,
          actionData: action === "MOVE_FOLDER" ? { folderId } : undefined,
        }),
      });
      const data = await res.json() as MailRule & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setRules(prev => [...prev, data]);
      setName(""); setCondValue(""); setField("from"); setOp("contains"); setAction("MOVE_FOLDER"); setFolderId("");
      setShowForm(false);
      toast.success("Rule created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create rule");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (rule: MailRule) => {
    const updated = await fetch(`/api/inbox/rules/${rule.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !rule.isActive }),
    }).then(r => r.json() as Promise<MailRule>).catch(() => null);
    if (updated) setRules(prev => prev.map(r => r.id === rule.id ? updated : r));
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/inbox/rules/${id}`, { method: "DELETE" }).catch(() => {});
    setRules(prev => prev.filter(r => r.id !== id));
    toast.success("Rule deleted");
  };

  const FIELD_LABELS: Record<string, string> = { from: "From", to: "To", subject: "Subject", body: "Body" };
  const OP_LABELS: Record<string, string> = { contains: "contains", equals: "equals", startsWith: "starts with", endsWith: "ends with", notContains: "not contains" };
  const ACTION_LABELS: Record<string, string> = { MOVE_FOLDER: "Move to folder", MARK_READ: "Mark as read", STAR: "Star", ARCHIVE: "Archive", TRASH: "Move to trash" };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 " onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-[#12151D] border border-[#262A35] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#262A35] bg-[#12151D] flex-shrink-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#E6E9F0]">
            <Zap className="w-4 h-4 text-[#00C2FF]" /> Email Rules
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowForm(v => !v)}
              className="flex items-center gap-1.5 bg-[#00C2FF]/10 text-[#00C2FF] border border-[#2E333F] px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#00C2FF]/20 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> New Rule
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-[#8A92A6] hover:bg-[#1B1F2A] transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {showForm && (
            <div className="p-5 border-b border-[#262A35] space-y-3 bg-[#12151D]">
              <p className="text-[13px] font-medium text-[#E6E9F0]">New rule</p>
              <input
                type="text"
                placeholder="Rule name (e.g. Move Slack emails)"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-[#12151D] border border-[#262A35] rounded-lg px-3 py-2 text-sm text-[#E6E9F0] focus:outline-none focus:ring-1 focus:ring-[#00d2ff]/40 placeholder:text-[#262b3a]"
                autoFocus
              />
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={field}
                  onChange={e => setField(e.target.value as typeof field)}
                  className="bg-[#12151D] border border-[#262A35] rounded-lg px-2 py-2 text-sm text-[#E6E9F0] focus:outline-none focus:ring-1 focus:ring-[#00d2ff]/40"
                >
                  <option value="from">From</option>
                  <option value="to">To</option>
                  <option value="subject">Subject</option>
                  <option value="body">Body</option>
                </select>
                <select
                  value={op}
                  onChange={e => setOp(e.target.value as typeof op)}
                  className="bg-[#12151D] border border-[#262A35] rounded-lg px-2 py-2 text-sm text-[#E6E9F0] focus:outline-none focus:ring-1 focus:ring-[#00d2ff]/40"
                >
                  <option value="contains">contains</option>
                  <option value="equals">equals</option>
                  <option value="startsWith">starts with</option>
                  <option value="endsWith">ends with</option>
                  <option value="notContains">not contains</option>
                </select>
                <input
                  type="text"
                  placeholder="Value"
                  value={condValue}
                  onChange={e => setCondValue(e.target.value)}
                  className="bg-[#12151D] border border-[#262A35] rounded-lg px-2 py-2 text-sm text-[#E6E9F0] focus:outline-none focus:ring-1 focus:ring-[#00d2ff]/40 placeholder:text-[#262b3a]"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-[#8A92A6] mb-1">Action</p>
                  <select
                    value={action}
                    onChange={e => setAction(e.target.value as typeof action)}
                    className="w-full bg-[#12151D] border border-[#262A35] rounded-lg px-2 py-2 text-sm text-[#E6E9F0] focus:outline-none focus:ring-1 focus:ring-[#00d2ff]/40"
                  >
                    <option value="MOVE_FOLDER">Move to folder</option>
                    <option value="MARK_READ">Mark as read</option>
                    <option value="STAR">Star</option>
                    <option value="ARCHIVE">Archive</option>
                    <option value="TRASH">Move to trash</option>
                  </select>
                </div>
                {action === "MOVE_FOLDER" && (
                  <div>
                    <p className="text-xs text-[#8A92A6] mb-1">Folder</p>
                    <select
                      value={folderId}
                      onChange={e => setFolderId(e.target.value)}
                      className="w-full bg-[#12151D] border border-[#262A35] rounded-lg px-2 py-2 text-sm text-[#E6E9F0] focus:outline-none focus:ring-1 focus:ring-[#00d2ff]/40"
                    >
                      <option value="">Pick folder…</option>
                      {customFolders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => void handleSave()}
                  disabled={!name.trim() || !condValue.trim() || saving}
                  className="flex-1 bg-[#00C2FF] text-[#06121A] py-2 rounded-lg text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Save Rule
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm text-[#8A92A6] hover:bg-[#1B1F2A] rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {loading ? (
            <div className="p-8 text-center text-sm text-[#8A92A6]">Loading rules…</div>
          ) : rules.length === 0 && !showForm ? (
            <div className="p-8 text-center">
              <Zap className="w-8 h-8 text-[#262b3a] mx-auto mb-3" />
              <p className="text-sm text-[#8A92A6] mb-1">No rules yet</p>
              <p className="text-xs text-[#262b3a]">Create a rule to automatically sort incoming emails into folders.</p>
              <button
                onClick={() => setShowForm(true)}
                className="mt-4 bg-[#00C2FF]/10 text-[#00C2FF] border border-[#2E333F] px-4 py-2 rounded-lg text-xs font-medium hover:bg-[#00C2FF]/20 transition-colors"
              >
                Create your first rule
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[#1C1F28]">
              {rules.map(rule => {
                const cond = rule.conditions[0];
                const folderName = rule.action === "MOVE_FOLDER"
                  ? customFolders.find(f => f.id === (rule.actionData as Record<string, string> | null)?.folderId)?.name ?? "Unknown folder"
                  : null;
                return (
                  <div key={rule.id} className={`flex items-start gap-3 p-4 transition-colors ${rule.isActive ? "" : "opacity-50"}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#E6E9F0] truncate">{rule.name}</p>
                      {cond && (
                        <p className="text-xs text-[#7a9199] mt-0.5">
                          When <span className="text-[#8A92A6]">{FIELD_LABELS[cond.field] ?? cond.field}</span>{" "}
                          <span className="text-[#8A92A6]">{OP_LABELS[cond.op] ?? cond.op}</span>{" "}
                          <span className="text-[#00C2FF] font-medium">&quot;{cond.value}&quot;</span>
                        </p>
                      )}
                      <p className="text-xs text-[#7a9199] mt-0.5">
                        → {ACTION_LABELS[rule.action] ?? rule.action}{folderName ? `: ${folderName}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
                      <button
                        onClick={() => void handleToggle(rule)}
                        title={rule.isActive ? "Disable rule" : "Enable rule"}
                        className={`relative w-9 h-5 rounded-full transition-colors ${rule.isActive ? "bg-[#00C2FF]" : "bg-[#262A35]"}`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 bg-[#12151D] rounded-full shadow transition-transform ${rule.isActive ? "translate-x-4" : "translate-x-0.5"}`} />
                      </button>
                      <button
                        onClick={() => void handleDelete(rule.id)}
                        className="p-1.5 rounded-lg text-[#8A92A6] hover:bg-[#ea4335]/10 hover:text-[#ea4335] transition-colors"
                        title="Delete rule"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
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

// ── System folder type ────────────────────────────────────────────────────────
type SystemFolder = "inbox" | "starred" | "sent" | "drafts" | "trash" | "archive" | "snoozed" | "scheduled";

const SYSTEM_FOLDERS: { key: SystemFolder; label: string; Icon: React.ElementType }[] = [
  { key: "inbox",     label: "Inbox",     Icon: Inbox       },
  { key: "starred",   label: "Starred",   Icon: Star        },
  { key: "sent",      label: "Sent",      Icon: Send        },
  { key: "drafts",    label: "Drafts",    Icon: FileText    },
  { key: "snoozed",   label: "Snoozed",   Icon: BellOff     },
  { key: "scheduled", label: "Scheduled", Icon: CalendarClock },
  { key: "archive",   label: "Archive",   Icon: Archive     },
  { key: "trash",     label: "Trash",     Icon: Trash2      },
];

type SentLog = {
  id: string; recipient: string; subject: string; status: string;
  createdAt: string; contact?: { name: string; email: string } | null;
  snippet?: string;
  isInternalThread?: boolean;
  threadId?: string;
};

const CATEGORIES = ["All", "Primary", "Updates"] as const;
type Category = typeof CATEGORIES[number];

// ── Main component ────────────────────────────────────────────────────────────
export function InboxView({ userRole, initialThreads }: {
  userRole?: UserRole;
  initialThreads?: ThreadSummary[];
}) {
  const [threads, setThreads]               = useState<ThreadSummary[]>(initialThreads ?? []);
  const [customFolders, setCustomFolders]   = useState<CustomFolder[]>([]);
  const [memberMap, setMemberMap]           = useState<Record<string, WorkspaceMember>>({});
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [threadDetail, setThreadDetail]     = useState<ThreadDetail | null>(null);
  const [isLoading, setIsLoading]           = useState(!initialThreads?.length);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isRefreshing, setIsRefreshing]     = useState(false);
  const [searchQuery, setSearchQuery]       = useState("");
  const [showUnreadOnly, setShowUnreadOnly]  = useState(false);
  const [showReply, setShowReply]           = useState(false);
  const [showForward, setShowForward]       = useState(false);
  const [activeFolder, setActiveFolder]     = useState<SystemFolder>("inbox");
  const [activeCustomFolder, setActiveCustomFolder] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<Category>("All");
  const [sentLogs, setSentLogs]             = useState<SentLog[]>([]);
  const [isSentLoading, setIsSentLoading]   = useState(false);
  const [drafts, setDrafts]                 = useState<Draft[]>([]);
  const [isDraftsLoading, setIsDraftsLoading] = useState(false);
  const [scheduledEmails, setScheduledEmails] = useState<ScheduledEmail[]>([]);
  const [isScheduledLoading, setIsScheduledLoading] = useState(false);
  const [editingDraft, setEditingDraft]     = useState<Draft | null>(null);
  const [showSmartReply, setShowSmartReply] = useState(false);
  const [smartReplyLoading, setSmartReplyLoading] = useState<"friendly" | "professional" | "brief" | null>(null);
  const [replyDefaultBody, setReplyDefaultBody] = useState("");
  const [showRewriteMenu, setShowRewriteMenu] = useState(false);
  const [rewriteBody, setRewriteBody]       = useState("");
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const [composerKey, setComposerKey]       = useState(0);
  const [snoozeTargetId, setSnoozeTargetId] = useState<string | null>(null);
  const [showNewFolder, setShowNewFolder]   = useState(false);
  const [showRules, setShowRules]           = useState(false);
  const [profileUserId, setProfileUserId]   = useState<string | null>(null);
  const [expandedMsgs, setExpandedMsgs]     = useState<Set<string>>(new Set());
  const rewriteMenuRef = useRef<HTMLDivElement>(null);

  // Drag-and-drop folder state
  const [draggedThread, setDraggedThread]   = useState<ThreadSummary | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [rulePrompt, setRulePrompt]         = useState<{ thread: ThreadSummary; folder: CustomFolder } | null>(null);

  // Load custom folders once
  useEffect(() => {
    fetch("/api/inbox/folders")
      .then(r => r.json())
      .then((data: CustomFolder[]) => setCustomFolders(data))
      .catch(() => {});

    fetch("/api/workspace/members")
      .then(r => r.ok ? r.json() : [])
      .then((members: WorkspaceMember[]) => {
        const map: Record<string, WorkspaceMember> = {};
        members.forEach(m => { map[m.email.toLowerCase()] = m; });
        setMemberMap(map);
      })
      .catch(() => {});
  }, []);

  const loadThreads = useCallback(async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      // Pass the active folder so the server filters server-side.
      // This prevents background polls from returning stale trashed/archived threads
      // that would overwrite the optimistic UI state after a delete/archive action.
      let apiFolder: string;
      if (searchQuery) {
        apiFolder = "inbox"; // search always scopes to inbox (non-trashed/archived)
      } else if (activeFolder === "trash") {
        apiFolder = "trash";
      } else if (activeFolder === "archive") {
        apiFolder = "archive";
      } else {
        apiFolder = "inbox"; // inbox, starred, snoozed, custom folders all use inbox data
      }
      const params = new URLSearchParams({ folder: apiFolder });
      if (searchQuery) params.set("q", searchQuery);
      const response = await fetch(`/api/inbox?${params}`, { cache: "no-store" });
      if (response.ok) {
        const data = await response.json() as ThreadSummary[];
        // On silent background polls, don't wipe threads if server returns empty
        if (!silent || data.length > 0) setThreads(data);
      }
    } catch {
      if (!silent) toast.error("Failed to load inbox");
    } finally {
      if (!silent) { setIsLoading(false); setIsRefreshing(false); }
    }
  }, [searchQuery, activeFolder]);

  useEffect(() => {
    // Always call loadThreads when deps change (searchQuery, activeFolder), not
    // just when initialThreads is empty — otherwise search never fires on
    // pre-populated inboxes because the guard short-circuits.
    loadThreads();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") loadThreads(true);
    }, 8000); // 8s feels near-realtime without hammering the DB
    return () => clearInterval(interval);
  }, [loadThreads]);

  useEffect(() => {
    if (activeFolder !== "sent") return;
    setIsSentLoading(true);
    // Fetch both external email logs and internal sent threads in parallel
    Promise.all([
      fetch("/api/email-logs?limit=100").then(r => r.json()).catch(() => ({ logs: [] })),
      fetch("/api/inbox?folder=sent").then(r => r.json()).catch(() => []),
    ]).then(([logsData, sentThreads]) => {
      const externalLogs: SentLog[] = (logsData.logs ?? []);
      // Convert internal sent threads to SentLog shape for unified rendering
      const internalLogs: SentLog[] = (Array.isArray(sentThreads) ? sentThreads : []).map((t: {
        id: string; subject: string; lastMessage?: { from: string; snippet: string; receivedAt: string } | null; createdAt: string;
      }) => ({
        id: `thread-${t.id}`,
        recipient: t.lastMessage?.from ?? "",
        subject: t.subject,
        status: "DELIVERED" as const,
        createdAt: t.lastMessage?.receivedAt ?? t.createdAt,
        snippet: t.lastMessage?.snippet ?? "",
        isInternalThread: true,
        threadId: t.id,
      }));
      // Merge and sort by date descending, deduplicate by subject+recipient
      const merged = [...externalLogs, ...internalLogs].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setSentLogs(merged);
    }).finally(() => setIsSentLoading(false));
  }, [activeFolder]);

  useEffect(() => {
    if (activeFolder !== "drafts") return;
    setIsDraftsLoading(true);
    fetch("/api/drafts")
      .then(r => r.json())
      .then((data: Draft[]) => setDrafts(data))
      .catch(() => {})
      .finally(() => setIsDraftsLoading(false));
  }, [activeFolder]);

  useEffect(() => {
    if (activeFolder !== "scheduled") return;
    setIsScheduledLoading(true);
    fetch("/api/inbox/scheduled")
      .then(r => r.json())
      .then((data: ScheduledEmail[]) => setScheduledEmails(data))
      .catch(() => {})
      .finally(() => setIsScheduledLoading(false));
  }, [activeFolder]);

  const loadThreadDetail = async (id: string) => {
    setIsDetailLoading(true);
    setSelectedThreadId(id);
    setShowSmartReply(false);
    setReplyDefaultBody("");
    setRewriteBody("");
    try {
      const response = await fetch(`/api/inbox/${id}`);
      if (response.ok) {
        const data = await response.json();
        setThreadDetail(data);
        // Gmail behaviour: only the newest message starts expanded
        const msgs = (data as { messages?: { id: string }[] }).messages ?? [];
        setExpandedMsgs(new Set(msgs.length ? [msgs[msgs.length - 1].id] : []));
        fetch(`/api/inbox/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markRead: true }) })
          .then(() => window.dispatchEvent(new Event("cybersage:unread-refresh")))
          .catch(() => {});
        setThreads(prev => prev.map(t => t.id === id ? { ...t, unreadCount: 0 } : t));
      }
    } catch {
      toast.error("Failed to load message details");
    } finally {
      setIsDetailLoading(false);
    }
  };

  const patchThread = async (id: string, patch: Record<string, unknown>) => {
    setThreads(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
    try {
      await fetch(`/api/inbox/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch {
      loadThreads(true);
    }
  };

  const toggleStar = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const thread = threads.find(t => t.id === id);
    if (!thread) return;
    void patchThread(id, { isStarred: !thread.isStarred });
  };

  const handleArchive = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    void patchThread(id, { isArchived: true });
    if (selectedThreadId === id) { setSelectedThreadId(null); setThreadDetail(null); }
    toast.success("Archived");
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    void patchThread(id, { isTrashed: true });
    if (selectedThreadId === id) { setSelectedThreadId(null); setThreadDetail(null); }
    toast.success("Moved to trash");
  };

  const handleRestoreFromTrash = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    void patchThread(id, { isTrashed: false });
    toast.success("Restored to inbox");
  };

  const handleMarkUnread = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Optimistic UI — bump unreadCount so the blue bar reappears immediately
    setThreads(prev => prev.map(t => t.id === id ? { ...t, unreadCount: 1 } : t));
    fetch(`/api/inbox/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markRead: false }),
    }).catch(() => {});
    toast.success("Marked as unread");
  };

  const handleFolderDrop = async (thread: ThreadSummary, folder: CustomFolder) => {
    setDragOverFolderId(null);
    setDraggedThread(null);
    // Move the thread immediately
    await patchThread(thread.id, { folderId: folder.id });
    setThreads(prev => prev.map(t => t.id === thread.id ? { ...t, folderId: folder.id } : t));
    toast.success(`Moved to "${folder.name}"`);
    // Prompt to create a rule for the sender domain
    const from = thread.lastMessage?.from ?? "";
    const atIdx = from.lastIndexOf("@");
    if (atIdx !== -1) {
      setRulePrompt({ thread, folder });
    }
  };

  const handleCreateDomainRule = async () => {
    if (!rulePrompt) return;
    const from = rulePrompt.thread.lastMessage?.from ?? "";
    const atIdx = from.lastIndexOf("@");
    if (atIdx === -1) { setRulePrompt(null); return; }
    const domain = from.slice(atIdx); // e.g. "@acme.com"
    const ruleName = `Auto: ${domain} → ${rulePrompt.folder.name}`;
    try {
      const res = await fetch("/api/inbox/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: ruleName,
          conditions: [{ field: "from", op: "endsWith", value: domain }],
          action: "MOVE_FOLDER",
          actionData: { folderId: rulePrompt.folder.id },
        }),
      });
      if (res.ok) {
        toast.success(`Rule created — all emails from ${domain} go to "${rulePrompt.folder.name}"`);
      } else {
        toast.error("Failed to create rule");
      }
    } catch {
      toast.error("Failed to create rule");
    }
    setRulePrompt(null);
  };

  const handleSnooze = async (id: string, until: Date) => {
    await patchThread(id, { isSnoozed: true, snoozedUntil: until.toISOString() });
    if (selectedThreadId === id) { setSelectedThreadId(null); setThreadDetail(null); }
    toast.success(`Snoozed until ${until.toLocaleString()}`);
  };

  const handleCancelScheduled = async (id: string) => {
    const res = await fetch(`/api/inbox/scheduled/${id}`, { method: "DELETE" });
    if (res.ok) {
      setScheduledEmails(prev => prev.filter(s => s.id !== id));
      toast.success("Scheduled email cancelled");
    } else {
      const data = await res.json() as { error?: string };
      toast.error(data.error ?? "Failed to cancel");
    }
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (rewriteMenuRef.current && !rewriteMenuRef.current.contains(e.target as Node)) {
        setShowRewriteMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSmartReply = async (tone: "friendly" | "professional" | "brief") => {
    if (!threadDetail) return;
    setSmartReplyLoading(tone);
    try {
      const res = await fetch("/api/ai/smart-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: threadDetail.id, tone }),
      });
      const data = await res.json() as { reply?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to generate reply");
      const generated = data.reply ?? "";
      setReplyDefaultBody(generated);
      setRewriteBody(generated);
      setComposerKey(k => k + 1);
      setShowSmartReply(false);
      setShowReply(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Smart reply failed");
    } finally {
      setSmartReplyLoading(null);
    }
  };

  const handleRewrite = async (style: "formal" | "casual" | "concise" | "expand") => {
    if (!rewriteBody.trim()) { toast.error("Nothing to rewrite — type your reply first"); return; }
    setRewriteLoading(true);
    setShowRewriteMenu(false);
    try {
      const res = await fetch("/api/ai/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: rewriteBody, style }),
      });
      const data = await res.json() as { result?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Rewrite failed");
      const rewritten = data.result ?? "";
      setRewriteBody(rewritten);
      setReplyDefaultBody(rewritten);
      setComposerKey(k => k + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rewrite failed");
    } finally {
      setRewriteLoading(false);
    }
  };

  const visibleThreads = threads.filter(t => {
    if (activeCustomFolder) return t.folderId === activeCustomFolder && !t.isTrashed;
    if (activeFolder === "trash")    return t.isTrashed;
    if (activeFolder === "archive")  return t.isArchived && !t.isTrashed;
    if (activeFolder === "snoozed")  return t.isSnoozed && !t.isTrashed;
    if (t.isTrashed) return false;
    if (t.isArchived) return false;
    if (t.isSnoozed && activeFolder !== "starred") return false;
    if (activeFolder === "starred")  return t.isStarred;
    if (showUnreadOnly && t.unreadCount === 0) return false;
    return true; // inbox and any unrecognised folder shows all non-trashed non-archived
  });

  const unreadCount = threads.filter(t => t.unreadCount > 0 && !t.isTrashed && !t.isArchived).length;
  const snoozedCount = threads.filter(t => t.isSnoozed && !t.isTrashed).length;

  const isSpecialFolder = activeFolder === "sent" || activeFolder === "drafts" || activeFolder === "scheduled";
  const _isArchiveFolder = activeFolder === "archive";

  const setSystemFolder = (key: SystemFolder) => {
    setActiveFolder(key);
    setActiveCustomFolder(null);
  };

  return (
    <div className="flex h-[calc(100vh-44px)] bg-[#12151D] overflow-hidden">

      {/* ── Left Sidebar ── */}
      <div className="hidden md:flex w-[200px] flex-shrink-0 flex-col bg-[#12151D] border-r border-[#262A35] overflow-y-auto">
        {/* System folders */}
        <div className="px-2.5 pt-3.5 pb-2">
          <p className="px-2.5 mb-2 text-[11px] font-bold uppercase tracking-[0.5px] text-[#5A6275]">Mailbox</p>
          {SYSTEM_FOLDERS.map(({ key, label, Icon }) => {
            const isActive = activeFolder === key && !activeCustomFolder;
            return (
              <button
                key={key}
                onClick={() => setSystemFolder(key)}
                className={`flex w-full items-center gap-[11px] h-[38px] px-[11px] mb-0.5 text-[13px] font-semibold rounded-lg transition-colors duration-100 ${
                  isActive
                    ? "bg-[#00C2FF]/[0.10] text-[#00C2FF]"
                    : "text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0]"
                }`}
              >
                <Icon className={`h-[18px] w-[18px] flex-shrink-0 ${isActive ? "text-[#00C2FF]" : ""}`} />
                <span className="flex-1 text-left">{label}</span>
                {key === "inbox" && unreadCount > 0 && (
                  <span className={`text-[11.5px] font-semibold font-mono leading-none ${isActive ? "text-[#00C2FF]" : "text-[#5A6275]"}`}>
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
                {key === "snoozed" && snoozedCount > 0 && (
                  <span className={`text-[11.5px] font-semibold font-mono leading-none ${isActive ? "text-[#00C2FF]" : "text-[#5A6275]"}`}>
                    {snoozedCount}
                  </span>
                )}
                {key === "drafts" && drafts.length > 0 && (
                  <span className={`text-[11.5px] font-semibold font-mono leading-none ${isActive ? "text-[#00C2FF]" : "text-[#5A6275]"}`}>
                    {drafts.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Custom folders */}
        <div className="px-2.5 flex-1">
          <div className="h-px bg-[#1C1F28] mx-1 mb-3" />
          <div className="flex items-center justify-between px-2.5 mb-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#5A6275]">Folders</p>
            <button
              onClick={() => setShowNewFolder(true)}
              className="p-0.5 rounded text-[#8A92A6] hover:text-[#00C2FF] hover:bg-[#1B1F2A] transition-colors"
              title="New folder"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
          </div>
          {customFolders.length === 0 ? (
            <button
              onClick={() => setShowNewFolder(true)}
              className="w-full text-left px-2.5 py-2 text-xs text-[#262b3a] hover:text-[#8A92A6] rounded-lg transition-colors"
            >
              + Create a folder
            </button>
          ) : (
            customFolders.map(folder => (
              <button
                key={folder.id}
                onClick={() => { setActiveCustomFolder(folder.id); setActiveFolder("inbox"); }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverFolderId(folder.id); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverFolderId(null); }}
                onDrop={(e) => { e.preventDefault(); if (draggedThread) void handleFolderDrop(draggedThread, folder); }}
                className={`flex w-full items-center gap-[11px] h-[38px] px-[11px] mb-0.5 text-[13px] font-semibold transition-colors rounded-lg ${
                  dragOverFolderId === folder.id
                    ? "bg-[#00C2FF]/10 text-[#00C2FF] border border-[#00C2FF]/30"
                    : activeCustomFolder === folder.id
                    ? "bg-[#00C2FF]/[0.10] text-[#00C2FF]"
                    : "text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0]"
                }`}
              >
                <Folder className="h-[18px] w-[18px] flex-shrink-0" style={{ color: dragOverFolderId === folder.id ? "#00d2ff" : (folder.color ?? "#9aa3b8") }} />
                <span className="flex-1 text-left truncate">{folder.name}</span>
                {dragOverFolderId === folder.id ? (
                  <span className="text-[10px] text-[#00C2FF] font-semibold">Drop here</span>
                ) : (folder._count?.threads ?? 0) > 0 && (
                  <span className="text-[11.5px] font-mono text-[#5A6275]">{folder._count?.threads}</span>
                )}
              </button>
            ))
          )}
        </div>

        {/* Labels */}
        <div className="px-2.5 pb-2">
          <div className="h-px bg-[#1C1F28] mx-1 mb-3" />
          <p className="px-2.5 mb-1 text-[11px] font-bold uppercase tracking-[0.5px] text-[#5A6275]">Labels</p>
          {[
            { label: "Priority", color: "#FF6B9D" },
            { label: "Dev",      color: "#7C5CFF" },
            { label: "Personal", color: "#10B981" },
            { label: "Finance",  color: "#F59E0B" },
          ].map(({ label, color }) => (
            <button
              key={label}
              className="flex w-full items-center gap-[11px] h-[34px] px-[11px] rounded-lg text-[12.5px] font-medium text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0] transition-colors"
            >
              <span className="w-[9px] h-[9px] rounded-full flex-shrink-0" style={{ background: color }} />
              <span className="flex-1 text-left">{label}</span>
            </button>
          ))}
        </div>

        {/* Rules */}
        <div className="px-2.5 pb-4">
          <div className="h-px bg-[#1C1F28] mx-1 mb-3" />
          <button
            onClick={() => setShowRules(true)}
            className="flex w-full items-center gap-[11px] h-[34px] px-[11px] rounded-lg text-[12.5px] font-medium text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0] transition-colors"
          >
            <Zap className="h-[18px] w-[18px] flex-shrink-0 text-[#00C2FF]" />
            <span className="flex-1 text-left">Email Rules</span>
          </button>
        </div>
      </div>

      {/* ── Thread List ── */}
      <div className={`${selectedThreadId ? "hidden md:flex" : "flex"} w-full md:w-[372px] flex-shrink-0 bg-[#12151D] border-r border-[#262A35] flex-col`}>
        <div className="px-4 pt-3 pb-2 border-b border-[#262A35] space-y-2">
          <div className="flex items-center justify-between min-h-[26px]">
            <h2 className="text-[13.5px] font-bold text-[#E6E9F0] flex items-center gap-1.5">
              {activeCustomFolder ? (
                <>
                  <Folder className="w-4 h-4 text-[#00C2FF]" />
                  {customFolders.find(f => f.id === activeCustomFolder)?.name ?? "Folder"}
                </>
              ) : (
                <>
                  {(() => { const F = SYSTEM_FOLDERS.find(f => f.key === activeFolder); return F ? <F.Icon className="w-4 h-4 text-[#00C2FF]" /> : null; })()}
                  {SYSTEM_FOLDERS.find(f => f.key === activeFolder)?.label ?? "Inbox"}
                </>
              )}
            </h2>
            <button
              onClick={() => loadThreads()}
              disabled={isRefreshing}
              className="p-1.5 hover:bg-[#1B1F2A] rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#8A92A6] ${isRefreshing ? "animate-spin" : ""}`} />
            </button>
          </div>

          {activeFolder === "inbox" && !activeCustomFolder && (
            <div className="flex gap-1">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`transition-colors ${
                    activeCategory === cat
                      ? "bg-[#00C2FF]/10 text-[#00C2FF] rounded-full border border-[#262A35] px-3 py-1 text-xs font-medium"
                      : "bg-[#12151D] text-[#8A92A6] rounded-full border border-[#262A35] px-3 py-1 text-xs hover:bg-[#1B1F2A]"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {!isSpecialFolder && (
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#5A6275]" />
                <input
                  type="text"
                  placeholder="Search…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#1B1F2A] border-transparent rounded-lg pl-10 py-2 text-sm focus:ring-2 focus:ring-[#00C2FF]/20 focus:bg-[#12151D] outline-none"
                />
              </div>
              <button
                onClick={() => setShowUnreadOnly(v => !v)}
                title={showUnreadOnly ? "Show all" : "Show unread only"}
                className={`flex-shrink-0 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${showUnreadOnly ? "bg-[#0E2532] text-[#00C2FF] border-[#00C2FF]/30" : "bg-[#12151D] text-[#8A92A6] border-[#262A35] hover:bg-[#1B1F2A]"}`}
              >
                Unread
              </button>
            </div>
          )}
        </div>

        {/* Security posture bar — inbox only */}
        {activeFolder === "inbox" && !activeCustomFolder && !searchQuery && visibleThreads.length > 0 && (
          <SecurityPostureBar threads={visibleThreads} totalScanned={visibleThreads.length} />
        )}

        {/* Thread rows */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#1C1F28]">

          {/* ── Scheduled tab ── */}
          {activeFolder === "scheduled" ? (
            isScheduledLoading ? (
              <div className="p-8 text-center text-sm text-[#8A92A6]">Loading scheduled emails…</div>
            ) : scheduledEmails.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#8A92A6]">No scheduled emails.</div>
            ) : (
              scheduledEmails.map(s => (
                <div key={s.id} className="group p-3 hover:bg-[#1B1F2A] transition-colors border-b border-[#262A35]">
                  <div className="flex items-center gap-2 mb-1">
                    <CalendarClock className="w-3.5 h-3.5 text-[#00C2FF] flex-shrink-0" />
                    <span className="text-xs font-semibold text-[#E6E9F0] truncate flex-1">{s.subject}</span>
                    <button
                      onClick={() => void handleCancelScheduled(s.id)}
                      className="hidden group-hover:flex p-1 rounded hover:bg-[#ea4335]/10 text-[#8A92A6] hover:text-[#ea4335] transition-colors"
                      title="Cancel scheduled send"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-xs text-[#8A92A6] truncate pl-5">To: {s.toAddresses.join(", ")}</p>
                  <p className="text-[11px] text-[#00C2FF] pl-5 mt-0.5">
                    Sends {formatDistanceToNow(new Date(s.scheduledAt), { addSuffix: true })}
                  </p>
                </div>
              ))
            )

          /* ── Drafts tab ── */
          ) : activeFolder === "drafts" ? (
            isDraftsLoading ? (
              <div className="p-8 text-center text-sm text-[#8A92A6]">Loading drafts…</div>
            ) : drafts.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#8A92A6]">No drafts saved.</div>
            ) : (
              drafts.map(draft => (
                <div
                  key={draft.id}
                  onClick={() => setEditingDraft(draft)}
                  className="group relative p-3 cursor-pointer hover:bg-[#1B1F2A] transition-colors border-b border-[#262A35]"
                >
                  <div className="flex items-center gap-2 mb-1 pr-8">
                    <FileText className="w-3 h-3 text-[#8A92A6] flex-shrink-0" />
                    <span className="text-xs font-semibold text-[#E6E9F0] truncate">
                      {draft.subject || "(no subject)"}
                    </span>
                    <span className="ml-auto text-xs text-[#8A92A6] flex-shrink-0">
                      {formatDistanceToNow(new Date(draft.savedAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-xs text-[#8A92A6] truncate pl-5">{draft.to ? `To: ${draft.to}` : "(no recipient)"}</p>
                  <p className="text-[11px] text-[#8A92A6] truncate pl-5 mt-0.5">{draft.body?.slice(0, 80) || ""}</p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      fetch(`/api/drafts/${draft.id}`, { method: "DELETE" }).then(() => {
                        setDrafts(prev => prev.filter(d => d.id !== draft.id));
                        toast.success("Draft deleted");
                      }).catch(() => toast.error("Failed to delete draft"));
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex p-1.5 rounded hover:bg-[#ea4335]/10 text-[#8A92A6] hover:text-[#ea4335] transition-colors"
                    title="Delete draft"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )

          /* ── Sent tab ── */
          ) : activeFolder === "sent" ? (
            isSentLoading ? (
              <div className="p-8 text-center text-sm text-[#8A92A6]">Loading sent…</div>
            ) : sentLogs.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#8A92A6]">No sent emails yet.</div>
            ) : (
              sentLogs.map(log => {
                const statusColor = log.status === "DELIVERED" || log.status === "SENT"
                  ? "text-[#0f9d58]" : log.status === "FAILED" ? "text-[#ea4335]" : "text-amber-400";
                const displayName = log.contact?.name || log.recipient;
                const member = memberMap[log.recipient.toLowerCase()];
                return (
                  <div
                    key={log.id}
                    className="p-3 hover:bg-[#1B1F2A] transition-colors cursor-pointer border-b border-[#1C1F28]"
                    onClick={() => { if (log.isInternalThread && log.threadId) loadThreadDetail(log.threadId); }}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <SenderAvatar
                        member={member}
                        email={log.recipient}
                        size={8}
                        onClick={(e) => { e?.stopPropagation(); if (member?.id) setProfileUserId(member.id); }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm text-[#E6E9F0] truncate">To: {displayName}</p>
                          <span className="ml-auto text-xs text-[#7a8899] flex-shrink-0">
                            {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-sm text-[#8A92A6] truncate font-medium">{log.subject}</p>
                        {log.snippet && (
                          <p className="text-xs text-[#7a8899] truncate mt-0.5">{log.snippet}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          {log.isInternalThread
                            ? <span className="text-[10px] font-semibold text-[#0f9d58]">✓ Delivered</span>
                            : <span className={`text-[10px] font-semibold ${statusColor}`}>{log.status}</span>
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )

          /* ── Thread list (inbox / starred / snoozed / trash / custom folder) ── */
          ) : isLoading ? (
            <div className="p-8 flex flex-col items-center gap-3 text-[#8A92A6]">
              <Loader2 className="w-6 h-6 animate-spin text-[#00C2FF]" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : visibleThreads.length === 0 ? (
            <div className="p-10 flex flex-col items-center gap-2 text-center">
              <Inbox className="w-8 h-8 text-[#262b3a]" />
              <p className="text-sm text-[#8A92A6] mt-1">
                {searchQuery ? "No messages match your search." : "All clear — nothing here."}
              </p>
            </div>
          ) : (
            visibleThreads.map(thread => (
              <div
                key={thread.id}
                draggable
                onDragStart={(e) => {
                  setDraggedThread(thread);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("threadId", thread.id);
                }}
                onDragEnd={() => { setDraggedThread(null); setDragOverFolderId(null); }}
                onClick={() => loadThreadDetail(thread.id)}
                className={`group relative cursor-grab active:cursor-grabbing transition-all duration-100 border-b border-[#1C1F28] ${
                  selectedThreadId === thread.id
                    ? "bg-[#00C2FF]/[0.07]"
                    : "hover:bg-[#1B1F2A]"
                } ${draggedThread?.id === thread.id ? "opacity-50" : ""}`}
              >
                {/* Selected row — 2.5px cyan left bar */}
                {selectedThreadId === thread.id && (
                  <span className="absolute left-0 top-0 bottom-0 w-[2.5px] bg-[#00C2FF] z-10" />
                )}
                {/* Hover action bar */}
                <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5 bg-[#12151D] border border-[#262A35] shadow-lg rounded-lg px-1 py-1 z-10">
                  {activeFolder === "trash" ? (
                    <button
                      onClick={(e) => handleRestoreFromTrash(thread.id, e)}
                      className="p-1.5 text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0] rounded-full transition-colors"
                      title="Restore to inbox"
                    >
                      <Inbox className="w-3.5 h-3.5" />
                    </button>
                  ) : activeFolder === "archive" ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); void patchThread(thread.id, { isArchived: false }); toast.success("Moved to inbox"); }}
                      className="p-1.5 text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0] rounded-full transition-colors"
                      title="Move to inbox"
                    >
                      <Inbox className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={(e) => handleMarkUnread(thread.id, e)}
                        className="p-1.5 text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0] rounded-full transition-colors"
                        title="Mark as unread"
                      >
                        <MailOpen className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSnoozeTargetId(thread.id); }}
                        className="p-1.5 text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0] rounded-full transition-colors"
                        title="Snooze"
                      >
                        <BellOff className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => toggleStar(thread.id, e)}
                        className={`p-1.5 rounded-full transition-colors ${thread.isStarred ? "text-[#00C2FF]" : "text-[#8A92A6] hover:text-[#E6E9F0]"}`}
                        title={thread.isStarred ? "Unstar" : "Star"}
                      >
                        <Star className="w-3.5 h-3.5" fill={thread.isStarred ? "currentColor" : "none"} />
                      </button>
                      <button
                        onClick={(e) => handleArchive(thread.id, e)}
                        className="p-1.5 text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0] rounded-full transition-colors"
                        title="Archive"
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDelete(thread.id, e)}
                        className="p-1.5 text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#ea4335] rounded-full transition-colors"
                        title="Trash"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>

                <div className="flex gap-3 px-4 py-[13px]">
                  {/* Avatar — 38px gradient */}
                  <div className="flex-shrink-0">
                    <SenderAvatar
                      member={memberMap[(thread.lastMessage?.from ?? "").toLowerCase()]}
                      email={thread.lastMessage?.from ?? "?"}
                      size={9}
                      onClick={() => { const m = memberMap[(thread.lastMessage?.from ?? "").toLowerCase()]; if (m?.id) setProfileUserId(m.id); }}
                    />
                  </div>

                  <div className="flex-1 min-w-0">

                    {/* Row 1 — Sender · star · time */}
                    <div className="flex items-center gap-1.5 mb-[3px]">
                      <span
                        className={`flex-1 truncate text-[13.5px] leading-tight ${thread.unreadCount > 0 ? "font-bold text-[#E6E9F0]" : "font-medium text-[#8A92A6]"}`}
                        onClick={(e) => { e.stopPropagation(); const m = memberMap[(thread.lastMessage?.from ?? "").toLowerCase()]; if (m?.id) setProfileUserId(m.id); }}
                      >
                        {senderName(memberMap[(thread.lastMessage?.from ?? "").toLowerCase()], thread.lastMessage?.from)}
                      </span>
                      {isExternalSender(thread.lastMessage?.from ?? "") && (
                        <span className="flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex-shrink-0" title="External sender">
                          <Globe className="w-2 h-2" />EXT
                        </span>
                      )}
                      {thread.isStarred && <Star className="w-[14px] h-[14px] text-[#FFB020] flex-shrink-0" fill="#FFB020" strokeWidth={1.5} />}
                      <span className="text-[11px] font-mono text-[#5A6275] flex-shrink-0">
                        {thread.lastMessage ? smartTime(thread.lastMessage.receivedAt) : ""}
                      </span>
                    </div>

                    {/* Row 2 — Subject */}
                    <div className="flex items-center gap-1.5 mb-[3px]">
                      <p className={`flex-1 truncate text-[13px] leading-snug ${thread.unreadCount > 0 ? "font-bold text-[#E6E9F0]" : "font-normal text-[#8A92A6]"}`}>
                        {thread.subject || "(No Subject)"}
                      </p>
                      <PriorityBadge priority={thread.priority} />
                      {thread.slaDeadline && <SlaIndicator deadline={thread.slaDeadline} />}
                      {thread.unreadCount > 1 && (
                        <span className="flex-shrink-0 rounded-full bg-[#00C2FF] px-1.5 py-0.5 text-[9px] font-semibold leading-none text-[#06121A] font-mono">
                          {thread.unreadCount}
                        </span>
                      )}
                    </div>

                    {/* Row 3 — Preview */}
                    <p className="text-[12.5px] text-[#6B7385] truncate leading-snug">
                      {thread.lastMessage?.snippet || "No preview available"}
                    </p>

                    {/* Label pills */}
                    {thread.labels && thread.labels.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-[7px]">
                        {thread.labels.slice(0, 3).map(lbl => (
                          <span key={lbl} className="inline-block text-[10.5px] font-semibold px-2 py-0.5 rounded-[5px] bg-[#00C2FF]/10 text-[#00C2FF]">
                            {lbl}
                          </span>
                        ))}
                      </div>
                    )}

                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Message Detail ── */}
      <div className={`${selectedThreadId ? "flex" : "hidden md:flex"} flex-1 bg-[#12151D] flex-col min-w-0`}>
        {!selectedThreadId ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
            <div className="w-12 h-12 rounded-xl bg-[#1B1F2A] border border-[#262A35] flex items-center justify-center">
              <Inbox className="w-5 h-5 text-[#5A6275]" />
            </div>
            <div className="max-w-xs text-center">
              <p className="text-sm font-medium text-[#8A92A6]">No conversation selected</p>
              <p className="text-[13px] text-[#5A6275] mt-1 leading-relaxed">
                Choose a thread from the list to read it here.
              </p>
            </div>
          </div>
        ) : isDetailLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[#8A92A6]">
            <RefreshCw className="w-7 h-7 animate-spin text-[#00C2FF]" />
            <span className="text-sm">Loading conversation…</span>
          </div>
        ) : threadDetail ? (
          <>
            {/* Detail Header — 50px icon toolbar (mockup) */}
            <div className="h-[50px] flex-none px-[18px] border-b border-[#262A35] bg-[#12151D] flex items-center gap-1.5">
              <button
                className="md:hidden flex-shrink-0 w-[34px] h-[34px] flex items-center justify-center rounded-lg border border-[#262A35] bg-[#12151D] text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0] transition-colors"
                onClick={() => setSelectedThreadId(null)}
                aria-label="Back to inbox"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setShowReply(true); setShowSmartReply(false); setShowForward(false); }}
                title="Reply"
                className="w-[34px] h-[34px] flex items-center justify-center rounded-lg border border-[#262A35] bg-[#12151D] text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0] transition-colors"
              >
                <Reply className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setShowForward(true); setShowReply(false); setShowSmartReply(false); }}
                title="Forward"
                className="w-[34px] h-[34px] flex items-center justify-center rounded-lg border border-[#262A35] bg-[#12151D] text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0] transition-colors"
              >
                <Forward className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setShowSmartReply(v => !v); setShowReply(false); }}
                title="AI Reply"
                className="w-[34px] h-[34px] flex items-center justify-center rounded-lg border border-[#262A35] bg-[#12151D] text-[#8A92A6] hover:text-[#00C2FF] transition-colors"
              >
                <Sparkles className="w-4 h-4" />
              </button>
              <div className="flex-1" />
              {(() => {
                const t = threads.find(th => th.id === threadDetail.id);
                if (!t || t.priority === "NORMAL") return null;
                const pc = PRIORITY_CONFIG[t.priority];
                return <span className={`text-[11px] font-semibold ${pc.color} mr-1`}>{pc.label}</span>;
              })()}
              <button
                onClick={(e) => handleArchive(threadDetail.id, e)}
                title="Archive"
                className="w-[34px] h-[34px] flex items-center justify-center rounded-lg border border-[#262A35] bg-[#12151D] text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0] transition-colors"
              >
                <Archive className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => handleDelete(threadDetail.id, e)}
                title="Delete"
                className="w-[34px] h-[34px] flex items-center justify-center rounded-lg border border-[#262A35] bg-[#12151D] text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#ea4335] transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* Sender security context strip */}
            {(() => {
              const firstMsg = threadDetail.messages[0];
              if (!firstMsg) return null;
              const ext = isExternalSender(firstMsg.from);
              const fromDomain = firstMsg.from.split("@")[1] ?? "";
              return (
                <div className={`flex items-center gap-3 px-5 py-1.5 text-[11px] border-b ${ext ? "bg-[#b06000]/[0.04] border-[#b06000]/15" : "bg-transparent border-[#262A35]"}`}>
                  {ext ? (
                    <span className="flex items-center gap-1 font-medium text-[#b06000]">
                      <Globe className="w-2.5 h-2.5" /> External sender
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 font-medium text-[#0f9d58]">
                      <ShieldCheck className="w-2.5 h-2.5" /> Internal
                    </span>
                  )}
                  <span className="text-[#bdc1c6]">·</span>
                  <span className="text-[#5A6275] font-mono">{fromDomain}</span>
                  <div className="flex-1" />
                  <span className="flex items-center gap-1.5 text-[#bdc1c6]">
                    <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-[#12151D]" />SPF</span>
                    <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-[#12151D]" />DKIM</span>
                    <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-[#12151D]" />DMARC</span>
                  </span>
                </div>
              );
            })()}

            {/* Smart Reply bar */}
            {showSmartReply && (
              <div className="bg-[#00C2FF]/10 border-b border-[#262A35] px-5 py-3 flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#00C2FF]">
                  <Sparkles className="w-3.5 h-3.5" /> AI Smart Reply
                </div>
                {(["friendly", "professional", "brief"] as const).map((tone) => (
                  <button
                    key={tone}
                    onClick={() => void handleSmartReply(tone)}
                    disabled={smartReplyLoading !== null}
                    className="bg-[#1B1F2A] text-[#8A92A6] hover:bg-[#00C2FF]/10 hover:text-[#00C2FF] rounded-md px-3 py-1.5 text-xs font-medium border border-[#262A35] flex items-center gap-1.5 transition-colors disabled:opacity-50 capitalize"
                  >
                    {smartReplyLoading === tone ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    {tone}
                  </button>
                ))}
                <button onClick={() => setShowSmartReply(false)} className="ml-auto p-2 text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0] rounded-full transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto px-9 py-6 space-y-2">
              {/* Subject H2 + mailbox meta */}
              <div className="mb-4">
                <h2 className="text-[22px] font-bold text-[#E6E9F0] leading-tight tracking-[-0.4px]">{threadDetail.subject || "(No Subject)"}</h2>
                <span className="text-[11px] text-[#5A6275] flex items-center gap-1 mt-1.5">
                  <Inbox className="w-2.5 h-2.5" />
                  {threads.find(t => t.id === threadDetail.id)?.mailboxName}
                </span>
              </div>
              {threadDetail.messages.map((msg, msgIdx) => {
                const isLastMsg = msgIdx === threadDetail.messages.length - 1;
                const isExpanded = isLastMsg || expandedMsgs.has(msg.id);
                const toggleMsg = () => setExpandedMsgs(prev => {
                  const next = new Set(prev);
                  if (next.has(msg.id)) next.delete(msg.id); else next.add(msg.id);
                  return next;
                });

                // Collapsed older message — single line, Gmail style
                if (!isExpanded) return (
                  <button
                    key={msg.id}
                    onClick={toggleMsg}
                    className="w-full flex items-center gap-3 px-5 py-2.5 bg-[#12151D]/60 rounded-lg border border-[#1C1F28] hover:bg-[#12151D] hover:border-[#262A35] transition-colors text-left"
                  >
                    <SenderAvatar member={memberMap[msg.from.toLowerCase()]} email={msg.from} size={6} />
                    <span className="text-[13px] font-medium text-[#8A92A6] flex-shrink-0 max-w-[160px] truncate">
                      {senderName(memberMap[msg.from.toLowerCase()], msg.from)}
                    </span>
                    <span className="text-xs text-[#5A6275] truncate flex-1">
                      {(msg.textBody ?? "").slice(0, 110)}
                    </span>
                    <span className="text-[11px] text-[#5A6275] flex-shrink-0 tabular-nums">{smartTime(msg.receivedAt)}</span>
                  </button>
                );

                return (
                <div key={msg.id} className="bg-[#12151D] rounded-xl border border-[#262A35] overflow-hidden">
                  <div
                    className={`px-5 py-3.5 border-b border-[#1C1F28] flex items-start justify-between gap-3 ${!isLastMsg ? "cursor-pointer" : ""}`}
                    onClick={!isLastMsg ? toggleMsg : undefined}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <SenderAvatar
                        member={memberMap[msg.from.toLowerCase()]}
                        email={msg.from}
                        size={11}
                        onClick={(e) => { e?.stopPropagation(); const m = memberMap[msg.from.toLowerCase()]; if (m?.id) setProfileUserId(m.id); }}
                      />
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2 min-w-0">
                          <p
                            className="text-[14.5px] font-bold text-[#E6E9F0] cursor-pointer hover:underline truncate"
                            onClick={(e) => { e.stopPropagation(); const m = memberMap[msg.from.toLowerCase()]; if (m?.id) setProfileUserId(m.id); }}
                          >
                            {senderName(memberMap[msg.from.toLowerCase()], msg.from)}
                          </p>
                          <p className="text-[12.5px] font-mono text-[#6B7385] truncate">&lt;{msg.from}&gt;</p>
                        </div>
                        <p className="text-xs text-[#5A6275] mt-0.5">
                          to {senderName(memberMap[msg.to.toLowerCase()], msg.to)}
                        </p>
                        {(() => {
                          const domain = (msg.from.match(/@([\w.-]+)/)?.[1] ?? "").toLowerCase();
                          const freeProviders = ["gmail.com","yahoo.com","hotmail.com","outlook.com","aol.com","protonmail.com","icloud.com","live.com"];
                          if (freeProviders.includes(domain)) return (
                            <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] text-amber-400 font-medium">
                              <AlertTriangle className="w-3 h-3" /> External / personal email domain
                            </span>
                          );
                          return null;
                        })()}
                      </div>
                    </div>
                    <span className="text-[12.5px] font-mono text-[#6B7385] flex-shrink-0 mt-0.5" title={new Date(msg.receivedAt).toLocaleString()}>
                      {format(new Date(msg.receivedAt), "d MMM yyyy, HH:mm")}
                    </span>
                  </div>

                  <div className="px-5 py-4">
                    {msg.threatScan && msg.threatScan.riskScore > 60 && (
                      <div className="mb-4 p-3 bg-[#ea4335]/10 border border-[#ea4335]/30 rounded-xl flex items-start gap-3">
                        <ShieldAlert className="w-4 h-4 text-[#ea4335] flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-[#ea4335]">Phishing Warning</p>
                          <p className="text-xs text-[#ea4335]/80 mt-0.5">This email shows strong indicators of a phishing attempt. Do not click links or open attachments.</p>
                          <ul className="mt-1.5 list-disc list-inside text-[11px] text-[#ea4335]/70 space-y-0.5">
                            {msg.threatScan.findings.map((f, i) => <li key={i}>{f}</li>)}
                          </ul>
                        </div>
                      </div>
                    )}
                    {msg.threatScan && msg.threatScan.riskScore > 30 && msg.threatScan.riskScore <= 60 && (
                      <div className="mb-4 p-3 bg-amber-400/10 border border-amber-400/30 rounded-xl flex items-start gap-3">
                        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-amber-300">Suspicious Email</p>
                          <p className="text-xs text-amber-400/80 mt-0.5">This email has been flagged as potentially suspicious. Proceed with caution.</p>
                          <ul className="mt-1.5 list-disc list-inside text-[11px] text-amber-400/70 space-y-0.5">
                            {msg.threatScan.findings.map((f, i) => <li key={i}>{f}</li>)}
                          </ul>
                        </div>
                      </div>
                    )}
                    {msg.threatScan && msg.threatScan.riskScore > 10 && msg.threatScan.riskScore <= 30 && (
                      <div className="mb-4 p-3 bg-[#00C2FF]/10 border border-[#00C2FF]/30 rounded-xl flex items-start gap-3">
                        <Info className="w-4 h-4 text-[#00C2FF] flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-[#00C2FF]">Security Notice</p>
                          <p className="text-xs text-[#00C2FF]/80 mt-0.5">Minor anomalies detected. Review the sender and content before responding.</p>
                        </div>
                      </div>
                    )}

                    {msg.htmlBody ? (
                      <div className="prose prose-sm max-w-none text-[#C2C8D6] prose-a:text-[#00C2FF] leading-[1.75]" dangerouslySetInnerHTML={{ __html: sanitizeHtml(msg.htmlBody) }} />
                    ) : (
                      <p className="text-[14.5px] text-[#C2C8D6] whitespace-pre-wrap leading-[1.75]">{msg.textBody}</p>
                    )}

                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="mt-5 pt-5 border-t border-[#262A35]">
                        <p className="text-xs font-medium text-[#8A92A6] mb-2">
                          {msg.attachments.length} {msg.attachments.length === 1 ? "attachment" : "attachments"}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {msg.attachments.map((att) => {
                            const riskyExts = [".exe",".bat",".cmd",".vbs",".jar",".ps1",".msi",".scr",".dll"];
                            const ext = att.filename.slice(att.filename.lastIndexOf(".")).toLowerCase();
                            const isRisky = riskyExts.includes(ext);
                            // Use the server-side proxy — avoids relative-path R2 URLs and
                            // handles signing. A file is "available" if it has a storageUrl
                            // OR a key (the proxy will sign it).
                            const hasFile = !!(att.storageUrl || att.key);
                            const downloadUrl = `/api/attachments/${att.id}`;

                            const inner = (
                              <>
                                {isRisky ? (
                                  <AlertCircle className="w-4 h-4 text-[#ea4335] flex-shrink-0" />
                                ) : hasFile ? (
                                  <ChevronRight className="w-4 h-4 text-[#00C2FF] group-hover:translate-x-0.5 transition-transform" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-[#5A6275] flex-shrink-0" />
                                )}
                                <div className="min-w-0">
                                  <p className={`text-xs font-medium truncate max-w-[160px] ${isRisky ? "text-[#ea4335]" : hasFile ? "text-[#E6E9F0]" : "text-[#5A6275]"}`}>
                                    {att.filename}
                                  </p>
                                  <p className={`text-[10px] ${isRisky ? "text-[#ea4335] font-medium" : "text-[#5A6275]"}`}>
                                    {isRisky ? "Potentially dangerous" : !hasFile ? "Not stored" : att.mimeType.split("/")[1]?.toUpperCase()}
                                  </p>
                                </div>
                              </>
                            );

                            const baseClass = `border rounded-lg px-3 py-2 flex items-center gap-2 text-sm transition-colors group`;
                            const colorClass = isRisky
                              ? "bg-[#ea4335]/10 border-[#ea4335]/30 hover:bg-[#ea4335]/20"
                              : hasFile
                              ? "bg-[#12151D] border-[#262A35] hover:bg-[#1B1F2A] cursor-pointer"
                              : "bg-[#12151D] border-[#262A35] cursor-not-allowed opacity-60";

                            return hasFile ? (
                              <a
                                key={att.id}
                                href={downloadUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`${baseClass} ${colorClass}`}
                              >
                                {inner}
                              </a>
                            ) : (
                              <div key={att.id} title="File content not available" className={`${baseClass} ${colorClass}`}>
                                {inner}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                );
              })}
            </div>

            {/* Footer — Reply (primary) + Forward (secondary) */}
            <div className="flex-none px-9 pt-4 pb-6 border-t border-[#262A35]">
              <div className="flex gap-2.5">
                <button
                  onClick={() => { setShowReply(true); setShowSmartReply(false); setShowForward(false); }}
                  className="h-10 px-5 rounded-[9px] text-[13px] font-bold text-[#06121A] flex items-center gap-2 transition-opacity hover:opacity-90"
                  style={{ background: "linear-gradient(135deg, #00C2FF, #0098E6)" }}
                >
                  <Reply className="w-4 h-4" /> Reply
                </button>
                <button
                  onClick={() => { setShowForward(true); setShowReply(false); setShowSmartReply(false); }}
                  className="h-10 px-5 rounded-[9px] text-[13px] font-semibold text-[#E6E9F0] bg-[#12151D] border border-[#262A35] hover:bg-[#1B1F2A] flex items-center gap-2 transition-colors"
                >
                  <Forward className="w-4 h-4" /> Forward
                </button>
              </div>
            </div>

            {/* Draft edit modal */}
            {editingDraft && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/40 " onClick={() => setEditingDraft(null)} />
                <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl bg-[#12151D] shadow-[0_8px_32px_rgba(0,0,0,0.12)]" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between border-b border-[#262A35] bg-[#12151D] px-5 py-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-[#00C2FF]">
                        <FileText className="h-3.5 w-3.5 text-white" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-[#E6E9F0]">Edit Draft</h2>
                        <p className="text-sm text-[#8A92A6] truncate max-w-[300px]">{editingDraft.subject || "(no subject)"}</p>
                      </div>
                    </div>
                    <button onClick={() => setEditingDraft(null)} className="rounded-lg p-1.5 text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0] transition-colors flex-shrink-0">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="max-h-[80vh] overflow-y-auto">
                    <SimpleComposer
                      bare
                      userRole={userRole}
                      defaultRecipient={editingDraft.to}
                      defaultSubject={editingDraft.subject}
                      draftId={editingDraft.id}
                      onSuccess={() => {
                        setEditingDraft(null);
                        setDrafts(prev => prev.filter(d => d.id !== editingDraft.id));
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Reply Modal */}
            {showReply && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <div
                  className="absolute inset-0 bg-black/40 "
                  onClick={() => { setShowReply(false); setReplyDefaultBody(""); setRewriteBody(""); }}
                />
                <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl bg-[#12151D] shadow-[0_8px_32px_rgba(0,0,0,0.12)]" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between border-b border-[#262A35] bg-[#12151D] px-5 py-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-[#00C2FF]">
                        <Send className="h-3.5 w-3.5 text-white" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-[#E6E9F0]">Reply</h2>
                        <p className="text-sm text-[#8A92A6] truncate max-w-[300px]">{threadDetail.subject}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="relative" ref={rewriteMenuRef}>
                        <button
                          onClick={() => setShowRewriteMenu(v => !v)}
                          disabled={rewriteLoading}
                          className="bg-[#1B1F2A] text-[#8A92A6] hover:bg-[#00C2FF]/10 hover:text-[#00C2FF] rounded-md px-3 py-1.5 text-xs font-medium border border-[#262A35] flex items-center gap-1.5 transition-colors disabled:opacity-50"
                        >
                          {rewriteLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-[#00C2FF]" />}
                          Rewrite
                          <ChevronDown className="w-3 h-3" />
                        </button>
                        {showRewriteMenu && (
                          <div className="absolute right-0 top-full mt-1 w-40 bg-[#12151D] border border-[#262A35] rounded-lg shadow-xl z-20 py-1 overflow-hidden">
                            {(["formal", "casual", "concise", "expand"] as const).map((style) => (
                              <button
                                key={style}
                                onClick={() => void handleRewrite(style)}
                                className="w-full text-left px-3 py-2 text-xs font-medium text-[#8A92A6] hover:bg-[#00C2FF]/10 hover:text-[#00C2FF] transition-colors capitalize"
                              >
                                Make {style.charAt(0).toUpperCase() + style.slice(1)}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => { setShowReply(false); setReplyDefaultBody(""); setRewriteBody(""); }}
                        className="p-2 text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0] rounded-full transition-colors"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                  <div className="max-h-[80vh] overflow-y-auto">
                    <SimpleComposer
                      key={composerKey}
                      bare
                      userRole={userRole}
                      defaultRecipient={threadDetail.messages[threadDetail.messages.length - 1]?.from ?? ""}
                      defaultSubject={`Re: ${threadDetail.subject}`}
                      defaultBody={replyDefaultBody}
                      replyToThreadId={threadDetail.id}
                      onSuccess={() => {
                        setShowReply(false);
                        setReplyDefaultBody("");
                        setRewriteBody("");
                        setComposerKey(0);
                        void loadThreadDetail(threadDetail.id);
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Forward Modal */}
            {showForward && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <div
                  className="absolute inset-0 bg-black/40 "
                  onClick={() => setShowForward(false)}
                />
                <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl bg-[#12151D] shadow-[0_8px_32px_rgba(0,0,0,0.12)]" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between border-b border-[#262A35] bg-[#12151D] px-5 py-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-[#1B1F2A]">
                        <Forward className="h-3.5 w-3.5 text-[#8A92A6]" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-[#E6E9F0]">Forward</h2>
                        <p className="text-sm text-[#8A92A6] truncate max-w-[300px]">{threadDetail.subject}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowForward(false)}
                      className="p-2 text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0] rounded-full transition-colors"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="max-h-[80vh] overflow-y-auto">
                    <SimpleComposer
                      bare
                      userRole={userRole}
                      defaultSubject={`Fwd: ${threadDetail.subject}`}
                      defaultBody={(() => {
                        const orig = threadDetail.messages[0];
                        if (!orig) return "";
                        return `\n\n-------- Forwarded message --------\nFrom: ${orig.from}\nDate: ${new Date(orig.receivedAt).toLocaleString()}\nSubject: ${threadDetail.subject}\n\n${(orig.textBody ?? "").slice(0, 2000)}`;
                      })()}
                      onSuccess={() => {
                        setShowForward(false);
                        toast.success("Message forwarded");
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>

      {/* ── Snooze Modal ── */}
      {snoozeTargetId && (
        <SnoozeModal
          onClose={() => setSnoozeTargetId(null)}
          onSnooze={(date) => { void handleSnooze(snoozeTargetId, date); setSnoozeTargetId(null); }}
        />
      )}

      {/* ── New Folder Modal ── */}
      {showNewFolder && (
        <NewFolderModal
          onClose={() => setShowNewFolder(false)}
          onCreate={(folder) => setCustomFolders(prev => [...prev, folder])}
        />
      )}

      {/* ── Rules Modal ── */}
      {showRules && (
        <RulesModal
          customFolders={customFolders}
          onClose={() => setShowRules(false)}
        />
      )}

      {/* ── User Profile Modal ── */}
      <UserProfileModal
        userId={profileUserId}
        onClose={() => setProfileUserId(null)}
        onCompose={(email) => {
          setProfileUserId(null);
          // Open composer pre-filled to this recipient
          document.dispatchEvent(new CustomEvent("nexus:compose", { detail: { to: email } }));
        }}
      />

      {/* ── Drag-drop Rule Prompt Snackbar ── */}
      {rulePrompt && (() => {
        const from = rulePrompt.thread.lastMessage?.from ?? "";
        const atIdx = from.lastIndexOf("@");
        const domain = atIdx !== -1 ? from.slice(atIdx) : from;
        return (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 bg-[#12151D] border border-[#2E333F] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)]">
            <Folder className="w-4 h-4 text-[#00C2FF] flex-shrink-0" />
            <p className="text-sm text-[#E6E9F0]">
              Also route all emails from <span className="font-semibold text-[#E6E9F0]">{domain}</span> to{" "}
              <span className="font-semibold text-[#E6E9F0]">{rulePrompt.folder.name}</span>?
            </p>
            <button
              onClick={() => void handleCreateDomainRule()}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#00C2FF] text-[#06121A] hover:bg-[#0098E6] transition-colors flex-shrink-0"
            >
              Create Rule
            </button>
            <button
              onClick={() => setRulePrompt(null)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg text-[#8A92A6] hover:text-[#E6E9F0] hover:bg-[#1B1F2A] transition-colors flex-shrink-0"
            >
              Just this one
            </button>
          </div>
        );
      })()}
    </div>
  );
}
