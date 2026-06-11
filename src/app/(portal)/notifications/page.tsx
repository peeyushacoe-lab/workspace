"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Bell, BellOff, Check, CheckCheck, Trash2, X,
  AtSign, Calendar, Shield, AlertTriangle, Mail,
  FileText, Settings, Loader2, RefreshCw, Filter,
} from "lucide-react";
import { PageHeader } from "@/components/Shell";
import { toast } from "sonner";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type NotificationType =
  | "MENTION"
  | "CALENDAR_INVITE"
  | "CALENDAR_REMINDER"
  | "SOC_ALERT"
  | "DLP_VIOLATION"
  | "NEW_MESSAGE"
  | "FILE_SHARED"
  | "SYSTEM";

type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  link?: string | null;
  createdAt: string;
};

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<NotificationType, {
  label: string;
  Icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
}> = {
  MENTION:           { label: "Mention",          Icon: AtSign,       color: "text-[#00d2ff]",   bg: "bg-[#00d2ff]/10",   border: "border-[#00d2ff]/20" },
  CALENDAR_INVITE:   { label: "Calendar Invite",  Icon: Calendar,     color: "text-violet-400",  bg: "bg-violet-400/10",  border: "border-violet-400/20" },
  CALENDAR_REMINDER: { label: "Reminder",         Icon: Calendar,     color: "text-amber-400",   bg: "bg-amber-400/10",   border: "border-amber-400/20" },
  SOC_ALERT:         { label: "SOC Alert",        Icon: Shield,       color: "text-red-400",     bg: "bg-red-400/10",     border: "border-red-400/20" },
  DLP_VIOLATION:     { label: "DLP Violation",    Icon: AlertTriangle,color: "text-orange-400",  bg: "bg-orange-400/10",  border: "border-orange-400/20" },
  NEW_MESSAGE:       { label: "New Message",      Icon: Mail,         color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20" },
  FILE_SHARED:       { label: "File Shared",      Icon: FileText,     color: "text-sky-400",     bg: "bg-sky-400/10",     border: "border-sky-400/20" },
  SYSTEM:            { label: "System",           Icon: Settings,     color: "text-[#5c6b72]",   bg: "bg-[#5c6b72]/10",  border: "border-[#5c6b72]/20" },
};

const ALL_TYPES = Object.keys(TYPE_CONFIG) as NotificationType[];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)    return "just now";
  if (mins < 60)   return `${mins}m ago`;
  if (hours < 24)  return `${hours}h ago`;
  if (days < 7)    return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function groupByDate(notifications: Notification[]): Array<{ label: string; items: Notification[] }> {
  const groups = new Map<string, Notification[]>();
  const today     = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const weekAgo   = new Date(today); weekAgo.setDate(today.getDate() - 7);

  for (const n of notifications) {
    const d = new Date(n.createdAt); d.setHours(0,0,0,0);
    let label: string;
    if (d >= today)     label = "Today";
    else if (d >= yesterday) label = "Yesterday";
    else if (d >= weekAgo)   label = "This Week";
    else                     label = "Older";
    const arr = groups.get(label) ?? [];
    arr.push(n);
    groups.set(label, arr);
  }

  const ORDER = ["Today", "Yesterday", "This Week", "Older"];
  return ORDER
    .filter((l) => groups.has(l))
    .map((label) => ({ label, items: groups.get(label)! }));
}

// ─── Notification Row ─────────────────────────────────────────────────────────

