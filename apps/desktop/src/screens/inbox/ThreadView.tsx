import { useState, useEffect } from "react";
import {
  getThread, updateThread,
  type ThreadDetail, type InboxMessage,
} from "@/api/client";
import type { ComposeMode } from "./Compose";

function senderInitial(from: string): string {
  const name = from.replace(/<.*>/, "").trim();
  return (name[0] ?? from[0] ?? "?").toUpperCase();
}

function senderName(from: string): string {
  const match = from.match(/^([^<]+)/) ?? [];
  return (match[1] ?? from).trim().replace(/"/g, "") || from;
}

function formatBytes(b: number | string): string {
  const n = typeof b === "string" ? parseInt(b, 10) : b;
  if (!n || isNaN(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// Strip dangerous tags from email HTML before rendering. The server already
// scans for threats; this is just defense in depth against script execution.
function sanitizeHtml(html: string): string {
  return html
    .replace(/<(script|iframe|object|embed|form|meta|base|link|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|iframe|object|embed|form|meta|base|link|style)[^>]*\/?>/gi, "")
    .replace(/\s+on\w+\s*=\s*(['"])[^'"]*\1/gi, "")
    .replace(/\s+on\w+\s*=\s*[^\s>]*/gi, "")
    .replace(/javascript\s*:/gi, "");
}

function buildQuoted(msg: InboxMessage): string {
  const date = formatDate(msg.receivedAt);
  const header = `On ${date}, ${senderName(msg.from)} wrote:`;
  const body = (msg.textBody ?? "").split("\n").map(l => `> ${l}`).join("\n");
  return `${header}\n${body}`;
}

export function ThreadView({
  threadId,
  onChanged,
  onOpenCompose,
  onBack,
}: {
  threadId: string;
  onChanged: () => void;
  onOpenCompose: (mode: ComposeMode) => void;
  onBack: () => void;
}) {
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    setError("");
    setExpanded(new Set());
    getThread(threadId)
      .then(t => {
        setThread(t);
        // Expand the last message by default
        if (t.messages.length > 0) {
          setExpanded(new Set([t.messages[t.messages.length - 1]!.id]));
        }
        // Mark thread read on open
        if (t.messages.some(m => !m.isRead)) {
          updateThread(threadId, { markRead: true }).then(onChanged).catch(() => {});
        }
      })
      .catch(err => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [threadId, onChanged]);

  function toggleExpand(msgId: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  }

  async function action(patch: Parameters<typeof updateThread>[1], optimistic?: Partial<ThreadDetail>) {
    if (!thread) return;
    if (optimistic) setThread({ ...thread, ...optimistic });
    try {
      await updateThread(thread.id, patch);
      onChanged();
    } catch {
      // Revert by refetching
      getThread(thread.id).then(setThread).catch(() => {});
    }
  }

  function onReply() {
    if (!thread) return;
    const last = thread.messages[thread.messages.length - 1];
    if (!last) return;
    onOpenCompose({
      kind: "reply",
      threadId: thread.id,
      to: last.from,
      subject: thread.subject,
      quoted: buildQuoted(last),
    });
  }

  function onReplyAll() {
    if (!thread) return;
    const last = thread.messages[thread.messages.length - 1];
    if (!last) return;
    const ccAddrs = (last.to ?? "").split(",").map(s => s.trim()).filter(Boolean);
    onOpenCompose({
      kind: "replyAll",
      threadId: thread.id,
      to: last.from,
      cc: ccAddrs,
      subject: thread.subject,
      quoted: buildQuoted(last),
    });
  }

  function onForward() {
    if (!thread) return;
    const last = thread.messages[thread.messages.length - 1];
    if (!last) return;
    onOpenCompose({
      kind: "forward",
      subject: thread.subject,
      quoted: `---------- Forwarded message ----------\nFrom: ${last.from}\nDate: ${formatDate(last.receivedAt)}\nSubject: ${thread.subject}\nTo: ${last.to}\n\n${last.textBody ?? ""}`,
    });
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-muted">
        Loading…
      </div>
    );
  }

  if (error || !thread) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-danger">
        <p>{error || "Thread not found"}</p>
        <button onClick={onBack} className="text-text-muted hover:text-text-primary text-xs">← back</button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex-shrink-0 flex h-[52px] items-center justify-between border-b border-brand-border px-4 no-select">
        <div className="flex items-center gap-1">
          <IconBtn title="Back" onClick={onBack}>
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </IconBtn>
          <div className="mx-2 h-5 w-px bg-brand-border" />
          <IconBtn title="Reply" onClick={onReply}>
            <path d="M3 10h10a8 8 0 0 1 8 8v2M3 10l6 6M3 10l6-6" />
          </IconBtn>
          <IconBtn title="Reply all" onClick={onReplyAll}>
            <path d="M7 17l-5-5 5-5M2 12h13a6 6 0 0 1 6 6v2M11 17L6 12l5-5" />
          </IconBtn>
          <IconBtn title="Forward" onClick={onForward}>
            <path d="M15 17l5-5-5-5M4 18v-2a4 4 0 0 1 4-4h12" />
          </IconBtn>
          <div className="mx-2 h-5 w-px bg-brand-border" />
          <IconBtn
            title={thread.isStarred ? "Unstar" : "Star"}
            onClick={() => action({ isStarred: !thread.isStarred }, { isStarred: !thread.isStarred })}
            active={thread.isStarred}
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </IconBtn>
          <IconBtn
            title={thread.isArchived ? "Unarchive" : "Archive"}
            onClick={() => action({ isArchived: !thread.isArchived })}
            active={thread.isArchived}
          >
            <path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4" />
          </IconBtn>
          <IconBtn
            title="Delete"
            onClick={() => action({ isTrashed: true })}
          >
            <path d="M3 6h18M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </IconBtn>
        </div>
        <div className="flex items-center gap-2">
          <PriorityBadge priority={thread.priority} />
        </div>
      </div>

      {/* Subject */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-brand-border">
        <h2 className="text-lg font-semibold text-text-primary leading-tight">{thread.subject || "(no subject)"}</h2>
        <p className="mt-1 text-xs text-text-muted">{thread.messages.length} {thread.messages.length === 1 ? "message" : "messages"}</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {thread.messages.map((msg, idx) => (
          <MessageCard
            key={msg.id}
            msg={msg}
            isLast={idx === thread.messages.length - 1}
            expanded={expanded.has(msg.id)}
            onToggle={() => toggleExpand(msg.id)}
          />
        ))}
      </div>

      {/* Quick reply bar */}
      <div className="flex-shrink-0 border-t border-brand-border p-4">
        <button
          onClick={onReply}
          className="w-full flex items-center gap-3 rounded-lg bg-bg-card border border-brand-border px-4 py-3 cursor-text hover:border-brand/40 transition-fast text-left"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
            <path d="M3 10h10a8 8 0 0 1 8 8v2M3 10l6 6M3 10l6-6" />
          </svg>
          <span className="text-sm text-text-muted">
            Reply to {senderName(thread.messages[thread.messages.length - 1]?.from ?? "")}…
          </span>
        </button>
      </div>
    </div>
  );
}

function MessageCard({
  msg,
  isLast,
  expanded,
  onToggle,
}: {
  msg: InboxMessage;
  isLast: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const from = msg.from;
  const isExpanded = expanded || isLast;

  return (
    <div className="rounded-xl bg-bg-card border border-brand-border overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-bg-hover transition-fast"
      >
        <div className="h-9 w-9 rounded-lg bg-brand-dim border border-brand-border flex items-center justify-center text-sm font-bold text-brand flex-shrink-0">
          {senderInitial(from)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-text-primary truncate">{senderName(from) || from}</p>
            {!msg.isRead && <span className="h-1.5 w-1.5 rounded-full bg-brand flex-shrink-0" />}
          </div>
          <p className="text-[11px] text-text-muted truncate">
            {isExpanded ? `to ${msg.to}` : (msg.textBody?.slice(0, 80) || "")}
          </p>
        </div>
        <p className="text-[11px] text-text-muted flex-shrink-0">{formatDate(msg.receivedAt)}</p>
      </button>

      {/* Body */}
      {isExpanded && (
        <div className="border-t border-brand-border/50 px-4 py-4">
          {msg.htmlBody ? (
            <div
              className="email-body text-sm text-text-secondary leading-relaxed max-w-full overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(msg.htmlBody) }}
            />
          ) : (
            <div className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
              {msg.textBody || "(no content)"}
            </div>
          )}

          {/* Attachments */}
          {msg.attachments && msg.attachments.length > 0 && (
            <div className="mt-4 pt-4 border-t border-brand-border/40">
              <p className="text-[11px] uppercase tracking-wider text-text-muted mb-2">
                {msg.attachments.length} attachment{msg.attachments.length > 1 ? "s" : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                {msg.attachments.map(a => (
                  <a
                    key={a.id}
                    href={a.storageUrl}
                    onClick={e => {
                      e.preventDefault();
                      window.nexus.system.openExternal(a.storageUrl);
                    }}
                    className="flex items-center gap-2 rounded-md border border-brand-border bg-bg-deep px-3 py-2 text-xs hover:border-brand/40 transition-fast"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                    </svg>
                    <div>
                      <p className="text-text-primary truncate max-w-[180px]">{a.filename}</p>
                      <p className="text-[10px] text-text-muted">{formatBytes(a.size)}</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function IconBtn({
  title, onClick, active, children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition-fast ${
        active
          ? "text-brand bg-brand-dim"
          : "text-text-muted hover:bg-bg-hover hover:text-text-primary"
      }`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "NORMAL" || priority === "LOW") return null;
  const cls =
    priority === "URGENT" ? "bg-red-500/15 text-red-400 border-red-500/30" :
    "bg-amber-500/15 text-amber-400 border-amber-500/30";
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${cls}`}>
      {priority}
    </span>
  );
}
