/* eslint-disable @next/next/no-img-element */
﻿"use client";

import { useCallback, useEffect, useRef, useState, memo } from "react";
import { useSearchParams } from "next/navigation";
import { connectSocket, disconnectSocket } from "@/lib/socket-client";
import type { Socket } from "socket.io-client";
import {
  Hash,
  MessageSquare,
  Plus,
  Send,
  Smile,
  Trash2,
  Edit3,
  X,
  Check,
  Users,
  CornerDownRight,
  Search,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Loader2,
  FileText,
  Download,
  UserPlus,
  Pin,
  PinOff,
  Mic,
  Square,
  Video,
  Phone,
  Megaphone,
  Paperclip,
  LogOut,
  Crown,
  UserMinus,
  Settings,
  ListPlus,
  Reply as ReplyIcon,
  Siren,
  Film,
  Sticker,
  User,
  Mail,
  Bell,
  BellOff,
  type LucideIcon,
} from "lucide-react";
import { formatDistanceToNow, isToday, isYesterday, format } from "date-fns";
import { toast } from "sonner";
import { useCall } from "./call/CallProvider";
import { avatarGradient } from "@/lib/avatar";

// ─── Types ────────────────────────────────────────────────────────────────────

type Member = {
  userId: string;
  role: string;
  lastReadAt?: string | null;
};

type Channel = {
  id: string;
  name: string;
  description?: string;
  type: "CHANNEL" | "DIRECT" | "GROUP";
  isPrivate: boolean;
  isBroadcast: boolean;
  createdById?: string | null;
  members: Member[];
  _count: { messages: number };
  unreadCount?: number;
};

type Reaction = {
  id: string;
  emoji: string;
  user: { id: string; fullName: string };
};

type Reply = { id: string };

type MessageUser = {
  id: string;
  fullName: string;
  avatarUrl?: string | null;
  role: string;
};

type QuotedMessagePreview = {
  id: string;
  content: string;
  deletedAt?: string | null;
  user: { id: string; fullName: string };
};

type ReadReceipt = { userId: string; readAt: string; user: { fullName: string } };

type Message = {
  id: string;
  channelId: string;
  userId: string;
  content: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  parentId?: string | null;
  quotedMessageId?: string | null;
  quotedMessage?: QuotedMessagePreview | null;
  isPinned?: boolean;
  isUrgent?: boolean;
  attachmentUrl?: string | null;
  attachmentMime?: string | null;
  attachmentName?: string | null;
  attachmentSize?: number | null;
  createdAt: string;
  user: MessageUser;
  reactions: Reaction[];
  replies: Reply[];
  readBy?: ReadReceipt[];
};

type UserSummary = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  avatarUrl?: string | null;
};

// ─── Emoji Picker Data ────────────────────────────────────────────────────────

const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: "Smileys",
    emojis: [
      "😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇",
      "🙂","😉","😌","😍","🥰","😘","😗","😙","😚","😋",
    ],
  },
  {
    label: "People",
    emojis: [
      "👍","👎","👏","🙌","🤝","👊","✊","🤜","🤛","💪",
      "🙏","🤲","👐","🤷","🤦","💁","🙋","🙅","🙆","🤞",
    ],
  },
  {
    label: "Nature",
    emojis: [
      "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯",
      "🌸","🌺","🌻","🌹","🍀","🌿","🌾","🍁","🍂","🍃",
    ],
  },
  {
    label: "Food",
    emojis: [
      "🍎","🍊","🍋","🍇","🍓","🫐","🍒","🍑","🥭","🍍",
      "🍕","🍔","🌮","🌯","🥙","🍜","🍣","🍱","🍛","🎂",
    ],
  },
  {
    label: "Symbols",
    emojis: [
      "❤️","🧡","💛","💚","💙","💜","🖤","🤍","❤️‍🔥","💯",
      "✅","❌","⭐","🔥","🎉","🎊","🏆","🎯","💡","🔔",
    ],
  },
];

// Quick-reaction strip (shown inline in the action toolbar)
const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🎉", "🔥", "✅"];

// ─── Emoji Picker Component ───────────────────────────────────────────────────

