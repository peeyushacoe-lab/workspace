"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AtSign,
  CalendarDays,
  Siren,
  Shield,
  MessageSquare,
  Folder,
  Info,
  BellOff,
  Bell,
  X,
  CheckSquare,
  type LucideIcon,
} from "lucide-react";
import type { NotificationType } from "@/generated/prisma/enums";

type NotificationMetadata = {
  channelId?: string;
  urgent?: boolean;
  senderId?: string;
} | null;

type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  link: string | null;
  metadata?: NotificationMetadata;
  createdAt: string;
};

type Toast = Omit<Notification, "read">;

/** Channel id the user is actively viewing in ChatView (set by ChatView) — used
 *  to suppress popups for the conversation that's already on screen. */
declare global {
  interface Window {
    __activeChatChannelId?: string | null;
  }
}

const TYPE_ICON: Record<NotificationType, LucideIcon> = {
  MENTION: AtSign,
  CALENDAR_INVITE: CalendarDays,
  CALENDAR_REMINDER: CalendarDays,
  SOC_ALERT: Siren,
  DLP_VIOLATION: Shield,
  NEW_MESSAGE: MessageSquare,
  FILE_SHARED: Folder,
  SYSTEM: Info,
  TASK_ASSIGNED: CheckSquare,
  TASK_DUE_SOON: CheckSquare,
  TASK_COMMENT: CheckSquare,
};

function TypeIcon({ type }: { type: NotificationType }) {
  const Icon = TYPE_ICON[type] ?? Info;
  return <Icon className="h-3.5 w-3.5" />;
}

