"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Inbox, Search, RefreshCw, Clock, ChevronLeft, ChevronRight,
  Mail, Reply, Trash2, Star, Archive, X, Send, Tag,
  AlertCircle, AlertTriangle, Info, ShieldAlert, FileText,
  Sparkles, Loader2, ChevronDown, CalendarClock, FolderPlus,
  Folder, BellOff, Zap, Users, MoreHorizontal, Plus, Edit2, Trash,
} from "lucide-react";
import { formatDistanceToNow, isPast, isBefore, addHours, addDays, nextMonday } from "date-fns";
import { toast } from "sonner";
import { SimpleComposer } from "./WorkspaceDashboard";
import type { UserRole } from "@/generated/prisma/enums";

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

type Attachment = { id: string; filename: string; storageUrl: string; mimeType: string; size?: number };
type ThreatScan  = { riskScore: number; findings: string[] };

type Message = {
  id: string; from: string; to: string; subject: string;
  textBody?: string; htmlBody?: string; isRead: boolean; receivedAt: string;
  attachments?: Attachment[]; threatScan?: ThreatScan | null;
};

type ThreadDetail = { id: string; subject: string; mailboxId: string; messages: Message[] };

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
  "*": ["class","dir","id","lang","style","title"],
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
  URGENT: { label: "Urgent", color: "text-[#ff4d6d]",   dot: "bg-[#ff4d6d]" },
  HIGH:   { label: "High",   color: "text-amber-400",    dot: "bg-amber-400" },
  NORMAL: { label: "Normal", color: "text-[#bbc9cf]",    dot: "bg-[#bbc9cf]" },
  LOW:    { label: "Low",    color: "text-[#3c494e]",    dot: "bg-[#3c494e]" },
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
    <span className="text-[10px] font-bold text-[#ff4d6d] flex items-center gap-0.5">
      <Zap className="w-2.5 h-2.5" />SLA
    </span>
  );
  if (soon) return (
    <span className="text-[10px] font-bold text-amber-400 flex items-center gap-0.5">
      <Clock className="w-2.5 h-2.5" />SLA
    </span>
  );
  return null;
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
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-72 bg-[#1b1f2e] border border-[rgba(0,255,255,0.12)] rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(0,255,255,0.08)] bg-[#0f1321]">
          <div className="flex items-center gap-2 text-sm font-bold text-[#dfe1f6]">
            <BellOff className="w-4 h-4 text-[#00d2ff]" /> Snooze until…
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3 space-y-1">
          {presets.map(p => (
            <button
              key={p.label}
              onClick={() => { onSnooze(p.date()); onClose(); }}
              className="w-full text-left px-3 py-2.5 text-sm text-[#dfe1f6] hover:bg-[#262939] rounded-lg transition-colors"
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setCustom(v => !v)}
            className="w-full text-left px-3 py-2.5 text-sm text-[#bbc9cf] hover:bg-[#262939] rounded-lg transition-colors flex items-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" /> Custom time
          </button>
          {custom && (
            <div className="pt-1 flex gap-2">
              <input
                type="datetime-local"
                value={customVal}
                onChange={e => setCustomVal(e.target.value)}
                className="flex-1 bg-[#0f1321] border border-[rgba(0,255,255,0.12)] rounded-lg px-2.5 py-1.5 text-xs text-[#dfe1f6] focus:outline-none focus:ring-1 focus:ring-[#00d2ff]/40"
              />
              <button
                onClick={() => { if (customVal) { onSnooze(new Date(customVal)); onClose(); } }}
                disabled={!customVal}
                className="bg-[#00d2ff] text-[#003543] px-3 rounded-lg text-xs font-bold disabled:opacity-40"
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

  const COLORS = ["#00d2ff","#00feb2","#ff4d6d","#a78bfa","#f59e0b","#3b82f6","#10b981","#ec4899"];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-72 bg-[#1b1f2e] border border-[rgba(0,255,255,0.12)] rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(0,255,255,0.08)] bg-[#0f1321]">
          <span className="text-sm font-bold text-[#dfe1f6]">New Folder</span>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[#bbc9cf] hover:bg-[#262939] transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-4">
          <input
            type="text"
            placeholder="Folder name"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && void handle()}
            className="w-full bg-[#0f1321] border border-[rgba(0,255,255,0.12)] rounded-lg px-3 py-2 text-sm text-[#dfe1f6] focus:outline-none focus:ring-1 focus:ring-[#00d2ff]/40"
            autoFocus
          />
          <div>
            <p className="text-xs text-[#bbc9cf] mb-2">Color</p>
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
            className="w-full bg-[#00d2ff] text-[#003543] py-2 rounded-lg text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Create Folder
          </button>
        </div>
      </div>
    </div>
  );
}

// ── System folder type ────────────────────────────────────────────────────────
type SystemFolder = "inbox" | "starred" | "sent" | "drafts" | "trash" | "snoozed" | "scheduled";

const SYSTEM_FOLDERS: { key: SystemFolder; label: string; Icon: React.ElementType }[] = [
  { key: "inbox",     label: "Inbox",     Icon: Inbox       },
  { key: "starred",   label: "Starred",   Icon: Star        },
  { key: "sent",      label: "Sent",      Icon: Send        },
  { key: "drafts",    label: "Drafts",    Icon: FileText    },
  { key: "snoozed",   label: "Snoozed",   Icon: BellOff     },
  { key: "scheduled", label: "Scheduled", Icon: CalendarClock },
  { key: "trash",     label: "Trash",     Icon: Trash2      },
];

type SentLog = {
  id: string; recipient: string; subject: string; status: string;
  createdAt: string; contact?: { name: string; email: string } | null;
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
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [threadDetail, setThreadDetail]     = useState<ThreadDetail | null>(null);
  const [isLoading, setIsLoading]           = useState(!initialThreads?.length);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isRefreshing, setIsRefreshing]     = useState(false);
  const [searchQuery, setSearchQuery]       = useState("");
  const [showReply, setShowReply]           = useState(false);
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
  const rewriteMenuRef = useRef<HTMLDivElement>(null);

  // Load custom folders once
  useEffect(() => {
    fetch("/api/inbox/folders")
      .then(r => r.json())
      .then((data: CustomFolder[]) => setCustomFolders(data))
      .catch(() => {});
  }, []);

  const loadThreads = useCallback(async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      const url = searchQuery ? `/api/inbox?q=${encodeURIComponent(searchQuery)}` : "/api/inbox";
      const response = await fetch(url);
      if (response.ok) setThreads(await response.json());
    } catch {
      if (!silent) toast.error("Failed to load inbox");
    } finally {
      if (!silent) { setIsLoading(false); setIsRefreshing(false); }
    }
  }, [searchQuery]);

  useEffect(() => {
    if (!initialThreads?.length) loadThreads();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") loadThreads(true);
    }, 30000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadThreads]);

  useEffect(() => {
    if (activeFolder !== "sent") return;
    setIsSentLoading(true);
    fetch("/api/email-logs?limit=100")
      .then(r => r.json())
      .then(data => setSentLogs(data.logs ?? []))
      .catch(() => {})
      .finally(() => setIsSentLoading(false));
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
        fetch(`/api/inbox/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markRead: true }) });
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
    if (activeFolder === "snoozed")  return t.isSnoozed && !t.isTrashed;
    if (t.isTrashed) return false;
    if (t.isSnoozed && activeFolder !== "starred") return false;
    if (activeFolder === "starred")  return t.isStarred;
    if (activeFolder === "inbox")    return !t.isArchived;
    return true;
  });

  const unreadCount = threads.filter(t => t.unreadCount > 0 && !t.isTrashed && !t.isArchived).length;
  const snoozedCount = threads.filter(t => t.isSnoozed && !t.isTrashed).length;

  const isSpecialFolder = activeFolder === "sent" || activeFolder === "drafts" || activeFolder === "scheduled";

  const setSystemFolder = (key: SystemFolder) => {
    setActiveFolder(key);
    setActiveCustomFolder(null);
  };

  return (
    <div className="flex h-[calc(100vh-130px)] min-h-[400px] bg-[#0f1321] rounded-2xl border border-[rgba(0,255,255,0.08)] shadow-sm overflow-hidden">

      {/* ── Left Sidebar ── */}
      <div className="hidden md:flex w-48 flex-shrink-0 flex-col bg-[#1b1f2e] border-r border-[rgba(0,255,255,0.08)] overflow-y-auto">
        {/* System folders */}
        <div className="p-3 pt-4">
          <p className="px-2 mb-2 text-xs font-semibold text-[#bbc9cf] uppercase tracking-wider">Mailbox</p>
          {SYSTEM_FOLDERS.map(({ key, label, Icon }) => {
            const isActive = activeFolder === key && !activeCustomFolder;
            return (
              <button
                key={key}
                onClick={() => setSystemFolder(key)}
                className={`flex w-full items-center gap-2.5 px-2.5 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[#00d2ff]/10 text-[#00d2ff] rounded-xl font-semibold"
                    : "text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6] rounded-lg"
                }`}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1 text-left">{label}</span>
                {key === "inbox" && unreadCount > 0 && (
                  <span className="bg-[#00d2ff] text-[#003543] text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
                {key === "snoozed" && snoozedCount > 0 && (
                  <span className="bg-[#3c494e] text-[#dfe1f6] text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {snoozedCount}
                  </span>
                )}
                {key === "drafts" && drafts.length > 0 && (
                  <span className="bg-[#3c494e] text-[#dfe1f6] text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {drafts.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Custom folders */}
        <div className="mt-1 px-3 border-t border-[rgba(0,255,255,0.08)] pt-3 flex-1">
          <div className="flex items-center justify-between px-2 mb-2">
            <p className="text-xs font-semibold text-[#bbc9cf] uppercase tracking-wider">Folders</p>
            <button
              onClick={() => setShowNewFolder(true)}
              className="p-0.5 rounded text-[#bbc9cf] hover:text-[#00d2ff] hover:bg-[#262939] transition-colors"
              title="New folder"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
          </div>
          {customFolders.length === 0 ? (
            <button
              onClick={() => setShowNewFolder(true)}
              className="w-full text-left px-2.5 py-2 text-xs text-[#3c494e] hover:text-[#bbc9cf] rounded-lg transition-colors"
            >
              + Create a folder
            </button>
          ) : (
            customFolders.map(folder => (
              <button
                key={folder.id}
                onClick={() => { setActiveCustomFolder(folder.id); setActiveFolder("inbox"); }}
                className={`flex w-full items-center gap-2.5 px-2.5 py-2 text-sm font-medium transition-colors rounded-lg ${
                  activeCustomFolder === folder.id
                    ? "bg-[#00d2ff]/10 text-[#00d2ff]"
                    : "text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6]"
                }`}
              >
                <Folder className="h-3.5 w-3.5 flex-shrink-0" style={{ color: folder.color ?? "#bbc9cf" }} />
                <span className="flex-1 text-left truncate">{folder.name}</span>
                {(folder._count?.threads ?? 0) > 0 && (
                  <span className="text-[10px] text-[#bbc9cf]">{folder._count?.threads}</span>
                )}
              </button>
            ))
          )}
        </div>

        {/* Labels */}
        <div className="px-3 border-t border-[rgba(0,255,255,0.08)] pt-3 pb-3">
          <p className="px-2 mb-2 text-xs font-semibold text-[#bbc9cf] uppercase tracking-wider">Labels</p>
          {[
            { label: "Work",     color: "bg-blue-500"  },
            { label: "Personal", color: "bg-green-500" },
            { label: "Finance",  color: "bg-amber-500" },
            { label: "Security", color: "bg-red-500"   },
          ].map(({ label, color }) => (
            <button
              key={label}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6] transition-colors"
            >
              <Tag className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="flex-1 text-left">{label}</span>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
            </button>
          ))}
        </div>
      </div>

      {/* ── Thread List ── */}
      <div className={`${selectedThreadId ? "hidden md:flex" : "flex"} w-full md:w-72 flex-shrink-0 bg-[#1b1f2e] border-r border-[rgba(0,255,255,0.08)] flex-col`}>
        <div className="p-3 border-b border-[rgba(0,255,255,0.08)] space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#dfe1f6] flex items-center gap-1.5">
              {activeCustomFolder ? (
                <>
                  <Folder className="w-4 h-4 text-[#00d2ff]" />
                  {customFolders.find(f => f.id === activeCustomFolder)?.name ?? "Folder"}
                </>
              ) : (
                <>
                  {(() => { const F = SYSTEM_FOLDERS.find(f => f.key === activeFolder); return F ? <F.Icon className="w-4 h-4 text-[#00d2ff]" /> : null; })()}
                  {SYSTEM_FOLDERS.find(f => f.key === activeFolder)?.label ?? "Inbox"}
                </>
              )}
            </h2>
            <button
              onClick={() => loadThreads()}
              disabled={isRefreshing}
              className="p-1.5 hover:bg-[#262939] rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#bbc9cf] ${isRefreshing ? "animate-spin" : ""}`} />
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
                      ? "bg-[#00d2ff]/10 text-[#00d2ff] rounded-full border border-[rgba(0,255,255,0.08)] px-3 py-1 text-xs font-medium"
                      : "bg-[#1b1f2e] text-[#bbc9cf] rounded-full border border-[rgba(0,255,255,0.08)] px-3 py-1 text-xs hover:bg-[#262939]"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {!isSpecialFolder && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#859399]" />
              <input
                type="text"
                placeholder="Search…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#262939] border-transparent rounded-lg pl-10 py-2 text-sm focus:ring-2 focus:ring-[#00d2ff]/30 focus:bg-[#1b1f2e] outline-none"
              />
            </div>
          )}
        </div>

        {/* Thread rows */}
        <div className="flex-1 overflow-y-auto divide-y divide-[rgba(0,255,255,0.04)]">

          {/* ── Scheduled tab ── */}
          {activeFolder === "scheduled" ? (
            isScheduledLoading ? (
              <div className="p-8 text-center text-sm text-[#bbc9cf]">Loading scheduled emails…</div>
            ) : scheduledEmails.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#bbc9cf]">No scheduled emails.</div>
            ) : (
              scheduledEmails.map(s => (
                <div key={s.id} className="group p-3 hover:bg-[#171b2a] transition-colors border-b border-[rgba(0,255,255,0.08)]">
                  <div className="flex items-center gap-2 mb-1">
                    <CalendarClock className="w-3.5 h-3.5 text-[#00d2ff] flex-shrink-0" />
                    <span className="text-xs font-semibold text-[#dfe1f6] truncate flex-1">{s.subject}</span>
                    <button
                      onClick={() => void handleCancelScheduled(s.id)}
                      className="hidden group-hover:flex p-1 rounded hover:bg-[#ff4d6d]/10 text-[#bbc9cf] hover:text-[#ff4d6d] transition-colors"
                      title="Cancel scheduled send"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-xs text-[#bbc9cf] truncate pl-5">To: {s.toAddresses.join(", ")}</p>
                  <p className="text-[11px] text-[#00d2ff] pl-5 mt-0.5">
                    Sends {formatDistanceToNow(new Date(s.scheduledAt), { addSuffix: true })}
                  </p>
                </div>
              ))
            )

          /* ── Drafts tab ── */
          ) : activeFolder === "drafts" ? (
            isDraftsLoading ? (
              <div className="p-8 text-center text-sm text-[#bbc9cf]">Loading drafts…</div>
            ) : drafts.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#bbc9cf]">No drafts saved.</div>
            ) : (
              drafts.map(draft => (
                <div
                  key={draft.id}
                  onClick={() => setEditingDraft(draft)}
                  className="group relative p-3 cursor-pointer hover:bg-[#171b2a] transition-colors border-b border-[rgba(0,255,255,0.08)]"
                >
                  <div className="flex items-center gap-2 mb-1 pr-8">
                    <FileText className="w-3 h-3 text-[#bbc9cf] flex-shrink-0" />
                    <span className="text-xs font-semibold text-[#dfe1f6] truncate">
                      {draft.subject || "(no subject)"}
                    </span>
                    <span className="ml-auto text-xs text-[#bbc9cf] flex-shrink-0">
                      {formatDistanceToNow(new Date(draft.savedAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-xs text-[#bbc9cf] truncate pl-5">{draft.to ? `To: ${draft.to}` : "(no recipient)"}</p>
                  <p className="text-[11px] text-[#bbc9cf] truncate pl-5 mt-0.5">{draft.body?.slice(0, 80) || ""}</p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      fetch(`/api/drafts/${draft.id}`, { method: "DELETE" }).then(() => {
                        setDrafts(prev => prev.filter(d => d.id !== draft.id));
                        toast.success("Draft deleted");
                      }).catch(() => toast.error("Failed to delete draft"));
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex p-1.5 rounded hover:bg-[#ff4d6d]/10 text-[#bbc9cf] hover:text-[#ff4d6d] transition-colors"
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
              <div className="p-8 text-center text-sm text-[#bbc9cf]">Loading sent…</div>
            ) : sentLogs.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#bbc9cf]">No sent emails yet.</div>
            ) : (
              sentLogs.map(log => {
                const statusColor = log.status === "SENT" || log.status === "DELIVERED"
                  ? "text-[#00feb2]" : log.status === "FAILED" ? "text-[#ff4d6d]" : "text-amber-400";
                return (
                  <div key={log.id} className="p-3 hover:bg-[#171b2a] transition-colors">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold text-[#00d2ff] uppercase tracking-wider truncate">
                        To: {log.contact?.name || log.recipient}
                      </span>
                      <span className="ml-auto text-xs text-[#bbc9cf] flex-shrink-0">
                        {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="w-8 h-8 rounded-full bg-[#00d2ff]/10 text-[#00d2ff] flex items-center justify-center font-bold text-sm flex-shrink-0">
                        {log.recipient.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-[#dfe1f6] truncate">{log.recipient}</p>
                        <p className="text-xs text-[#bbc9cf] truncate">{log.subject}</p>
                        <span className={`text-[10px] font-semibold ${statusColor}`}>{log.status}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )

          /* ── Thread list (inbox / starred / snoozed / trash / custom folder) ── */
          ) : isLoading ? (
            <div className="p-8 text-center text-sm text-[#bbc9cf]">Loading inbox…</div>
          ) : visibleThreads.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#bbc9cf]">
              {searchQuery ? "No matching messages." : "Nothing here yet."}
            </div>
          ) : (
            visibleThreads.map(thread => (
              <div
                key={thread.id}
                onClick={() => loadThreadDetail(thread.id)}
                className={`group relative bg-[#1b1f2e] hover:bg-[#171b2a] border-b border-[rgba(0,255,255,0.08)] cursor-pointer transition-colors ${
                  selectedThreadId === thread.id ? "bg-[#00d2ff]/5 border-l-4 border-[#2563eb]" : ""
                }`}
              >
                {/* Hover action bar */}
                <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5 bg-[#1b1f2e]/95 backdrop-blur-sm border border-[rgba(0,255,255,0.08)] shadow-md rounded-lg px-1 py-1 z-10">
                  {activeFolder === "trash" ? (
                    <button
                      onClick={(e) => handleRestoreFromTrash(thread.id, e)}
                      className="p-1.5 text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6] rounded-full transition-colors"
                      title="Restore"
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSnoozeTargetId(thread.id); }}
                        className="p-1.5 text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6] rounded-full transition-colors"
                        title="Snooze"
                      >
                        <BellOff className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => toggleStar(thread.id, e)}
                        className={`p-1.5 rounded-full transition-colors ${thread.isStarred ? "text-[#00d2ff]" : "text-[#bbc9cf] hover:text-[#dfe1f6]"}`}
                        title={thread.isStarred ? "Unstar" : "Star"}
                      >
                        <Star className="w-3.5 h-3.5" fill={thread.isStarred ? "currentColor" : "none"} />
                      </button>
                      <button
                        onClick={(e) => handleArchive(thread.id, e)}
                        className="p-1.5 text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6] rounded-full transition-colors"
                        title="Archive"
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDelete(thread.id, e)}
                        className="p-1.5 text-[#bbc9cf] hover:bg-[#262939] hover:text-[#ff4d6d] rounded-full transition-colors"
                        title="Trash"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>

                <div className="p-3">
                  <div className="flex items-center gap-2 mb-1 pr-20">
                    <span className="text-[10px] font-bold text-[#00d2ff] uppercase tracking-wider truncate">
                      {thread.mailboxName}
                    </span>
                    {/* Priority badge */}
                    <PriorityBadge priority={thread.priority} />
                    {/* SLA indicator */}
                    {thread.slaDeadline && <SlaIndicator deadline={thread.slaDeadline} />}
                    {/* Snoozed indicator */}
                    {thread.isSnoozed && <BellOff className="w-2.5 h-2.5 text-[#3c494e]" />}
                    {/* Assignment indicator */}
                    {thread.assignedToId && <Users className="w-2.5 h-2.5 text-[#bbc9cf]" />}
                    <span className={`ml-auto text-xs flex-shrink-0 ${thread.unreadCount > 0 ? "text-[#00d2ff] font-medium" : "text-[#bbc9cf]"}`}>
                      {thread.lastMessage
                        ? formatDistanceToNow(new Date(thread.lastMessage.receivedAt), { addSuffix: true })
                        : ""}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-8 h-8 rounded-full bg-[#00d2ff]/10 text-[#00d2ff] flex items-center justify-center font-bold text-sm flex-shrink-0">
                      {(thread.lastMessage?.from ?? "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`truncate ${thread.unreadCount > 0 ? "font-bold text-sm text-[#dfe1f6]" : "font-medium text-sm text-[#dfe1f6]"}`}>
                        {thread.lastMessage?.from ?? "Unknown"}
                      </p>
                      <p className={`truncate ${thread.unreadCount > 0 ? "font-bold text-sm text-[#dfe1f6]" : "font-medium text-sm text-[#dfe1f6]"}`}>
                        {thread.subject}
                      </p>
                      <p className="text-xs text-[#bbc9cf] truncate">{thread.lastMessage?.snippet}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      {thread.unreadCount > 0 && (
                        <span className="bg-[#00d2ff] text-[#003543] text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                          {thread.unreadCount}
                        </span>
                      )}
                      {thread.isStarred && <Star className="w-3 h-3 text-[#00d2ff]" fill="currentColor" />}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Message Detail ── */}
      <div className={`${selectedThreadId ? "flex" : "hidden md:flex"} flex-1 bg-[#1b1f2e] flex-col min-w-0`}>
        {!selectedThreadId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-[#bbc9cf] p-8">
            <Mail className="w-14 h-14 mb-4 opacity-20" />
            <p className="text-base font-semibold">Select a message to read</p>
            <p className="text-sm mt-1 text-[#bbc9cf]">Your secure CyberSage Workspace</p>
          </div>
        ) : isDetailLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[#bbc9cf]">
            <RefreshCw className="w-7 h-7 animate-spin text-[#00d2ff]" />
            <span className="text-sm">Loading conversation…</span>
          </div>
        ) : threadDetail ? (
          <>
            {/* Detail Header */}
            <div className="px-6 py-4 border-b border-[rgba(0,255,255,0.08)] flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <button
                  className="md:hidden flex-shrink-0 p-2 text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6] rounded-full transition-colors"
                  onClick={() => setSelectedThreadId(null)}
                  aria-label="Back to inbox"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="min-w-0">
                  <h3 className="text-xl font-bold text-[#dfe1f6] leading-tight truncate">{threadDetail.subject}</h3>
                  <div className="flex items-center gap-3 mt-1">
                    <div className="flex items-center gap-1 text-sm text-[#bbc9cf]">
                      <Inbox className="w-3 h-3" />
                      <span>{threads.find(t => t.id === threadDetail.id)?.mailboxName}</span>
                    </div>
                    {(() => {
                      const t = threads.find(th => th.id === threadDetail.id);
                      if (!t) return null;
                      const pc = PRIORITY_CONFIG[t.priority];
                      if (t.priority === "NORMAL") return null;
                      return (
                        <span className={`text-xs font-semibold flex items-center gap-1 ${pc.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${pc.dot}`} />
                          {pc.label}
                        </span>
                      );
                    })()}
                    <div className="hidden sm:flex items-center gap-1 text-sm text-[#bbc9cf]">
                      <Clock className="w-3 h-3" />
                      <span>Started {new Date(threadDetail.messages[0]?.receivedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => { setShowSmartReply(v => !v); setShowReply(false); }}
                  className="bg-[#262939] text-[#bbc9cf] hover:bg-[#00d2ff]/10 hover:text-[#00d2ff] rounded-md px-3 py-1.5 text-xs font-medium border border-[rgba(0,255,255,0.08)] flex items-center gap-1.5 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Smart Reply</span>
                </button>
                <button
                  onClick={() => { setShowReply(true); setShowSmartReply(false); }}
                  className="bg-[#00d2ff] text-[#003543] hover:bg-[#00b8d9] hover:shadow-[0_0_20px_rgba(0,210,255,0.4)] rounded-md px-4 py-2 text-sm font-medium flex items-center gap-1.5"
                >
                  <Reply className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Reply</span>
                </button>
              </div>
            </div>

            {/* Smart Reply bar */}
            {showSmartReply && (
              <div className="bg-[#00d2ff]/10 border-b border-[rgba(0,255,255,0.08)] px-5 py-3 flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#00d2ff]">
                  <Sparkles className="w-3.5 h-3.5" /> AI Smart Reply
                </div>
                {(["friendly", "professional", "brief"] as const).map((tone) => (
                  <button
                    key={tone}
                    onClick={() => void handleSmartReply(tone)}
                    disabled={smartReplyLoading !== null}
                    className="bg-[#262939] text-[#bbc9cf] hover:bg-[#00d2ff]/10 hover:text-[#00d2ff] rounded-md px-3 py-1.5 text-xs font-medium border border-[rgba(0,255,255,0.08)] flex items-center gap-1.5 transition-colors disabled:opacity-50 capitalize"
                  >
                    {smartReplyLoading === tone ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    {tone}
                  </button>
                ))}
                <button onClick={() => setShowSmartReply(false)} className="ml-auto p-2 text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6] rounded-full transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {threadDetail.messages.map((msg) => (
                <div key={msg.id} className="bg-[#1b1f2e] rounded-xl border border-[rgba(0,255,255,0.08)] shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-[rgba(0,255,255,0.08)] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#00d2ff]/10 text-[#00d2ff] flex items-center justify-center font-bold text-sm flex-shrink-0">
                        {msg.from.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[#dfe1f6]">{msg.from}</p>
                        <p className="text-sm text-[#bbc9cf]">to {msg.to}</p>
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
                    <span className="text-xs text-[#bbc9cf]">{new Date(msg.receivedAt).toLocaleString()}</span>
                  </div>

                  <div className="p-5">
                    {msg.threatScan && msg.threatScan.riskScore > 60 && (
                      <div className="mb-4 p-3 bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-xl flex items-start gap-3">
                        <ShieldAlert className="w-4 h-4 text-[#ff4d6d] flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-bold text-[#ff4d6d]">Phishing Warning</p>
                          <p className="text-xs text-[#ff4d6d]/80 mt-0.5">This email shows strong indicators of a phishing attempt. Do not click links or open attachments.</p>
                          <ul className="mt-1.5 list-disc list-inside text-[11px] text-[#ff4d6d]/70 space-y-0.5">
                            {msg.threatScan.findings.map((f, i) => <li key={i}>{f}</li>)}
                          </ul>
                        </div>
                      </div>
                    )}
                    {msg.threatScan && msg.threatScan.riskScore > 30 && msg.threatScan.riskScore <= 60 && (
                      <div className="mb-4 p-3 bg-amber-400/10 border border-amber-400/30 rounded-xl flex items-start gap-3">
                        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-bold text-amber-300">Suspicious Email</p>
                          <p className="text-xs text-amber-400/80 mt-0.5">This email has been flagged as potentially suspicious. Proceed with caution.</p>
                          <ul className="mt-1.5 list-disc list-inside text-[11px] text-amber-400/70 space-y-0.5">
                            {msg.threatScan.findings.map((f, i) => <li key={i}>{f}</li>)}
                          </ul>
                        </div>
                      </div>
                    )}
                    {msg.threatScan && msg.threatScan.riskScore > 10 && msg.threatScan.riskScore <= 30 && (
                      <div className="mb-4 p-3 bg-[#00d2ff]/10 border border-[#00d2ff]/30 rounded-xl flex items-start gap-3">
                        <Info className="w-4 h-4 text-[#00d2ff] flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-[#a5e7ff]">Security Notice</p>
                          <p className="text-xs text-[#00d2ff]/80 mt-0.5">Minor anomalies detected. Review the sender and content before responding.</p>
                        </div>
                      </div>
                    )}

                    {msg.htmlBody ? (
                      <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(msg.htmlBody) }} />
                    ) : (
                      <p className="text-sm text-[#dfe1f6] whitespace-pre-wrap">{msg.textBody}</p>
                    )}

                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="mt-5 pt-5 border-t border-[rgba(0,255,255,0.08)]">
                        <p className="text-xs font-semibold text-[#bbc9cf] uppercase tracking-wider mb-2">
                          Attachments ({msg.attachments.length})
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {msg.attachments.map((att) => {
                            const riskyExts = [".exe",".bat",".cmd",".vbs",".js",".jar",".ps1",".msi",".scr",".dll"];
                            const ext = att.filename.slice(att.filename.lastIndexOf(".")).toLowerCase();
                            const isRisky = riskyExts.includes(ext);
                            return (
                              <a
                                key={att.id}
                                href={att.storageUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`border rounded-lg px-3 py-2 flex items-center gap-2 text-sm transition-colors group ${isRisky ? "bg-[#ff4d6d]/10 border-[#ff4d6d]/30 hover:bg-[#ff4d6d]/20" : "bg-[#0f1321] border-[rgba(0,255,255,0.08)] hover:bg-[#262939]"}`}
                              >
                                {isRisky ? (
                                  <AlertCircle className="w-4 h-4 text-[#ff4d6d] flex-shrink-0" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-[#00d2ff] group-hover:translate-x-0.5 transition-transform" />
                                )}
                                <div className="min-w-0">
                                  <p className={`text-xs font-medium truncate max-w-[160px] ${isRisky ? "text-[#ff4d6d]" : "text-[#dfe1f6]"}`}>{att.filename}</p>
                                  <p className={`text-[10px] uppercase ${isRisky ? "text-[#ff4d6d] font-semibold" : "text-[#bbc9cf]"}`}>
                                    {isRisky ? "⚠ Potentially dangerous" : att.mimeType.split("/")[1]}
                                  </p>
                                </div>
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Draft edit modal */}
            {editingDraft && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEditingDraft(null)} />
                <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl bg-[#1b1f2e] shadow-2xl" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between border-b border-[rgba(0,255,255,0.08)] bg-[#0f1321] px-5 py-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-[#00d2ff]">
                        <FileText className="h-3.5 w-3.5 text-[#003543]" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-sm font-bold text-[#dfe1f6]">Edit Draft</h2>
                        <p className="text-sm text-[#bbc9cf] truncate max-w-[300px]">{editingDraft.subject || "(no subject)"}</p>
                      </div>
                    </div>
                    <button onClick={() => setEditingDraft(null)} className="rounded-lg p-1.5 text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6] transition-colors flex-shrink-0">
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
                  className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                  onClick={() => { setShowReply(false); setReplyDefaultBody(""); setRewriteBody(""); }}
                />
                <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl bg-[#1b1f2e] shadow-2xl" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between border-b border-[rgba(0,255,255,0.08)] bg-[#0f1321] px-5 py-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-[#00d2ff]">
                        <Send className="h-3.5 w-3.5 text-[#003543]" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-sm font-bold text-[#dfe1f6]">Reply</h2>
                        <p className="text-sm text-[#bbc9cf] truncate max-w-[300px]">{threadDetail.subject}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="relative" ref={rewriteMenuRef}>
                        <button
                          onClick={() => setShowRewriteMenu(v => !v)}
                          disabled={rewriteLoading}
                          className="bg-[#262939] text-[#bbc9cf] hover:bg-[#00d2ff]/10 hover:text-[#00d2ff] rounded-md px-3 py-1.5 text-xs font-medium border border-[rgba(0,255,255,0.08)] flex items-center gap-1.5 transition-colors disabled:opacity-50"
                        >
                          {rewriteLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-[#00d2ff]" />}
                          Rewrite
                          <ChevronDown className="w-3 h-3" />
                        </button>
                        {showRewriteMenu && (
                          <div className="absolute right-0 top-full mt-1 w-40 bg-[#1b1f2e]/80 backdrop-blur-sm border border-[rgba(0,255,255,0.08)] rounded-xl shadow-lg z-20 py-1 overflow-hidden">
                            {(["formal", "casual", "concise", "expand"] as const).map((style) => (
                              <button
                                key={style}
                                onClick={() => void handleRewrite(style)}
                                className="w-full text-left px-3 py-2 text-xs font-medium text-[#bbc9cf] hover:bg-[#00d2ff]/10 hover:text-[#00d2ff] transition-colors capitalize"
                              >
                                Make {style.charAt(0).toUpperCase() + style.slice(1)}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => { setShowReply(false); setReplyDefaultBody(""); setRewriteBody(""); }}
                        className="p-2 text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6] rounded-full transition-colors"
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
    </div>
  );
}
