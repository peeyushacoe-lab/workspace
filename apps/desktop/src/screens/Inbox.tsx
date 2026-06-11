import { useState, useEffect, useCallback } from "react";
import {
  getInbox, getFolders, createFolder,
  type Thread, type MailFolder,
} from "@/api/client";
import { Compose, type ComposeMode } from "./inbox/Compose";
import { ThreadView } from "./inbox/ThreadView";

type SystemFolder = "inbox" | "starred" | "unread" | "sent" | "archive" | "trash";

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function senderInitial(from: string): string {
  const name = from.replace(/<.*>/, "").trim();
  return (name[0] ?? from[0] ?? "?").toUpperCase();
}

function senderName(from: string): string {
  const match = from.match(/^([^<]+)/) ?? [];
  return (match[1] ?? from).trim().replace(/"/g, "") || from;
}

const PRIORITY_DOT: Record<string, string> = {
  URGENT: "bg-red-500",
  HIGH: "bg-amber-500",
  NORMAL: "bg-transparent",
  LOW: "bg-transparent",
};

const SYSTEM_FOLDERS: Array<{ id: SystemFolder; label: string; icon: string }> = [
  { id: "inbox",   label: "Inbox",    icon: "M2.563 8.001h18.874M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" },
  { id: "starred", label: "Starred",  icon: "M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z" },
  { id: "unread",  label: "Unread",   icon: "M22 6l-10 7L2 6M2 6h20v12H2z" },
  { id: "sent",    label: "Sent",     icon: "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" },
  { id: "archive", label: "Archive",  icon: "M21 8v13H3V8M1 3h22v5H1zM10 12h4" },
  { id: "trash",   label: "Trash",    icon: "M3 6h18M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" },
];

export function Inbox() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [folders, setFolders] = useState<MailFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [folder, setFolder] = useState<SystemFolder | string>("inbox");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [composeMode, setComposeMode] = useState<ComposeMode | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [t, f] = await Promise.all([
        getInbox(debouncedSearch ? { q: debouncedSearch } : undefined),
        getFolders().catch(() => []),
      ]);
      setThreads(t);
      setFolders(f);
    } catch {
      setError("Failed to load inbox.");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => { load(); }, [load]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Auto-refresh every 30s
  useEffect(() => {
    const iv = setInterval(() => { load(); }, 30_000);
    return () => clearInterval(iv);
  }, [load]);

  const filtered = threads.filter(t => {
    if (folder === "starred")  return t.isStarred && !t.isTrashed;
    if (folder === "unread")   return t.unreadCount > 0 && !t.isTrashed && !t.isArchived;
    if (folder === "archive")  return t.isArchived && !t.isTrashed;
    if (folder === "trash")    return t.isTrashed;
    if (folder === "sent")     return t.mailbox?.toLowerCase() === t.lastMessage?.from?.toLowerCase();
    if (typeof folder === "string" && folder.startsWith("custom:")) {
      const id = folder.slice("custom:".length);
      return t.folderId === id;
    }
    // Inbox: everything not trashed, not archived
    return !t.isTrashed && !t.isArchived;
  });

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      const f = await createFolder({ name });
      setFolders(prev => [...prev, f].sort((a, b) => a.name.localeCompare(b.name)));
      setNewFolderName("");
      setNewFolderOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Folder rail ───────────────────────────────────────────────────── */}
      <div className="flex w-[200px] flex-shrink-0 flex-col border-r border-brand-border bg-bg-sidebar/30 no-select">
        <div className="flex h-[52px] flex-shrink-0 items-center justify-between border-b border-brand-border px-4">
          <h2 className="text-sm font-semibold text-text-primary">Mail</h2>
        </div>

        {/* Compose CTA */}
        <div className="p-3">
          <button
            onClick={() => setComposeMode({ kind: "new" })}
            className="flex w-full items-center justify-center gap-2 rounded-md py-2 text-xs font-semibold text-bg-deep transition-smooth"
            style={{
              background: "linear-gradient(135deg, #00d2ff 0%, #0098c7 100%)",
              boxShadow: "0 0 12px rgba(0,210,255,0.2)",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            New email
          </button>
        </div>

        {/* System folders */}
        <nav className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
          {SYSTEM_FOLDERS.map(f => (
            <FolderBtn
              key={f.id}
              label={f.label}
              icon={f.icon}
              active={folder === f.id}
              count={f.id === "inbox" ? threads.filter(t => t.unreadCount > 0 && !t.isTrashed && !t.isArchived).length : undefined}
              onClick={() => { setFolder(f.id); setSelectedThreadId(null); }}
            />
          ))}

          {/* Custom folders */}
          {folders.length > 0 && (
            <div className="pt-3 pb-1 px-2 text-[10px] uppercase tracking-wider text-text-muted">Folders</div>
          )}
          {folders.map(f => (
            <FolderBtn
              key={f.id}
              label={f.name}
              icon="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
              color={f.color ?? undefined}
              active={folder === `custom:${f.id}`}
              count={f._count?.threads}
              onClick={() => { setFolder(`custom:${f.id}`); setSelectedThreadId(null); }}
            />
          ))}

          {/* New folder button / inline form */}
          {newFolderOpen ? (
            <div className="mt-2 px-2 space-y-1">
              <input
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") handleCreateFolder();
                  if (e.key === "Escape") { setNewFolderOpen(false); setNewFolderName(""); }
                }}
                autoFocus
                placeholder="Folder name"
                className="w-full rounded-md border border-brand-border bg-bg-deep px-2 py-1.5 text-xs text-text-primary outline-none focus:border-brand/40"
              />
              <div className="flex gap-1">
                <button
                  onClick={handleCreateFolder}
                  className="flex-1 rounded-md bg-brand/20 px-2 py-1 text-[10px] font-semibold text-brand hover:bg-brand/30 transition-fast"
                >
                  Create
                </button>
                <button
                  onClick={() => { setNewFolderOpen(false); setNewFolderName(""); }}
                  className="rounded-md px-2 py-1 text-[10px] text-text-muted hover:bg-bg-hover transition-fast"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setNewFolderOpen(true)}
              className="mt-2 flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-text-muted hover:bg-bg-hover hover:text-text-secondary transition-fast"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New folder
            </button>
          )}
        </nav>
      </div>

      {/* ── Thread list ────────────────────────────────────────────────────── */}
      <div className="flex w-[340px] flex-shrink-0 flex-col border-r border-brand-border overflow-hidden">
        {/* Header */}
        <div className="flex h-[52px] flex-shrink-0 items-center justify-between border-b border-brand-border px-4 no-select">
          <h2 className="text-sm font-semibold text-text-primary capitalize">
            {folder.startsWith("custom:")
              ? folders.find(f => f.id === folder.slice("custom:".length))?.name ?? "Folder"
              : folder}
          </h2>
          <button
            onClick={load}
            disabled={loading}
            title="Refresh"
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-bg-hover hover:text-text-primary transition-fast disabled:opacity-50"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loading ? "animate-spin" : ""}>
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="flex-shrink-0 border-b border-brand-border px-3 py-2 no-select">
          <div className="relative">
            <svg className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted/50" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search mail"
              className="w-full rounded-md border border-brand-border bg-bg-deep py-1.5 pl-7 pr-2 text-xs text-text-primary placeholder-text-muted/50 outline-none focus:border-brand/40 transition-fast"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="m-3 rounded-lg bg-danger/10 border border-danger/20 px-3 py-2 text-xs text-danger text-center">
              {error}
            </div>
          )}

          {loading && threads.length === 0 && Array.from({ length: 8 }).map((_, i) => <ThreadSkeleton key={i} />)}

          {!loading && !error && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 p-8 text-center text-text-muted">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-30">
                <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              <p className="text-xs">No messages</p>
            </div>
          )}

          {filtered.map(t => (
            <ThreadRow
              key={t.id}
              thread={t}
              selected={selectedThreadId === t.id}
              onClick={() => setSelectedThreadId(t.id)}
            />
          ))}
        </div>
      </div>

      {/* ── Detail pane ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {selectedThreadId ? (
          <ThreadView
            key={selectedThreadId}
            threadId={selectedThreadId}
            onChanged={load}
            onOpenCompose={setComposeMode}
            onBack={() => setSelectedThreadId(null)}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-text-muted no-select">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="opacity-20">
              <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            <div className="text-center">
              <p className="text-sm font-medium text-text-secondary">Select a conversation</p>
              <p className="text-xs mt-1">Choose a thread from the list to read it here</p>
            </div>
          </div>
        )}
      </div>

      {/* Compose modal */}
      {composeMode && (
        <Compose
          mode={composeMode}
          onClose={() => setComposeMode(null)}
          onSent={() => { setComposeMode(null); load(); }}
        />
      )}
    </div>
  );
}

