"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MessageSquare, Check, Trash2, Loader2, X, CornerDownRight, Send, Eye, EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

/**
 * Threaded comments panel, shared by Docs, Sheets and Slides.
 *
 * All three store their documents as `Note` rows, so one panel and one API
 * (/api/documents/[id]/comments) covers the suite. Replaces the local-only
 * `useState` comment list in DocsView, whose comments were lost on refresh and
 * always attributed to "You".
 *
 * `anchor` is editor-specific and opaque to this component:
 *   Docs   — { from, to }     Tiptap character range
 *   Sheets — { cell, sheet }  e.g. { cell: "B7", sheet: "s1" }
 *   Slides — { slide }        slide id
 */

export type CommentAnchor =
  | { from: number; to: number }
  | { cell: string; sheet?: string }
  | { slide: string }
  | null;

type CommentUser = { id: string; fullName: string; avatarUrl: string | null };

export type DocCommentThread = {
  id: string;
  content: string;
  userId: string;
  user: CommentUser;
  range: CommentAnchor;
  resolved: boolean;
  resolvedByUser: CommentUser | null;
  createdAt: string;
  replies: {
    id: string;
    content: string;
    userId: string;
    user: CommentUser;
    createdAt: string;
  }[];
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Avatar({ user }: { user: CommentUser }) {
  return (
    <div
      className="h-6 w-6 flex-shrink-0 rounded-full bg-accent-soft text-accent
                 flex items-center justify-center text-[10px] font-semibold select-none"
      title={user.fullName}
    >
      {initials(user.fullName)}
    </div>
  );
}

/** Renders @mentions in a slightly stronger colour, without a markdown parser. */
function CommentBody({ text }: { text: string }) {
  const parts = text.split(/(@[\p{L}][\p{L}\p{N}._'-]*)/gu);
  return (
    <p className="text-xs text-foreground whitespace-pre-wrap break-words leading-relaxed">
      {parts.map((part, i) =>
        part.startsWith("@")
          ? <span key={i} className="font-medium text-accent">{part}</span>
          : <span key={i}>{part}</span>,
      )}
    </p>
  );
}

export function DocComments({
  docId,
  onClose,
  /** Anchor for a new thread, e.g. the current selection. */
  currentAnchor,
  /** Human label for that anchor, shown on the composer ("B7", "Slide 3"). */
  anchorLabel,
  /** Describes an existing thread's anchor, for the chip on each thread. */
  describeAnchor,
  /** Clicking a thread jumps the editor to its anchor. */
  onJumpToAnchor,
}: {
  docId: string;
  onClose: () => void;
  currentAnchor?: CommentAnchor;
  anchorLabel?: string;
  describeAnchor?: (anchor: CommentAnchor) => string | null;
  onJumpToAnchor?: (anchor: CommentAnchor) => void;
}) {
  const [threads, setThreads] = useState<DocCommentThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${docId}/comments?resolved=${showResolved}`);
      if (res.ok) setThreads((await res.json()) as DocCommentThread[]);
    } catch {
      toast.error("Could not load comments");
    } finally {
      setLoading(false);
    }
  }, [docId, showResolved]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (replyTo) replyRef.current?.focus();
  }, [replyTo]);

  const post = async (content: string, parentId?: string) => {
    const text = content.trim();
    if (!text) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/documents/${docId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: text,
          ...(parentId ? { parentId } : { anchor: currentAnchor ?? null }),
        }),
      });
      if (!res.ok) throw new Error();
      if (parentId) { setReplyDraft(""); setReplyTo(null); } else { setDraft(""); }
      await load();
    } catch {
      toast.error("Could not post comment");
    } finally {
      setBusy(false);
    }
  };

  const setResolved = async (thread: DocCommentThread, resolved: boolean) => {
    // Optimistic — resolving is the highest-frequency action in review passes.
    setThreads(prev =>
      showResolved
        ? prev.map(t => (t.id === thread.id ? { ...t, resolved } : t))
        : prev.filter(t => t.id !== thread.id),
    );
    try {
      const res = await fetch(`/api/documents/${docId}/comments`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId: thread.id, resolved }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Could not update the comment");
      await load();
    }
  };

  const remove = async (commentId: string) => {
    setThreads(prev =>
      prev
        .filter(t => t.id !== commentId)
        .map(t => ({ ...t, replies: t.replies.filter(r => r.id !== commentId) })),
    );
    try {
      const res = await fetch(
        `/api/documents/${docId}/comments?commentId=${commentId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Could not delete the comment");
      await load();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border-soft flex-shrink-0">
        <MessageSquare className="w-4 h-4 text-muted" />
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">Comments</p>
          <p className="text-[10px] text-subtle">
            {loading
              ? "Loading…"
              : `${threads.length} ${showResolved ? "resolved" : "open"} thread${threads.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setShowResolved(v => !v)}
            title={showResolved ? "Show open comments" : "Show resolved comments"}
            className={`p-1.5 rounded-md transition-colors ${
              showResolved ? "text-accent bg-accent-soft" : "text-muted hover:text-foreground hover:bg-hover"
            }`}
          >
            {showResolved ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-subtle hover:text-foreground hover:bg-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* New thread composer */}
      {!showResolved && (
        <div className="px-3 py-2.5 border-b border-border-soft flex-shrink-0">
          {anchorLabel && (
            <p className="text-[10px] text-subtle mb-1.5">
              Commenting on <span className="font-medium text-muted">{anchorLabel}</span>
            </p>
          )}
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              // ⌘/Ctrl+Enter posts — plain Enter keeps making new lines.
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void post(draft);
              }
            }}
            rows={2}
            placeholder="Add a comment… use @ to mention someone"
            className="w-full px-2.5 py-2 bg-surface-sunken border border-border rounded-lg
                       text-xs text-foreground placeholder:text-subtle resize-none
                       focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-colors"
          />
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] text-subtle">⌘↵ to post</span>
            <button
              onClick={() => void post(draft)}
              disabled={!draft.trim() || busy}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold
                         bg-accent text-accent-foreground hover:bg-accent-hover
                         disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              Comment
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-subtle" />
          </div>
        ) : threads.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <MessageSquare className="w-6 h-6 mx-auto text-subtle mb-2" />
            <p className="text-xs text-muted">
              {showResolved ? "Nothing resolved yet" : "No comments yet"}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border-soft">
            {threads.map(thread => {
              const anchorText = describeAnchor?.(thread.range) ?? null;
              return (
                <li key={thread.id} className="px-3 py-3 group">
                  <div className="flex items-start gap-2">
                    <Avatar user={thread.user} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-medium text-foreground">{thread.user.fullName}</span>
                        <span className="text-[10px] text-subtle">
                          {formatDistanceToNow(new Date(thread.createdAt), { addSuffix: true })}
                        </span>
                        {anchorText && (
                          <button
                            onClick={() => onJumpToAnchor?.(thread.range)}
                            disabled={!onJumpToAnchor}
                            className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-sunken
                                       text-muted hover:text-accent hover:bg-accent-soft transition-colors
                                       disabled:hover:text-muted disabled:hover:bg-surface-sunken"
                          >
                            {anchorText}
                          </button>
                        )}
                      </div>
                      <div className="mt-1"><CommentBody text={thread.content} /></div>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button
                        onClick={() => void setResolved(thread, !thread.resolved)}
                        title={thread.resolved ? "Reopen" : "Resolve"}
                        className={`p-1.5 rounded-md transition-colors ${
                          thread.resolved
                            ? "text-ok bg-ok-soft"
                            : "text-muted hover:text-ok hover:bg-ok-soft"
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => void remove(thread.id)}
                        title="Delete thread"
                        className="p-1.5 rounded-md text-muted hover:text-crit hover:bg-crit-soft transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {thread.replies.length > 0 && (
                    <ul className="mt-2 ml-8 space-y-2 border-l border-border-soft pl-3">
                      {thread.replies.map(reply => (
                        <li key={reply.id} className="group/reply flex items-start gap-2">
                          <Avatar user={reply.user} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-medium text-foreground">{reply.user.fullName}</span>
                              <span className="text-[10px] text-subtle">
                                {formatDistanceToNow(new Date(reply.createdAt), { addSuffix: true })}
                              </span>
                            </div>
                            <CommentBody text={reply.content} />
                          </div>
                          <button
                            onClick={() => void remove(reply.id)}
                            title="Delete reply"
                            className="p-1 rounded-md text-muted hover:text-crit hover:bg-crit-soft
                                       opacity-0 group-hover/reply:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {replyTo === thread.id ? (
                    <div className="mt-2 ml-8">
                      <textarea
                        ref={replyRef}
                        value={replyDraft}
                        onChange={e => setReplyDraft(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            void post(replyDraft, thread.id);
                          } else if (e.key === "Escape") {
                            setReplyTo(null); setReplyDraft("");
                          }
                        }}
                        rows={2}
                        placeholder="Reply…"
                        className="w-full px-2.5 py-1.5 bg-surface-sunken border border-border rounded-lg
                                   text-xs text-foreground placeholder:text-subtle resize-none
                                   focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
                      />
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <button
                          onClick={() => void post(replyDraft, thread.id)}
                          disabled={!replyDraft.trim() || busy}
                          className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-accent text-accent-foreground
                                     hover:bg-accent-hover disabled:opacity-40 transition-colors"
                        >
                          Reply
                        </button>
                        <button
                          onClick={() => { setReplyTo(null); setReplyDraft(""); }}
                          className="px-2 py-1 rounded-md text-[11px] font-medium text-muted hover:bg-hover transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setReplyTo(thread.id); setReplyDraft(""); }}
                      className="mt-1.5 ml-8 flex items-center gap-1 text-[11px] font-medium
                                 text-muted hover:text-accent transition-colors"
                    >
                      <CornerDownRight className="w-3 h-3" /> Reply
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
