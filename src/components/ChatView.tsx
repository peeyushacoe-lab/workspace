"use client";

import { useCallback, useEffect, useRef, useState, memo } from "react";
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
  Sparkles,
  Loader2,
  FileText,
  Download,
  UserPlus,
  Pin,
  PinOff,
  Mic,
  MicOff,
  Square,
  Phone,
  Video,
} from "lucide-react";
import { formatDistanceToNow, isToday, isYesterday, format } from "date-fns";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type Member = {
  userId: string;
  role: string;
};

type Channel = {
  id: string;
  name: string;
  description?: string;
  type: "CHANNEL" | "DIRECT" | "GROUP";
  isPrivate: boolean;
  members: Member[];
  _count: { messages: number };
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

type Message = {
  id: string;
  channelId: string;
  userId: string;
  content: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  parentId?: string | null;
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
};

type UserSummary = {
  id: string;
  fullName: string;
  email: string;
  role: string;
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
      className="absolute bottom-full right-0 mb-1 w-72 bg-[#1b1f2e] border border-[rgba(0,255,255,0.1)] rounded-2xl shadow-xl z-50 overflow-hidden"
      style={{ transition: "opacity 150ms ease-out" }}
    >
      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[rgba(0,255,255,0.1)]">
        <Search className="w-3.5 h-3.5 text-[#bbc9cf] flex-shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search emoji…"
          className="flex-1 text-xs outline-none text-[#dfe1f6] placeholder-[#bbc9cf] bg-transparent"
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
        />
        {query && (
          <button onClick={() => setQuery("")} className="text-[#bbc9cf] hover:text-[#dfe1f6]">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Category tabs — hidden during search */}
      {!query && (
        <div className="flex border-b border-[rgba(0,255,255,0.1)] overflow-x-auto">
          {EMOJI_CATEGORIES.map((cat, i) => (
            <button
              key={cat.label}
              onClick={() => setActiveCategory(i)}
              className={`flex-shrink-0 px-3 py-1.5 text-[10px] font-semibold transition-colors ${
                activeCategory === i
                  ? "text-[#a5e7ff] border-b-2 border-[#a5e7ff]"
                  : "text-[#bbc9cf] hover:text-[#dfe1f6]"
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
            className="flex items-center justify-center w-8 h-8 text-lg hover:bg-[#262939] rounded-lg transition-transform hover:scale-110"
            title={emoji}
          >
            {emoji}
          </button>
        ))}
        {displayEmojis.length === 0 && (
          <p className="col-span-8 text-center text-xs text-[#bbc9cf] py-4">No results</p>
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

function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const colors = [
    "bg-[#00d2ff]/20",
    "bg-[#00feb2]/20",
    "bg-[#a5e7ff]/20",
    "bg-[#ff4d6d]/20",
    "bg-[#00d2ff]/30",
  ];
  const color = colors[name.charCodeAt(0) % colors.length];
  const sz = size === "sm" ? "w-8 h-8 text-xs" : "w-10 h-10 text-sm";

  return (
    <div
      className={`${sz} rounded-full ${color} flex items-center justify-center text-[#a5e7ff] font-bold flex-shrink-0`}
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
          <span key={i} className="bg-[#ff4d6d]/15 text-[#ff9db0] font-bold rounded px-0.5">
            {part}
          </span>
        );
      }
      const isMention = memberNames.some(m => m.toLowerCase().startsWith(name));
      if (isMention) {
        return (
          <span key={i} className="bg-[#00d2ff]/10 text-[#a5e7ff] font-semibold rounded px-0.5">
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
            ? "bg-[#00d2ff]/10 border-[#00d2ff] text-[#a5e7ff]"
            : "bg-[#1b1f2e] border-[rgba(0,255,255,0.1)] text-[#bbc9cf] hover:bg-[#00d2ff]/10"
        }`}
      >
        {emoji} {count}
      </button>

      {hovered && reactors.length > 0 && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 pointer-events-none">
          <div className="bg-[#0f1321] text-[#dfe1f6] text-[10px] rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg max-w-[200px] border border-[rgba(0,255,255,0.1)]">
            <div className="font-semibold mb-0.5 text-[#859399]">Reacted by:</div>
            <div className="text-[#dfe1f6] truncate">{reactors.join(", ")}</div>
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#0f1321]" />
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
    return (
      <div className="mt-1.5 inline-flex items-center gap-3 bg-[#1b1f2e] border border-[rgba(0,255,255,0.1)] rounded-xl px-3 py-2.5 max-w-xs">
        <FileText className="w-7 h-7 text-[#a5e7ff] flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#dfe1f6] truncate">{data.name}</p>
          <p className="text-[10px] text-[#bbc9cf]">{formatFileSize(data.size)} · {data.mimeType.split("/")[1]?.toUpperCase()}</p>
        </div>
        {data.url && (
          <a
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#a5e7ff] hover:text-[#00d2ff] flex-shrink-0"
            title="Download"
          >
            <Download className="w-4 h-4" />
          </a>
        )}
      </div>
    );
  } catch {
    return <p className="text-sm text-[#dfe1f6] whitespace-pre-wrap break-words mt-0.5">{content}</p>;
  }
}

// ─── Bot Response Card ────────────────────────────────────────────────────────

function BotResponseCard({ content }: { content: string }) {
  try {
    const jsonStr = content.replace("[BOT_RESPONSE] ", "");
    const data = JSON.parse(jsonStr) as { from: string; text: string };
    return (
      <div className="mt-1 flex items-start gap-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#a5e7ff]/10 border border-[#a5e7ff]/20">
          <Sparkles className="h-4 w-4 text-[#a5e7ff]" />
        </div>
        <div className="flex-1 min-w-0 bg-[#262939] border border-[rgba(0,255,255,0.1)] rounded-xl p-4 max-w-xl">
          <p className="text-[#a5e7ff] font-semibold text-sm mb-1">{data.from}</p>
          <p className="text-sm text-[#dfe1f6] whitespace-pre-wrap break-words leading-relaxed">{data.text}</p>
        </div>
      </div>
    );
  } catch {
    return <p className="text-sm text-[#dfe1f6] whitespace-pre-wrap break-words mt-0.5">{content}</p>;
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
  onPin,
  memberNames = [],
}: {
  msg: Message;
  currentUserId: string;
  onReact: (messageId: string, emoji: string) => void;
  onEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
  onReply?: (msg: Message) => void;
  onPin?: (messageId: string, pinned: boolean) => void;
  memberNames?: string[];
}) {
  const [showActions, setShowActions] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(msg.content);
  const pickerRef = useRef<HTMLDivElement>(null);
  const isOwn = msg.userId === currentUserId;
  const isDeleted = !!msg.deletedAt;
  const isFileAttachment = msg.content.startsWith("[FILE_ATTACHMENT] ");
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

  return (
    <div
      className={`group relative flex gap-3 px-6 py-3 transition-colors ${msg.isUrgent ? "bg-[#ff4d6d]/5 border-l-2 border-[#ff4d6d] hover:bg-[#ff4d6d]/10" : "hover:bg-[#262939]"}`}
      onMouseEnter={() => !isDeleted && setShowActions(true)}
      onMouseLeave={() => {
        if (!showEmojiPicker) setShowActions(false);
      }}
    >
      <div className="w-8 h-8 rounded-full bg-[#00d2ff]/10 text-[#a5e7ff] flex items-center justify-center font-bold text-sm flex-shrink-0 border border-[#a5e7ff]/20">
        {msg.user.fullName.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-[#dfe1f6] text-sm">{msg.user.fullName}</span>
          {msg.isUrgent && (
            <span className="text-[10px] font-bold text-[#ff4d6d] bg-[#ff4d6d]/15 px-1.5 py-0.5 rounded-full leading-none">🚨 Urgent</span>
          )}
          <span className="text-xs text-[#bbc9cf]">
            {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
          </span>
          {msg.editedAt && !isDeleted && (
            <span className="text-xs text-[#bbc9cf] italic">(edited)</span>
          )}
        </div>

        {/* Deleted message */}
        {isDeleted ? (
          <p className="text-sm text-[#bbc9cf] italic mt-0.5">(message deleted)</p>
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
              className="flex-1 text-sm border border-[#00d2ff] rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#00d2ff] resize-none bg-[#0f1321] text-[#dfe1f6]"
              autoFocus
            />
            <button onClick={saveEdit} className="text-[#00feb2] hover:text-[#46ffb8] flex-shrink-0">
              <Check className="w-4 h-4" />
            </button>
            <button onClick={() => setEditing(false)} className="text-[#bbc9cf] hover:text-[#dfe1f6] flex-shrink-0">
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
              <p className="text-sm text-[#dfe1f6] whitespace-pre-wrap break-words mt-0.5">
                {renderWithMentions(msg.content, currentUserId, memberNames)}
              </p>
            )}
            {msg.attachmentUrl && msg.attachmentMime?.startsWith("image/") && (
              <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer" className="inline-block mt-1.5">
                <img
                  src={msg.attachmentUrl}
                  alt={msg.attachmentName ?? "image"}
                  className="rounded-xl max-w-xs max-h-64 object-cover border border-[rgba(0,210,255,0.1)] hover:opacity-90 transition-opacity"
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

        {/* Thread reply count */}
        {!isDeleted && onReply && msg.replies.length > 0 && (
          <button
            onClick={() => onReply(msg)}
            className="mt-1.5 flex items-center gap-1.5 text-xs text-[#a5e7ff] hover:text-[#00d2ff] hover:underline"
          >
            <CornerDownRight className="w-3 h-3" />
            {msg.replies.length} {msg.replies.length === 1 ? "reply" : "replies"}
          </button>
        )}
      </div>

      {/* Action buttons — only on non-deleted, non-editing, non-bot messages */}
      {showActions && !editing && !isDeleted && !isBotResponse && (
        <div className="absolute right-4 top-2 bg-[#1b1f2e] border border-[rgba(0,255,255,0.1)] rounded-lg shadow-sm flex items-center gap-1 px-1 py-0.5">
          {/* Quick reactions */}
          <div className="flex items-center border-r border-[rgba(0,255,255,0.1)] pr-1 mr-0.5">
            {QUICK_EMOJIS.slice(0, 4).map((e) => (
              <button
                key={e}
                onClick={() => onReact(msg.id, e)}
                className="text-sm p-1 hover:bg-[#262939] rounded-lg hover:scale-110 transition-transform"
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
              className="p-1.5 hover:bg-[#262939] hover:text-[#dfe1f6] rounded-md text-xs transition-colors text-[#bbc9cf]"
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

          {onReply && (
            <button
              onClick={() => onReply(msg)}
              className="p-1.5 hover:bg-[#262939] hover:text-[#dfe1f6] rounded-md text-xs transition-colors text-[#bbc9cf]"
              title="Reply in thread"
            >
              <CornerDownRight className="w-4 h-4" />
            </button>
          )}
          {onPin && (
            <button
              onClick={() => onPin(msg.id, !msg.isPinned)}
              className={`p-1.5 rounded-md text-xs transition-colors ${msg.isPinned ? "text-[#00d2ff]" : "text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6]"}`}
              title={msg.isPinned ? "Unpin message" : "Pin message"}
            >
              {msg.isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
            </button>
          )}
          {isOwn && (
            <>
              <button
                onClick={() => { setEditing(true); setShowActions(false); }}
                className="p-1.5 hover:bg-[#262939] hover:text-[#dfe1f6] rounded-md text-xs transition-colors text-[#bbc9cf]"
                title="Edit"
              >
                <Edit3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => onDelete(msg.id)}
                className="p-1.5 hover:bg-[#ff4d6d]/10 rounded-md text-xs transition-colors text-[#bbc9cf] hover:text-[#ff4d6d]"
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
      <div className="flex-1 h-px bg-[#3c494e]" />
      <span className="text-xs text-[#bbc9cf] font-medium whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-px bg-[#3c494e]" />
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
    <div className="bg-[#1b1f2e] border-l border-[rgba(0,255,255,0.1)] w-80 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[rgba(0,255,255,0.1)] flex items-center justify-between font-semibold text-[#dfe1f6] text-sm flex-shrink-0">
        <div className="flex items-center gap-2">
          <CornerDownRight className="w-4 h-4 text-[#bbc9cf]" />
          <span>Thread</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-[#bbc9cf] hover:text-[#dfe1f6] hover:bg-[#262939] rounded-md transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Parent message preview */}
      <div className="px-4 py-3 bg-[#00d2ff]/10 border-b border-[rgba(0,255,255,0.1)] flex-shrink-0">
        <div className="flex items-start gap-2">
          <Avatar name={parentMsg.user.fullName} size="sm" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-semibold text-[#dfe1f6]">{parentMsg.user.fullName}</span>
            <p className="text-xs text-[#bbc9cf] mt-0.5 line-clamp-3 whitespace-pre-wrap break-words">
              {parentMsg.content}
            </p>
          </div>
        </div>
      </div>

      {/* Replies */}
      <div className="flex-1 overflow-y-auto py-2 space-y-1">
        {messages.length === 0 ? (
          <div className="text-center text-[#bbc9cf] py-8">
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
      <div className="border-t border-[rgba(0,255,255,0.1)] px-4 py-3 flex-shrink-0">
        <div className="flex items-end gap-2 bg-[#0f1321] border border-[rgba(0,255,255,0.1)] rounded-lg px-3 py-2">
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
            className="flex-1 bg-transparent resize-none text-sm text-[#dfe1f6] placeholder-[#bbc9cf] outline-none max-h-24 overflow-y-auto"
            style={{ minHeight: "1.25rem" }}
          />
          <button
            onClick={send}
            disabled={!composerText.trim() || sending}
            className="bg-[#00d2ff] text-[#003543] hover:bg-[#47d6ff] rounded-lg p-2 transition-colors disabled:opacity-40 flex-shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-[10px] text-[#bbc9cf] mt-1 ml-1">Enter to reply</p>
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
  const [creating, setCreating] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/chat/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description, isPrivate }),
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
      <div className="bg-[#1b1f2e] rounded-2xl shadow-xl p-6 w-full max-w-md mx-4 border border-[rgba(0,255,255,0.1)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[#dfe1f6]">Create Channel</h2>
          <button onClick={onClose} className="text-[#bbc9cf] hover:text-[#dfe1f6]">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#bbc9cf] uppercase tracking-wider mb-1">
              Channel Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
              placeholder="e.g. engineering"
              className="w-full px-3 py-2 border border-[rgba(0,255,255,0.1)] rounded-xl text-sm focus:ring-2 focus:ring-[#00d2ff] focus:bg-[#0f1321] outline-none bg-[#0f1321] text-[#dfe1f6] placeholder-[#bbc9cf]"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#bbc9cf] uppercase tracking-wider mb-1">
              Description (optional)
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this channel about?"
              className="w-full px-3 py-2 border border-[rgba(0,255,255,0.1)] rounded-xl text-sm focus:ring-2 focus:ring-[#00d2ff] focus:bg-[#0f1321] outline-none bg-[#0f1321] text-[#dfe1f6] placeholder-[#bbc9cf]"
            />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-[#dfe1f6]">Private channel</span>
          </label>
        </div>
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-[rgba(0,255,255,0.1)] rounded-xl text-sm font-semibold text-[#bbc9cf] hover:bg-[#262939]"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim() || creating}
            className="flex-1 px-4 py-2 bg-[#00d2ff] text-[#003543] rounded-xl text-sm font-semibold hover:bg-[#47d6ff] disabled:opacity-50"
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
      if (isDirect) {
        const existing = existingDirectChannels.find((c) =>
          c.members.some((m) => m.userId === memberIds[0])
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
      <div className="bg-[#1b1f2e] rounded-2xl shadow-xl p-6 w-full max-w-md mx-4 border border-[rgba(0,255,255,0.1)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[#dfe1f6]">
            {selected.size > 1 ? "New Group Message" : "New Direct Message"}
          </h2>
          <button onClick={onClose} className="text-[#bbc9cf] hover:text-[#dfe1f6]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-[#bbc9cf] mb-3">
          Select one person for a DM or multiple for a group conversation.
        </p>

        {/* Search */}
        <div className="flex items-center gap-2 px-3 py-2 border border-[rgba(0,255,255,0.1)] rounded-xl mb-3 bg-[#0f1321]">
          <Search className="w-3.5 h-3.5 text-[#bbc9cf]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people…"
            className="flex-1 text-sm outline-none bg-transparent text-[#dfe1f6] placeholder-[#bbc9cf]"
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
                  className="flex items-center gap-1 bg-[#00d2ff]/10 text-[#a5e7ff] text-xs px-2.5 py-1 rounded-full"
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
              <Loader2 className="w-5 h-5 animate-spin text-[#bbc9cf]" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-xs text-[#bbc9cf] py-4">No users found</p>
          ) : (
            filtered.map((u) => (
              <button
                key={u.id}
                onClick={() => toggle(u.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${
                  selected.has(u.id)
                    ? "bg-[#00d2ff]/10"
                    : "hover:bg-[#1b1f2e]"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                    selected.has(u.id)
                      ? "bg-[#00d2ff] border-[#00d2ff]"
                      : "border-[rgba(0,255,255,0.1)]"
                  }`}
                >
                  {selected.has(u.id) && <Check className="w-3 h-3 text-[#003543]" />}
                </div>
                <Avatar name={u.fullName} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#dfe1f6] truncate">{u.fullName}</p>
                  <p className="text-[10px] text-[#bbc9cf] truncate">{u.email}</p>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-[rgba(0,255,255,0.1)] rounded-xl text-sm font-semibold text-[#bbc9cf] hover:bg-[#262939]"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={selected.size === 0 || creating}
            className="flex-1 px-4 py-2 bg-[#00d2ff] text-[#003543] rounded-xl text-sm font-semibold hover:bg-[#47d6ff] disabled:opacity-50"
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
      ? "text-green-600"
      : summary.sentiment === "negative"
      ? "text-red-600"
      : "text-[#475569]";

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#1b1f2e] rounded-2xl shadow-xl p-6 w-full max-w-lg mx-4 border border-[rgba(0,255,255,0.1)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#a5e7ff]" />
            <h2 className="text-lg font-bold text-[#dfe1f6]">
              #{channelName} Summary
            </h2>
          </div>
          <button onClick={onClose} className="text-[#bbc9cf] hover:text-[#dfe1f6]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary */}
        <div className="bg-[#0f1321] border border-[rgba(0,255,255,0.1)] rounded-xl p-4 mb-4">
          <p className="text-sm text-[#dfe1f6] leading-relaxed">{summary.summary}</p>
          <p className={`text-[10px] font-semibold uppercase tracking-wider mt-2 ${sentimentColor}`}>
            Sentiment: {summary.sentiment}
          </p>
        </div>

        {/* Key Points */}
        {summary.keyPoints.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-[#bbc9cf] uppercase tracking-wider mb-2">
              Key Points
            </h3>
            <ul className="space-y-1.5">
              {summary.keyPoints.map((point, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[#dfe1f6]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00d2ff] mt-1.5 flex-shrink-0" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Action Items */}
        {summary.actionItems.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-[#bbc9cf] uppercase tracking-wider mb-2">
              Action Items
            </h3>
            <ul className="space-y-1.5">
              {summary.actionItems.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[#dfe1f6]">
                  <Check className="w-3.5 h-3.5 text-[#00feb2] mt-0.5 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full px-4 py-2 bg-[#00d2ff] text-[#003543] rounded-xl text-sm font-semibold hover:bg-[#47d6ff]"
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
  onlineUsers,
  onSelect,
  onNew,
  newTitle,
}: {
  label: string;
  channels: Channel[];
  selectedChannelId: string | null;
  onlineUsers: Map<string, string>;
  onSelect: (id: string) => void;
  onNew?: () => void;
  newTitle?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);

  if (channels.length === 0 && !onNew) return null;

  const isDM = label === "DIRECT MESSAGES";
  const isGroup = label === "GROUPS";

  return (
    <div className="mb-1">
      <div className="flex items-center justify-between px-2 py-1">
        <button
          onClick={() => setCollapsed((p) => !p)}
          className="flex items-center gap-1 text-[#bbc9cf] hover:text-[#dfe1f6] transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
          <span className="text-xs font-semibold text-[#bbc9cf] uppercase tracking-wider">{label}</span>
        </button>
        {onNew && (
          <button
            onClick={onNew}
            className="text-[#bbc9cf] hover:text-[#dfe1f6] transition-colors"
            title={newTitle ?? "New"}
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="space-y-0.5 mt-0.5">
          {channels.map((ch) => {
            const isSelected = selectedChannelId === ch.id;
            const memberCount = ch.members?.length ?? 0;
            return (
              <button
                key={ch.id}
                onClick={() => onSelect(ch.id)}
                className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors text-left ${
                  isSelected
                    ? "bg-[#00d2ff]/10 text-[#a5e7ff] font-semibold border-l-2 border-[#00d2ff]"
                    : "text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6]"
                }`}
              >
                {isDM || isGroup ? (
                  <Users className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
                ) : (
                  <Hash className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
                )}
                <span className="truncate flex-1 text-[13px]">{ch.name}</span>
                {isSelected && onlineUsers.size > 0 && (
                  <span className="bg-[#00d2ff] text-[#003543] text-xs rounded-full px-1.5 py-0.5 font-bold leading-none">
                    {onlineUsers.size}
                  </span>
                )}
                {!isSelected && isDM && (
                  <span className="w-2 h-2 rounded-full bg-[#00feb2] opacity-0 group-hover:opacity-100 flex-shrink-0" />
                )}
              </button>
            );
          })}
          {channels.length === 0 && (
            <p className="text-[#bbc9cf] text-[11px] px-3 py-1 italic">None yet</p>
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
      <div className="bg-[#1b1f2e] rounded-2xl shadow-xl p-6 w-full max-w-md mx-4 border border-[rgba(0,255,255,0.1)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[#dfe1f6]">Add Members to #{channel.name}</h2>
          <button onClick={onClose} className="text-[#bbc9cf] hover:text-[#dfe1f6]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people…"
          className="w-full bg-[#0f1321] border border-[rgba(0,255,255,0.1)] rounded-xl px-4 py-2.5 text-sm text-[#dfe1f6] placeholder-[#bbc9cf] outline-none focus:border-[#00d2ff] mb-3"
        />

        <div className="max-h-56 overflow-y-auto space-y-1 mb-4">
          {loading ? (
            <p className="text-sm text-[#bbc9cf] text-center py-4">Loading users…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-[#bbc9cf] text-center py-4">
              {users.length === 0 ? "All users are already members" : "No matching users"}
            </p>
          ) : (
            filtered.map((u) => (
              <button
                key={u.id}
                onClick={() => toggle(u.id)}
                className={`w-full flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-left transition-colors ${
                  selected.has(u.id) ? "bg-[#00d2ff]/10 text-[#a5e7ff] border border-[#00d2ff]/30" : "text-[#dfe1f6] hover:bg-[#262939]"
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-[#262939] border border-[rgba(0,255,255,0.1)] flex items-center justify-center text-xs font-bold text-[#00d2ff] flex-shrink-0">
                  {u.fullName[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{u.fullName}</p>
                  <p className="text-xs text-[#bbc9cf] truncate">{u.email}</p>
                </div>
                {selected.has(u.id) && <Check className="w-4 h-4 text-[#00d2ff] flex-shrink-0" />}
              </button>
            ))
          )}
        </div>

        {selected.size > 0 && (
          <p className="text-xs text-[#bbc9cf] mb-3">{selected.size} selected</p>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-[rgba(0,255,255,0.1)] text-[#bbc9cf] rounded-xl text-sm hover:bg-[#262939]">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={selected.size === 0 || saving}
            className="flex-1 px-4 py-2 bg-[#00d2ff] text-[#003543] rounded-xl text-sm font-semibold hover:bg-[#47d6ff] disabled:opacity-50"
          >
            {saving ? "Adding…" : `Add ${selected.size > 0 ? selected.size : ""} Member${selected.size !== 1 ? "s" : ""}`}
          </button>
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

  const tabs: { id: MediaTab; label: string; icon: string }[] = [
    { id: "gif", label: "GIF", icon: "🎞️" },
    { id: "sticker", label: "Sticker", icon: "🎭" },
    { id: "emoji", label: "Emoji", icon: "😊" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-[#1b1f2e] border border-[rgba(0,210,255,0.15)] rounded-t-2xl shadow-2xl overflow-hidden"
        style={{ maxHeight: "65vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tab bar */}
        <div className="flex border-b border-[rgba(0,210,255,0.1)]">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setQuery(""); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors ${tab === t.id ? "text-[#a5e7ff] border-b-2 border-[#00d2ff]" : "text-[#5c6b72] hover:text-[#bbc9cf]"}`}
            >
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
          <button onClick={onClose} className="px-3 text-[#5c6b72] hover:text-[#bbc9cf]"><X className="w-4 h-4" /></button>
        </div>

        {/* Search bar (GIF + Sticker + Emoji) */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[rgba(0,210,255,0.08)]">
          <Search className="w-3.5 h-3.5 text-[#5c6b72] flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === "emoji" ? "Search emoji…" : tab === "sticker" ? "Search stickers…" : "Search GIFs…"}
            className="flex-1 bg-transparent text-sm text-[#dfe1f6] placeholder-[#5c6b72] outline-none"
            onKeyDown={(e) => e.key === "Escape" && onClose()}
          />
        </div>

        {/* Emoji category pills */}
        {tab === "emoji" && !query && (
          <div className="flex gap-1 px-3 py-1.5 overflow-x-auto border-b border-[rgba(0,210,255,0.08)]">
            {EMOJI_CATEGORIES.map((cat, i) => (
              <button
                key={cat.label}
                onClick={() => setEmojiCategory(i)}
                className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full transition-colors ${emojiCategory === i ? "bg-[#00d2ff]/20 text-[#a5e7ff]" : "text-[#5c6b72] hover:text-[#bbc9cf]"}`}
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
                  className="flex items-center justify-center w-9 h-9 text-xl hover:bg-[#262939] rounded-lg transition-transform hover:scale-110"
                >{emoji}</button>
              ))}
              {emojiRows.length === 0 && <p className="col-span-8 text-center text-sm text-[#5c6b72] py-6">No results</p>}
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-[#5c6b72]" />
            </div>
          ) : results.length === 0 ? (
            <p className="text-center text-sm text-[#5c6b72] py-8">
              {!process.env.NEXT_PUBLIC_GIPHY_KEY ? "Set GIPHY_API_KEY to enable" : "No results"}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {results.map((gif) => (
                <button
                  key={gif.id}
                  onClick={() => { onSelect(gif.url, gif.title); onClose(); }}
                  className="relative group overflow-hidden rounded-lg bg-[#0f1321] aspect-square hover:ring-2 hover:ring-[#00d2ff] transition-all"
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
        <div className="px-4 py-1 border-t border-[rgba(0,210,255,0.08)]">
          <span className="text-[9px] text-[#5c6b72]">{tab !== "emoji" ? "Powered by GIPHY" : ""}</span>
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
  icon: string;
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
      icon: "#",
      onSelect: () => { onSelectChannel(c.id); onClose(); },
    }));

  const dmItems: CmdAction[] = channels
    .filter((c) => (c.type === "DIRECT" || c.type === "GROUP") && c.name.toLowerCase().includes(q))
    .map((c) => ({
      id: c.id,
      label: c.name,
      icon: c.type === "GROUP" ? "👥" : "👤",
      onSelect: () => { onSelectChannel(c.id); onClose(); },
    }));

  const actionItems: CmdAction[] = [
    { id: "_new_channel", label: "New Channel", icon: "+", description: "Create a public or private channel", onSelect: () => { onNewChannel(); onClose(); } },
    { id: "_new_dm", label: "New Direct Message", icon: "✉", description: "Open a DM or group conversation", onSelect: () => { onNewDM(); onClose(); } },
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
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-[#1b1f2e] border border-[rgba(0,210,255,0.15)] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[rgba(0,210,255,0.1)]">
          <Search className="w-4 h-4 text-[#bbc9cf] flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Jump to channel or action…"
            className="flex-1 bg-transparent text-sm text-[#dfe1f6] placeholder-[#5c6b72] outline-none"
          />
          <kbd className="text-[10px] text-[#5c6b72] bg-[#0f1321] border border-[rgba(255,255,255,0.08)] rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-1">
          {allItems.length === 0 ? (
            <p className="text-center text-sm text-[#5c6b72] py-8">No results</p>
          ) : (
            groups.map((group) => (
              <div key={group.heading}>
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-[#5c6b72] uppercase tracking-wider">{group.heading}</p>
                {group.items.map((item) => {
                  const idx = flatIdx++;
                  const isActive = idx === safeCursor;
                  return (
                    <button
                      key={item.id}
                      onMouseEnter={() => setCursor(idx)}
                      onClick={item.onSelect}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${isActive ? "bg-[#00d2ff]/10" : "hover:bg-[#262939]"}`}
                    >
                      <span className={`text-sm w-5 text-center flex-shrink-0 ${isActive ? "text-[#00d2ff]" : "text-[#5c6b72]"}`}>{item.icon}</span>
                      <span className="flex-1 min-w-0">
                        <span className={`text-sm font-medium ${isActive ? "text-[#a5e7ff]" : "text-[#dfe1f6]"}`}>{item.label}</span>
                        {item.description && (
                          <span className="block text-xs text-[#5c6b72] truncate">{item.description}</span>
                        )}
                      </span>
                      {isActive && <ChevronRight className="w-3.5 h-3.5 text-[#00d2ff] flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-[rgba(0,210,255,0.08)] flex items-center gap-4 text-[10px] text-[#5c6b72]">
          <span><kbd className="bg-[#0f1321] border border-[rgba(255,255,255,0.08)] rounded px-1">↑↓</kbd> navigate</span>
          <span><kbd className="bg-[#0f1321] border border-[rgba(255,255,255,0.08)] rounded px-1">↵</kbd> select</span>
          <span><kbd className="bg-[#0f1321] border border-[rgba(255,255,255,0.08)] rounded px-1">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main ChatView ────────────────────────────────────────────────────────────

export function ChatView({ currentUserId }: { currentUserId: string }) {
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
  const [typingNames, setTypingNames] = useState<Map<string, string>>(new Map());
  const [threadParentMsg, setThreadParentMsg] = useState<Message | null>(null);
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<Map<string, string>>(new Map());

  // Drag-drop state
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const dragCounterRef = useRef(0);

  // AI Summarize state
  const [summarizing, setSummarizing] = useState(false);
  const [summaryResult, setSummaryResult] = useState<SummaryResult | null>(null);
  const [summaryMode, setSummaryMode] = useState<"summary" | "action-items" | "schedule-meeting">("summary");

  // Pinned messages panel
  const [showPins, setShowPins] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);

  // Voice note recording
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Sidebar search
  const [sidebarSearch, setSidebarSearch] = useState("");

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

  // Keep ref in sync for SSE closure
  useEffect(() => {
    threadParentIdRef.current = threadParentMsg?.id ?? null;
  }, [threadParentMsg]);

  const loadChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/channels");
      if (res.ok) setChannels((await res.json()) as Channel[]);
    } catch {
      toast.error("Failed to load channels");
    }
  }, []);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

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

  // Fetch initial presence snapshot (one-time REST, no polling)
  useEffect(() => {
    if (!selectedChannelId) return;
    fetch(`/api/chat/channels/${selectedChannelId}/presence`)
      .then((r) => r.json())
      .then((online: { userId: string; fullName: string }[]) =>
        setOnlineUsers(new Map(online.map((u) => [u.userId, u.fullName])))
      )
      .catch(() => {});
  }, [selectedChannelId]);

  // Load top-level messages when channel changes
  useEffect(() => {
    if (!selectedChannelId) return;

    setLoadingMessages(true);
    setMessages([]);
    setThreadParentMsg(null);
    setThreadMessages([]);

    fetch(`/api/chat/channels/${selectedChannelId}/messages`)
      .then((r) => r.json())
      .then((data) => setMessages(data as Message[]))
      .catch(() => toast.error("Failed to load messages"))
      .finally(() => setLoadingMessages(false));
  }, [selectedChannelId]);

  // Socket.IO channel subscription — join/leave rooms, register event handlers
  useEffect(() => {
    if (!selectedChannelId) return;
    const socket = socketRef.current;
    if (!socket) return;

    socket.emit("chat:join", { channelId: selectedChannelId });

    const onMessage = (msg: Message) => {
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

    const onPresence = ({ userId, fullName, online }: { userId: string; fullName: string; online: boolean }) => {
      setOnlineUsers((prev) => {
        const m = new Map(prev);
        if (online) m.set(userId, fullName);
        else m.delete(userId);
        return m;
      });
    };

    const onTyping = ({ userId, fullName }: { userId: string; fullName: string }) => {
      if (userId === currentUserId) return;
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
    socket.on("chat:presence", onPresence);
    socket.on("chat:typing", onTyping);

    return () => {
      socket.emit("chat:leave", { channelId: selectedChannelId });
      socket.off("chat:message", onMessage);
      socket.off("chat:message_updated", onMessageUpdated);
      socket.off("chat:message_deleted", onMessageDeleted);
      socket.off("chat:reactions_updated", onReactionsUpdated);
      socket.off("chat:presence", onPresence);
      socket.off("chat:typing", onTyping);
      typingTimers.current.forEach((t) => clearTimeout(t));
      typingTimers.current.clear();
      setTypingNames(new Map());
    };
  }, [selectedChannelId, currentUserId]);

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
    setComposerText("");
    setComposerAttachment(null);
    try {
      const urgent = composerUrgent;
      setComposerUrgent(false);
      const res = await fetch(`/api/chat/channels/${selectedChannelId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: text,
          isUrgent: urgent,
          ...(attachment ? { attachmentUrl: attachment.url, attachmentMime: attachment.mime, attachmentName: attachment.name } : {}),
        }),
      });
      if (!res.ok) throw new Error("Failed");

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
    try {
      await fetch(`/api/chat/messages/${messageId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
    } catch {
      toast.error("Failed to react");
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
      await fetch(`/api/chat/messages/${messageId}`, { method: "DELETE" });
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

  // Voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      setRecording(true);
    } catch {
      toast.error("Microphone access denied");
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
      formData.append("file", audioBlob, "voice-note.webm");
      const uploadRes = await fetch("/api/drive/upload", { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const fileRecord = await uploadRes.json() as { id: string; name: string; size: string; mimeType: string; storageUrl?: string };
      const content = "[FILE_ATTACHMENT] " + JSON.stringify({ name: "Voice Note", size: parseInt(fileRecord.size, 10), mimeType: "audio/webm", url: fileRecord.storageUrl, fileId: fileRecord.id });
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
    | { type: "message"; msg: Message };

  const listItems: ListItem[] = [];
  let lastDateLabel = "";
  for (const msg of messages) {
    const label = dateSeparatorLabel(msg.createdAt);
    if (label !== lastDateLabel) {
      listItems.push({ type: "separator", label, key: `sep-${msg.id}` });
      lastDateLabel = label;
    }
    listItems.push({ type: "message", msg });
  }

  // ─── Channel sections ──────────────────────────────────────────────────────
  const publicChannels = channels.filter((c) => c.type === "CHANNEL");
  const directChannels = channels.filter((c) => c.type === "DIRECT");
  const groupChannels = channels.filter((c) => c.type === "GROUP");

  return (
    <div className="flex h-[calc(100vh-3.5rem)] lg:h-screen bg-[#0f1321] overflow-hidden">
      {/* Channel sidebar */}
      <div className="w-64 bg-[#1b1f2e] border-r border-[rgba(0,255,255,0.1)] flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-[rgba(0,255,255,0.1)]">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-[#a5e7ff]" />
            <span className="text-[#dfe1f6] font-bold text-sm flex-1">Workspace Chat</span>
            <button
              onClick={() => setShowCommandPalette(true)}
              title="Command palette (⌘K)"
              className="flex items-center gap-1 text-[10px] text-[#5c6b72] hover:text-[#bbc9cf] bg-[#0f1321] border border-[rgba(255,255,255,0.08)] rounded px-1.5 py-0.5 transition-colors"
            >
              <Search className="w-2.5 h-2.5" />
              <span>⌘K</span>
            </button>
          </div>
        </div>

        {/* Sidebar search */}
        <div className="px-3 py-2 border-b border-[rgba(0,255,255,0.06)]">
          <div className="flex items-center gap-2 bg-[#0f1321] border border-[rgba(0,255,255,0.08)] rounded-lg px-2.5 py-1.5">
            <Search className="w-3 h-3 text-[#5c6b72] flex-shrink-0" />
            <input
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              placeholder="Search channels, people…"
              className="flex-1 text-xs bg-transparent text-[#dfe1f6] placeholder-[#5c6b72] outline-none"
            />
            {sidebarSearch && (
              <button onClick={() => setSidebarSearch("")} className="text-[#5c6b72] hover:text-[#bbc9cf]">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <ChannelSection
            label="CHANNELS"
            channels={publicChannels.filter((c) => !sidebarSearch || c.name.toLowerCase().includes(sidebarSearch.toLowerCase()))}
            selectedChannelId={selectedChannelId}
            onlineUsers={onlineUsers}
            onSelect={setSelectedChannelId}
            onNew={sidebarSearch ? undefined : () => setShowNewChannel(true)}
            newTitle="New Channel"
          />

          <ChannelSection
            label="DIRECT MESSAGES"
            channels={directChannels.filter((c) => !sidebarSearch || c.name.toLowerCase().includes(sidebarSearch.toLowerCase()))}
            selectedChannelId={selectedChannelId}
            onlineUsers={onlineUsers}
            onSelect={setSelectedChannelId}
            onNew={sidebarSearch ? undefined : () => setShowNewGroupDM(true)}
            newTitle="New Direct Message"
          />

          <ChannelSection
            label="GROUPS"
            channels={groupChannels.filter((c) => !sidebarSearch || c.name.toLowerCase().includes(sidebarSearch.toLowerCase()))}
            selectedChannelId={selectedChannelId}
            onlineUsers={onlineUsers}
            onSelect={setSelectedChannelId}
            onNew={sidebarSearch ? undefined : () => setShowNewGroupDM(true)}
            newTitle="New Group"
          />

          {channels.length === 0 && (
            <p className="text-[#bbc9cf] text-xs px-3 py-4 text-center">
              No channels yet.
              <br />
              Create one to get started.
            </p>
          )}
        </div>
      </div>

      {/* Main area */}
      {!selectedChannelId ? (
        <div className="flex-1 flex flex-col items-center justify-center text-[#bbc9cf] bg-[#0f1321] p-8">
          <MessageSquare className="w-16 h-16 mb-4 opacity-20" />
          <p className="text-lg font-medium">Select a channel</p>
          <p className="text-sm">Or create one from the sidebar.</p>
        </div>
      ) : (
        <>
          {/* Messages pane */}
          <div
            className="bg-[#0f1321] flex-1 flex flex-col min-w-0 relative"
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            {/* Drag-drop overlay */}
            {isDragOver && (
              <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
                <div className="absolute inset-4 border-2 border-dashed border-[#00d2ff] rounded-2xl bg-[#00d2ff]/10" />
                <div className="relative z-10 text-center">
                  <div className="text-4xl mb-2">📎</div>
                  <p className="text-lg font-bold text-[#a5e7ff]">Drop to attach</p>
                  <p className="text-sm text-[#bbc9cf]">File will be uploaded and shared in this channel</p>
                </div>
              </div>
            )}

            {/* Upload progress overlay */}
            {uploadingFile && (
              <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#0f1321]/80">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-[#a5e7ff]" />
                  <p className="text-sm font-medium text-[#dfe1f6]">Uploading file…</p>
                </div>
              </div>
            )}

            {/* Channel header */}
            <div className="px-6 py-3 border-b border-[rgba(0,255,255,0.1)] bg-[#1b1f2e] flex items-center justify-between flex-shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  {selectedChannel?.type === "DIRECT" || selectedChannel?.type === "GROUP" ? (
                    <Users className="w-5 h-5 text-[#bbc9cf]" />
                  ) : (
                    <Hash className="w-5 h-5 text-[#bbc9cf]" />
                  )}
                  <h2 className="font-semibold text-[#dfe1f6] text-base">{selectedChannel?.name}</h2>
                  {selectedChannel?.type === "DIRECT" && (
                    <span className="text-[10px] font-semibold text-[#5c6b72] bg-[#262939] border border-[rgba(0,255,255,0.08)] px-1.5 py-0.5 rounded-full uppercase tracking-wider">DM</span>
                  )}
                  {selectedChannel?.type === "GROUP" && (
                    <span className="text-[10px] font-semibold text-[#5c6b72] bg-[#262939] border border-[rgba(0,255,255,0.08)] px-1.5 py-0.5 rounded-full uppercase tracking-wider">Group</span>
                  )}
                </div>
                {selectedChannel?.type === "DIRECT" ? (
                  <p className="text-xs text-[#5c6b72] mt-0.5">Direct Message</p>
                ) : selectedChannel?.description ? (
                  <p className="text-xs text-[#bbc9cf] mt-0.5">{selectedChannel.description}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                {/* AI Summarize dropdown */}
                <div className="relative group">
                  <button
                    onClick={() => void handleSummarize("summary")}
                    disabled={summarizing || messages.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[rgba(0,255,255,0.1)] text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6] disabled:opacity-40 transition-colors"
                    title="AI tools"
                  >
                    {summarizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-[#a5e7ff]" />}
                    <span className="hidden sm:inline">{summarizing ? "Thinking…" : "AI"}</span>
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  <div className="absolute right-0 top-full mt-1 w-44 bg-[#1b1f2e]/90 backdrop-blur-sm border border-[rgba(0,255,255,0.1)] rounded-xl shadow-xl z-20 py-1 hidden group-hover:block">
                    {([
                      { mode: "summary" as const,           label: "Summarize channel" },
                      { mode: "action-items" as const,      label: "Extract action items" },
                      { mode: "schedule-meeting" as const,  label: "Draft meeting agenda" },
                    ]).map(({ mode, label }) => (
                      <button
                        key={mode}
                        onClick={() => void handleSummarize(mode)}
                        className="w-full text-left px-3 py-2 text-xs text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6] transition-colors"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pinned messages toggle */}
                <button
                  onClick={() => { if (showPins) setShowPins(false); else void loadPinnedMessages(); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${showPins ? "border-[#00d2ff] text-[#00d2ff] bg-[#00d2ff]/10" : "border-[rgba(0,255,255,0.1)] text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6]"}`}
                  title="Pinned messages"
                >
                  <Pin className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Pins</span>
                </button>

                {onlineUsers.size > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#00feb2] animate-pulse" />
                    <span className="text-xs text-[#00feb2] font-medium">
                      {onlineUsers.size} online
                    </span>
                  </div>
                )}
                {/* Start a call */}
                <button
                  onClick={() => { if (selectedChannelId) window.open(`/meet/cybersage-${selectedChannelId}`, "_blank"); }}
                  title="Start a voice/video call"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[rgba(0,255,255,0.1)] text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6] transition-colors"
                >
                  <Video className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Call</span>
                </button>

                {/* Web Push toggle */}
                <button
                  onClick={() => void togglePush()}
                  disabled={pushLoading}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${pushEnabled ? "border-[#00d2ff] text-[#00d2ff] bg-[#00d2ff]/10" : "border-[rgba(0,255,255,0.1)] text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6]"} disabled:opacity-40`}
                  title={pushEnabled ? "Disable urgent push notifications" : "Enable push for urgent messages"}
                >
                  {pushLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span className="text-sm">{pushEnabled ? "🔔" : "🔕"}</span>}
                </button>
                {selectedChannel?.type !== "DIRECT" && (
                  <button
                    onClick={() => setShowAddMembers(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[rgba(0,255,255,0.1)] text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6] transition-colors"
                    title="Add members"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Add</span>
                  </button>
                )}
                <div className="flex items-center gap-1 text-[#bbc9cf] text-xs">
                  <Users className="w-4 h-4" />
                  <span>{selectedChannel?.members.length ?? 0} members</span>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto py-4 space-y-1 bg-[#0f1321]">
              {loadingMessages ? (
                <div className="text-center text-[#bbc9cf] py-8 text-sm">Loading messages…</div>
              ) : messages.length === 0 ? (
                <div className="text-center text-[#bbc9cf] py-12">
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
                      onReply={openThread}
                      onPin={handlePin}
                      memberNames={memberNames}
                    />
                  )
                )
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Typing / bot indicator */}
            <div className="px-6 py-2 h-7 flex items-center flex-shrink-0 bg-[#0f1321]">
              {botResponding ? (
                <p className="text-xs text-[#bbc9cf] italic animate-pulse flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-[#a5e7ff]" /> CyberSage AI is thinking…
                </p>
              ) : typingNames.size > 0 && (
                <p className="text-xs text-[#bbc9cf] italic animate-pulse">
                  {Array.from(typingNames.values()).join(", ")}{" "}
                  {typingNames.size === 1 ? "is" : "are"} typing…
                </p>
              )}
            </div>

            {/* Composer */}
            <div className="px-4 py-3 border-t border-[rgba(0,255,255,0.1)] bg-[#1b1f2e] flex-shrink-0">
              {/* Voice note preview */}
              {audioBlob && (
                <div className="flex items-center gap-3 mb-2 bg-[#0f1321] border border-[rgba(0,255,255,0.1)] rounded-lg px-3 py-2">
                  <audio src={URL.createObjectURL(audioBlob)} controls className="flex-1 h-8" />
                  <button onClick={() => void sendVoiceNote()} disabled={uploadingFile} className="bg-[#00d2ff] text-[#003543] px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40">Send</button>
                  <button onClick={() => setAudioBlob(null)} className="text-[#bbc9cf] hover:text-[#ff4d6d]"><X className="w-4 h-4" /></button>
                </div>
              )}

              <div className="relative">
                {/* @mention autocomplete */}
                {mentionQuery !== null && mentionResults.length > 0 && (
                  <div className="absolute bottom-full left-0 mb-1 w-64 bg-[#1b1f2e] border border-[rgba(0,255,255,0.1)] rounded-xl shadow-xl z-50 overflow-hidden">
                    {mentionResults.map(u => (
                      <button
                        key={u.id}
                        onClick={() => insertMention(u.fullName)}
                        className="w-full text-left px-3 py-2 text-sm text-[#dfe1f6] hover:bg-[#262939] flex items-center gap-2"
                      >
                        <span className="w-6 h-6 rounded-full bg-[#00d2ff]/20 text-[#a5e7ff] flex items-center justify-center text-xs font-bold flex-shrink-0">
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
                    <img src={composerAttachment.url} alt={composerAttachment.name} className="max-h-28 rounded-lg border border-[rgba(0,210,255,0.2)]" />
                    <button
                      onClick={() => setComposerAttachment(null)}
                      className="absolute -top-1.5 -right-1.5 bg-[#ff4d6d] text-white rounded-full w-4 h-4 flex items-center justify-center text-xs leading-none"
                    >×</button>
                  </div>
                )}

                <div className={`flex items-end gap-3 bg-[#0f1321] border rounded-lg px-4 py-2.5 transition-colors ${composerUrgent ? "border-[#ff4d6d]/50 bg-[#ff4d6d]/5" : "border-[rgba(0,255,255,0.1)]"}`}>
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
                    placeholder={composerUrgent ? `🚨 Urgent message to #${selectedChannel?.name ?? ""}` : `Message #${selectedChannel?.name ?? ""}`}
                    rows={1}
                    className="flex-1 bg-transparent resize-none text-sm text-[#dfe1f6] placeholder-[#bbc9cf] outline-none max-h-32 overflow-y-auto"
                    style={{ minHeight: "1.5rem" }}
                  />
                  {/* Emoji insert */}
                  <button onClick={() => { setMediaPickerTab("emoji"); setShowGifPicker(true); }} title="Insert emoji" className="p-2 rounded-lg transition-colors flex-shrink-0 text-sm text-[#5c6b72] hover:text-[#bbc9cf] hover:bg-[#262939]">😊</button>
                  {/* Sticker */}
                  <button onClick={() => { setMediaPickerTab("sticker"); setShowGifPicker(true); }} title="Send a sticker" className="p-2 rounded-lg transition-colors flex-shrink-0 text-sm text-[#5c6b72] hover:text-[#bbc9cf] hover:bg-[#262939]">🎭</button>
                  {/* GIF */}
                  <button onClick={() => { setMediaPickerTab("gif"); setShowGifPicker(true); }} title="Send a GIF" className="p-2 rounded-lg transition-colors flex-shrink-0 text-xs font-bold text-[#5c6b72] hover:text-[#bbc9cf] hover:bg-[#262939]">GIF</button>
                  {/* Urgent flag toggle */}
                  <button
                    onClick={() => setComposerUrgent(v => !v)}
                    title={composerUrgent ? "Remove urgent flag" : "Mark as urgent"}
                    className={`p-2 rounded-lg transition-colors flex-shrink-0 text-sm ${composerUrgent ? "bg-[#ff4d6d]/20 text-[#ff4d6d]" : "text-[#5c6b72] hover:text-[#bbc9cf] hover:bg-[#262939]"}`}
                  >
                    🚨
                  </button>
                  {/* Voice note button */}
                  <button
                    onClick={recording ? stopRecording : () => void startRecording()}
                    className={`p-2 rounded-lg transition-colors flex-shrink-0 ${recording ? "bg-[#ff4d6d] text-white animate-pulse" : "text-[#bbc9cf] hover:text-[#dfe1f6] hover:bg-[#262939]"}`}
                    title={recording ? "Stop recording" : "Record voice note"}
                  >
                    {recording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={sendMessage}
                    disabled={(!composerText.trim() && !composerAttachment) || sending}
                    className="bg-[#00d2ff] text-[#003543] hover:bg-[#47d6ff] rounded-lg p-2 transition-colors disabled:opacity-40 flex-shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-[#bbc9cf] mt-1.5 ml-1">
                Enter to send · Shift+Enter for new line · Drag files to attach · @ to mention · ⌘K to navigate
              </p>
            </div>
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
            <div className="bg-[#1b1f2e] border-l border-[rgba(0,255,255,0.1)] w-80 flex flex-col flex-shrink-0">
              <div className="px-4 py-3 border-b border-[rgba(0,255,255,0.1)] flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#dfe1f6]">
                  <Pin className="w-4 h-4 text-[#00d2ff]" />
                  <span>Pinned Messages</span>
                  <span className="text-xs text-[#bbc9cf]">({pinnedMessages.length})</span>
                </div>
                <button onClick={() => setShowPins(false)} className="p-1.5 text-[#bbc9cf] hover:text-[#dfe1f6] hover:bg-[#262939] rounded-md transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto py-2">
                {pinnedMessages.length === 0 ? (
                  <div className="text-center text-[#bbc9cf] py-8">
                    <Pin className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-xs">No pinned messages yet.</p>
                  </div>
                ) : (
                  pinnedMessages.map(msg => (
                    <div key={msg.id} className="px-4 py-3 border-b border-[rgba(0,255,255,0.06)] hover:bg-[#262939] transition-colors">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-[#dfe1f6]">{msg.user.fullName}</span>
                        <span className="text-[10px] text-[#bbc9cf]">{formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}</span>
                      </div>
                      <p className="text-xs text-[#bbc9cf] line-clamp-3">{msg.content}</p>
                      <button
                        onClick={() => void handlePin(msg.id, false)}
                        className="mt-1.5 text-[10px] text-[#bbc9cf] hover:text-[#ff4d6d] flex items-center gap-1 transition-colors"
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
          existingDirectChannels={channels.filter((c) => c.type === "DIRECT" || c.type === "GROUP")}
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
