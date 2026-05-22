"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { NotificationType } from "@/generated/prisma/enums";

type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  link: string | null;
  createdAt: string;
};

type Toast = Omit<Notification, "read">;

const TYPE_ICON: Record<NotificationType, string> = {
  MENTION: "🔔",
  CALENDAR_INVITE: "📅",
  CALENDAR_REMINDER: "📅",
  SOC_ALERT: "🚨",
  DLP_VIOLATION: "🛡",
  NEW_MESSAGE: "💬",
  FILE_SHARED: "📁",
  SYSTEM: "ℹ️",
};

const TYPE_COLOR: Record<NotificationType, string> = {
  MENTION: "bg-[#00d2ff]/10 text-[#00d2ff]",
  CALENDAR_INVITE: "bg-purple-500/10 text-purple-300",
  CALENDAR_REMINDER: "bg-purple-500/10 text-purple-300",
  SOC_ALERT: "bg-[#ff4d6d]/10 text-[#ff4d6d]",
  DLP_VIOLATION: "bg-orange-500/10 text-orange-300",
  NEW_MESSAGE: "bg-[#00feb2]/10 text-[#00feb2]",
  FILE_SHARED: "bg-yellow-500/10 text-yellow-300",
  SYSTEM: "bg-[#262939] text-[#bbc9cf]",
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

export function NotificationCenter({ userId, dark = false }: { userId: string; dark?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json() as { notifications: Notification[]; unreadCount: number };
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {}
  }, []);

  useEffect(() => {
    if (document.visibilityState !== "visible") return;
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    let es: EventSource | null = null;

    function connect() {
      if (es) return;
      es = new EventSource("/api/notifications/stream");
      es.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data) as Toast;
          setUnreadCount((c) => c + 1);
          setNotifications((prev) => [
            { ...payload, read: false },
            ...prev,
          ]);
          const toast = payload;
          setToasts((t) => [...t, toast]);
          setTimeout(() => {
            setToasts((t) => t.filter((x) => x.id !== toast.id));
          }, 4_000);
        } catch {}
      };
      es.onerror = () => { es?.close(); es = null; };
    }

    function disconnect() {
      es?.close();
      es = null;
    }

    function onVisibility() {
      if (document.visibilityState === "visible") connect();
      else disconnect();
    }

    if (document.visibilityState === "visible") connect();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [userId]);

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
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await fetch(`/api/notifications/${id}`, { method: "PATCH" });
    } catch {}
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await fetch("/api/notifications", { method: "DELETE" });
    } catch {}
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
          className="relative p-2 text-[#bbc9cf] hover:text-[#dfe1f6] hover:bg-[#262939] rounded-full transition-colors"
          aria-label="Notifications"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[#ff4d6d] ring-2 ring-[#1b1f2e]" />
          )}
        </button>

        {open && (
          <div className="absolute right-0 top-10 bg-[#1b1f2e] border border-[rgba(0,255,255,0.1)] rounded-xl shadow-xl w-80 z-50">
            <div className="px-4 py-3 border-b border-[rgba(0,255,255,0.1)] flex items-center justify-between">
              <h2 className="font-semibold text-[#dfe1f6] text-sm">Notifications</h2>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-[#00d2ff] hover:text-[#47d6ff] font-medium"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="flex border-b border-[rgba(0,255,255,0.1)]">
              {(["all", "unread"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 py-2 text-xs font-medium transition-colors capitalize ${
                    tab === t
                      ? "border-b-2 border-[#00d2ff] text-[#00d2ff]"
                      : "text-[#bbc9cf] hover:text-[#dfe1f6]"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {displayed.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-[#bbc9cf]">
                  <span className="text-3xl mb-2">🔔</span>
                  <p className="text-sm">No notifications</p>
                </div>
              ) : (
                Object.entries(groups).map(([label, items]) =>
                  items.length === 0 ? null : (
                    <div key={label}>
                      <div className="sticky top-0 px-4 py-1.5 text-xs font-semibold text-[#bbc9cf] uppercase tracking-wider bg-[#262939] border-b border-[rgba(0,255,255,0.1)]">
                        {label}
                      </div>
                      {items.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => handleClick(n)}
                          className={`px-4 py-3 border-b border-[rgba(0,255,255,0.1)] hover:bg-[#262939] cursor-pointer transition-colors flex gap-3 w-full text-left ${
                            !n.read ? "bg-[#00d2ff]/5" : ""
                          }`}
                        >
                          <span
                            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm ${TYPE_COLOR[n.type]}`}
                          >
                            {TYPE_ICON[n.type]}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium text-[#dfe1f6] leading-tight truncate">
                                {n.title}
                              </p>
                              <span className="shrink-0 text-xs text-[#bbc9cf] mt-0.5">
                                {timeAgo(n.createdAt)}
                              </span>
                            </div>
                            <p className="text-xs text-[#bbc9cf] line-clamp-2">{n.body}</p>
                          </div>
                          {!n.read && (
                            <span className="w-2 h-2 rounded-full bg-[#00d2ff] flex-shrink-0 mt-1" />
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

      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-start gap-3 rounded-xl border border-[rgba(0,255,255,0.1)] bg-[#1b1f2e] p-4 shadow-lg w-80 animate-in slide-in-from-bottom-2 fade-in duration-200"
          >
            <span
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm ${TYPE_COLOR[t.type]}`}
            >
              {TYPE_ICON[t.type]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[#dfe1f6] truncate">{t.title}</p>
              <p className="mt-0.5 text-xs text-[#bbc9cf] line-clamp-2">{t.body}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
