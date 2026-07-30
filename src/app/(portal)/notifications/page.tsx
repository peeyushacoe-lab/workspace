"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Bell, BellOff, Check, CheckCheck, Trash2,
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
  MENTION:           { label: "Mention",          Icon: AtSign,       color: "text-accent",   bg: "bg-accent/10",   border: "border-accent/20" },
  CALENDAR_INVITE:   { label: "Calendar Invite",  Icon: Calendar,     color: "text-violet",  bg: "bg-violet/10",  border: "border-violet/20" },
  CALENDAR_REMINDER: { label: "Reminder",         Icon: Calendar,     color: "text-warn",   bg: "bg-warn/10",   border: "border-warn/20" },
  SOC_ALERT:         { label: "SOC Alert",        Icon: Shield,       color: "text-crit",     bg: "bg-crit/10",     border: "border-crit/20" },
  DLP_VIOLATION:     { label: "DLP Violation",    Icon: AlertTriangle,color: "text-warn",  bg: "bg-warn/10",  border: "border-warn/20" },
  NEW_MESSAGE:       { label: "New Message",      Icon: Mail,         color: "text-ok", bg: "bg-ok/10", border: "border-ok/20" },
  FILE_SHARED:       { label: "File Shared",      Icon: FileText,     color: "text-accent",     bg: "bg-accent/10",     border: "border-accent/20" },
  SYSTEM:            { label: "System",           Icon: Settings,     color: "text-subtle",   bg: "bg-border-strong/10",  border: "border-border-strong/20" },
};

const _ALL_TYPES = Object.keys(TYPE_CONFIG) as NotificationType[];

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
        "hover:bg-surface-sunken/40 cursor-pointer",
        !notification.read ? "bg-surface" : "bg-transparent",
      ].join(" ")}
    >
      {/* Unread dot */}
      {!notification.read && (
        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-accent" />
      )}

      {/* Icon */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${cfg.bg} border ${cfg.border}`}>
        <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cfg.color} ${cfg.bg} border ${cfg.border}`}>
            {cfg.label}
          </span>
          <span className="text-[10px] font-mono text-subtle ml-auto">{timeAgo(notification.createdAt)}</span>
        </div>
        <p className={`text-sm font-medium mt-1 leading-snug ${notification.read ? "text-muted" : "text-foreground"}`}>
          {notification.title}
        </p>
        <p className="text-xs text-subtle mt-0.5 line-clamp-2">{notification.body}</p>
      </div>

      {/* Actions — revealed on hover */}
      <div className="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {!notification.read && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMarkRead(notification.id); }}
            className="p-1.5 rounded text-subtle hover:text-ok hover:bg-surface transition-colors"
            title="Mark as read"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(notification.id); }}
          className="p-1.5 rounded text-subtle hover:text-crit hover:bg-surface transition-colors"
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
    <div className="min-h-full bg-surface text-foreground">
      <PageHeader
        eyebrow="Workspace"
        title="Notifications"
        description="Stay on top of what matters."
        action={
          unreadCount > 0 ? (
            <button
              onClick={() => void markAllRead()}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-ok/10 text-ok border border-ok/20 hover:bg-ok/20 transition-colors"
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
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/20">
              <Bell className="w-3 h-3 text-accent" />
              <span className="text-xs font-semibold text-accent"><span className="font-mono">{unreadCount}</span> unread</span>
            </div>
          )}

          {/* Unread toggle */}
          <button
            onClick={() => setUnreadOnly((v) => !v)}
            className={[
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
              unreadOnly
                ? "bg-accent/10 text-accent border-accent/20"
                : "bg-surface text-subtle border-border hover:text-muted",
            ].join(" ")}
          >
            <Filter className="w-3 h-3" />
            {unreadOnly ? "Unread only" : "Show all"}
          </button>

          {/* Refresh */}
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface text-subtle border border-border hover:text-muted transition-colors disabled:opacity-50 ml-auto"
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
                    ? "bg-accent/15 text-accent border-accent/30"
                    : "bg-surface text-subtle border-border hover:text-muted hover:border-border-strong",
                ].join(" ")}
              >
                {label}
                {count > 0 && (
                  <span className={`px-1 min-w-[16px] text-center rounded-full text-[9px] font-mono font-semibold ${active ? "bg-accent/20 text-accent" : "bg-surface-sunken text-subtle"}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Notification list */}
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-subtle">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading notifications…</span>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-14 h-14 rounded-2xl bg-surface border border-border flex items-center justify-center">
              <BellOff className="w-6 h-6 text-subtle" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-muted">
                {unreadOnly ? "No unread notifications" : "All quiet"}
              </p>
              <p className="text-xs text-subtle mt-1">
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
                  <span className="text-[10px] font-semibold text-muted">{label}</span>
                  <div className="flex-1 h-px bg-border-soft" />
                </div>

                {/* Card */}
                <div className="bg-surface border border-border rounded-xl overflow-hidden divide-y divide-border-soft">
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
          <p className="text-center text-xs text-subtle pt-2">
            <span className="font-mono">{filtered.length}</span> of <span className="font-mono">{notifications.length}</span> notifications shown
          </p>
        )}
      </div>
    </div>
  );
}