function NotificationRow({
  notification,
  onMarkRead,
  onDelete,
}: {
  notification: Notification;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const cfg = TYPE_CONFIG[notification.type] ?? TYPE_CONFIG.SYSTEM;
  const Icon = cfg.Icon;

  const inner = (
    <div
      className={[
        "group relative flex items-start gap-3 px-4 py-3.5 transition-colors",
        "hover:bg-[#262939]/40 cursor-pointer",
        !notification.read ? "bg-[#1b1f2e]" : "bg-transparent",
      ].join(" ")}
    >
      {/* Unread dot */}
      {!notification.read && (
        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#00d2ff]" />
      )}

      {/* Icon */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${cfg.bg} border ${cfg.border}`}>
        <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${cfg.color} ${cfg.bg} border ${cfg.border}`}>
            {cfg.label}
          </span>
          <span className="text-[10px] text-[#5c6b72] ml-auto">{timeAgo(notification.createdAt)}</span>
        </div>
        <p className={`text-sm font-medium mt-1 leading-snug ${notification.read ? "text-[#bbc9cf]" : "text-[#dfe1f6]"}`}>
          {notification.title}
        </p>
        <p className="text-xs text-[#5c6b72] mt-0.5 line-clamp-2">{notification.body}</p>
      </div>

      {/* Actions — revealed on hover */}
      <div className="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {!notification.read && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMarkRead(notification.id); }}
            className="p-1.5 rounded text-[#5c6b72] hover:text-emerald-400 hover:bg-[#0f1321] transition-colors"
            title="Mark as read"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(notification.id); }}
          className="p-1.5 rounded text-[#5c6b72] hover:text-red-400 hover:bg-[#0f1321] transition-colors"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );

  if (notification.link) {
    return <Link href={notification.link} className="block">{inner}</Link>;
  }
  return inner;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const FILTERS: Array<{ label: string; value: NotificationType | "all" }> = [
  { label: "All",       value: "all" },
  { label: "Security",  value: "SOC_ALERT" },
  { label: "Mentions",  value: "MENTION" },
  { label: "Messages",  value: "NEW_MESSAGE" },
  { label: "Calendar",  value: "CALENDAR_INVITE" },
  { label: "System",    value: "SYSTEM" },
];

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [loading, setLoading]             = useState(true);
  const [filter, setFilter]               = useState<NotificationType | "all">("all");
  const [unreadOnly, setUnreadOnly]       = useState(false);
  const sseRef = useRef<EventSource | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=100");
      if (res.ok) {
        const data = await res.json() as { notifications: Notification[]; unreadCount: number };
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── SSE real-time ──────────────────────────────────────────────────────
  useEffect(() => {
    const es = new EventSource("/api/notifications/stream");
    sseRef.current = es;
    es.onmessage = (e) => {
      try {
        const n = JSON.parse(e.data as string) as Notification;
        setNotifications((prev) => [{ ...n, read: false }, ...prev]);
        setUnreadCount((c) => c + 1);
      } catch { /* ignore parse errors */ }
    };
    return () => es.close();
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────
  const markRead = async (id: string) => {
    const res = await fetch(`/api/notifications/${id}`, { method: "PATCH" });
    if (res.ok) {
      setNotifications((prev) =>
        prev.map((n) => n.id === id ? { ...n, read: true } : n)
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }
  };

  const deleteOne = async (id: string) => {
    const wasUnread = notifications.find((n) => n.id === id)?.read === false;
    const res = await fetch(`/api/notifications/${id}`, { method: "DELETE" });
    if (res.ok) {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      if (wasUnread) setUnreadCount((c) => Math.max(0, c - 1));
    }
  };

  const markAllRead = async () => {
    const res = await fetch("/api/notifications", { method: "DELETE" });
    if (res.ok) {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
      toast.success("All notifications marked as read");
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────
  const filtered = notifications.filter((n) => {
    if (unreadOnly && n.read) return false;
    if (filter !== "all") {
      if (filter === "CALENDAR_INVITE") {
        return n.type === "CALENDAR_INVITE" || n.type === "CALENDAR_REMINDER";
      }
      return n.type === filter;
    }
    return true;
  });

  const groups = groupByDate(filtered);

  return (
    <div className="min-h-screen bg-[#0f1321] text-[#dfe1f6]">
      <PageHeader
        eyebrow="Workspace"
        title="Notifications"
        description="Stay on top of what matters."
        action={
          unreadCount > 0 ? (
            <button
              onClick={() => void markAllRead()}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </button>
          ) : null
        }
      />

      <div className="max-w-3xl px-6 pb-12 space-y-4">

        {/* Stats + controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Unread badge */}
          {unreadCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00d2ff]/10 border border-[#00d2ff]/20">
              <Bell className="w-3 h-3 text-[#00d2ff]" />
              <span className="text-xs font-semibold text-[#00d2ff]">{unreadCount} unread</span>
            </div>
          )}

          {/* Unread toggle */}
          <button
            onClick={() => setUnreadOnly((v) => !v)}
            className={[
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
              unreadOnly
                ? "bg-[#00d2ff]/10 text-[#00d2ff] border-[#00d2ff]/20"
                : "bg-[#1b1f2e] text-[#5c6b72] border-[rgba(0,255,255,0.08)] hover:text-[#bbc9cf]",
            ].join(" ")}
          >
            <Filter className="w-3 h-3" />
            {unreadOnly ? "Unread only" : "Show all"}
          </button>

          {/* Refresh */}
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1b1f2e] text-[#5c6b72] border border-[rgba(0,255,255,0.08)] hover:text-[#bbc9cf] transition-colors disabled:opacity-50 ml-auto"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Type filter pills */}
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(({ label, value }) => {
            const active = filter === value;
            const count = value === "all"
              ? notifications.filter((n) => !n.read).length
              : value === "CALENDAR_INVITE"
                ? notifications.filter((n) => !n.read && (n.type === "CALENDAR_INVITE" || n.type === "CALENDAR_REMINDER")).length
                : notifications.filter((n) => !n.read && n.type === value).length;
            return (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={[
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
                  active
                    ? "bg-[#00d2ff]/15 text-[#00d2ff] border-[#00d2ff]/30"
                    : "bg-[#1b1f2e] text-[#5c6b72] border-[rgba(0,255,255,0.08)] hover:text-[#bbc9cf] hover:border-[rgba(0,255,255,0.2)]",
                ].join(" ")}
              >
                {label}
                {count > 0 && (
                  <span className={`px-1 min-w-[16px] text-center rounded-full text-[9px] font-bold ${active ? "bg-[#00d2ff]/20 text-[#00d2ff]" : "bg-[#262939] text-[#5c6b72]"}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Notification list */}
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-[#5c6b72]">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading notifications…</span>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#1b1f2e] border border-[rgba(0,255,255,0.08)] flex items-center justify-center">
              <BellOff className="w-6 h-6 text-[#3c4f5a]" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-[#bbc9cf]">
                {unreadOnly ? "No unread notifications" : "All quiet"}
              </p>
              <p className="text-xs text-[#5c6b72] mt-1">
                {unreadOnly ? "Switch to 'Show all' to see past notifications." : "You're up to date."}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map(({ label, items }) => (
              <div key={label}>
                {/* Date group header */}
                <div className="flex items-center gap-3 mb-1 px-4">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-[#3c4f5a]">{label}</span>
                  <div className="flex-1 h-px bg-[rgba(0,255,255,0.05)]" />
                </div>

                {/* Card */}
                <div className="bg-[#1b1f2e] border border-[rgba(0,255,255,0.08)] rounded-xl overflow-hidden divide-y divide-[rgba(0,255,255,0.04)]">
                  {items.map((n) => (
                    <NotificationRow
                      key={n.id}
                      notification={n}
                      onMarkRead={markRead}
                      onDelete={deleteOne}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Count summary */}
        {!loading && notifications.length > 0 && (
          <p className="text-center text-xs text-[#3c4f5a] pt-2">
            {filtered.length} of {notifications.length} notifications shown
          </p>
        )}
      </div>
    </div>
  );
}