function EmojiPicker({
  onSelect,
  onClose,
}: {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const allEmojis = EMOJI_CATEGORIES.flatMap((c) => c.emojis);
  const filtered = query.trim()
    ? allEmojis.filter((e) => e.includes(query.trim()))
    : null;

  const displayEmojis = filtered ?? EMOJI_CATEGORIES[activeCategory]?.emojis ?? [];

  return (
    <div
      className="absolute bottom-full right-0 mb-1 w-72 bg-surface border border-border rounded-2xl shadow-xl z-50 overflow-hidden"
      style={{ transition: "opacity 150ms ease-out" }}
    >
      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Search className="w-3.5 h-3.5 text-muted flex-shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search emoji…"
          className="flex-1 text-xs outline-none text-foreground placeholder-muted bg-transparent"
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
        />
        {query && (
          <button onClick={() => setQuery("")} className="text-muted hover:text-foreground">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Category tabs — hidden during search */}
      {!query && (
        <div className="flex border-b border-border overflow-x-auto">
          {EMOJI_CATEGORIES.map((cat, i) => (
            <button
              key={cat.label}
              onClick={() => setActiveCategory(i)}
              className={`flex-shrink-0 px-3 py-1.5 text-[10px] font-semibold transition-colors ${
                activeCategory === i
                  ? "text-accent border-b-2 border-accent"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* Emoji grid */}
      <div className="grid grid-cols-8 gap-0.5 p-2 max-h-44 overflow-y-auto">
        {displayEmojis.map((emoji, i) => (
          <button
            key={`${emoji}-${i}`}
            onClick={() => {
              onSelect(emoji);
              onClose();
            }}
            className="flex items-center justify-center w-8 h-8 text-lg hover:bg-surface-sunken rounded-lg transition-transform hover:scale-110"
            title={emoji}
          >
            {emoji}
          </button>
        ))}
        {displayEmojis.length === 0 && (
          <p className="col-span-8 text-center text-xs text-muted py-4">No results</p>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dateSeparatorLabel(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMMM d, yyyy");
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, avatarUrl, size = "sm" }: { name: string; avatarUrl?: string | null; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "w-8 h-8 text-xs" : "w-10 h-10 text-sm";

  if (avatarUrl) {
    return (
      <img src={avatarUrl} alt={name} className={`${sz} rounded-full object-cover flex-shrink-0`} />
    );
  }

  return (
    <div
      className={`${sz} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0`}
      style={{ background: avatarGradient(name) }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// ─── Mention renderer ────────────────────────────────────────────────────────

function renderWithMentions(content: string, currentUserId: string, memberNames: string[]): React.ReactNode {
  const parts = content.split(/(@\w[\w\s]{0,30})/g);
  return parts.map((part, i) => {
    if (part.startsWith("@")) {
      const name = part.slice(1).trim().toLowerCase();
      if (name === "here" || name === "channel") {
        return (
          <span key={i} className="bg-crit/15 text-crit font-semibold rounded px-0.5">
            {part}
          </span>
        );
      }
      const isMention = memberNames.some(m => m.toLowerCase().startsWith(name));
      if (isMention) {
        return (
          <span key={i} className="bg-accent/10 text-accent font-semibold rounded px-0.5">
            {part}
          </span>
        );
      }
    }
    return <span key={i}>{part}</span>;
  });
}

// ─── Reaction Tooltip ─────────────────────────────────────────────────────────

function ReactionPill({
  emoji,
  count,
  mine,
  reactors,
  onReact,
}: {
  emoji: string;
  count: number;
  mine: boolean;
  reactors: string[];
  onReact: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div className="relative inline-flex">
      <button
        onClick={onReact}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
          mine
            ? "bg-accent/10 border-accent text-accent"
            : "bg-surface border-border text-muted hover:bg-accent/10"
        }`}
      >
        {emoji} {count}
      </button>

      {hovered && reactors.length > 0 && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 pointer-events-none">
          <div className="bg-surface text-foreground text-[10px] rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg max-w-[200px] border border-border">
            <div className="font-semibold mb-0.5 text-subtle">Reacted by:</div>
            <div className="text-foreground truncate">{reactors.join(", ")}</div>
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-border" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── File Attachment Card ─────────────────────────────────────────────────────

function FileAttachmentCard({ content }: { content: string }) {
  // Parse the special file attachment format from message content
  // Format: [FILE_ATTACHMENT] JSON_DATA
  try {
    const jsonStr = content.replace("[FILE_ATTACHMENT] ", "");
    const data = JSON.parse(jsonStr) as {
      name: string;
      size: number;
      mimeType: string;
      url?: string;
      fileId?: string;
    };

    // Audio files (voice notes, audio uploads) → inline player
    if (data.mimeType.startsWith("audio/") && data.url) {
      const previewUrl = data.fileId
        ? `/api/drive/files/${data.fileId}/download?preview=1`
        : data.url;
      return (
        <div className="mt-1.5 flex items-center gap-2 bg-surface border border-border rounded-2xl px-3 py-2.5 max-w-sm w-full">
          <div className="w-7 h-7 rounded-full bg-accent/15 flex items-center justify-center flex-shrink-0">
            <Mic className="w-3.5 h-3.5 text-accent" />
          </div>
          <audio
            src={previewUrl}
            controls
            preload="metadata"
            className="flex-1 h-8 min-w-0"
            style={{ accentColor: "var(--accent)" }}
          />
        </div>
      );
    }

    // Image files → inline preview
    if (data.mimeType.startsWith("image/") && data.url) {
      const previewUrl = data.fileId
        ? `/api/drive/files/${data.fileId}/download?preview=1`
        : data.url;
      return (
        <div className="mt-1.5">
          <img
            src={previewUrl}
            alt={data.name}
            className="rounded-xl max-w-xs max-h-48 object-cover border border-border"
          />
          <p className="text-[10px] text-muted mt-1">{data.name} · {formatFileSize(data.size)}</p>
        </div>
      );
    }

    // All other files → download card
    return (
      <div className="mt-1.5 inline-flex items-center gap-3 bg-surface border border-border rounded-xl px-3 py-2.5 max-w-xs">
        <FileText className="w-7 h-7 text-accent flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{data.name}</p>
          <p className="text-[10px] text-muted">{formatFileSize(data.size)} · {data.mimeType.split("/")[1]?.toUpperCase()}</p>
        </div>
        {data.url && (
          <a
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:text-accent flex-shrink-0"
            title="Download"
          >
            <Download className="w-4 h-4" />
          </a>
        )}
      </div>
    );
  } catch {
    return <p className="text-sm text-foreground whitespace-pre-wrap break-words mt-0.5">{content}</p>;
  }
}

// ─── Bot Response Card ────────────────────────────────────────────────────────

function BotResponseCard({ content }: { content: string }) {
  try {
    const jsonStr = content.replace("[BOT_RESPONSE] ", "");
    const data = JSON.parse(jsonStr) as { from: string; text: string };
    return (
      <div className="mt-1 flex items-start gap-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent/10 border border-accent/20">
          <Sparkles className="h-4 w-4 text-accent" />
        </div>
        <div className="flex-1 min-w-0 bg-surface-sunken border border-border rounded-xl p-4 max-w-xl">
          <p className="text-accent font-semibold text-sm mb-1">{data.from}</p>
          <p className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">{data.text}</p>
        </div>
      </div>
    );
  } catch {
    return <p className="text-sm text-foreground whitespace-pre-wrap break-words mt-0.5">{content}</p>;
  }
}

// ─── Message Item ─────────────────────────────────────────────────────────────

const MessageItem = memo(function MessageItem({
  msg,
  currentUserId,
  onReact,
  onEdit,
  onDelete,
  onReply,
  onQuoteReply,
  onPin,
  onJumpTo,
  memberNames = [],
  isGroupChat = false,
  isLastInChannel = false,
  isContinuation = false,
}: {
  msg: Message;
  currentUserId: string;
  onReact: (messageId: string, emoji: string) => void;
  onEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
  onReply?: (msg: Message) => void;
  onQuoteReply?: (msg: Message) => void;
  onPin?: (messageId: string, pinned: boolean) => void;
  onJumpTo?: (messageId: string) => void;
  memberNames?: string[];
  isGroupChat?: boolean;
  isLastInChannel?: boolean;
  /** Continuation of the previous message from the same author — see listItems. */
  isContinuation?: boolean;
}) {
  const [showActions, setShowActions] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(msg.content);
  const [creatingTask, setCreatingTask] = useState(false);
  const [taskCreated, setTaskCreated] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const isOwn = msg.userId === currentUserId;
  const isDeleted = !!msg.deletedAt;
  const isFileAttachment = msg.content.startsWith("[FILE_ATTACHMENT] ");

  const createTaskFromMessage = async () => {
    setCreatingTask(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: msg.content.slice(0, 200),
          description: `Created from a chat message.`,
          sourceType: "chat",
          sourceId: msg.id,
        }),
      });
      if (!res.ok) throw new Error();
      setTaskCreated(true);
      toast.success("Task created from message");
    } catch {
      toast.error("Failed to create task");
    } finally {
      setCreatingTask(false);
    }
  };
  const isBotResponse = msg.content.startsWith("[BOT_RESPONSE] ");

  // Close picker when clicking outside
  useEffect(() => {
    if (!showEmojiPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showEmojiPicker]);

  // Group reactions by emoji across all emojis (not just QUICK_EMOJIS)
  const grouped = msg.reactions.reduce<Record<string, { count: number; mine: boolean; reactors: string[] }>>(
    (acc, r) => {
      if (!acc[r.emoji]) acc[r.emoji] = { count: 0, mine: false, reactors: [] };
      acc[r.emoji].count++;
      acc[r.emoji].reactors.push(r.user.fullName);
      if (r.user.id === currentUserId) acc[r.emoji].mine = true;
      return acc;
    },
    {}
  );

  const saveEdit = () => {
    if (editContent.trim() && editContent !== msg.content) {
      onEdit(msg.id, editContent.trim());
    }
    setEditing(false);
  };

  // System call-log entry (missed / ended) — rendered as a centered pill.
  if (!isDeleted && msg.content.startsWith("[CALL_LOG] ")) {
    let log: { status?: string; media?: string } = {};
    try {
      log = JSON.parse(msg.content.slice("[CALL_LOG] ".length));
    } catch {
      log = {};
    }
    const isVideo = log.media === "video";
    const label =
      (isVideo ? "Video call" : "Voice call") +
      (log.status === "ended" ? " ended" : " · Missed");
    return (
      <div className="flex items-center justify-center px-6 py-2">
        <div className="inline-flex items-center gap-2 text-xs text-muted bg-surface-sunken border border-border rounded-full px-3 py-1">
          {isVideo ? (
            <Video className="w-3.5 h-3.5 text-muted" />
          ) : (
            <Phone className="w-3.5 h-3.5 text-muted" />
          )}
          <span>{label}</span>
          <span className="text-subtle tabular-nums">
            {format(new Date(msg.createdAt), "HH:mm")}
          </span>
        </div>
      </div>
    );
  }

  const isMine = msg.userId === currentUserId;

  // Read-receipt derivation. `readBy` holds one row per (message, reader) —
  // exclude the author (a person doesn't "read" their own sent message).
  const readers = (msg.readBy ?? []).filter((r) => r.userId !== msg.userId);
  const otherReaders = readers.filter((r) => r.userId !== currentUserId);

  return (
    <div
      id={`msg-${msg.id}`}
      className={`group relative mx-2 flex gap-3 rounded-xl px-2 transition-colors scroll-mt-16 lg:mx-4 lg:px-3 ${
        isContinuation ? "py-0.5" : "pt-2.5 pb-1"
      } ${
        msg.isUrgent
          ? "border-l-2 border-crit bg-crit/5 hover:bg-crit/10"
          : isMine
            // Teams tints your own messages rather than flipping them to the
            // right. Alignment stays uniform — one avatar column, one reading
            // edge — while authorship is still obvious at a glance.
            ? "bg-accent-soft/50 hover:bg-accent-soft/70"
            : "hover:bg-surface-sunken"
      }`}
      onMouseEnter={() => !isDeleted && setShowActions(true)}
      onMouseLeave={() => {
        if (!showEmojiPicker) setShowActions(false);
      }}
    >
      <div className="w-[38px] flex-shrink-0 flex justify-center">
        {isContinuation ? (
          // The gutter keeps its width so text stays aligned; the timestamp
          // appears there on hover, which is how you check "when exactly?" on a
          // continuation line without repeating it on every row.
          <span className="mt-[3px] text-[10px] tabular-nums leading-none text-subtle opacity-0 transition-opacity group-hover:opacity-100">
            {format(new Date(msg.createdAt), "HH:mm")}
          </span>
        ) : (
          <Avatar name={msg.user.fullName} avatarUrl={msg.user.avatarUrl} size="md" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        {!isContinuation && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="font-semibold text-foreground text-[13.5px]">{msg.user.fullName}</span>
            {msg.isUrgent && (
              <span className="text-[10px] font-semibold text-crit bg-crit/15 px-1.5 py-0.5 rounded-full leading-none inline-flex items-center gap-1"><Siren className="w-3 h-3" />Urgent</span>
            )}
            {/* Clock time, not "22 days ago". The date separator above already
                says which day this is, so a relative distance restates it badly
                — and inside a day it is useless for ordering a conversation. */}
            <time
              dateTime={new Date(msg.createdAt).toISOString()}
              title={format(new Date(msg.createdAt), "EEEE d MMMM yyyy, HH:mm")}
              className="text-[11px] tabular-nums text-subtle"
            >
              {format(new Date(msg.createdAt), "HH:mm")}
            </time>
            {msg.editedAt && !isDeleted && (
              <span className="text-[11px] text-subtle italic">(edited)</span>
            )}
          </div>
        )}
        {isContinuation && msg.editedAt && !isDeleted && (
          <span className="text-[11px] text-subtle italic">(edited) </span>
        )}

        {/* Quoted "replying to" preview — WhatsApp-style inline quote card */}
        {!isDeleted && msg.quotedMessage && (
          <button
            type="button"
            onClick={() => onJumpTo?.(msg.quotedMessage!.id)}
            className="mb-1 flex max-w-md flex-col rounded-md border-l-2 border-accent bg-surface px-2.5 py-1 text-left hover:bg-surface transition-colors"
          >
            <span className="text-[11.5px] font-semibold text-accent">
              {msg.quotedMessage.user.fullName}
            </span>
            <span className="truncate text-[12.5px] text-muted">
              {msg.quotedMessage.deletedAt ? "(message deleted)" : msg.quotedMessage.content || "Attachment"}
            </span>
          </button>
        )}

        {/* Deleted message */}
        {isDeleted ? (
          <p className="text-sm text-muted italic mt-0.5">(message deleted)</p>
        ) : editing ? (
          <div className="mt-1 flex items-center gap-2">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                if (e.key === "Escape") setEditing(false);
              }}
              onBlur={saveEdit}
              rows={1}
              className="flex-1 text-sm border border-accent rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-accent resize-none bg-surface text-foreground"
              autoFocus
            />
            <button onClick={saveEdit} className="text-ok hover:text-ok flex-shrink-0">
              <Check className="w-4 h-4" />
            </button>
            <button onClick={() => setEditing(false)} className="text-muted hover:text-foreground flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : isFileAttachment ? (
          <FileAttachmentCard content={msg.content} />
        ) : isBotResponse ? (
          <BotResponseCard content={msg.content} />
        ) : (
          <>
            {msg.content && (
              <p className="text-[14px] leading-[1.55] text-foreground whitespace-pre-wrap break-words">
                {renderWithMentions(msg.content, currentUserId, memberNames)}
              </p>
            )}
            {msg.attachmentUrl && msg.attachmentMime?.startsWith("image/") && (
              <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer" className="inline-block mt-1.5">
                <img
                  src={msg.attachmentUrl}
                  alt={msg.attachmentName ?? "image"}
                  className="rounded-xl max-w-xs max-h-64 object-cover border border-accent/[0.1] hover:opacity-90 transition-opacity"
                />
              </a>
            )}
          </>
        )}

        {/* Reactions — only on non-deleted messages */}
        {!isDeleted && Object.keys(grouped).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {Object.entries(grouped).map(([emoji, { count, mine, reactors }]) => (
              <ReactionPill
                key={emoji}
                emoji={emoji}
                count={count}
                mine={mine}
                reactors={reactors}
                onReact={() => onReact(msg.id, emoji)}
              />
            ))}
          </div>
        )}

        {/* Thread reply count / start thread link */}
        {!isDeleted && onReply && (
          <button
            onClick={() => onReply(msg)}
            className="mt-1.5 flex items-center gap-1.5 text-xs text-accent hover:underline"
          >
            <CornerDownRight className="w-3 h-3" />
            {msg.replies.length > 0
              ? `${msg.replies.length} ${msg.replies.length === 1 ? "reply" : "replies"}`
              : "Reply in thread"}
          </button>
        )}

        {/* Read receipt — WhatsApp-style "Seen" status.
            DM: shown under the sender's own message once the other person has read it.
            Group: shown under the single most-recent message in the channel, visible
            to every member (not just the sender), listing who has caught up. */}
        {!isDeleted && !isGroupChat && isOwn && (
          <div className="mt-1 flex items-center gap-1 text-[11px] text-subtle">
            {otherReaders.length > 0 ? (
              <>
                <Check className="w-3 h-3 text-accent" />
                <Check className="w-3 h-3 -ml-2 text-accent" />
                <span>Seen {format(new Date(otherReaders[0].readAt), "h:mm a")}</span>
              </>
            ) : (
              <>
                <Check className="w-3 h-3" />
                <span>Sent</span>
              </>
            )}
          </div>
        )}
        {!isDeleted && isGroupChat && isLastInChannel && readers.length > 0 && (
          <div
            className="mt-1 flex items-center gap-1 text-[11px] text-subtle"
            title={readers.map((r) => `${r.user.fullName} · ${format(new Date(r.readAt), "h:mm a")}`).join("\n")}
          >
            <Check className="w-3 h-3 text-accent" />
            <span>
              Seen by {readers.slice(0, 2).map((r) => r.user.fullName.split(" ")[0]).join(", ")}
              {readers.length > 2 ? ` +${readers.length - 2}` : ""}
            </span>
          </div>
        )}
      </div>

      {/* Action buttons — only on non-deleted, non-editing, non-bot messages.
          The toolbar sits ABOVE the row's top edge, not inside it. Anchored
          inside, it covered the first line of any message wide enough to reach
          it — you hovered to react and lost the sentence you were reacting to.
          -translate-y-1/2 straddles the boundary, the way Slack's does. */}
      {showActions && !editing && !isDeleted && !isBotResponse && (
        <div className="absolute right-4 top-0 z-10 -translate-y-1/2 bg-surface border border-border rounded-lg shadow-pop flex items-center gap-1 px-1 py-0.5">
          {/* Quick reactions */}
          <div className="flex items-center border-r border-border pr-1 mr-0.5">
            {QUICK_EMOJIS.slice(0, 4).map((e) => (
              <button
                key={e}
                onClick={() => onReact(msg.id, e)}
                className="text-sm p-1 hover:bg-surface-sunken rounded-lg hover:scale-110 transition-transform"
                title={e}
              >
                {e}
              </button>
            ))}
          </div>

          {/* Full emoji picker trigger */}
          <div className="relative" ref={pickerRef}>
            <button
              onClick={() => setShowEmojiPicker((p) => !p)}
              className="p-1.5 hover:bg-surface-sunken hover:text-foreground rounded-md text-xs transition-colors text-muted"
              title="More reactions"
            >
              <Smile className="w-4 h-4" />
            </button>
            {showEmojiPicker && (
              <EmojiPicker
                onSelect={(emoji) => onReact(msg.id, emoji)}
                onClose={() => setShowEmojiPicker(false)}
              />
            )}
          </div>

          {onQuoteReply && (
            <button
              onClick={() => onQuoteReply(msg)}
              className="p-1.5 hover:bg-surface-sunken hover:text-foreground rounded-md text-xs transition-colors text-muted"
              title="Reply"
            >
              <ReplyIcon className="w-4 h-4" />
            </button>
          )}
          {onReply && (
            <button
              onClick={() => onReply(msg)}
              className="p-1.5 hover:bg-surface-sunken hover:text-foreground rounded-md text-xs transition-colors text-muted"
              title="Reply in thread"
            >
              <CornerDownRight className="w-4 h-4" />
            </button>
          )}
          {!isDeleted && !isFileAttachment && (
            <button
              onClick={() => void createTaskFromMessage()}
              disabled={creatingTask || taskCreated}
              className={`p-1.5 hover:bg-surface-sunken rounded-md text-xs transition-colors disabled:opacity-60 ${taskCreated ? "text-ok" : "text-muted hover:text-foreground"}`}
              title={taskCreated ? "Task created" : "Create task from this message"}
            >
              {creatingTask ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListPlus className="w-4 h-4" />}
            </button>
          )}
          {onPin && (
            <button
              onClick={() => onPin(msg.id, !msg.isPinned)}
              className={`p-1.5 rounded-md text-xs transition-colors ${msg.isPinned ? "text-accent" : "text-muted hover:bg-surface-sunken hover:text-foreground"}`}
              title={msg.isPinned ? "Unpin message" : "Pin message"}
            >
              {msg.isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
            </button>
          )}
          {isOwn && (
            <>
              <button
                onClick={() => { setEditing(true); setShowActions(false); }}
                className="p-1.5 hover:bg-surface-sunken hover:text-foreground rounded-md text-xs transition-colors text-muted"
                title="Edit"
              >
                <Edit3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => onDelete(msg.id)}
                className="p-1.5 hover:bg-crit/10 rounded-md text-xs transition-colors text-muted hover:text-crit"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
});

// ─── Date Separator ───────────────────────────────────────────────────────────

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-6 py-3">
      <div className="flex-1 h-px bg-surface-sunken" />
      <span className="text-xs text-muted font-medium whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-px bg-surface-sunken" />
    </div>
  );
}

// ─── Thread Panel ─────────────────────────────────────────────────────────────

function ThreadPanel({
  parentMsg,
  currentUserId,
  channelId,
  messages,
  memberNames = [],
  onClose,
  onReact,
  onEdit,
  onDelete,
}: {
  parentMsg: Message;
  currentUserId: string;
  channelId: string;
  messages: Message[];
  memberNames?: string[];
  onClose: () => void;
  onReact: (messageId: string, emoji: string) => void;
  onEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
}) {
  const [composerText, setComposerText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!composerText.trim() || sending) return;
    setSending(true);
    const text = composerText;
    setComposerText("");
    try {
      const res = await fetch(`/api/chat/channels/${channelId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, parentId: parentMsg.id }),
      });
      if (!res.ok) throw new Error("Failed");
      // SSE delivers the new reply to threadMessages in parent
    } catch {
      toast.error("Failed to send reply");
      setComposerText(text);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-surface hidden lg:flex lg:flex-col lg:w-80 lg:flex-shrink-0 border-l border-border-soft">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between font-semibold text-foreground text-sm flex-shrink-0">
        <div className="flex items-center gap-2">
          <CornerDownRight className="w-4 h-4 text-muted" />
          <span>Thread</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-muted hover:text-foreground hover:bg-surface-sunken rounded-md transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Parent message preview */}
      <div className="px-4 py-3 bg-accent/10 border-b border-border flex-shrink-0">
        <div className="flex items-start gap-2">
          <Avatar name={parentMsg.user.fullName} avatarUrl={parentMsg.user.avatarUrl} size="sm" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-semibold text-foreground">{parentMsg.user.fullName}</span>
            <p className="text-xs text-muted mt-0.5 line-clamp-3 whitespace-pre-wrap break-words">
              {parentMsg.content}
            </p>
          </div>
        </div>
      </div>

      {/* Replies */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-2 space-y-1">
        {messages.length === 0 ? (
          <div className="text-center text-muted py-8">
            <CornerDownRight className="w-8 h-8 mx-auto mb-2 opacity-20" />
            <p className="text-xs">No replies yet. Start the thread!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageItem
              key={msg.id}
              msg={msg}
              currentUserId={currentUserId}
              onReact={onReact}
              onEdit={onEdit}
              onDelete={onDelete}
              memberNames={memberNames}
            />
          ))
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-border px-4 py-3 flex-shrink-0">
        <div className="flex items-end gap-2 bg-surface border border-border rounded-lg px-3 py-2">
          <textarea
            value={composerText}
            onChange={(e) => setComposerText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Reply in thread…"
            rows={1}
            className="flex-1 bg-transparent resize-none text-sm text-foreground placeholder-muted outline-none max-h-24 overflow-y-auto"
            style={{ minHeight: "1.25rem" }}
          />
          <button
            onClick={send}
            disabled={!composerText.trim() || sending}
            className="text-accent-foreground rounded-lg p-2 transition-opacity hover:opacity-90 disabled:opacity-40 flex-shrink-0"
            style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-hover))" }}
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-[10px] text-muted mt-1 ml-1">Enter to reply</p>
      </div>
    </div>
  );
}

// ─── New Channel Modal ────────────────────────────────────────────────────────

function NewChannelModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (c: Channel) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [isBroadcast, setIsBroadcast] = useState(false);
  const [creating, setCreating] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/chat/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description, isPrivate, isBroadcast }),
      });
      if (!res.ok) throw new Error("Failed");
      const ch = (await res.json()) as Channel;
      onCreate(ch);
      onClose();
    } catch {
      toast.error("Failed to create channel");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-surface rounded-2xl shadow-xl p-6 w-full max-w-md mx-4 border border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Create Channel</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted mb-1">
              Channel Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
              onKeyDown={(e) => { if (e.key === "Enter" && name.trim() && !creating) void submit(); }}
              placeholder="e.g. engineering"
              className="w-full px-3 py-2 border border-border rounded-xl text-sm focus:ring-2 focus:ring-accent focus:bg-surface outline-none bg-surface text-foreground placeholder-muted"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted mb-1">
              Description (optional)
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this channel about?"
              className="w-full px-3 py-2 border border-border rounded-xl text-sm focus:ring-2 focus:ring-accent focus:bg-surface outline-none bg-surface text-foreground placeholder-muted"
            />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-foreground">Private channel</span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isBroadcast}
              onChange={(e) => setIsBroadcast(e.target.checked)}
              className="rounded mt-0.5"
            />
            <div>
              <span className="text-sm text-foreground flex items-center gap-1.5">
                <Megaphone className="w-3.5 h-3.5 text-muted" />
                Broadcast channel
              </span>
              <p className="text-[11px] text-subtle mt-0.5">Only you can post. Everyone can follow and read.</p>
            </div>
          </label>
        </div>
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-border rounded-xl text-sm font-semibold text-muted hover:bg-surface-sunken"
          >
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={!name.trim() || creating}
            className="flex-1 px-4 py-2 bg-accent text-accent-foreground rounded-xl text-sm font-semibold hover:bg-accent-hover disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create Channel"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── New Group DM Modal ───────────────────────────────────────────────────────

function NewGroupDMModal({
  currentUserId,
  existingDirectChannels,
  onClose,
  onCreate,
}: {
  currentUserId: string;
  existingDirectChannels: Channel[];
  onClose: () => void;
  onCreate: (c: Channel) => void;
}) {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/workspace/members")
      .then((r) => r.json())
      .then((data: UserSummary[]) => {
        setUsers(data.filter((u) => u.id !== currentUserId));
      })
      .catch(() => toast.error("Failed to load users"))
      .finally(() => setLoading(false));
  }, [currentUserId]);

  const filtered = users.filter(
    (u) =>
      u.fullName.toLowerCase().includes(query.toLowerCase()) ||
      u.email.toLowerCase().includes(query.toLowerCase())
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (selected.size === 0) { toast.error("Select at least one person"); return; }
    setCreating(true);
    const memberIds = Array.from(selected);
    const isDirect = memberIds.length === 1;
    const names = users
      .filter((u) => selected.has(u.id))
      .map((u) => u.fullName.split(" ")[0])
      .join(", ");
    try {
      // Dedup: if a DM with this person already exists, open it instead
      // members.length === 2 ensures we don't accidentally match a GROUP channel
      if (isDirect) {
        const existing = existingDirectChannels.find((c) =>
          c.members.length === 2 && c.members.some((m) => m.userId === memberIds[0])
        );
        if (existing) { onCreate(existing); onClose(); return; }
      }
      const res = await fetch("/api/chat/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: isDirect ? names : `Group: ${names}`,
          type: isDirect ? "DIRECT" : "GROUP",
          isPrivate: true,
          memberIds,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const ch = (await res.json()) as Channel;
      onCreate(ch);
      onClose();
    } catch {
      toast.error("Failed to create conversation");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-surface rounded-2xl shadow-xl p-6 w-full max-w-md mx-4 border border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">
            {selected.size > 1 ? "New Group Message" : "New Direct Message"}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-muted mb-3">
          Select one person for a DM or multiple for a group conversation.
        </p>

        {/* Search */}
        <div className="flex items-center gap-2 px-3 py-2 border border-border rounded-xl mb-3 bg-surface">
          <Search className="w-3.5 h-3.5 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people…"
            className="flex-1 text-sm outline-none bg-transparent text-foreground placeholder-muted"
          />
        </div>

        {/* Selected chips */}
        {selected.size > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {Array.from(selected).map((id) => {
              const u = users.find((x) => x.id === id);
              return u ? (
                <span
                  key={id}
                  className="flex items-center gap-1 bg-accent/10 text-accent text-xs px-2.5 py-1 rounded-full"
                >
                  {u.fullName}
                  <button onClick={() => toggle(id)} className="ml-0.5 opacity-60 hover:opacity-100">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ) : null;
            })}
          </div>
        )}

        {/* User list */}
        <div className="max-h-52 overflow-y-auto space-y-0.5 mb-4">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-xs text-muted py-4">No users found</p>
          ) : (
            filtered.map((u) => (
              <button
                key={u.id}
                onClick={() => toggle(u.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${
                  selected.has(u.id)
                    ? "bg-accent/10"
                    : "hover:bg-surface"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                    selected.has(u.id)
                      ? "bg-accent border-accent"
                      : "border-border"
                  }`}
                >
                  {selected.has(u.id) && <Check className="w-3 h-3 text-accent-foreground" />}
                </div>
                <Avatar name={u.fullName} avatarUrl={u.avatarUrl} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{u.fullName}</p>
                  <p className="text-[10px] text-muted truncate">{u.email}</p>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-border rounded-xl text-sm font-semibold text-muted hover:bg-surface-sunken"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={selected.size === 0 || creating}
            className="flex-1 px-4 py-2 bg-accent text-accent-foreground rounded-xl text-sm font-semibold hover:bg-accent-hover disabled:opacity-50"
          >
            {creating ? "Creating…" : selected.size === 1 ? "Send Message" : `Start Group (${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AI Summary Modal ─────────────────────────────────────────────────────────

type SummaryResult = {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  sentiment: string;
};

function SummaryModal({
  channelName,
  summary,
  onClose,
}: {
  channelName: string;
  summary: SummaryResult;
  onClose: () => void;
}) {
  const sentimentColor =
    summary.sentiment === "positive"
      ? "text-ok"
      : summary.sentiment === "negative"
      ? "text-crit"
      : "text-subtle";

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-surface rounded-2xl shadow-xl p-6 w-full max-w-lg mx-4 border border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-semibold text-foreground">
              #{channelName} Summary
            </h2>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary */}
        <div className="bg-surface border border-border rounded-xl p-4 mb-4">
          <p className="text-sm text-foreground leading-relaxed">{summary.summary}</p>
          <p className={`text-[10px] font-semibold mt-2 ${sentimentColor}`}>
            Sentiment: {summary.sentiment}
          </p>
        </div>

        {/* Key Points */}
        {summary.keyPoints.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-muted mb-2">
              Key Points
            </h3>
            <ul className="space-y-1.5">
              {summary.keyPoints.map((point, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 flex-shrink-0" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Action Items */}
        {summary.actionItems.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-muted mb-2">
              Action Items
            </h3>
            <ul className="space-y-1.5">
              {summary.actionItems.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                  <Check className="w-3.5 h-3.5 text-ok mt-0.5 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full px-4 py-2 bg-accent text-accent-foreground rounded-xl text-sm font-semibold hover:bg-accent-hover"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ─── Channel Sidebar Section ──────────────────────────────────────────────────

function ChannelSection({
  label,
  channels,
  selectedChannelId,
  presenceData,
  onSelect,
  onNew,
  newTitle,
  currentUserId,
}: {
  label: string;
  channels: Channel[];
  selectedChannelId: string | null;
  onlineUsers?: Map<string, string>;
  presenceData?: Record<string, { status: string; updatedAt: string }>;
  onSelect: (id: string) => void;
  onNew?: () => void;
  newTitle?: string;
  currentUserId: string;
}) {
  const [collapsed, setCollapsed] = useState(false);

  if (channels.length === 0 && !onNew) return null;

  // Row style is derived from the channel's own type, never from `label`.
  // This used to string-match the display label ("DIRECT MESSAGES"), so simply
  // renaming the heading to sentence case silently turned every DM avatar into
  // a "#" channel row.

  return (
    <div className="mb-1">
      <div className="flex items-center justify-between px-2.5 pt-3.5 pb-2">
        <button
          onClick={() => setCollapsed((p) => !p)}
          className="flex items-center gap-1 text-subtle hover:text-muted transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
          <span className="text-[11px] font-semibold text-subtle">{label}</span>
        </button>
        {onNew && (
          <button
            onClick={onNew}
            className="text-subtle hover:text-muted transition-colors"
            title={newTitle ?? "New"}
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="space-y-0.5">
          {channels.map((ch) => {
            const isSelected = selectedChannelId === ch.id;
            // Badge = unread messages only. The selected channel never shows a
            // badge (you're reading it) — previously it showed online-user count
            // here, which read as a bogus unread number.
            const hasUnread = !isSelected && (ch.unreadCount ?? 0) > 0;
            const badgeCount = ch.unreadCount ?? 0;
            const showBadge = hasUnread;

            const isGroup = ch.type === "GROUP";
            const showAvatarRow = ch.type === "DIRECT" || isGroup;

            if (showAvatarRow) {
              // Direct message / group row — 44px with avatar + presence dot
              const other = ch.members?.find((m) => m.userId !== currentUserId);
              const otherStatus = other ? presenceData?.[other.userId]?.status ?? "offline" : "offline";
              const statusColors: Record<string, string> = { online: "var(--ok)", away: "var(--warn)", busy: "var(--crit)", in_meeting: "var(--violet)", dnd: "var(--crit)", offline: "#9b9a93" };
              const presence = statusColors[otherStatus] ?? "var(--subtle)";
              return (
                <button
                  key={ch.id}
                  onClick={() => onSelect(ch.id)}
                  className={`nx-nav-item nx-press w-full flex items-center gap-2.5 h-11 rounded-xl px-[11px] text-left transition-colors ${
                    isSelected ? "bg-accent-soft" : "hover:bg-hover"
                  }`}
                >
                  <div className="relative flex-shrink-0">
                    {isGroup ? (
                      <div className="w-[30px] h-[30px] rounded-full bg-surface-sunken border border-border flex items-center justify-center">
                        <Users className="w-3.5 h-3.5 text-muted" />
                      </div>
                    ) : (
                      <div className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ background: avatarGradient(ch.name) }}>
                        {ch.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span
                      className="absolute -bottom-px -right-px w-2.5 h-2.5 rounded-full border-2 border-border"
                      style={{ background: presence }}
                    />
                  </div>
                  <span className={`truncate flex-1 text-[13px] ${isSelected || hasUnread ? "font-semibold text-foreground" : "font-medium text-muted"}`}>{ch.name}</span>
                  {showBadge && (
                    <span className="nx-badge font-mono bg-accent text-accent-foreground text-[10.5px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-[5px] font-bold leading-none flex-shrink-0">
                      {badgeCount > 99 ? "99+" : badgeCount}
                    </span>
                  )}
                </button>
              );
            }

            // Channel row — 38px with colored #
            const hashColor = isSelected || hasUnread ? "var(--accent)" : "var(--subtle)";
            return (
              <button
                key={ch.id}
                onClick={() => onSelect(ch.id)}
                className={`nx-nav-item nx-press w-full flex items-center gap-2.5 h-[38px] rounded-xl px-[11px] text-left transition-colors ${
                  isSelected ? "bg-accent-soft" : "hover:bg-hover"
                }`}
              >
                {ch.isBroadcast ? (
                  <Megaphone className="w-3.5 h-3.5 flex-shrink-0" style={{ color: hashColor }} />
                ) : (
                  <span className="text-[15px] font-semibold leading-none flex-shrink-0" style={{ color: hashColor }}>#</span>
                )}
                <span className={`truncate flex-1 text-[13px] ${isSelected || hasUnread ? "font-semibold text-foreground" : "font-medium text-muted"}`}>{ch.name}</span>
                {showBadge && (
                  <span className="nx-badge font-mono bg-accent text-accent-foreground text-[10.5px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-[5px] font-bold leading-none flex-shrink-0">
                    {badgeCount > 99 ? "99+" : badgeCount}
                  </span>
                )}
              </button>
            );
          })}
          {channels.length === 0 && (
            <p className="text-subtle text-[11px] px-[11px] py-1 italic">None yet</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Add Members Modal ────────────────────────────────────────────────────────

function AddMembersModal({
  channel,
  currentUserId,
  onClose,
  onAdded,
}: {
  channel: Channel;
  currentUserId: string;
  onClose: () => void;
  onAdded: (c: Channel) => void;
}) {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const existingMemberIds = new Set(channel.members.map((m) => m.userId));

  useEffect(() => {
    fetch("/api/workspace/members")
      .then((r) => r.json())
      .then((data: UserSummary[]) => {
        setUsers(data.filter((u) => u.id !== currentUserId && !existingMemberIds.has(u.id)));
      })
      .catch(() => toast.error("Failed to load users"))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, channel.id]);

  const filtered = users.filter(
    (u) =>
      u.fullName.toLowerCase().includes(query.toLowerCase()) ||
      u.email.toLowerCase().includes(query.toLowerCase())
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (selected.size === 0) { toast.error("Select at least one person"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/chat/channels/${channel.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: Array.from(selected) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `Server error ${res.status}`);
      }
      const { channel: updated } = (await res.json()) as { channel: Channel };
      if (updated) onAdded(updated);
      toast.success(`Added ${selected.size} member${selected.size > 1 ? "s" : ""}`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add members");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-surface rounded-2xl shadow-xl p-6 w-full max-w-md mx-4 border border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Add Members to #{channel.name}</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people…"
          className="w-full bg-surface border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder-muted outline-none focus:border-accent mb-3"
        />

        <div className="max-h-56 overflow-y-auto space-y-1 mb-4">
          {loading ? (
            <p className="text-sm text-muted text-center py-4">Loading users…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted text-center py-4">
              {users.length === 0 ? "All users are already members" : "No matching users"}
            </p>
          ) : (
            filtered.map((u) => (
              <button
                key={u.id}
                onClick={() => toggle(u.id)}
                className={`w-full flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-left transition-colors ${
                  selected.has(u.id) ? "bg-accent/10 text-accent border border-accent/30" : "text-foreground hover:bg-surface-sunken"
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-surface-sunken border border-border flex items-center justify-center text-xs font-semibold text-accent flex-shrink-0">
                  {u.fullName[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{u.fullName}</p>
                  <p className="text-xs text-muted truncate">{u.email}</p>
                </div>
                {selected.has(u.id) && <Check className="w-4 h-4 text-accent flex-shrink-0" />}
              </button>
            ))
          )}
        </div>

        {selected.size > 0 && (
          <p className="text-xs text-muted mb-3">{selected.size} selected</p>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-border text-muted rounded-xl text-sm hover:bg-surface-sunken">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={selected.size === 0 || saving}
            className="flex-1 px-4 py-2 bg-accent text-accent-foreground rounded-xl text-sm font-semibold hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? "Adding…" : `Add ${selected.size > 0 ? selected.size : ""} Member${selected.size !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Manage Members Modal ──────────────────────────────────────────────────────

function ManageMembersModal({
  channel,
  currentUserId,
  onClose,
  onChangeRole,
  onRemove,
  onLeave,
}: {
  channel: Channel;
  currentUserId: string;
  onClose: () => void;
  onChangeRole: (userId: string, role: "ADMIN" | "MEMBER") => Promise<void>;
  onRemove: (userId: string, name: string) => Promise<void>;
  onLeave: () => void;
}) {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/workspace/members")
      .then((r) => r.json())
      .then((data: UserSummary[]) => setUsers(data))
      .catch(() => toast.error("Failed to load users"))
      .finally(() => setLoading(false));
  }, []);

  const usersById = new Map(users.map((u) => [u.id, u]));
  const myMembership = channel.members.find((m) => m.userId === currentUserId);
  const isChannelAdmin = myMembership?.role === "ADMIN";
  const roster = [...channel.members].sort((a, b) => {
    if (a.role !== b.role) return a.role === "ADMIN" ? -1 : 1;
    const nameA = usersById.get(a.userId)?.fullName ?? "";
    const nameB = usersById.get(b.userId)?.fullName ?? "";
    return nameA.localeCompare(nameB);
  });

  const runAction = async (userId: string, action: () => Promise<void>) => {
    setBusyUserId(userId);
    try {
      await action();
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-surface rounded-2xl shadow-xl p-6 w-full max-w-md mx-4 border border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">
            Members {channel.type !== "DIRECT" ? `(${channel.members.length})` : ""}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto space-y-1 mb-4">
          {loading ? (
            <p className="text-sm text-muted text-center py-4">Loading members…</p>
          ) : (
            roster.map((m) => {
              const u = usersById.get(m.userId);
              const name = u?.fullName ?? "Unknown user";
              const isSelf = m.userId === currentUserId;
              const isAdmin = m.role === "ADMIN";
              const busy = busyUserId === m.userId;
              return (
                <div key={m.userId} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-surface-sunken">
                  <div className="w-8 h-8 rounded-full bg-surface-sunken border border-border flex items-center justify-center text-xs font-semibold text-accent flex-shrink-0">
                    {name[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-foreground flex items-center gap-1.5">
                      {name}{isSelf ? " (you)" : ""}
                      {isAdmin && <Crown className="w-3 h-3 text-warn flex-shrink-0" />}
                    </p>
                    <p className="text-xs text-muted truncate">{u?.email ?? ""}</p>
                  </div>

                  {channel.type !== "DIRECT" && isChannelAdmin && !isSelf && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => void runAction(m.userId, () => onChangeRole(m.userId, isAdmin ? "MEMBER" : "ADMIN"))}
                        disabled={busy}
                        title={isAdmin ? "Remove admin" : "Make admin"}
                        className="p-1.5 rounded-lg text-muted hover:text-warn hover:bg-warn/10 transition-colors disabled:opacity-40"
                      >
                        <Crown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => void runAction(m.userId, () => onRemove(m.userId, name))}
                        disabled={busy}
                        title="Remove from group"
                        className="p-1.5 rounded-lg text-muted hover:text-crit hover:bg-crit/10 transition-colors disabled:opacity-40"
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-border text-muted rounded-xl text-sm hover:bg-surface-sunken">
            Close
          </button>
          {channel.type === "GROUP" && (
            <button
              onClick={onLeave}
              className="flex-1 px-4 py-2 border border-crit/40 text-crit rounded-xl text-sm font-semibold hover:bg-crit/10 flex items-center justify-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" /> Leave group
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── GIF Picker ──────────────────────────────────────────────────────────────

type GifResult = { id: string; title: string; url: string; previewUrl: string };
type MediaTab = "gif" | "sticker" | "emoji";

function GifPicker({
  onSelect,
  onEmojiInsert,
  onClose,
  initialTab = "gif",
}: {
  onSelect: (url: string, title: string) => void;
  onEmojiInsert: (emoji: string) => void;
  onClose: () => void;
  initialTab?: MediaTab;
}) {
  const [tab, setTab] = useState<MediaTab>(initialTab);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, [tab]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedQuery(query), 400);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  useEffect(() => {
    if (tab === "emoji") return;
    setLoading(true);
    const apiUrl = debouncedQuery.trim()
      ? `/api/chat/gifs?type=${tab}&q=${encodeURIComponent(debouncedQuery.trim())}`
      : `/api/chat/gifs?type=${tab}`;
    fetch(apiUrl)
      .then((r) => r.json())
      .then((d: { results: GifResult[] }) => setResults(d.results ?? []))
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [debouncedQuery, tab]);

  const emojiRows = query.trim()
    ? EMOJI_CATEGORIES.flatMap((c) => c.emojis).filter((e) => e.includes(query.trim()))
    : (EMOJI_CATEGORIES[emojiCategory]?.emojis ?? []);

  const tabs: { id: MediaTab; label: string; icon: LucideIcon }[] = [
    { id: "gif", label: "GIF", icon: Film },
    { id: "sticker", label: "Sticker", icon: Sticker },
    { id: "emoji", label: "Emoji", icon: Smile },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 " onClick={onClose}>
      <div
        className="w-full max-w-lg bg-surface border border-accent/[0.15] rounded-t-2xl shadow-2xl overflow-hidden"
        style={{ maxHeight: "65vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tab bar */}
        <div className="flex border-b border-accent/[0.1]">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setQuery(""); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors ${tab === t.id ? "text-accent border-b-2 border-accent" : "text-subtle hover:text-muted"}`}
            >
              <t.icon className="w-4 h-4" />{t.label}
            </button>
          ))}
          <button onClick={onClose} className="px-3 text-subtle hover:text-muted"><X className="w-4 h-4" /></button>
        </div>

        {/* Search bar (GIF + Sticker + Emoji) */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-accent/[0.08]">
          <Search className="w-3.5 h-3.5 text-subtle flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === "emoji" ? "Search emoji…" : tab === "sticker" ? "Search stickers…" : "Search GIFs…"}
            className="flex-1 bg-transparent text-sm text-foreground placeholder-subtle outline-none"
            onKeyDown={(e) => e.key === "Escape" && onClose()}
          />
        </div>

        {/* Emoji category pills */}
        {tab === "emoji" && !query && (
          <div className="flex gap-1 px-3 py-1.5 overflow-x-auto border-b border-accent/[0.08]">
            {EMOJI_CATEGORIES.map((cat, i) => (
              <button
                key={cat.label}
                onClick={() => setEmojiCategory(i)}
                className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full transition-colors ${emojiCategory === i ? "bg-accent/20 text-accent" : "text-subtle hover:text-muted"}`}
              >{cat.label}</button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="overflow-y-auto p-2" style={{ maxHeight: "calc(65vh - 120px)" }}>
          {tab === "emoji" ? (
            <div className="grid grid-cols-8 gap-0.5">
              {emojiRows.map((emoji, i) => (
                <button
                  key={`${emoji}-${i}`}
                  onClick={() => { onEmojiInsert(emoji); onClose(); }}
                  className="flex items-center justify-center w-9 h-9 text-xl hover:bg-surface-sunken rounded-lg transition-transform hover:scale-110"
                >{emoji}</button>
              ))}
              {emojiRows.length === 0 && <p className="col-span-8 text-center text-sm text-subtle py-6">No results</p>}
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-subtle" />
            </div>
          ) : results.length === 0 ? (
            <p className="text-center text-sm text-subtle py-8">
              {!process.env.NEXT_PUBLIC_GIPHY_KEY ? "Set GIPHY_API_KEY to enable" : "No results"}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {results.map((gif) => (
                <button
                  key={gif.id}
                  onClick={() => { onSelect(gif.url, gif.title); onClose(); }}
                  className="relative group overflow-hidden rounded-lg bg-surface aspect-square hover:ring-2 hover:ring-accent transition-all"
                >
                  <img src={gif.previewUrl} alt={gif.title} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-xs font-semibold text-white">Send</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="px-4 py-1 border-t border-accent/[0.08]">
          <span className="text-[9px] text-subtle">{tab !== "emoji" ? "Powered by GIPHY" : ""}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Command Palette ─────────────────────────────────────────────────────────

type CmdAction = {
  id: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  onSelect: () => void;
};

function CommandPalette({
  channels,
  onClose,
  onSelectChannel,
  onNewChannel,
  onNewDM,
}: {
  channels: Channel[];
  onClose: () => void;
  onSelectChannel: (id: string) => void;
  onNewChannel: () => void;
  onNewDM: () => void;
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const q = query.trim().toLowerCase();

  const channelItems: CmdAction[] = channels
    .filter((c) => c.type === "CHANNEL" && c.name.toLowerCase().includes(q))
    .map((c) => ({
      id: c.id,
      label: `#${c.name}`,
      description: c.description,
      icon: Hash,
      onSelect: () => { onSelectChannel(c.id); onClose(); },
    }));

  const dmItems: CmdAction[] = channels
    .filter((c) => (c.type === "DIRECT" || c.type === "GROUP") && c.name.toLowerCase().includes(q))
    .map((c) => ({
      id: c.id,
      label: c.name,
      icon: c.type === "GROUP" ? Users : User,
      onSelect: () => { onSelectChannel(c.id); onClose(); },
    }));

  const actionItems: CmdAction[] = [
    { id: "_new_channel", label: "New Channel", icon: Plus, description: "Create a public or private channel", onSelect: () => { onNewChannel(); onClose(); } },
    { id: "_new_dm", label: "New Direct Message", icon: Mail, description: "Open a DM or group conversation", onSelect: () => { onNewDM(); onClose(); } },
  ].filter((a) => !q || a.label.toLowerCase().includes(q));

  const groups: { heading: string; items: CmdAction[] }[] = [
    { heading: "Channels", items: channelItems },
    { heading: "Direct Messages", items: dmItems },
    { heading: "Actions", items: actionItems },
  ].filter((g) => g.items.length > 0);

  const allItems = groups.flatMap((g) => g.items);

  const safeCursor = Math.min(cursor, Math.max(0, allItems.length - 1));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, allItems.length - 1)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); return; }
    if (e.key === "Enter") { e.preventDefault(); allItems[safeCursor]?.onSelect(); return; }
  };

  let flatIdx = 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60 " onClick={onClose}>
      <div
        className="w-full max-w-lg bg-surface border border-accent/[0.15] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-accent/[0.1]">
          <Search className="w-4 h-4 text-muted flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Jump to channel or action…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder-subtle outline-none"
          />
          <kbd className="text-[10px] text-subtle bg-surface border border-border rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-1">
          {allItems.length === 0 ? (
            <p className="text-center text-sm text-subtle py-8">No results</p>
          ) : (
            groups.map((group) => (
              <div key={group.heading}>
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-subtle">{group.heading}</p>
                {group.items.map((item) => {
                  const idx = flatIdx++;
                  const isActive = idx === safeCursor;
                  return (
                    <button
                      key={item.id}
                      onMouseEnter={() => setCursor(idx)}
                      onClick={item.onSelect}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${isActive ? "bg-accent/10" : "hover:bg-surface-sunken"}`}
                    >
                      <item.icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-accent" : "text-subtle"}`} />
                      <span className="flex-1 min-w-0">
                        <span className={`text-sm font-medium ${isActive ? "text-accent" : "text-foreground"}`}>{item.label}</span>
                        {item.description && (
                          <span className="block text-xs text-subtle truncate">{item.description}</span>
                        )}
                      </span>
                      {isActive && <ChevronRight className="w-3.5 h-3.5 text-accent flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-accent/[0.08] flex items-center gap-4 text-[10px] text-subtle">
          <span><kbd className="bg-surface border border-border rounded px-1">↑↓</kbd> navigate</span>
          <span><kbd className="bg-surface border border-border rounded px-1">↵</kbd> select</span>
          <span><kbd className="bg-surface border border-border rounded px-1">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main ChatView ────────────────────────────────────────────────────────────

export function ChatView({ currentUserId, userRole: _userRole }: { currentUserId: string; userRole?: string }) {
  const canCall = true;
  const { startCall, busy: callBusy } = useCall();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [sending, setSending] = useState(false);
  const [composerUrgent, setComposerUrgent] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [showNewGroupDM, setShowNewGroupDM] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [showManageMembers, setShowManageMembers] = useState(false);
  const [typingNames, setTypingNames] = useState<Map<string, string>>(new Map());
  const [threadParentMsg, setThreadParentMsg] = useState<Message | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<Map<string, string>>(new Map());
  const [presenceData, setPresenceData] = useState<Record<string, { status: string; updatedAt: string }>>();

  // Drag-drop state
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  // AI Summarize state
  const [summarizing, setSummarizing] = useState(false);
  const [summaryResult, setSummaryResult] = useState<SummaryResult | null>(null);
  const [summaryMode, setSummaryMode] = useState<"summary" | "action-items" | "schedule-meeting">("summary");

  // Pinned messages panel
  const [showPins, setShowPins] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);

  // Group rename state
  const [renamingChannel, setRenamingChannel] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);

  // Voice note recording
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Sidebar search
  const [sidebarSearch, setSidebarSearch] = useState("");

  // Workspace member name map — used to derive correct DM display names
  const [dmMemberNames, setDmMemberNames] = useState<Map<string, string>>(new Map());

  // Local unread count overrides — incremented when socket messages arrive for non-selected channels,
  // reset to 0 when the channel is opened (cleared by merging into the channels state)
  const [localUnread, setLocalUnread] = useState<Map<string, number>>(new Map());
  // Message ids already counted toward a badge — dedupes across the two live
  // transports (Socket.IO and the per-user SSE stream) when both are active.
  const seenUnreadIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/workspace/members")
      .then((r) => r.json())
      .then((data: UserSummary[]) => {
        setDmMemberNames(new Map(data.map((u) => [u.id, u.fullName])));
      })
      .catch(() => {});
  }, []);

  // @mention autocomplete
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<{ id: string; fullName: string }[]>([]);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // @CyberSage bot state
  const [botResponding, setBotResponding] = useState(false);

  // Media picker (GIF / Sticker / Emoji)
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [mediaPickerTab, setMediaPickerTab] = useState<"gif" | "sticker" | "emoji">("gif");
  const [composerAttachment, setComposerAttachment] = useState<{ url: string; mime: string; name: string } | null>(null);

  const handleEmojiInsert = (emoji: string) => {
    const ref = composerRef.current;
    if (!ref) { setComposerText((prev) => prev + emoji); return; }
    const start = ref.selectionStart ?? composerText.length;
    const end = ref.selectionEnd ?? composerText.length;
    const newText = composerText.slice(0, start) + emoji + composerText.slice(end);
    setComposerText(newText);
    requestAnimationFrame(() => {
      ref.focus();
      ref.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  // Web Push subscription state
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lastTypingSent = useRef(0);
  const threadParentIdRef = useRef<string | null>(null);

  const selectedChannel = channels.find((c) => c.id === selectedChannelId);

  // Header display name — for DMs ALWAYS show the OTHER person's name. The stored
  // channel name was set from the creator's perspective, so the recipient would
  // otherwise see their own name at the top of the conversation.
  const selectedChannelName = (() => {
    if (!selectedChannel) return "";
    if (selectedChannel.type === "DIRECT") {
      const other = selectedChannel.members.find((m) => m.userId !== currentUserId);
      const otherName = other ? dmMemberNames.get(other.userId) : null;
      if (otherName) return otherName;
    }
    return selectedChannel.name;
  })();

  // Keep ref in sync for SSE closure
  useEffect(() => {
    threadParentIdRef.current = threadParentMsg?.id ?? null;
  }, [threadParentMsg]);

  // Focus the composer as soon as a "reply to" quote is selected
  useEffect(() => {
    if (replyingTo) composerRef.current?.focus();
  }, [replyingTo]);

  const loadChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/channels");
      if (res.ok) {
        setChannels((await res.json()) as Channel[]);
        // Server-side unreadCount is authoritative and already includes any
        // messages we counted locally — drop local increments so badges don't
        // double-count after a refresh.
        setLocalUnread(new Map());
      }
    } catch {
      toast.error("Failed to load channels");
    }
  }, []);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  // Periodic channel-list refresh — keeps unread badges honest and picks up
  // brand-new channels (e.g. a DM someone just started with you) that the
  // per-user stream connected before knowing about.
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void loadChannels();
    }, 30_000);
    return () => clearInterval(interval);
  }, [loadChannels]);

  // Deep link support: /chat?channel=<id> (used by notification popups)
  const searchParams = useSearchParams();
  const [pendingDeepLink, setPendingDeepLink] = useState<string | null>(null);
  useEffect(() => {
    const target = searchParams?.get("channel");
    if (target) setPendingDeepLink(target);
  }, [searchParams]);
  useEffect(() => {
    if (!pendingDeepLink) return;
    if (channels.some((c) => c.id === pendingDeepLink)) {
      setSelectedChannelId(pendingDeepLink);
      setPendingDeepLink(null);
    }
  }, [pendingDeepLink, channels]);

  // Global ⌘K / Ctrl+K command palette shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowCommandPalette((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Check if web push is already subscribed
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    navigator.serviceWorker.ready.then((sw) =>
      sw.pushManager.getSubscription().then((sub) => setPushEnabled(!!sub))
    ).catch(() => {});
  }, []);

  const togglePush = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast.error("Push notifications are not supported in this browser");
      return;
    }
    setPushLoading(true);
    try {
      const sw = await navigator.serviceWorker.ready;
      const existing = await sw.pushManager.getSubscription();
      if (existing) {
        await existing.unsubscribe();
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: existing.endpoint }) });
        setPushEnabled(false);
        toast.success("Push notifications disabled");
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") { toast.error("Notification permission denied"); return; }
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidKey) { toast.error("Push not configured (missing VAPID key)"); return; }
        const sub = await sw.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKey,
        });
        await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
        setPushEnabled(true);
        toast.success("Push notifications enabled for urgent messages");
      }
    } catch (e) {
      toast.error("Failed to update push subscription");
      console.error(e);
    } finally {
      setPushLoading(false);
    }
  };

  // Socket.IO connection — one socket for the whole session, channels managed via join/leave
  useEffect(() => {
    const socket = connectSocket();
    socketRef.current = socket;
    return () => {
      disconnectSocket();
      socketRef.current = null;
    };
  }, []);

  // Join ALL channel rooms on load so we can receive messages for unread badge tracking.
  // We don't set up full message handlers here — just increment localUnread for non-selected channels.
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || channels.length === 0) return;

    const nonSelected = channels.filter((c) => c.id !== selectedChannelId);
    nonSelected.forEach((c) => socket.emit("chat:join", { channelId: c.id }));

    const onGlobalMessage = (msg: { channelId?: string; id?: string; userId?: string }) => {
      const chId = msg.channelId;
      if (!chId || chId === selectedChannelId) return;
      // Never count your own messages (e.g. sent from another tab/device) as unread
      if (msg.userId && msg.userId === currentUserId) return;
      if (msg.id) {
        if (seenUnreadIdsRef.current.has(msg.id)) return;
        seenUnreadIdsRef.current.add(msg.id);
      }
      setLocalUnread((prev) => {
        const m = new Map(prev);
        m.set(chId, (m.get(chId) ?? 0) + 1);
        return m;
      });
    };

    socket.on("chat:message", onGlobalMessage);

    const onSocketReconnect = () => {
      nonSelected.forEach((c) => socket.emit("chat:join", { channelId: c.id }));
    };
    // Re-join on reconnect; if already connected, the emit above is buffered/sent immediately
    socket.on("connect", onSocketReconnect);

    return () => {
      socket.off("chat:message", onGlobalMessage);
      socket.off("connect", onSocketReconnect);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels.length, selectedChannelId]);

  // Refs mirroring state — lets the per-user SSE stream below stay open for the
  // whole session instead of reconnecting every time the selection changes.
  const selectedChannelIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedChannelIdRef.current = selectedChannelId;
  }, [selectedChannelId]);
  const channelsRef = useRef<Channel[]>([]);
  useEffect(() => {
    channelsRef.current = channels;
  }, [channels]);

  // Per-user SSE stream (/api/chat/stream) — the production transport for
  // messages in channels you DON'T have open. Socket.IO above only works when a
  // dedicated socket server is configured (NEXT_PUBLIC_SOCKET_URL); on Vercel it
  // never connects, so without this stream a DM to a non-selected channel showed
  // no badge and no popup until a full reload. Badge increments are deduped by
  // message id against the socket path, so both transports can coexist.
  useEffect(() => {
    const source = new EventSource("/api/chat/stream");

    source.addEventListener("message", (e) => {
      try {
        const msg = JSON.parse((e as MessageEvent).data) as {
          id?: string;
          channelId?: string;
          userId?: string;
        };
        const chId = msg.channelId;
        if (!chId || !msg.id) return;
        // Own messages (other tab/device) are never unread
        if (msg.userId === currentUserId) return;
        // The open conversation is handled by the per-channel stream/poll
        if (chId === selectedChannelIdRef.current) return;
        if (seenUnreadIdsRef.current.has(msg.id)) return;
        seenUnreadIdsRef.current.add(msg.id);
        // Brand-new channel (e.g. a DM just started with you) — refresh the list
        if (!channelsRef.current.some((c) => c.id === chId)) void loadChannels();
        setLocalUnread((prev) => {
          const m = new Map(prev);
          m.set(chId, (m.get(chId) ?? 0) + 1);
          return m;
        });
      } catch {
        // ignore malformed events
      }
    });

    source.onerror = () => {
      // EventSource auto-reconnects (Vercel's function cap forces periodic
      // reconnects, which also re-snapshots channel memberships server-side).
    };

    return () => source.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  // Clear local unread when a channel is selected
  useEffect(() => {
    if (!selectedChannelId) return;
    // Tell NotificationCenter which conversation is on screen so it doesn't
    // pop toasts/urgent prompts for messages the user is already reading.
    window.__activeChatChannelId = selectedChannelId;
    setLocalUnread((prev) => {
      if (!prev.has(selectedChannelId)) return prev;
      const m = new Map(prev);
      m.delete(selectedChannelId);
      return m;
    });
    // Also clear server-side unreadCount so it resets on next channel load
    setChannels((prev) =>
      prev.map((c) => (c.id === selectedChannelId ? { ...c, unreadCount: 0 } : c))
    );
    // Persist lastReadAt so badge stays clear on next page load
    fetch(`/api/chat/channels/${selectedChannelId}/read`, { method: 'POST' }).catch(() => {});
    return () => {
      window.__activeChatChannelId = null;
      // Mark read again on leave — messages that arrived WHILE this channel was
      // open are after the lastReadAt set above, and would otherwise reappear
      // as unread on the next page load. keepalive lets it survive navigation.
      fetch(`/api/chat/channels/${selectedChannelId}/read`, { method: 'POST', keepalive: true }).catch(() => {});
    };
  }, [selectedChannelId]);

  // Global presence: poll Redis-backed presence for all channel members every 60s
  useEffect(() => {
    const allMemberIds = Array.from(
      new Set(channels.flatMap((c) => c.members.map((m) => m.userId)).filter((id) => id !== currentUserId))
    );
    if (allMemberIds.length === 0) return;

    const fetchGlobalPresence = async () => {
      try {
        const res = await fetch(`/api/presence?userIds=${encodeURIComponent(allMemberIds.join(","))}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json() as Record<string, { status: string; updatedAt: string }>;
        setPresenceData(data);
        // Build onlineUsers map: only users with status "online"
        const online = new Map<string, string>();
        for (const [uid, p] of Object.entries(data)) {
          if (p.status === "online" || p.status === "away" || p.status === "busy" || p.status === "in_meeting") {
            online.set(uid, uid); // value not used for display
          }
        }
        setOnlineUsers(online);
      } catch {
        // ignore
      }
    };

    // Also send our own heartbeat (supplements PresenceStatusPicker)
    const sendHeartbeat = () =>
      fetch("/api/presence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ heartbeat: true }) }).catch(() => {});

    fetchGlobalPresence();
    sendHeartbeat();

    const presenceInterval = setInterval(fetchGlobalPresence, 60_000);
    const heartbeatInterval = setInterval(sendHeartbeat, 240_000);

    return () => {
      clearInterval(presenceInterval);
      clearInterval(heartbeatInterval);
    };
  }, [channels, currentUserId]);

  // Load top-level messages when channel changes
  useEffect(() => {
    if (!selectedChannelId) return;

    setLoadingMessages(true);
    setMessages([]);
    setThreadParentMsg(null);
    setThreadMessages([]);
    setReplyingTo(null);

    fetch(`/api/chat/channels/${selectedChannelId}/messages`)
      .then((r) => r.json())
      .then((data) => setMessages(data as Message[]))
      .catch(() => toast.error("Failed to load messages"))
      .finally(() => setLoadingMessages(false));
  }, [selectedChannelId]);

  // Polling fallback — fetch new messages every 5 s in case the socket misses events
  useEffect(() => {
    if (!selectedChannelId) return;

    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      setMessages((current) => {
        if (current.length === 0) return current;
        const latest = current.reduce((a, b) =>
          new Date(a.createdAt) > new Date(b.createdAt) ? a : b
        );
        fetch(
          `/api/chat/channels/${selectedChannelId}/messages?after=${encodeURIComponent(latest.createdAt)}`
        )
          .then((r) => r.json())
          .then((incoming: Message[]) => {
            if (incoming.length === 0) return;
            setMessages((prev) => {
              const ids = new Set(prev.map((m) => m.id));
              const fresh = incoming.filter((m) => !ids.has(m.id));
              return fresh.length > 0 ? [...prev, ...fresh] : prev;
            });
          })
          .catch(() => {});
        return current; // no-op state update — we just needed the ref value
      });
    };

    const interval = setInterval(() => void poll(), 5_000);
    return () => clearInterval(interval);
  }, [selectedChannelId]);

  // Socket.IO channel subscription — join/leave rooms, register event handlers
  useEffect(() => {
    if (!selectedChannelId) return;
    const socket = socketRef.current;
    if (!socket) return;

    socket.emit("chat:join", { channelId: selectedChannelId });

    // Re-join the channel room after socket reconnects (server-side room state is lost on reconnect)
    const onReconnect = () => {
      socket.emit("chat:join", { channelId: selectedChannelId });
    };
    socket.on("connect", onReconnect);

    const onMessage = (msg: Message) => {
      // Ignore messages from other channel rooms (we joined all rooms for unread tracking)
      if (msg.channelId !== selectedChannelId) return;
      if (msg.parentId) {
        if (threadParentIdRef.current === msg.parentId) {
          setThreadMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.parentId
              ? { ...m, replies: [...m.replies.filter((r) => r.id !== msg.id), { id: msg.id }] }
              : m
          )
        );
      } else {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
    };

    const onMessageUpdated = (updated: Message) => {
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      setThreadMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    };

    const onMessageDeleted = ({ id }: { id: string }) => {
      const now = new Date().toISOString();
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, deletedAt: now } : m)));
      setThreadMessages((prev) => prev.map((m) => (m.id === id ? { ...m, deletedAt: now } : m)));
    };

    const onReactionsUpdated = ({ messageId, reactions }: { messageId: string; reactions: Reaction[] }) => {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
      setThreadMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
    };

    const onRead = ({ userId, fullName, messageIds, readAt }: { userId: string; fullName: string; messageIds: string[]; readAt: string }) => {
      const applyRead = (m: Message) => {
        if (!messageIds.includes(m.id)) return m;
        const existing = m.readBy ?? [];
        if (existing.some((r) => r.userId === userId)) return m;
        return { ...m, readBy: [...existing, { userId, readAt, user: { fullName } }] };
      };
      setMessages((prev) => prev.map(applyRead));
      setThreadMessages((prev) => prev.map(applyRead));
    };

    const onPresence = ({ userId, fullName, online }: { userId: string; fullName: string; online: boolean }) => {
      setOnlineUsers((prev) => {
        const m = new Map(prev);
        if (online) m.set(userId, fullName);
        else m.delete(userId);
        return m;
      });
    };

    const onTyping = ({ userId, fullName, channelId: typingChannelId }: { userId: string; fullName: string; channelId?: string }) => {
      if (userId === currentUserId) return;
      if (typingChannelId && typingChannelId !== selectedChannelId) return;
      const existing = typingTimers.current.get(userId);
      if (existing) clearTimeout(existing);
      setTypingNames((prev) => { const m = new Map(prev); m.set(userId, fullName); return m; });
      const timer = setTimeout(() => {
        setTypingNames((prev) => { const m = new Map(prev); m.delete(userId); return m; });
        typingTimers.current.delete(userId);
      }, 3_000);
      typingTimers.current.set(userId, timer);
    };

    socket.on("chat:message", onMessage);
    socket.on("chat:message_updated", onMessageUpdated);
    socket.on("chat:message_deleted", onMessageDeleted);
    socket.on("chat:reactions_updated", onReactionsUpdated);
    socket.on("chat:read", onRead);
    socket.on("chat:presence", onPresence);
    socket.on("chat:typing", onTyping);

    return () => {
      socket.emit("chat:leave", { channelId: selectedChannelId });
      socket.off("connect", onReconnect);
      socket.off("chat:message", onMessage);
      socket.off("chat:message_updated", onMessageUpdated);
      socket.off("chat:message_deleted", onMessageDeleted);
      socket.off("chat:reactions_updated", onReactionsUpdated);
      socket.off("chat:read", onRead);
      socket.off("chat:presence", onPresence);
      socket.off("chat:typing", onTyping);
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const timers = typingTimers.current;
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      setTypingNames(new Map());
    };
  }, [selectedChannelId, currentUserId]);

  // Live updates via SSE — this is the transport that actually works in production.
  // Socket.IO (above) requires a separately-hosted always-on server (NEXT_PUBLIC_SOCKET_URL);
  // on Vercel that env var is unset and the socket never connects, so without this SSE
  // fallback new messages and reactions would only ever appear after a full page reload.
  // The stream re-broadcasts the same Redis pub/sub events the API routes already publish
  // (see /api/chat/channels/[id]/stream), so both transports can safely coexist — message
  // appends are deduped by id and reaction/edit updates are idempotent.
  useEffect(() => {
    if (!selectedChannelId) return;

    const source = new EventSource(`/api/chat/channels/${selectedChannelId}/stream`);

    source.addEventListener("message", (e) => {
      const msg = JSON.parse((e as MessageEvent).data) as Message;
      if (msg.channelId !== selectedChannelId) return;
      if (msg.parentId) {
        if (threadParentIdRef.current === msg.parentId) {
          setThreadMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.parentId
              ? { ...m, replies: [...m.replies.filter((r) => r.id !== msg.id), { id: msg.id }] }
              : m
          )
        );
      } else {
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      }
    });

    source.addEventListener("message_updated", (e) => {
      const updated = JSON.parse((e as MessageEvent).data) as Message;
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      setThreadMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    });

    source.addEventListener("message_deleted", (e) => {
      const { id } = JSON.parse((e as MessageEvent).data) as { id: string };
      const now = new Date().toISOString();
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, deletedAt: now } : m)));
      setThreadMessages((prev) => prev.map((m) => (m.id === id ? { ...m, deletedAt: now } : m)));
    });

    source.addEventListener("reactions_updated", (e) => {
      const { messageId, reactions } = JSON.parse((e as MessageEvent).data) as { messageId: string; reactions: Reaction[] };
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
      setThreadMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
    });

    source.addEventListener("read", (e) => {
      const { userId, fullName, messageIds, readAt } = JSON.parse((e as MessageEvent).data) as {
        userId: string;
        fullName: string;
        messageIds: string[];
        readAt: string;
      };
      const applyRead = (m: Message) => {
        if (!messageIds.includes(m.id)) return m;
        const existing = m.readBy ?? [];
        if (existing.some((r) => r.userId === userId)) return m;
        return { ...m, readBy: [...existing, { userId, readAt, user: { fullName } }] };
      };
      setMessages((prev) => prev.map(applyRead));
      setThreadMessages((prev) => prev.map(applyRead));
    });

    source.onerror = () => {
      // EventSource auto-reconnects on transient errors/timeouts (e.g. the 30s
      // Vercel function duration cap); nothing to do here but avoid noisy logs.
    };

    return () => source.close();
  }, [selectedChannelId]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!composerText.trim() && !composerAttachment) return;
    if (!selectedChannelId || sending) return;
    setSending(true);
    const text = composerText;
    const attachment = composerAttachment;
    const quotedMessageId = replyingTo?.id;
    setComposerText("");
    setComposerAttachment(null);
    setReplyingTo(null);
    try {
      const urgent = composerUrgent;
      setComposerUrgent(false);
      const res = await fetch(`/api/chat/channels/${selectedChannelId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: text,
          isUrgent: urgent,
          ...(quotedMessageId ? { quotedMessageId } : {}),
          ...(attachment ? { attachmentUrl: attachment.url, attachmentMime: attachment.mime, attachmentName: attachment.name } : {}),
        }),
      });
      if (!res.ok) throw new Error("Failed");

      // Add sent message to UI immediately (socket may be delayed or unavailable)
      const newMsg = (await res.json()) as Message;
      setMessages((prev) => prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]);

      // @CyberSage bot: detect mention and auto-respond
      const botMentionMatch = text.match(/^@CyberSage\s+([\s\S]+)/i);
      if (botMentionMatch) {
        const question = botMentionMatch[1].trim();
        setBotResponding(true);
        try {
          const aiRes = await fetch("/api/ai/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: question }),
          });
          const aiData = (await aiRes.json()) as { reply?: string; error?: string };
          if (aiData.reply) {
            const botContent = `[BOT_RESPONSE] ${JSON.stringify({ from: "CyberSage AI", text: aiData.reply })}`;
            await fetch(`/api/chat/channels/${selectedChannelId}/messages`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content: botContent }),
            });
          }
        } catch {
          // bot error is non-critical — don't toast
        } finally {
          setBotResponding(false);
        }
      }
    } catch {
      toast.error("Failed to send message");
      setComposerText(text);
    } finally {
      setSending(false);
    }
  };

  const handleComposerChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setComposerText(val);
    const now = Date.now();
    if (selectedChannelId && now - lastTypingSent.current > 2000) {
      lastTypingSent.current = now;
      socketRef.current?.emit("chat:typing", { channelId: selectedChannelId });
    }
    void handleMentionInput(val);
  };

  const handleReact = async (messageId: string, emoji: string) => {
    // Optimistic toggle — don't wait on the SSE round-trip to show your own reaction.
    // The server's authoritative reaction list (via POST response + SSE broadcast)
    // fully replaces this entry moments later, so no reconciliation is needed.
    const applyOptimistic = (list: Message[]) =>
      list.map((m) => {
        if (m.id !== messageId) return m;
        const already = m.reactions.find((r) => r.emoji === emoji && r.user.id === currentUserId);
        return {
          ...m,
          reactions: already
            ? m.reactions.filter((r) => r.id !== already.id)
            : [...m.reactions, { id: `optimistic-${Date.now()}`, emoji, user: { id: currentUserId, fullName: "You" } }],
        };
      });
    setMessages(applyOptimistic);
    setThreadMessages(applyOptimistic);

    try {
      const res = await fetch(`/api/chat/messages/${messageId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      if (!res.ok) throw new Error("Failed");
      const { reactions } = (await res.json()) as { reactions: Reaction[] };
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
      setThreadMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
    } catch {
      toast.error("Failed to react");
      // Roll back the optimistic toggle by re-applying it (toggle is its own inverse)
      setMessages(applyOptimistic);
      setThreadMessages(applyOptimistic);
    }
  };

  const handleEdit = async (messageId: string, content: string) => {
    try {
      await fetch(`/api/chat/messages/${messageId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
    } catch {
      toast.error("Failed to edit message");
    }
  };

  const handleDelete = async (messageId: string) => {
    try {
      const res = await fetch(`/api/chat/messages/${messageId}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Failed");
      const now = new Date().toISOString();
      setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, deletedAt: now } : m));
      setThreadMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, deletedAt: now } : m));
    } catch {
      toast.error("Failed to delete message");
    }
  };

  const handlePin = async (messageId: string, pinned: boolean) => {
    try {
      await fetch(`/api/chat/messages/${messageId}/pin`, { method: pinned ? "POST" : "DELETE" });
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isPinned: pinned } : m));
      if (pinned) toast.success("Message pinned");
      else { toast.success("Message unpinned"); setPinnedMessages(prev => prev.filter(m => m.id !== messageId)); }
      if (showPins && selectedChannelId) {
        const res = await fetch(`/api/chat/channels/${selectedChannelId}/pins`);
        if (res.ok) setPinnedMessages(await res.json());
      }
    } catch {
      toast.error("Failed to pin message");
    }
  };

  const loadPinnedMessages = async () => {
    if (!selectedChannelId) return;
    const res = await fetch(`/api/chat/channels/${selectedChannelId}/pins`);
    if (res.ok) setPinnedMessages(await res.json());
    setShowPins(true);
  };

  // Voice recording — use the first MIME type the browser supports
  const getAudioMime = () => {
    const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
    return types.find(t => MediaRecorder.isTypeSupported(t)) ?? "";
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Audio recording is not supported in this browser");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      toast.error("Audio recording is not supported in this browser");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = getAudioMime();
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mr.mimeType || "audio/webm" });
        setAudioBlob(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start(100); // collect chunks every 100ms for reliability
      setRecording(true);
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        toast.error("Microphone permission denied. Allow microphone access and try again.");
      } else {
        toast.error("Could not start recording. Check microphone permissions.");
      }
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const sendVoiceNote = async () => {
    if (!audioBlob || !selectedChannelId) return;
    setUploadingFile(true);
    try {
      const formData = new FormData();
      const ext = audioBlob.type.includes("mp4") ? "mp4" : audioBlob.type.includes("ogg") ? "ogg" : "webm";
      formData.append("file", audioBlob, `voice-note.${ext}`);
      const uploadRes = await fetch("/api/drive/upload", { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const fileRecord = await uploadRes.json() as { id: string; name: string; size: string; mimeType: string; storageUrl?: string };
      const content = "[FILE_ATTACHMENT] " + JSON.stringify({ name: "Voice Note", size: parseInt(fileRecord.size, 10), mimeType: fileRecord.mimeType || audioBlob.type || "audio/webm", url: fileRecord.storageUrl, fileId: fileRecord.id });
      await fetch(`/api/chat/channels/${selectedChannelId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      setAudioBlob(null);
      toast.success("Voice note sent");
    } catch {
      toast.error("Failed to send voice note");
    } finally {
      setUploadingFile(false);
    }
  };

  // @mention autocomplete (includes @here and @channel smart mentions)
  const SMART_MENTIONS = [
    { id: "@here", fullName: "here — notify online members" },
    { id: "@channel", fullName: "channel — notify all members" },
  ];

  const handleMentionInput = async (text: string) => {
    const mentionMatch = text.match(/@(\w*)$/);
    if (!mentionMatch) { setMentionQuery(null); return; }
    const q = mentionMatch[1].toLowerCase();
    setMentionQuery(q);
    if (!selectedChannelId) return;
    const smart = SMART_MENTIONS.filter((s) => s.id.slice(1).startsWith(q));
    const res = await fetch(`/api/chat/channels/${selectedChannelId}/mentions?q=${encodeURIComponent(q)}`).catch(() => null);
    const members: { id: string; fullName: string }[] = res?.ok ? await res.json() : [];
    setMentionResults([...smart, ...members]);
  };

  const insertMention = (name: string) => {
    const bare = name.startsWith("@") ? name.slice(1) : name;
    const text = composerText.replace(/@(\w*)$/, `@${bare} `);
    setComposerText(text);
    setMentionQuery(null);
    composerRef.current?.focus();
  };

  const openThread = async (msg: Message) => {
    setThreadParentMsg(msg);
    setThreadMessages([]);
    try {
      const res = await fetch(
        `/api/chat/channels/${msg.channelId}/messages?parentId=${msg.id}`
      );
      if (res.ok) setThreadMessages((await res.json()) as Message[]);
    } catch {
      toast.error("Failed to load thread");
    }
  };

  // ─── Drag-Drop Handlers ────────────────────────────────────────────────────

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleChatFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChannelId) return;
    if (chatFileInputRef.current) chatFileInputRef.current.value = "";
    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/drive/upload", { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const fileRecord = (await uploadRes.json()) as { id: string; name: string; size: string; mimeType: string; storageUrl?: string };
      const attachmentContent = "[FILE_ATTACHMENT] " + JSON.stringify({ name: fileRecord.name, size: parseInt(fileRecord.size, 10), mimeType: fileRecord.mimeType, url: fileRecord.storageUrl, fileId: fileRecord.id });
      await fetch(`/api/chat/channels/${selectedChannelId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: attachmentContent }) });
      toast.success(`${file.name} shared`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingFile(false);
    }
  };

  const handleRenameChannel = async () => {
    if (!selectedChannelId || !renameValue.trim()) return;
    setRenameSaving(true);
    try {
      const res = await fetch(`/api/chat/channels/${selectedChannelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      if (!res.ok) { const e = await res.json() as { error?: string }; throw new Error(e.error ?? "Failed"); }
      setChannels(prev => prev.map(c => c.id === selectedChannelId ? { ...c, name: renameValue.trim() } : c));
      setRenamingChannel(false);
      toast.success("Group renamed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not rename");
    } finally {
      setRenameSaving(false);
    }
  };

  const handleDeleteChannel = async () => {
    if (!selectedChannelId || !selectedChannel) return;
    if (!confirm(`Delete #${selectedChannel.name}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/chat/channels/${selectedChannelId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      setChannels(prev => prev.filter(c => c.id !== selectedChannelId));
      setSelectedChannelId(null);
      toast.success("Channel deleted");
    } catch {
      toast.error("Could not delete channel");
    }
  };

  const handleLeaveChannel = async () => {
    if (!selectedChannelId || !selectedChannel) return;
    if (!confirm(`Leave "${selectedChannel.name}"? You'll need to be re-added to rejoin.`)) return;
    try {
      const res = await fetch(`/api/chat/channels/${selectedChannelId}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUserId }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})) as { error?: string }; throw new Error(e.error ?? "Failed"); }
      setChannels(prev => prev.filter(c => c.id !== selectedChannelId));
      setSelectedChannelId(null);
      toast.success("Left the group");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not leave group");
    }
  };

  const handleChangeMemberRole = async (userId: string, role: "ADMIN" | "MEMBER") => {
    if (!selectedChannelId) return;
    try {
      const res = await fetch(`/api/chat/channels/${selectedChannelId}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})) as { error?: string }; throw new Error(e.error ?? "Failed"); }
      setChannels(prev => prev.map(c => c.id === selectedChannelId
        ? { ...c, members: c.members.map(m => m.userId === userId ? { ...m, role } : m) }
        : c));
      toast.success(role === "ADMIN" ? "Promoted to admin" : "Removed as admin");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update role");
    }
  };

  const handleRemoveMember = async (userId: string, name: string) => {
    if (!selectedChannelId) return;
    if (!confirm(`Remove ${name} from this group?`)) return;
    try {
      const res = await fetch(`/api/chat/channels/${selectedChannelId}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})) as { error?: string }; throw new Error(e.error ?? "Failed"); }
      setChannels(prev => prev.map(c => c.id === selectedChannelId
        ? { ...c, members: c.members.filter(m => m.userId !== userId) }
        : c));
      toast.success(`Removed ${name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove member");
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragOver(false);

    if (!selectedChannelId) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const file = files[0];
    setUploadingFile(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await fetch("/api/drive/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const errData = (await uploadRes.json()) as { error?: string };
        throw new Error(errData.error ?? "Upload failed");
      }

      const fileRecord = (await uploadRes.json()) as {
        id: string;
        name: string;
        size: string;
        mimeType: string;
        storageUrl?: string;
      };

      // Post a chat message with file attachment info
      const attachmentContent =
        "[FILE_ATTACHMENT] " +
        JSON.stringify({
          name: fileRecord.name,
          size: parseInt(fileRecord.size, 10),
          mimeType: fileRecord.mimeType,
          url: fileRecord.storageUrl,
          fileId: fileRecord.id,
        });

      const msgRes = await fetch(`/api/chat/channels/${selectedChannelId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: attachmentContent }),
      });

      if (!msgRes.ok) throw new Error("Failed to send file message");
      toast.success(`${file.name} uploaded and shared`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      toast.error(msg);
    } finally {
      setUploadingFile(false);
    }
  };

  // ─── AI Summarize ──────────────────────────────────────────────────────────

  const handleSummarize = async (mode: "summary" | "action-items" | "schedule-meeting" = summaryMode) => {
    if (!selectedChannelId || messages.length === 0) {
      toast.error("No messages to summarize");
      return;
    }
    setSummarizing(true);
    setSummaryMode(mode);
    try {
      const res = await fetch("/api/ai/chat-summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: selectedChannelId, mode }),
      });

      if (!res.ok) {
        const errData = (await res.json()) as { error?: string };
        throw new Error(errData.error ?? "AI unavailable");
      }

      const data = (await res.json()) as { result: string };
      // Adapt free-text result to the SummaryResult shape
      setSummaryResult({
        summary: data.result,
        keyPoints: [],
        actionItems: [],
        sentiment: "neutral",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to summarize";
      toast.error(msg);
    } finally {
      setSummarizing(false);
    }
  };

  // Collect unique member names from loaded messages for @mention highlighting
  const memberNames = [...new Set(messages.map(m => m.user.fullName))];

  // Build messages list with date separators
  type ListItem =
    | { type: "separator"; label: string; key: string }
    | { type: "message"; msg: Message; grouped: boolean };

  /**
   * Consecutive messages from one person inside this window collapse into a
   * single visual block — one avatar, one name, one timestamp.
   *
   * Without it every line repeats the author's avatar and name, and a
   * three-message thought reads as three separate events. This is the single
   * biggest difference between a chat log and an audit log.
   */
  const GROUP_WINDOW_MS = 5 * 60 * 1000;

  const listItems: ListItem[] = [];
  let lastDateLabel = "";
  let prev: Message | null = null;

  for (const msg of messages) {
    const label = dateSeparatorLabel(msg.createdAt);
    const newDay = label !== lastDateLabel;
    if (newDay) {
      listItems.push({ type: "separator", label, key: `sep-${msg.id}` });
      lastDateLabel = label;
    }

    // Anything carrying its own chrome breaks the group: a date divider above
    // it, an urgent flag, a quote card, or a call log all need their own header
    // to make sense on their own.
    const grouped =
      !newDay &&
      prev !== null &&
      prev.userId === msg.userId &&
      !msg.isUrgent &&
      !prev.isUrgent &&
      !msg.quotedMessage &&
      !msg.content.startsWith("[CALL_LOG] ") &&
      !prev.content.startsWith("[CALL_LOG] ") &&
      new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() < GROUP_WINDOW_MS;

    listItems.push({ type: "message", msg, grouped });
    prev = msg;
  }
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;

  // Scroll a quoted/jump-to message into view and briefly highlight it.
  const scrollToMessage = (messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("bg-accent/10");
    setTimeout(() => el.classList.remove("bg-accent/10"), 1200);
  };

  // ─── Channel sections ──────────────────────────────────────────────────────
  // Merge server unreadCount with local (socket-tracked) unread increments
  const withUnread = (ch: Channel): Channel => ({
    ...ch,
    unreadCount: (ch.unreadCount ?? 0) + (localUnread.get(ch.id) ?? 0),
  });

  const publicChannels = channels.filter((c) => c.type === "CHANNEL").map(withUnread);
  const groupChannels = channels.filter((c) => c.type === "GROUP").map(withUnread);

  // For DMs, show the OTHER person's name (not the stored channel name which was
  // set from the creator's perspective and looks wrong to the recipient)
  const directChannels = channels
    .filter((c) => c.type === "DIRECT")
    .map((c) => {
      const other = c.members.find((m) => m.userId !== currentUserId);
      if (other) {
        const otherName = dmMemberNames.get(other.userId);
        if (otherName) return withUnread({ ...c, name: otherName.split(" ")[0] });
      }
      return withUnread(c);
    });

  return (
    // One continuous surface, no inter-column gap. The `lg:gap-2` here was what
    // separated the five floating cards; with the columns flush and divided by
    // hairlines, a gap would just reopen the seams.
    <div className="flex h-[calc(100vh-7.25rem)] lg:h-full bg-surface overflow-hidden">
      {/* Channel sidebar — full width on mobile when no channel, hidden when channel open */}
      <div className={`${selectedChannelId ? "hidden lg:flex" : "flex"} w-full lg:w-64 flex-shrink-0 bg-surface border-r border-border-soft flex-col overflow-y-auto overflow-x-hidden`}>
        {/* One search, not three.
            This column previously carried a "Messages" title, a ⌘K button AND a
            filter field — stacked directly under the shell's own search box, so
            the same screen offered four ways to search and no clue which did
            what. The field below filters THIS list; ⌘K (still bound globally)
            searches everything. The redundant title bar is gone. */}
        <div className="px-2.5 py-2.5 border-b border-border-soft flex-shrink-0">
          <div className="flex items-center gap-2 bg-surface-sunken border border-border rounded-lg px-2.5 py-1.5 focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/20 transition-colors">
            <Search className="w-3.5 h-3.5 text-subtle flex-shrink-0" />
            <input
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              placeholder="Filter conversations"
              aria-label="Filter conversations"
              className="flex-1 text-[13px] bg-transparent text-foreground placeholder-subtle outline-none"
            />
            {sidebarSearch && (
              <button
                onClick={() => setSidebarSearch("")}
                aria-label="Clear filter"
                className="text-subtle hover:text-muted"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-2.5">
          <ChannelSection
            label="Channels"
            channels={publicChannels.filter((c) => !sidebarSearch || c.name.toLowerCase().includes(sidebarSearch.toLowerCase()))}
            selectedChannelId={selectedChannelId}
            onlineUsers={onlineUsers}
            presenceData={presenceData}
            onSelect={setSelectedChannelId}
            onNew={sidebarSearch ? undefined : () => setShowNewChannel(true)}
            newTitle="New Channel"
            currentUserId={currentUserId}
          />

          <ChannelSection
            label="Direct messages"
            channels={directChannels.filter((c) => !sidebarSearch || c.name.toLowerCase().includes(sidebarSearch.toLowerCase()))}
            selectedChannelId={selectedChannelId}
            onlineUsers={onlineUsers}
            presenceData={presenceData}
            onSelect={setSelectedChannelId}
            onNew={sidebarSearch ? undefined : () => setShowNewGroupDM(true)}
            newTitle="New Direct Message"
            currentUserId={currentUserId}
          />

          <ChannelSection
            label="Groups"
            channels={groupChannels.filter((c) => !sidebarSearch || c.name.toLowerCase().includes(sidebarSearch.toLowerCase()))}
            selectedChannelId={selectedChannelId}
            onlineUsers={onlineUsers}
            presenceData={presenceData}
            onSelect={setSelectedChannelId}
            onNew={sidebarSearch ? undefined : () => setShowNewGroupDM(true)}
            newTitle="New Group"
            currentUserId={currentUserId}
          />

          {channels.length === 0 && (
            <p className="text-muted text-xs px-3 py-4 text-center">
              No channels yet.
              <br />
              Create one to get started.
            </p>
          )}
        </div>
      </div>

      {/* Main area — hidden on mobile when no channel selected */}
      {!selectedChannelId ? (
        <div className="hidden lg:flex flex-1 flex-col items-center justify-center text-muted bg-surface p-8">
          <MessageSquare className="w-16 h-16 mb-4 opacity-20" />
          <p className="text-lg font-medium">Select a channel</p>
          <p className="text-sm">Or create one from the sidebar.</p>
        </div>
      ) : (
        <>
          {/* Messages pane */}
          <div
            className="bg-surface flex-1 flex flex-col min-w-0 overflow-x-hidden relative"
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            {/* Drag-drop overlay */}
            {isDragOver && (
              <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
                <div className="absolute inset-4 border-2 border-dashed border-accent rounded-2xl bg-accent/10" />
                <div className="relative z-10 text-center">
                  <Paperclip className="w-8 h-8 mx-auto mb-2 text-accent" />
                  <p className="text-lg font-semibold text-accent">Drop to attach</p>
                  <p className="text-sm text-muted">File will be uploaded and shared in this channel</p>
                </div>
              </div>
            )}

            {/* Upload progress overlay */}
            {uploadingFile && (
              <div className="absolute inset-0 z-40 flex items-center justify-center bg-surface/80">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-accent" />
                  <p className="text-sm font-medium text-foreground">Uploading file…</p>
                </div>
              </div>
            )}

            {/* Channel header */}
            <div className="h-14 px-3 lg:px-5 border-b border-border bg-surface flex items-center gap-2 lg:gap-3 flex-shrink-0">
              {/* Mobile back button */}
              <button
                onClick={() => setSelectedChannelId(null)}
                className="lg:hidden flex-shrink-0 p-1.5 rounded-lg text-muted hover:bg-surface-sunken transition-colors"
                aria-label="Back to channels"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              {selectedChannel?.type === "DIRECT" || selectedChannel?.type === "GROUP" ? (
                <Users className="w-[18px] h-[18px] text-subtle flex-shrink-0" />
              ) : selectedChannel?.isBroadcast ? (
                <Megaphone className="w-[18px] h-[18px] text-subtle flex-shrink-0" />
              ) : (
                <span className="text-base font-semibold text-subtle leading-none flex-shrink-0">#</span>
              )}
              <div className="min-w-0 flex-1">
                {/* Inline rename input for GROUP channels */}
                {renamingChannel && selectedChannel?.type === "GROUP" ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") void handleRenameChannel();
                        if (e.key === "Escape") setRenamingChannel(false);
                      }}
                      className="flex-1 min-w-0 bg-surface-sunken border border-accent/50 rounded-lg px-2.5 py-1 text-sm font-bold text-foreground outline-none focus:border-accent max-w-[220px]"
                      placeholder="Group name…"
                    />
                    <button
                      onClick={() => void handleRenameChannel()}
                      disabled={renameSaving}
                      className="p-1.5 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-40"
                    >
                      {renameSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => setRenamingChannel(false)}
                      className="p-1.5 rounded-lg text-subtle hover:text-foreground hover:bg-surface-sunken transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-foreground text-[14.5px] truncate">{selectedChannelName}</h2>
                    {selectedChannel?.type === "DIRECT" && (
                      <span className="text-[10px] font-semibold text-subtle bg-surface-sunken border border-border px-1.5 py-0.5 rounded-full flex-shrink-0">DM</span>
                    )}
                    {selectedChannel?.type === "GROUP" && (
                      <>
                        <span className="text-[10px] font-semibold text-subtle bg-surface-sunken border border-border px-1.5 py-0.5 rounded-full flex-shrink-0">Group</span>
                        {/* Rename button — only for channel admin */}
                        {selectedChannel.members.find(m => m.userId === currentUserId)?.role === "ADMIN" && (
                          <button
                            onClick={() => { setRenameValue(selectedChannel.name); setRenamingChannel(true); }}
                            className="p-0.5 rounded text-subtle hover:text-accent transition-colors flex-shrink-0"
                            title="Rename group"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                        )}
                      </>
                    )}
                    {selectedChannel?.isBroadcast && (
                      <span className="text-[10px] font-semibold text-muted bg-surface-sunken border border-border px-1.5 py-0.5 rounded-full flex-shrink-0">Broadcast</span>
                    )}
                  </div>
                )}
                {!renamingChannel && (
                  <p className="text-xs text-subtle truncate mt-px">
                    {selectedChannel?.type === "DIRECT"
                      ? (() => {
                          const other = selectedChannel.members.find((m) => m.userId !== currentUserId);
                          if (!other) return "Direct Message";
                          const p = presenceData?.[other.userId];
                          if (!p || p.status === "offline") {
                            // Show "Last seen X ago" if we have a real timestamp
                            const ts = p?.updatedAt ? new Date(p.updatedAt) : null;
                            const now = Date.now();
                            const ageMs = ts ? now - ts.getTime() : null;
                            // If timestamp is very fresh (within 30s) it might be our fallback "now" — skip it
                            if (ts && ageMs !== null && ageMs > 30_000) {
                              return `Last seen ${formatDistanceToNow(ts, { addSuffix: true })}`;
                            }
                            return "Offline";
                          }
                          const labels: Record<string, string> = { online: "Online", away: "Away", busy: "Busy", in_meeting: "In a meeting", dnd: "Do not disturb" };
                          return labels[p.status] ?? "Online";
                        })()
                      : `${selectedChannel?.members.length ?? 0} member${(selectedChannel?.members.length ?? 0) === 1 ? "" : "s"}${onlineUsers.size > 0 ? ` · ${onlineUsers.size} online` : ""}`}
                    {selectedChannel?.type !== "DIRECT" && selectedChannel?.description ? ` · ${selectedChannel.description}` : ""}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Start a call — hidden for interns */}
                {canCall && (selectedChannel?.type === "DIRECT" || selectedChannel?.type === "GROUP") ? (
                  <>
                    <button
                      onClick={() => { if (selectedChannelId && selectedChannel) void startCall(selectedChannelId, selectedChannelName, "audio"); }}
                      disabled={callBusy}
                      title={`Voice call ${selectedChannelName}`}
                      className="w-9 h-9 flex items-center justify-center rounded-lg border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-40 transition-colors flex-shrink-0"
                    >
                      <Phone className="w-[18px] h-[18px]" />
                    </button>
                    <button
                      onClick={() => { if (selectedChannelId && selectedChannel) void startCall(selectedChannelId, selectedChannelName, "video"); }}
                      disabled={callBusy}
                      title={`Video call ${selectedChannelName}`}
                      className="w-9 h-9 flex items-center justify-center rounded-lg border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-40 transition-colors flex-shrink-0"
                    >
                      <Video className="w-[18px] h-[18px]" />
                    </button>
                  </>
                ) : canCall && selectedChannel ? (
                  <button
                    onClick={() => { if (selectedChannelId) window.open(`/meet/cybersage-${selectedChannelId}`, "_blank"); }}
                    title="Start a group call"
                    className="w-9 h-9 flex items-center justify-center rounded-lg border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20 transition-colors flex-shrink-0"
                  >
                    <Video className="w-[18px] h-[18px]" />
                  </button>
                ) : null}

                {/* AI Summarize dropdown */}
                <div className="relative group">
                  <button
                    onClick={() => void handleSummarize("summary")}
                    disabled={summarizing || messages.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border text-muted hover:bg-surface-sunken hover:text-foreground disabled:opacity-40 transition-colors"
                    title="AI tools"
                  >
                    {summarizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-accent" />}
                    <span className="hidden sm:inline">{summarizing ? "Thinking…" : "AI"}</span>
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  <div className="absolute right-0 top-full mt-1 w-44 bg-surface border border-border rounded-xl shadow-xl z-20 py-1 hidden group-hover:block">
                    {([
                      { mode: "summary" as const,           label: "Summarize channel" },
                      { mode: "action-items" as const,      label: "Extract action items" },
                      { mode: "schedule-meeting" as const,  label: "Draft meeting agenda" },
                    ]).map(({ mode, label }) => (
                      <button
                        key={mode}
                        onClick={() => void handleSummarize(mode)}
                        className="w-full text-left px-3 py-2 text-xs text-muted hover:bg-surface-sunken hover:text-foreground transition-colors"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pinned messages toggle */}
                <button
                  onClick={() => { if (showPins) setShowPins(false); else void loadPinnedMessages(); }}
                  className={`w-9 h-9 flex items-center justify-center rounded-lg border transition-colors flex-shrink-0 ${showPins ? "border-accent text-accent bg-accent/10" : "border-border bg-surface text-muted hover:bg-surface-sunken hover:text-foreground"}`}
                  title="Pinned messages"
                >
                  <Pin className="w-[18px] h-[18px]" />
                </button>


                {/* AI Summarize dropdown moved up; remaining utilities */}
                {/* Pinned messages toggle */}
                {/* Web Push toggle */}
                <button
                  onClick={() => void togglePush()}
                  disabled={pushLoading}
                  className={`w-9 h-9 flex items-center justify-center rounded-lg border transition-colors flex-shrink-0 ${pushEnabled ? "border-accent text-accent bg-accent/10" : "border-border bg-surface text-muted hover:bg-surface-sunken hover:text-foreground"} disabled:opacity-40`}
                  title={pushEnabled ? "Disable urgent push notifications" : "Enable push for urgent messages"}
                >
                  {pushLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (pushEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />)}
                </button>
                {selectedChannel?.type !== "DIRECT" && (
                  <button
                    onClick={() => setShowAddMembers(true)}
                    className="w-9 h-9 flex items-center justify-center rounded-lg border border-border bg-surface text-muted hover:bg-surface-sunken hover:text-foreground transition-colors flex-shrink-0"
                    title="Add members"
                  >
                    <UserPlus className="w-[18px] h-[18px]" />
                  </button>
                )}
              {/* Manage members — view roster, promote/demote, remove members */}
              {selectedChannel?.type !== "DIRECT" && (
                <button
                  onClick={() => setShowManageMembers(true)}
                  className="w-9 h-9 flex items-center justify-center rounded-lg border border-border bg-surface text-muted hover:bg-surface-sunken hover:text-foreground transition-colors flex-shrink-0"
                  title="Manage members"
                >
                  <Settings className="w-[18px] h-[18px]" />
                </button>
              )}
              {/* Leave group — available to any member of a GROUP channel */}
              {selectedChannel?.type === "GROUP" && (
                <button
                  onClick={() => void handleLeaveChannel()}
                  title="Leave group"
                  className="w-9 h-9 flex items-center justify-center rounded-lg border border-border bg-surface text-muted hover:bg-crit/10 hover:text-crit hover:border-crit/40 transition-colors flex-shrink-0"
                >
                  <LogOut className="w-[18px] h-[18px]" />
                </button>
              )}
              {/* Delete channel — only visible to channel admins */}
              {selectedChannel?.type !== "DIRECT" && selectedChannel?.members?.find(m => m.userId === currentUserId)?.role === "ADMIN" && (
                <button
                  onClick={() => void handleDeleteChannel()}
                  title="Delete channel"
                  className="w-9 h-9 flex items-center justify-center rounded-lg border border-crit/40 text-crit hover:bg-crit/10 transition-colors flex-shrink-0"
                >
                  <Trash2 className="w-[18px] h-[18px]" />
                </button>
              )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden py-2 bg-surface">
              {loadingMessages ? (
                <div className="text-center text-muted py-8 text-sm">Loading messages…</div>
              ) : messages.length === 0 ? (
                <div className="text-center text-muted py-12">
                  <Hash className="w-10 h-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No messages yet. Say hello!</p>
                </div>
              ) : (
                listItems.map((item) =>
                  item.type === "separator" ? (
                    <DateSeparator key={item.key} label={item.label} />
                  ) : (
                    <MessageItem
                      key={item.msg.id}
                      msg={item.msg}
                      currentUserId={currentUserId}
                      onReact={handleReact}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onReply={selectedChannel?.type !== "DIRECT" ? openThread : undefined}
                      onQuoteReply={setReplyingTo}
                      onJumpTo={scrollToMessage}
                      onPin={handlePin}
                      memberNames={memberNames}
                      isGroupChat={selectedChannel?.type !== "DIRECT"}
                      isLastInChannel={item.msg.id === lastMessageId}
                      isContinuation={item.grouped}
                    />
                  )
                )
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Typing / bot indicator */}
            <div className="px-6 py-2 h-7 flex items-center flex-shrink-0 bg-surface">
              {botResponding ? (
                <p className="text-xs text-muted italic animate-pulse flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-accent" /> CyberSage AI is thinking…
                </p>
              ) : typingNames.size > 0 && (
                <p className="text-xs text-muted italic animate-pulse">
                  {Array.from(typingNames.values()).join(", ")}{" "}
                  {typingNames.size === 1 ? "is" : "are"} typing…
                </p>
              )}
            </div>

            {/* Broadcast read-only notice for non-admin members */}
            {selectedChannel?.isBroadcast && selectedChannel.members.find(m => m.userId === currentUserId)?.role !== "ADMIN" ? (
              <div className="px-4 py-4 border-t border-border bg-surface flex-shrink-0 flex items-center justify-center gap-3">
                <Megaphone className="w-4 h-4 text-muted shrink-0" />
                <p className="text-sm text-muted">
                  This is a broadcast channel — only the owner can post.
                </p>
              </div>
            ) : (
            <>
            {/* Composer */}
            <div className="px-6 pt-3.5 pb-5 bg-surface flex-shrink-0">
              {/* Voice note preview */}
              {audioBlob && (
                <div className="flex items-center gap-3 mb-2 bg-surface border border-border rounded-lg px-3 py-2">
                  <audio src={URL.createObjectURL(audioBlob)} controls className="flex-1 h-8" />
                  <button onClick={() => void sendVoiceNote()} disabled={uploadingFile} className="bg-accent text-accent-foreground px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40">Send</button>
                  <button onClick={() => setAudioBlob(null)} className="text-muted hover:text-crit"><X className="w-4 h-4" /></button>
                </div>
              )}

              {/* "Replying to" quote banner — appears once a message's hover Reply
                  button is clicked; sending the composer attaches quotedMessageId
                  so the sent message renders with an inline quote card. */}
              {replyingTo && (
                <div className="flex items-center gap-2 mb-2 bg-surface-sunken border-l-2 border-accent rounded-lg pl-3 pr-2 py-2">
                  <ReplyIcon className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11.5px] font-semibold text-accent">
                      Replying to {replyingTo.userId === currentUserId ? "yourself" : replyingTo.user.fullName}
                    </p>
                    <p className="truncate text-[12.5px] text-muted">
                      {replyingTo.deletedAt ? "(message deleted)" : replyingTo.content || "Attachment"}
                    </p>
                  </div>
                  <button
                    onClick={() => setReplyingTo(null)}
                    className="text-muted hover:text-foreground flex-shrink-0"
                    title="Cancel reply"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="relative">
                {/* @mention autocomplete */}
                {mentionQuery !== null && mentionResults.length > 0 && (
                  <div className="absolute bottom-full left-0 mb-1 w-64 bg-surface border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                    {mentionResults.map(u => (
                      <button
                        key={u.id}
                        onClick={() => insertMention(u.fullName)}
                        className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-surface-sunken flex items-center gap-2"
                      >
                        <span className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-semibold flex-shrink-0">
                          {u.fullName.charAt(0)}
                        </span>
                        {u.fullName}
                      </button>
                    ))}
                  </div>
                )}

                {/* GIF attachment preview */}
                {composerAttachment && (
                  <div className="mb-2 relative inline-block">
                    <img src={composerAttachment.url} alt={composerAttachment.name} className="max-h-28 rounded-lg border border-accent/[0.2]" />
                    <button
                      onClick={() => setComposerAttachment(null)}
                      className="absolute -top-1.5 -right-1.5 bg-crit text-white rounded-full w-4 h-4 flex items-center justify-center text-xs leading-none"
                    >×</button>
                  </div>
                )}

                {/* Composer: sunken well that lifts to a focused surface — the
                    focus-within ring is the same accent treatment as every other
                    input in the system, so the primary control reads as primary. */}
                <div
                  className={`flex items-end gap-2.5 rounded-xl border py-2 pl-4 pr-2 shadow-sm transition-all duration-150 focus-within:shadow-pop focus-within:ring-2 ${
                    composerUrgent
                      ? "border-crit/50 bg-crit-soft focus-within:ring-crit/20"
                      : "border-border bg-surface focus-within:border-accent/60 focus-within:ring-accent/20"
                  }`}
                >
                  {/* Hidden file input for attachments */}
                  <input ref={chatFileInputRef} type="file" className="hidden" onChange={(e) => void handleChatFileSelect(e)} />
                  {/* File attach button */}
                  <button
                    onClick={() => chatFileInputRef.current?.click()}
                    disabled={uploadingFile}
                    title="Attach file"
                    className="nx-press p-1 mb-1 rounded-lg transition-colors flex-shrink-0 text-subtle hover:text-foreground hover:bg-hover disabled:opacity-40"
                  >
                    {uploadingFile ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
                  </button>
                  <textarea
                    ref={composerRef}
                    value={composerText}
                    onChange={handleComposerChange}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") { setMentionQuery(null); return; }
                      if (e.key === "Enter" && !e.shiftKey && mentionQuery === null) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder={composerUrgent ? `Urgent message to #${selectedChannel?.name ?? ""}` : `Message #${selectedChannel?.name ?? ""}`}
                    rows={1}
                    className="flex-1 bg-transparent resize-none text-sm text-foreground placeholder-muted outline-none max-h-32 overflow-y-auto py-1.5"
                    style={{ minHeight: "1.5rem" }}
                  />
                  {/* Emoji insert */}
                  <button onClick={() => { setMediaPickerTab("emoji"); setShowGifPicker(true); }} title="Insert emoji" className="nx-press p-1.5 mb-1 rounded-lg transition-colors flex-shrink-0 text-subtle hover:text-foreground hover:bg-hover"><Smile className="w-4 h-4" /></button>
                  {/* Sticker */}
                  <button onClick={() => { setMediaPickerTab("sticker"); setShowGifPicker(true); }} title="Send a sticker" className="nx-press p-1.5 mb-1 rounded-lg transition-colors flex-shrink-0 text-subtle hover:text-foreground hover:bg-hover"><Sticker className="w-4 h-4" /></button>
                  {/* GIF */}
                  <button onClick={() => { setMediaPickerTab("gif"); setShowGifPicker(true); }} title="Send a GIF" className="nx-press p-1.5 mb-1 rounded-lg transition-colors flex-shrink-0 text-xs font-semibold text-subtle hover:text-foreground hover:bg-hover">GIF</button>
                  {/* Urgent flag toggle */}
                  <button
                    onClick={() => setComposerUrgent(v => !v)}
                    title={composerUrgent ? "Remove urgent flag" : "Mark as urgent"}
                    className={`p-1.5 mb-1 rounded-lg transition-colors flex-shrink-0 text-sm ${composerUrgent ? "bg-crit/20 text-crit" : "text-subtle hover:text-muted hover:bg-surface-sunken"}`}
                  >
                    <Siren className="w-4 h-4" />
                  </button>
                  {/* Voice note button */}
                  <button
                    onClick={recording ? stopRecording : () => void startRecording()}
                    className={`p-1.5 mb-1 rounded-lg transition-colors flex-shrink-0 ${recording ? "bg-crit text-white animate-pulse" : "text-muted hover:text-foreground hover:bg-surface-sunken"}`}
                    title={recording ? "Stop recording" : "Record voice note"}
                  >
                    {recording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={sendMessage}
                    disabled={(!composerText.trim() && !composerAttachment) || sending}
                    className="w-[38px] h-[38px] flex items-center justify-center rounded-[9px] text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40 flex-shrink-0"
                    style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-hover))" }}
                  >
                    <Send className="w-[18px] h-[18px]" />
                  </button>
                </div>
              </div>
              <p className="hidden lg:block text-[10px] text-muted mt-1.5 ml-1">
                Enter to send · Shift+Enter for new line · Drag files to attach · @ to mention · ⌘K to navigate
              </p>
            </div>
            </>
            )}
          </div>

          {/* Thread panel */}
          {threadParentMsg && (
            <ThreadPanel
              parentMsg={threadParentMsg}
              currentUserId={currentUserId}
              channelId={selectedChannelId}
              messages={threadMessages}
              memberNames={memberNames}
              onClose={() => {
                setThreadParentMsg(null);
                setThreadMessages([]);
              }}
              onReact={handleReact}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          )}

          {/* Pinned messages panel */}
          {showPins && !threadParentMsg && (
            <div className="bg-surface hidden lg:flex lg:flex-col lg:w-80 flex-shrink-0 border-l border-border-soft">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Pin className="w-4 h-4 text-accent" />
                  <span>Pinned Messages</span>
                  <span className="text-xs text-muted">({pinnedMessages.length})</span>
                </div>
                <button onClick={() => setShowPins(false)} className="p-1.5 text-muted hover:text-foreground hover:bg-surface-sunken rounded-md transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto overflow-x-hidden py-2">
                {pinnedMessages.length === 0 ? (
                  <div className="text-center text-muted py-8">
                    <Pin className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-xs">No pinned messages yet.</p>
                  </div>
                ) : (
                  pinnedMessages.map(msg => (
                    <div key={msg.id} className="px-4 py-3 border-b border-border hover:bg-surface-sunken transition-colors">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-foreground">{msg.user.fullName}</span>
                        <span className="text-[10px] text-muted">{formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}</span>
                      </div>
                      <p className="text-xs text-muted line-clamp-3">{msg.content}</p>
                      <button
                        onClick={() => void handlePin(msg.id, false)}
                        className="mt-1.5 text-[10px] text-muted hover:text-crit flex items-center gap-1 transition-colors"
                      >
                        <PinOff className="w-3 h-3" /> Unpin
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Media Picker (GIF / Sticker / Emoji) */}
      {showGifPicker && (
        <GifPicker
          initialTab={mediaPickerTab}
          onSelect={(url, name) => setComposerAttachment({ url, mime: "image/gif", name })}
          onEmojiInsert={handleEmojiInsert}
          onClose={() => setShowGifPicker(false)}
        />
      )}

      {/* Command Palette */}
      {showCommandPalette && (
        <CommandPalette
          channels={channels}
          onClose={() => setShowCommandPalette(false)}
          onSelectChannel={(id) => { setSelectedChannelId(id); setShowCommandPalette(false); }}
          onNewChannel={() => { setShowNewChannel(true); setShowCommandPalette(false); }}
          onNewDM={() => { setShowNewGroupDM(true); setShowCommandPalette(false); }}
        />
      )}

      {/* Modals */}
      {showNewChannel && (
        <NewChannelModal
          onClose={() => setShowNewChannel(false)}
          onCreate={(ch) => {
            setChannels((prev) => [ch, ...prev]);
            setSelectedChannelId(ch.id);
          }}
        />
      )}

      {showNewGroupDM && (
        <NewGroupDMModal
          currentUserId={currentUserId}
          existingDirectChannels={channels.filter((c) => c.type === "DIRECT")}
          onClose={() => setShowNewGroupDM(false)}
          onCreate={(ch) => {
            setChannels((prev) => prev.some((c) => c.id === ch.id) ? prev : [ch, ...prev]);
            setSelectedChannelId(ch.id);
          }}
        />
      )}

      {showAddMembers && selectedChannel && (
        <AddMembersModal
          channel={selectedChannel}
          currentUserId={currentUserId}
          onClose={() => setShowAddMembers(false)}
          onAdded={(updatedChannel) => {
            setChannels((prev) => prev.map((c) => c.id === updatedChannel.id ? updatedChannel : c));
          }}
        />
      )}

      {showManageMembers && selectedChannel && (
        <ManageMembersModal
          channel={selectedChannel}
          currentUserId={currentUserId}
          onClose={() => setShowManageMembers(false)}
          onChangeRole={handleChangeMemberRole}
          onRemove={handleRemoveMember}
          onLeave={() => { setShowManageMembers(false); void handleLeaveChannel(); }}
        />
      )}

      {summaryResult && selectedChannel && (
        <SummaryModal
          channelName={selectedChannel.name}
          summary={summaryResult}
          onClose={() => setSummaryResult(null)}
        />
      )}
    </div>
  );
}
