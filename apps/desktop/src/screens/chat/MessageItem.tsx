import { useState } from "react";
import { editMessage, deleteMessage, toggleReaction, type ChatMessage } from "@/api/client";

function timeLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const today = now.toDateString() === d.toDateString();
  if (today) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const QUICK_REACTIONS = ["👍", "❤️", "😄", "🎉", "🙌", "👀", "🔥", "😢"];

function groupReactions(reactions: ChatMessage["reactions"]) {
  const groups: Record<string, ChatMessage["reactions"]> = {};
  for (const r of reactions) (groups[r.emoji] ??= []).push(r);
  return groups;
}

export function MessageItem({
  msg, currentUserId, compact, showActions = true, inThread, onChanged, onOpenThread,
}: {
  msg: ChatMessage;
  currentUserId?: string;
  compact: boolean;
  showActions?: boolean;
  inThread?: boolean;
  onChanged: (updated?: ChatMessage) => void;
  onOpenThread: (msg: ChatMessage) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(msg.content);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const isMe = msg.user.id === currentUserId;

  async function saveEdit() {
    if (!editText.trim()) return;
    try {
      const updated = await editMessage(msg.id, editText.trim());
      onChanged(updated);
      setEditing(false);
    } catch { /* silent */ }
  }

  async function handleDelete() {
    if (!confirm("Delete this message?")) return;
    try {
      await deleteMessage(msg.id);
      onChanged({ ...msg, deletedAt: new Date().toISOString() });
    } catch { /* silent */ }
  }

  async function handleReaction(emoji: string) {
    try {
      const result = await toggleReaction(msg.id, emoji);
      onChanged({ ...msg, reactions: result.reactions });
      setShowReactionPicker(false);
    } catch { /* silent */ }
  }

  if (msg.deletedAt) {
    return (
      <div className={`flex items-start gap-3 py-1 ${compact ? "pl-9" : ""}`}>
        {!compact && (
          <div className="mt-0.5 h-7 w-7 flex-shrink-0 rounded-lg bg-bg-active/50 flex items-center justify-center text-xs font-bold text-text-muted">
            {(msg.user.fullName?.[0] ?? "?").toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          {!compact && (
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="text-[13px] font-semibold text-text-muted">{msg.user.fullName}</span>
              <span className="text-[10px] text-text-muted">{timeLabel(msg.createdAt)}</span>
            </div>
          )}
          <p className="text-[13px] text-text-muted italic">(message deleted)</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`group relative flex items-start gap-3 ${compact ? "py-0.5 pl-9" : "py-1"} rounded-md hover:bg-bg-hover/40 transition-fast`}>
      {!compact && (
        <div className={`mt-0.5 h-7 w-7 flex-shrink-0 rounded-lg flex items-center justify-center text-xs font-bold ${isMe ? "bg-brand-dim text-brand" : "bg-bg-active text-text-secondary"}`}>
          {(msg.user.fullName?.[0] ?? "?").toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0 pr-2">
        {!compact && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className={`text-[13px] font-semibold leading-tight ${isMe ? "text-brand" : "text-text-primary"}`}>
              {isMe ? "You" : msg.user.fullName}
            </span>
            <span className="text-[10px] text-text-muted">{timeLabel(msg.createdAt)}</span>
            {msg.editedAt && <span className="text-[10px] text-text-muted/60">(edited)</span>}
            {msg.isUrgent && (
              <span className="text-[10px] font-semibold text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">URGENT</span>
            )}
          </div>
        )}

        {editing ? (
          <div className="space-y-1">
            <textarea
              autoFocus
              value={editText}
              onChange={e => setEditText(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void saveEdit(); }
                if (e.key === "Escape") { setEditing(false); setEditText(msg.content); }
              }}
              rows={Math.min(8, Math.max(2, editText.split("\n").length))}
              className="w-full resize-none rounded-md border border-brand-border bg-bg-deep px-2 py-1.5 text-[13px] text-text-primary outline-none focus:border-brand/40"
            />
            <div className="flex items-center gap-2 text-[10px]">
              <button
                onClick={() => void saveEdit()}
                className="rounded bg-brand/20 px-2 py-1 font-semibold text-brand hover:bg-brand/30 transition-fast"
              >
                Save
              </button>
              <button
                onClick={() => { setEditing(false); setEditText(msg.content); }}
                className="rounded px-2 py-1 text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-fast"
              >
                Cancel
              </button>
              <span className="text-text-muted/50">esc cancel · enter save</span>
            </div>
          </div>
        ) : (
          <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words text-text-secondary">
            {renderMessageContent(msg.content)}
          </p>
        )}

        {msg.attachmentUrl && !editing && (
          <a
            href={msg.attachmentUrl}
            onClick={e => { e.preventDefault(); window.nexus.system.openExternal(msg.attachmentUrl!); }}
            className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-brand-border bg-bg-card px-2.5 py-1.5 text-xs text-text-secondary hover:border-brand/40 transition-fast"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
            </svg>
            {msg.attachmentName ?? "Attachment"}
          </a>
        )}

        {/* Reactions */}
        {msg.reactions && msg.reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {Object.entries(groupReactions(msg.reactions)).map(([emoji, users]) => {
              const mine = users.some(u => u.user.id === currentUserId);
              return (
                <button
                  key={emoji}
                  onClick={() => void handleReaction(emoji)}
                  title={users.map(u => u.user.fullName).join(", ")}
                  className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] border transition-fast ${
                    mine
                      ? "bg-brand/15 border-brand/40 text-brand"
                      : "bg-bg-hover border-brand-border/40 text-text-secondary hover:border-brand-border"
                  }`}
                >
                  {emoji} <span className={mine ? "text-brand" : "text-text-muted"}>{users.length}</span>
                </button>
              );
            })}
            {showActions && (
              <button
                onClick={() => setShowReactionPicker(s => !s)}
                className="inline-flex items-center justify-center rounded-full w-5 h-5 text-[10px] bg-bg-hover border border-brand-border/40 text-text-muted hover:text-brand hover:border-brand/40 transition-fast"
              >
                +
              </button>
            )}
          </div>
        )}

        {/* Reply thread indicator */}
        {!inThread && msg.replies && msg.replies.length > 0 && (
          <button
            onClick={() => onOpenThread(msg)}
            className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-brand/80 hover:text-brand transition-fast"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            {msg.replies.length} {msg.replies.length === 1 ? "reply" : "replies"}
          </button>
        )}
      </div>

      {/* Hover actions */}
      {showActions && !editing && (
        <div className="absolute right-2 top-0 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-fast flex items-center gap-0.5 rounded-md border border-brand-border bg-bg-card shadow-lg overflow-hidden">
          {/* Quick reactions */}
          {QUICK_REACTIONS.slice(0, 4).map(emoji => (
            <button
              key={emoji}
              onClick={() => void handleReaction(emoji)}
              className="h-7 w-7 flex items-center justify-center hover:bg-bg-hover text-xs transition-fast"
              title={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
          <button
            onClick={() => setShowReactionPicker(s => !s)}
            className="h-7 w-7 flex items-center justify-center hover:bg-bg-hover text-text-muted transition-fast"
            title="More reactions"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
            </svg>
          </button>
          {!inThread && (
            <button
              onClick={() => onOpenThread(msg)}
              className="h-7 w-7 flex items-center justify-center hover:bg-bg-hover text-text-muted transition-fast"
              title="Reply in thread"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
            </button>
          )}
          {isMe && (
            <>
              <button
                onClick={() => setEditing(true)}
                className="h-7 w-7 flex items-center justify-center hover:bg-bg-hover text-text-muted transition-fast"
                title="Edit"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
              <button
                onClick={() => void handleDelete()}
                className="h-7 w-7 flex items-center justify-center hover:bg-bg-hover text-danger/80 hover:text-danger transition-fast"
                title="Delete"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </>
          )}
        </div>
      )}

      {/* Full reaction picker */}
      {showReactionPicker && (
        <div className="absolute right-2 top-8 z-10 rounded-md border border-brand-border bg-bg-deep shadow-xl p-1.5 flex flex-wrap gap-1 max-w-[200px]">
          {QUICK_REACTIONS.map(emoji => (
            <button
              key={emoji}
              onClick={() => void handleReaction(emoji)}
              className="h-7 w-7 flex items-center justify-center rounded hover:bg-bg-hover text-sm transition-fast"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Render @mentions as styled spans
function renderMessageContent(content: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /@(\w+(?:\s\w+)?)/g;
  let lastIdx = 0;
  let match;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIdx) parts.push(content.slice(lastIdx, match.index));
    parts.push(
      <span key={match.index} className="text-brand bg-brand-dim/40 px-1 py-0.5 rounded-md font-medium">
        @{match[1]}
      </span>,
    );
    lastIdx = regex.lastIndex;
  }
  if (lastIdx < content.length) parts.push(content.slice(lastIdx));
  return parts.length === 0 ? content : parts;
}