const TYPE_COLOR: Record<NotificationType, string> = {
  MENTION:           "bg-[#1a56db]/10 text-[#1a56db] border border-[#1a56db]/20",
  CALENDAR_INVITE:   "bg-violet-500/10 text-violet-600 border border-violet-500/20",
  CALENDAR_REMINDER: "bg-amber-500/10 text-amber-600 border border-amber-500/20",
  SOC_ALERT:         "bg-[#ea4335]/10 text-[#ea4335] border border-[#ea4335]/20",
  DLP_VIOLATION:     "bg-[#f4b400]/10 text-[#b06000] border border-[#f4b400]/20",
  NEW_MESSAGE:       "bg-[#0f9d58]/10 text-[#0f9d58] border border-[#0f9d58]/20",
  FILE_SHARED:       "bg-sky-500/10 text-sky-600 border border-sky-500/20",
  SYSTEM:            "bg-[#f1f3f4] text-[#5f6368] border border-[#e8eaed]",
  TASK_ASSIGNED:     "bg-[#0f9d58]/10 text-[#0f9d58] border border-[#0f9d58]/20",
  TASK_DUE_SOON:     "bg-[#f4b400]/10 text-[#b06000] border border-[#f4b400]/20",
  TASK_COMMENT:      "bg-[#1a56db]/10 text-[#1a56db] border border-[#1a56db]/20",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function groupByDay(notifications: Notification[]): Record<string, Notification[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups: Record<string, Notification[]> = { Today: [], Yesterday: [], Older: [] };
  for (const n of notifications) {
    const d = new Date(n.createdAt);
    d.setHours(0, 0, 0, 0);
    if (d.getTime() === today.getTime()) groups.Today.push(n);
    else if (d.getTime() === yesterday.getTime()) groups.Yesterday.push(n);
    else groups.Older.push(n);
  }
  return groups;
}

const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;

export function NotificationCenter({ userId, dark: _dark = false }: { userId: string; dark?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [urgentAlerts, setUrgentAlerts] = useState<Toast[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json() as { notifications: Notification[]; unreadCount: number };
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {}
  }, []);

  // Fetch on mount (when visible) and whenever the tab becomes visible again
  useEffect(() => {
    if (document.visibilityState === "visible") fetchNotifications();
  }, [fetchNotifications]);

  // SSE with exponential-backoff reconnect
  useEffect(() => {
    let es: EventSource | null = null;
    let unmounted = false;

    function connect() {
      if (unmounted || es) return;
      es = new EventSource("/api/notifications/stream");

      es.onmessage = (e) => {
        retryCountRef.current = 0; // successful message → reset backoff
        try {
          const payload = JSON.parse(e.data) as Toast;
          setUnreadCount((c) => c + 1);
          setNotifications((prev) => [{ ...payload, read: false }, ...prev]);

          // Don't pop anything for the conversation the user is looking at right now
          const chId = payload.metadata?.channelId;
          if (chId && window.__activeChatChannelId === chId) return;

          if (payload.metadata?.urgent) {
            // Urgent → persistent full-attention prompt, stays until dismissed
            setUrgentAlerts((prev) => (prev.some((x) => x.id === payload.id) ? prev : [...prev, payload]));
          } else {
            const t = payload;
            setToasts((prev) => [...prev, t]);
            setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 4_000);
          }
        } catch {}
      };

      es.onopen = () => { retryCountRef.current = 0; };

      es.onerror = () => {
        es?.close();
        es = null;
        if (unmounted) return;
        // Reconnect with exponential backoff
        const delay = Math.min(RECONNECT_BASE_MS * 2 ** retryCountRef.current, RECONNECT_MAX_MS);
        retryCountRef.current += 1;
        retryTimerRef.current = setTimeout(connect, delay);
      };
    }

    function disconnect() {
      unmounted = true;
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
      es?.close();
      es = null;
    }

    function onVisibility() {
      if (document.visibilityState === "visible") {
        // Reconnect SSE and catch up on missed notifications
        unmounted = false;
        retryCountRef.current = 0;
        connect();
        fetchNotifications();
      } else {
        unmounted = true;
        if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
        es?.close();
        es = null;
      }
    }

    if (document.visibilityState === "visible") connect();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      disconnect();
    };
  }, [userId, fetchNotifications]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const markRead = useCallback(async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try { await fetch(`/api/notifications/${id}`, { method: "PATCH" }); } catch {}
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try { await fetch("/api/notifications", { method: "DELETE" }); } catch {}
  }, []);

  const handleClick = useCallback(
    async (n: Notification) => {
      if (!n.read) await markRead(n.id);
      setOpen(false);
      if (n.link) router.push(n.link);
    },
    [markRead, router]
  );

  const displayed = tab === "unread" ? notifications.filter((n) => !n.read) : notifications;
  const groups = groupByDay(displayed);

  return (
    <>
      <div className="relative" ref={panelRef}>
        <button
          onClick={() => setOpen((o) => !o)}
          className="relative p-2 text-[#5f6368] hover:text-[#202124] hover:bg-[#f1f3f4] rounded-full transition-colors"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[#ea4335] ring-2 ring-white" />
          )}
        </button>

        {open && (
          <div className="absolute right-0 top-10 bg-white border border-[#e8eaed] rounded-xl shadow-xl w-80 z-50">
            <div className="px-4 py-3 border-b border-[#e8eaed] flex items-center justify-between">
              <h2 className="font-semibold text-[#202124] text-sm">Notifications</h2>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-[#1a56db] hover:text-[#1648c7] font-medium"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="flex border-b border-[#e8eaed]">
              {(["all", "unread"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 py-2 text-xs font-medium transition-colors capitalize ${
                    tab === t
                      ? "border-b-2 border-[#1a56db] text-[#1a56db]"
                      : "text-[#5f6368] hover:text-[#202124]"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {displayed.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-[#5f6368]">
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f1f3f4] border border-[#e8eaed]">
                    <BellOff className="h-5 w-5 text-[#80868b]" />
                  </span>
                  <p className="text-sm">No notifications</p>
                </div>
              ) : (
                Object.entries(groups).map(([label, items]) =>
                  items.length === 0 ? null : (
                    <div key={label}>
                      <div className="sticky top-0 px-4 py-1.5 text-xs font-semibold text-[#5f6368] bg-[#f8f9fa] border-b border-[#e8eaed]">
                        {label}
                      </div>
                      {items.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => handleClick(n)}
                          className={`px-4 py-3 border-b border-[#e8eaed] hover:bg-[#f8f9fa] cursor-pointer transition-colors flex gap-3 w-full text-left ${
                            !n.read ? "bg-[#1a56db]/5" : ""
                          }`}
                        >
                          <span
                            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${TYPE_COLOR[n.type] ?? TYPE_COLOR.SYSTEM}`}
                          >
                            <TypeIcon type={n.type} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium text-[#202124] leading-tight truncate">
                                {n.title}
                              </p>
                              <span className="shrink-0 text-xs text-[#80868b] mt-0.5">
                                {timeAgo(n.createdAt)}
                              </span>
                            </div>
                            <p className="text-xs text-[#5f6368] line-clamp-2">{n.body}</p>
                          </div>
                          {!n.read && (
                            <span className="w-2 h-2 rounded-full bg-[#1a56db] flex-shrink-0 mt-1" />
                          )}
                        </button>
                      ))}
                    </div>
                  )
                )
              )}
            </div>
          </div>
        )}
      </div>

      {/* Toast stack — bottom-right (click to open) */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setToasts((prev) => prev.filter((x) => x.id !== t.id));
              if (t.link) router.push(t.link);
            }}
            className="pointer-events-auto flex items-start gap-3 rounded-xl border border-[#e8eaed] bg-white p-4 shadow-lg w-80 text-left cursor-pointer hover:border-[#1a56db]/40 animate-in slide-in-from-bottom-2 fade-in duration-200 transition-colors"
          >
            <span
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${TYPE_COLOR[t.type] ?? TYPE_COLOR.SYSTEM}`}
            >
              <TypeIcon type={t.type} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[#202124] truncate">{t.title}</p>
              <p className="mt-0.5 text-xs text-[#5f6368] line-clamp-2">{t.body}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Urgent prompt — top-center, persists until dismissed, shown on every page */}
      {urgentAlerts.length > 0 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-[min(28rem,calc(100vw-2rem))]">
          {urgentAlerts.map((a) => (
            <div
              key={a.id}
              role="alertdialog"
              aria-label={a.title}
              className="flex items-start gap-3 rounded-xl border border-[#ea4335]/40 border-l-4 border-l-[#ea4335] bg-white p-4 shadow-xl animate-in slide-in-from-top-2 fade-in duration-200"
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#ea4335]/10 text-[#ea4335]">
                <Siren className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-[#ea4335]">Urgent message</p>
                <p className="mt-0.5 text-sm font-semibold text-[#202124] truncate">{a.title}</p>
                <p className="mt-0.5 text-xs text-[#5f6368] line-clamp-2">{a.body}</p>
                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setUrgentAlerts((prev) => prev.filter((x) => x.id !== a.id));
                      if (a.link) router.push(a.link);
                    }}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#ea4335] text-white hover:bg-[#d33426] transition-colors"
                  >
                    View message
                  </button>
                  <button
                    type="button"
                    onClick={() => setUrgentAlerts((prev) => prev.filter((x) => x.id !== a.id))}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg text-[#5f6368] hover:text-[#202124] hover:bg-[#f1f3f4] transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
              <button
                type="button"
                aria-label="Dismiss urgent alert"
                onClick={() => setUrgentAlerts((prev) => prev.filter((x) => x.id !== a.id))}
                className="p-1 rounded-md text-[#80868b] hover:text-[#202124] hover:bg-[#f1f3f4] transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
