import { useState, useEffect, useRef, useCallback } from "react";
import { getMessages, sendMessage, type ChatMessage } from "@/api/client";
import { useAuth } from "@/store/auth";
import { MessageItem } from "./MessageItem";

export function ThreadPanel({
  parent, channelId, onClose, onParentChanged,
}: {
  parent: ChatMessage;
  channelId: string;
  onClose: () => void;
  onParentChanged: (msg: ChatMessage) => void;
}) {
  const { user } = useAuth();
  const [replies, setReplies] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const msgs = await getMessages(channelId, { parentId: parent.id });
      setReplies(msgs);
    } catch { /* silent */ }
  }, [channelId, parent.id]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 4_000);
    return () => clearInterval(iv);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [replies]);

  async function handleSend() {
    if (!draft.trim() || sending) return;
    const text = draft.trim();
    setDraft("");
    setSending(true);
    try {
      const msg = await sendMessage(channelId, { content: text, parentId: parent.id });
      setReplies(prev => [...prev, msg]);
      // Increase reply count on parent
      onParentChanged({ ...parent, replies: [...(parent.replies ?? []), { id: msg.id }] });
    } catch { /* silent */ }
    finally { setSending(false); }
  }

  return (
    <aside className="w-[360px] flex-shrink-0 border-l border-brand-border flex flex-col bg-bg-base overflow-hidden">
      {/* Header */}
      <div className="h-[52px] flex-shrink-0 flex items-center justify-between border-b border-brand-border px-4 no-select">
        <div>
          <p className="text-sm font-semibold text-text-primary">Thread</p>
          <p className="text-[10px] text-text-muted">{replies.length} {replies.length === 1 ? "reply" : "replies"}</p>
        </div>
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-bg-hover hover:text-text-primary transition-fast"
          title="Close thread"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Parent + replies */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        <div className="rounded-lg border border-brand-border/50 bg-bg-card p-2 mb-3">
          <MessageItem
            msg={parent}
            currentUserId={user?.id}
            compact={false}
            showActions={false}
            onChanged={() => {}}
            onOpenThread={() => {}}
            inThread
          />
        </div>

        {replies.length > 0 && (
          <div className="flex items-center gap-2 my-2">
            <div className="flex-1 h-px bg-brand-border/30" />
            <span className="text-[10px] text-text-muted">{replies.length} {replies.length === 1 ? "reply" : "replies"}</span>
            <div className="flex-1 h-px bg-brand-border/30" />
          </div>
        )}

        {replies.map((msg, i) => {
          const prev = i > 0 ? replies[i - 1] : null;
          const compact = !!prev && prev.user.id === msg.user.id && (new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime()) < 5 * 60_000;
          return (
            <MessageItem
              key={msg.id}
              msg={msg}
              currentUserId={user?.id}
              compact={compact}
              onChanged={(updated) => {
                if (updated) setReplies(rs => rs.map(r => r.id === updated.id ? updated : r));
                else load();
              }}
              onOpenThread={() => {}}
              inThread
            />
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-brand-border p-3">
        <div className="flex items-end gap-2 rounded-xl bg-bg-card border border-brand-border px-3 py-2 focus-within:border-brand/50 transition-fast">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
            placeholder="Reply…"
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-text-primary placeholder-text-muted/50 outline-none leading-relaxed max-h-32 overflow-y-auto"
            style={{ minHeight: "22px" }}
          />
          <button
            onClick={() => void handleSend()}
            disabled={!draft.trim() || sending}
            className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-lg transition-fast disabled:opacity-30"
            style={{ background: draft.trim() ? "linear-gradient(135deg, #00d2ff 0%, #0098c7 100%)" : undefined }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={draft.trim() ? "#0f1321" : "currentColor"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
