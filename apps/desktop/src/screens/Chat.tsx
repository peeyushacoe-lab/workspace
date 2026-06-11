import { useState, useEffect, useRef, useCallback } from "react";
import {
  getChannels, getMessages, sendMessage, getWorkspaceMembers, uploadDriveFile,
  type Channel, type ChatMessage, type WorkspaceMember,
} from "@/api/client";
import { useAuth } from "@/store/auth";
import { MessageItem } from "./chat/MessageItem";
import { NewChannelModal } from "./chat/NewChannelModal";
import { ThreadPanel } from "./chat/ThreadPanel";

function groupByDate(msgs: ChatMessage[]): Record<string, ChatMessage[]> {
  const groups: Record<string, ChatMessage[]> = {};
  for (const m of msgs) {
    const d = new Date(m.createdAt);
    const today = new Date();
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    let label: string;
    if (d.toDateString() === today.toDateString()) label = "Today";
    else if (d.toDateString() === yesterday.toDateString()) label = "Yesterday";
    else label = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
    (groups[label] ??= []).push(m);
  }
  return groups;
}

export function Chat() {
  const { user } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [selected, setSelected] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thread, setThread] = useState<ChatMessage | null>(null);
  const [showNewChannel, setShowNewChannel] = useState<boolean | "dm">(false);
  const [draft, setDraft] = useState("");
  const [isUrgent, setIsUrgent] = useState(false);
  const [loadingCh, setLoadingCh] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionPos, setMentionPos] = useState(0);
  const [showMembersPanel, setShowMembersPanel] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadChannels = useCallback(async () => {
    try {
      const ch = await getChannels();
      setChannels(ch);
      if (!selected && ch.length) setSelected(ch[0]);
    } catch { /* silent */ }
    finally { setLoadingCh(false); }
  }, [selected]);

  useEffect(() => {
    loadChannels();
    getWorkspaceMembers().then(setMembers).catch(() => {});
  }, [loadChannels]);

  const loadMessages = useCallback(async (channelId: string) => {
    try {
      const msgs = await getMessages(channelId);
      setMessages(msgs);
    } catch { /* silent */ }
    finally { setLoadingMsg(false); }
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLoadingMsg(true);
    setMessages([]);
    setThread(null);
    loadMessages(selected.id);
    const iv = setInterval(() => loadMessages(selected.id), 3_000);
    return () => clearInterval(iv);
  }, [selected, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Mention detection on draft change
  function handleDraftChange(text: string, cursorPos: number) {
    setDraft(text);
    const before = text.slice(0, cursorPos);
    const m = before.match(/@(\w*)$/);
    if (m) {
      setMentionQuery(m[1] ?? "");
      setMentionPos(cursorPos);
    } else {
      setMentionQuery(null);
    }
  }

  function applyMention(member: WorkspaceMember) {
    const before = draft.slice(0, mentionPos);
    const after = draft.slice(mentionPos);
    const withoutPartial = before.replace(/@\w*$/, "");
    const newDraft = `${withoutPartial}@${member.fullName.split(" ")[0]} ${after}`;
    setDraft(newDraft);
    setMentionQuery(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function handleSend() {
    if (!selected || !draft.trim() || sending) return;
    const text = draft.trim();
    setDraft("");
    setIsUrgent(false);
    setMentionQuery(null);
    setSending(true);
    try {
      const msg = await sendMessage(selected.id, { content: text, isUrgent });
      setMessages(m => [...m, msg]);
    } catch { /* silent */ }
    finally { setSending(false); inputRef.current?.focus(); }
  }

  async function handleUpload(file: File) {
    if (!selected) return;
    setUploading(true);
    try {
      const uploaded = await uploadDriveFile(file);
      const msg = await sendMessage(selected.id, {
        content: draft.trim() || `Shared ${file.name}`,
        attachmentUrl: uploaded.url ?? `https://drive.cybersage.uk/${uploaded.id}`,
        attachmentMime: uploaded.mimeType ?? file.type,
        attachmentName: uploaded.name,
      });
      setMessages(m => [...m, msg]);
      setDraft("");
    } catch (e) {
      alert(`Upload failed: ${e instanceof Error ? e.message : "Unknown"}`);
    } finally {
      setUploading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Mention navigation can come later — for now just send on Enter
    if (e.key === "Enter" && !e.shiftKey) {
      if (mentionQuery !== null && filteredMembers.length > 0) {
        e.preventDefault();
        applyMention(filteredMembers[0]!);
        return;
      }
      e.preventDefault();
      void handleSend();
    }
  }

  const grouped = groupByDate(messages);
  const channelGroups = channels.reduce<{ channels: Channel[]; dms: Channel[] }>((acc, ch) => {
    if (ch.type === "DM" || ch.type === "GROUP") acc.dms.push(ch);
    else acc.channels.push(ch);
    return acc;
  }, { channels: [], dms: [] });

  const filteredMembers = mentionQuery !== null
    ? members
        .filter(m => m.fullName.toLowerCase().includes(mentionQuery.toLowerCase()))
        .slice(0, 6)
    : [];

  return (
    <div className="flex h-full overflow-hidden">
      {/* Channel sidebar */}
      <aside className="w-[220px] flex-shrink-0 border-r border-brand-border bg-bg-sidebar/30 flex flex-col overflow-hidden no-select">
        <div className="h-[52px] flex-shrink-0 flex items-center justify-between px-4 border-b border-brand-border">
          <span className="text-sm font-semibold text-text-primary">Chat</span>
          <button
            onClick={() => setShowNewChannel(true)}
            title="New channel or DM"
            className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover transition-fast"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2 space-y-3">
          {loadingCh && (
            <div className="space-y-1 px-2">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-7 rounded-md" />)}
            </div>
          )}

          {!loadingCh && (
            <>
              {/* Channels */}
              <Section
                title="Channels"
                onAdd={() => setShowNewChannel(true)}
                items={channelGroups.channels}
                selected={selected}
                onSelect={setSelected}
                emptyText="No channels"
              />

              {/* DMs */}
              <Section
                title="Direct Messages"
                onAdd={() => setShowNewChannel("dm")}
                items={channelGroups.dms}
                selected={selected}
                onSelect={setSelected}
                emptyText="No direct messages"
              />
            </>
          )}
        </div>
      </aside>

      {/* Messages */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {selected ? (
          <>
            <div className="h-[52px] flex-shrink-0 flex items-center gap-3 px-5 border-b border-brand-border no-select">
              <span className="text-text-muted font-bold text-base">{selected.type === "DM" ? "" : "#"}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-primary truncate">{selected.name}</p>
                {selected.description && <p className="text-[10px] text-text-muted truncate">{selected.description}</p>}
              </div>
              <button
                onClick={() => setShowMembersPanel(s => !s)}
                className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-fast"
                title="Show members"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
                {selected.memberCount ?? "–"}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {loadingMsg && (
                <div className="flex h-full items-center justify-center text-text-muted text-sm">
                  <svg className="animate-spin mr-2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Loading…
                </div>
              )}
              {!loadingMsg && messages.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center text-text-muted gap-2">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-25">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <p className="text-sm">No messages yet. Say hello!</p>
                </div>
              )}

              {Object.entries(grouped).map(([date, msgs]) => (
                <div key={date}>
                  <div className="flex items-center gap-2 my-3">
                    <div className="flex-1 h-px bg-brand-border/40" />
                    <span className="text-[10px] text-text-muted px-2">{date}</span>
                    <div className="flex-1 h-px bg-brand-border/40" />
                  </div>
                  {msgs.map((msg, i) => {
                    const prev = i > 0 ? msgs[i - 1] : null;
                    const compact = !!prev && prev.user.id === msg.user.id && (new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime()) < 5 * 60_000;
                    return (
                      <MessageItem
                        key={msg.id}
                        msg={msg}
                        currentUserId={user?.id}
                        compact={compact}
                        onChanged={(updated) => {
                          if (updated) setMessages(ms => ms.map(m => m.id === updated.id ? updated : m));
                          else loadMessages(selected.id);
                        }}
                        onOpenThread={(m) => setThread(m)}
                      />
                    );
                  })}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="flex-shrink-0 border-t border-brand-border p-3 relative">
              {/* Mention dropdown */}
              {mentionQuery !== null && filteredMembers.length > 0 && (
                <div className="absolute bottom-full left-4 mb-2 w-[260px] max-h-[200px] overflow-y-auto rounded-lg border border-brand-border bg-bg-deep shadow-xl">
                  <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-text-muted border-b border-brand-border/50">
                    Mention a person
                  </div>
                  {filteredMembers.map((m, idx) => (
                    <button
                      key={m.id}
                      onClick={() => applyMention(m)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-bg-hover transition-fast ${idx === 0 ? "bg-bg-hover/50" : ""}`}
                    >
                      <div className="h-6 w-6 flex-shrink-0 rounded-full bg-brand-dim border border-brand-border flex items-center justify-center text-[10px] font-bold text-brand">
                        {m.fullName[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] text-text-primary truncate">{m.fullName}</p>
                        <p className="text-[10px] text-text-muted truncate">{m.email}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className={`flex items-end gap-2 rounded-xl bg-bg-card border ${isUrgent ? "border-red-500/50" : "border-brand-border"} px-3 py-2 focus-within:border-brand/50 transition-fast`}>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading || sending}
                  title="Attach file"
                  className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-bg-hover hover:text-text-primary transition-fast disabled:opacity-30"
                >
                  {uploading ? (
                    <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                    </svg>
                  )}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) void handleUpload(f); e.target.value = ""; }}
                />
                <button
                  onClick={() => setIsUrgent(s => !s)}
                  title="Mark urgent"
                  className={`flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-md transition-fast ${
                    isUrgent ? "bg-red-500/15 text-red-400" : "text-text-muted hover:bg-bg-hover hover:text-text-primary"
                  }`}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill={isUrgent ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </button>
                <textarea
                  ref={inputRef}
                  value={draft}
                  onChange={e => handleDraftChange(e.target.value, e.target.selectionStart ?? 0)}
                  onKeyDown={handleKey}
                  placeholder={`Message ${selected.type === "DM" ? selected.name.replace(/^DM:\s*/, "") : `#${selected.name}`}`}
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
              <p className="mt-1 text-[10px] text-text-muted/40 text-right no-select">
                Enter to send · Shift+Enter for newline · @ to mention
              </p>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-text-muted">
            <p className="text-sm">Select a channel to start chatting</p>
          </div>
        )}
      </div>

      {/* Thread panel */}
      {thread && selected && (
        <ThreadPanel
          parent={thread}
          channelId={selected.id}
          onClose={() => setThread(null)}
          onParentChanged={(m) => {
            setThread(m);
            setMessages(ms => ms.map(x => x.id === m.id ? m : x));
          }}
        />
      )}

      {/* Members panel */}
      {showMembersPanel && selected && (
        <aside className="w-[240px] flex-shrink-0 border-l border-brand-border bg-bg-base flex flex-col overflow-hidden no-select">
          <div className="h-[52px] flex-shrink-0 flex items-center justify-between px-4 border-b border-brand-border">
            <span className="text-sm font-semibold text-text-primary">Members</span>
            <button onClick={() => setShowMembersPanel(false)} className="text-text-muted hover:text-text-primary transition-fast">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {selected.members?.map(m => {
              const member = members.find(x => x.id === m.userId);
              if (!member) return null;
              return (
                <div key={m.userId} className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-bg-hover transition-fast">
                  <div className="relative">
                    <div className="h-7 w-7 rounded-lg bg-brand-dim border border-brand-border flex items-center justify-center text-xs font-bold text-brand">
                      {member.fullName[0]?.toUpperCase()}
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-500 border border-bg-base" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] text-text-primary truncate leading-tight">{member.fullName}</p>
                    <p className="text-[10px] text-text-muted truncate leading-tight">
                      {m.role === "ADMIN" ? "Admin" : member.jobTitle ?? member.role}
                    </p>
                  </div>
                </div>
              );
            })}
            {(!selected.members || selected.members.length === 0) && (
              <p className="px-3 py-4 text-xs text-text-muted text-center">No members info</p>
            )}
          </div>
        </aside>
      )}

      {/* Modal */}
      {showNewChannel && (
        <NewChannelModal
          defaultDM={showNewChannel === "dm"}
          onClose={() => setShowNewChannel(false)}
          onCreated={(channelId) => {
            setShowNewChannel(false);
            loadChannels().then(() => {
              setSelected(channels.find(c => c.id === channelId) ?? null);
            });
          }}
        />
      )}
    </div>
  );
}

function Section({
  title, onAdd, items, selected, onSelect, emptyText,
}: {
  title: string;
  onAdd?: () => void;
  items: Channel[];
  selected: Channel | null;
  onSelect: (ch: Channel) => void;
  emptyText: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between px-3 mb-1">
        <span className="text-[10px] uppercase tracking-wider text-text-muted">{title}</span>
        {onAdd && (
          <button
            onClick={onAdd}
            className="h-4 w-4 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-bg-hover transition-fast"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="px-3 py-1 text-[11px] text-text-muted italic">{emptyText}</p>
      ) : items.map(ch => (
        <button
          key={ch.id}
          onClick={() => onSelect(ch)}
          className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md mx-1 text-left text-sm transition-fast ${
            selected?.id === ch.id
              ? "bg-brand-dim text-text-primary"
              : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          }`}
        >
          <span className="flex-shrink-0 w-4 flex items-center justify-center text-text-muted text-[11px] font-bold">
            {ch.type === "DM" || ch.type === "GROUP" ? (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
            ) : (
              "#"
            )}
          </span>
          <span className="flex-1 truncate text-[13px]">
            {ch.type === "DM" ? ch.name.replace(/^DM:\s*/, "") : ch.name}
          </span>
          {ch.unreadCount > 0 && (
            <span className="flex-shrink-0 h-4 min-w-4 px-1 rounded-full bg-brand text-bg-deep text-[10px] font-bold flex items-center justify-center">
              {ch.unreadCount > 99 ? "99+" : ch.unreadCount}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