function ThreadRow({
  thread, selected, onClick,
}: {
  thread: Thread;
  selected: boolean;
  onClick: () => void;
}) {
  const isUnread = thread.unreadCount > 0;
  const from = thread.lastMessage?.from ?? "";
  const time = thread.lastMessage?.receivedAt ?? thread.createdAt;

  return (
    <button
      onClick={onClick}
      className={`group w-full text-left px-3 py-2.5 border-b border-brand-border/40 transition-fast hover:bg-bg-hover focus:outline-none ${
        selected ? "bg-brand-dim border-l-2 border-l-brand" : "border-l-2 border-l-transparent"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div
          className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold select-none"
          style={{
            background: isUnread ? "rgba(0,210,255,0.15)" : "rgba(38,41,57,0.8)",
            color: isUnread ? "#00d2ff" : "#5c6b72",
          }}
        >
          {senderInitial(from)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className={`text-[13px] truncate leading-tight ${isUnread ? "font-semibold text-text-primary" : "font-medium text-text-secondary"}`}>
              {senderName(from) || thread.mailboxName || "Unknown"}
            </span>
            <span className="flex-shrink-0 text-[11px] text-text-muted">{timeAgo(time)}</span>
          </div>

          <div className="flex items-center gap-1.5 mb-0.5">
            {thread.isStarred && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            )}
            {thread.priority && PRIORITY_DOT[thread.priority] && PRIORITY_DOT[thread.priority] !== "bg-transparent" && (
              <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[thread.priority]}`} />
            )}
            <p className={`text-[12px] truncate leading-tight ${isUnread ? "text-text-primary" : "text-text-secondary"}`}>
              {thread.subject || "(no subject)"}
            </p>
          </div>

          <p className="text-[11px] text-text-muted truncate leading-tight">
            {thread.lastMessage?.snippet || "No preview"}
          </p>
        </div>

        <div className="mt-1.5 flex-shrink-0">
          {isUnread ? (
            <span className="block h-2 w-2 rounded-full bg-brand shadow-[0_0_6px_rgba(0,210,255,0.6)]" />
          ) : (
            <span className="block h-2 w-2" />
          )}
        </div>
      </div>
    </button>
  );
}

function ThreadSkeleton() {
  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5 border-b border-brand-border/40">
      <div className="skeleton mt-0.5 h-8 w-8 rounded-lg flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="skeleton h-3 w-3/4 rounded" />
        <div className="skeleton h-3 w-1/2 rounded" />
        <div className="skeleton h-2.5 w-full rounded" />
      </div>
    </div>
  );
}

function FolderBtn({
  label, icon, color, active, count, onClick,
}: {
  label: string;
  icon: string;
  color?: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex h-8 w-full items-center gap-2.5 rounded-md px-3 text-xs transition-fast ${
        active
          ? "bg-brand-dim text-brand border-l-2 border-brand"
          : "text-text-secondary hover:bg-bg-hover hover:text-text-primary border-l-2 border-transparent"
      }`}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color ?? "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
        <path d={icon} />
      </svg>
      <span className="flex-1 truncate text-left font-medium capitalize">{label}</span>
      {typeof count === "number" && count > 0 && (
        <span className="rounded-full bg-bg-hover px-1.5 text-[10px] font-bold text-text-muted">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}
