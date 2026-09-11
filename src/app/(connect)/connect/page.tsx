"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  MessageSquare, AtSign, Video, FolderOpen, Bell, ArrowRight, Hash,
  Users, RefreshCw, CheckCircle2, Pencil, Calendar, Zap,
} from "lucide-react";
import { avatarGradient } from "@/lib/avatar";
import type {
  ConnectHomeResponse,
  ConnectConversation,
  ConnectMeeting,
} from "@/app/api/connect/home/route";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

function greeting(d: Date): string {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function relative(iso: string, now: number): string {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

function clockTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  count,
  label,
  href,
  accent,
}: {
  icon: React.ElementType;
  count: number;
  label: string;
  href: string;
  accent?: boolean;
}) {
  const hot = count > 0 && accent;
  return (
    <Link
      href={href}
      className={`group flex flex-col gap-2 rounded-xl border p-4 shadow-sm transition-all hover:shadow-panel hover:-translate-y-px ${focusRing} ${
        hot
          ? "border-accent/30 bg-accent-soft"
          : "border-border bg-surface hover:border-border-strong"
      }`}
    >
      <div className="flex items-center justify-between">
        <Icon className={`h-4 w-4 ${hot ? "text-accent" : "text-subtle"}`} aria-hidden />
        <ArrowRight className="h-3.5 w-3.5 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div>
        <p className={`text-2xl font-bold tracking-tight leading-none tabular-nums ${hot ? "text-accent" : count > 0 ? "text-foreground" : "text-subtle"}`}>
          {count}
        </p>
        <p className={`mt-1 text-[11px] font-medium ${hot ? "text-accent-strong" : "text-muted"}`}>{label}</p>
      </div>
    </Link>
  );
}

// ── Conversation row ───────────────────────────────────────────────────────────

function ConversationRow({ c, now }: { c: ConnectConversation; now: number }) {
  const isDirect = c.kind === "DIRECT";
  const isGroup = c.kind === "GROUP";

  return (
    <Link
      href={`/connect/chat?channel=${encodeURIComponent(c.channelId)}`}
      className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-hover ${focusRing}`}
    >
      {c.unread && (
        <span aria-hidden className="absolute left-1 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-accent" />
      )}

      {/* Avatar */}
      {isDirect ? (
        <div
          className="relative h-9 w-9 flex-shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold text-accent-foreground"
          style={{ background: avatarGradient(c.title) }}
        >
          {c.title.charAt(0).toUpperCase()}
        </div>
      ) : (
        <div className="h-9 w-9 flex-shrink-0 rounded-xl bg-surface-sunken border border-border flex items-center justify-center">
          {isGroup
            ? <Users className="h-4 w-4 text-muted" />
            : <Hash className="h-4 w-4 text-muted" />}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={`flex-1 truncate text-[13px] leading-tight ${c.unread ? "font-semibold text-foreground" : "font-medium text-muted"}`}>
            {c.title}
          </span>
          <time dateTime={c.at} className="flex-shrink-0 text-[10px] tabular-nums text-subtle">
            {relative(c.at, now)}
          </time>
        </div>
        <p className={`mt-0.5 truncate text-[12px] ${c.unread ? "text-foreground/70 font-medium" : "text-subtle"}`}>
          <span className="font-medium text-muted">{c.authorName.split(" ")[0]}:</span>{" "}
          {c.preview}
        </p>
      </div>

      {c.unread && (
        <span className="h-2 w-2 flex-shrink-0 rounded-full bg-accent" aria-label="Unread" />
      )}
    </Link>
  );
}

// ── Meeting row ────────────────────────────────────────────────────────────────

function MeetingRow({ m }: { m: ConnectMeeting }) {
  const live = m.status === "LIVE";
  return (
    <Link
      href={`/meet/${encodeURIComponent(m.roomName)}`}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-hover ${focusRing}`}
    >
      <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${live ? "bg-ok-soft" : "bg-surface-sunken"}`}>
        <Video className={`h-4 w-4 ${live ? "text-ok" : "text-muted"}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-foreground">{m.title}</p>
        <p className="text-[11px] text-subtle">{live ? "Live now" : clockTime(m.at)}</p>
      </div>
      {live && (
        <span className="flex flex-shrink-0 items-center gap-1 rounded-full bg-ok-soft border border-ok/25 px-2 py-0.5 text-[10px] font-semibold text-ok">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ok" aria-hidden />
          Join
        </span>
      )}
    </Link>
  );
}

// ── Quick actions ──────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { icon: Pencil, label: "New message", href: "/connect/chat", color: "text-accent bg-accent-soft" },
  { icon: Calendar, label: "Schedule meeting", href: "/connect/meetings", color: "text-violet bg-violet-soft" },
  { icon: FolderOpen, label: "Shared files", href: "/connect/files", color: "text-ok bg-ok-soft" },
  { icon: Zap, label: "Activity", href: "/connect/activity", color: "text-warn bg-warn-soft" },
];

// ── Skeleton ───────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="h-9 w-9 flex-shrink-0 animate-pulse rounded-full bg-surface-sunken" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="h-2.5 w-1/3 animate-pulse rounded-full bg-surface-sunken" />
        <div className="h-2 w-2/3 animate-pulse rounded-full bg-surface-sunken" />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ConnectHomePage() {
  const [data, setData] = useState<ConnectHomeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const res = await fetch("/api/connect/home", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as ConnectHomeResponse);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setNow(Date.now());
    void load(true);
    const t = setInterval(() => { setNow(Date.now()); void load(true); }, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const counts = data?.counts;
  const totalAttention = counts
    ? counts.unreadConversations + counts.mentions + counts.notifications
    : -1;
  const allQuiet = totalAttention === 0;

  return (
    <div className="px-5 py-6 lg:px-8 max-w-5xl mx-auto">

      {/* ── Hero greeting ────────────────────────────────────────────────── */}
      <header className="mb-7 flex items-start justify-between gap-4">
        <div>
          <p className="mb-0.5 text-[11px] font-semibold text-subtle uppercase tracking-wider">
            {now ? dayLabel(new Date(now)) : " "}
          </p>
          <h1 className="text-[26px] font-bold leading-tight tracking-[-0.03em] text-foreground">
            {now && data ? `${greeting(new Date(now))}, ${data.greetingName}` : " "}
          </h1>
          <p className="mt-1.5 text-[13px] text-muted" aria-live="polite">
            {!data ? " " : allQuiet
              ? "You're all caught up — nothing waiting."
              : `${totalAttention > 0 ? `${totalAttention} item${totalAttention > 1 ? "s" : ""} need your attention.` : "Here's what's happening."}`}
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={refreshing}
          className={`flex-shrink-0 flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12px] font-medium text-muted shadow-sm transition-colors hover:bg-hover hover:text-foreground disabled:opacity-50 ${focusRing}`}
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </header>

      {/* ── Stat cards ───────────────────────────────────────────────────── */}
      <div className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {counts ? (
          <>
            <StatCard icon={MessageSquare} count={counts.unreadConversations} label="Unread" href="/connect/chat" accent />
            <StatCard icon={AtSign} count={counts.mentions} label="Mentions" href="/connect/activity" accent />
            <StatCard icon={Video} count={counts.meetingsToday} label="Meetings today" href="/connect/meetings" />
            <StatCard icon={FolderOpen} count={counts.filesShared} label="Shared files" href="/connect/files" />
            <StatCard icon={Bell} count={counts.notifications} label="Notifications" href="/notifications" />
          </>
        ) : (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <div className="mb-3 h-4 w-4 animate-pulse rounded bg-surface-sunken" />
              <div className="h-6 w-8 animate-pulse rounded-lg bg-surface-sunken mb-2" />
              <div className="h-2.5 w-16 animate-pulse rounded-full bg-surface-sunken" />
            </div>
          ))
        )}
      </div>

      {/* ── Quick actions strip ───────────────────────────────────────────── */}
      <div className="mb-7 flex flex-wrap gap-2">
        {QUICK_ACTIONS.map(({ icon: Icon, label, href, color }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-foreground shadow-sm transition-all hover:border-border-strong hover:shadow-panel hover:-translate-y-px ${focusRing}`}
          >
            <span className={`flex h-6 w-6 items-center justify-center rounded-lg ${color}`}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            {label}
          </Link>
        ))}
      </div>

      {/* ── Two-column body ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

        {/* Left: conversations */}
        <section className="lg:col-span-2 rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
            <h2 className="text-[13px] font-semibold text-foreground">Recent conversations</h2>
            <Link
              href="/connect/chat"
              className={`flex items-center gap-1 rounded px-1 text-[12px] font-medium text-muted transition-colors hover:text-foreground ${focusRing}`}
            >
              View all
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {allQuiet && !loading && data && (
            <div className="flex flex-col items-center gap-2 py-12 px-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ok-soft">
                <CheckCircle2 className="h-6 w-6 text-ok" />
              </div>
              <p className="text-[13px] font-semibold text-foreground">All caught up</p>
              <p className="text-[12px] text-muted">No unread conversations.</p>
              <Link
                href="/connect/chat"
                className={`mt-1 inline-flex items-center gap-1.5 rounded-lg bg-accent-soft px-3 py-1.5 text-[12px] font-semibold text-accent hover:bg-accent/20 transition-colors ${focusRing}`}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Start a conversation
              </Link>
            </div>
          )}

          <div className="p-1.5">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
            ) : data && data.conversations.length > 0 && now !== null ? (
              data.conversations.map((c) => (
                <ConversationRow key={c.channelId} c={c} now={now} />
              ))
            ) : !allQuiet ? (
              <p className="py-10 text-center text-xs text-subtle">
                No conversations yet — start one from Chat.
              </p>
            ) : null}
          </div>
        </section>

        {/* Right: meetings */}
        <section className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
            <h2 className="text-[13px] font-semibold text-foreground">Upcoming meetings</h2>
            <Link
              href="/connect/meetings"
              className={`flex items-center gap-1 rounded px-1 text-[12px] font-medium text-muted transition-colors hover:text-foreground ${focusRing}`}
            >
              View all
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="p-1.5">
            {loading ? (
              Array.from({ length: 2 }).map((_, i) => <SkeletonRow key={i} />)
            ) : data && data.upcoming.length > 0 ? (
              data.upcoming.map((m) => <MeetingRow key={m.id} m={m} />)
            ) : (
              <div className="flex flex-col items-center gap-2 py-10 text-center px-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-sunken">
                  <Video className="h-5 w-5 text-subtle" />
                </div>
                <p className="text-[12px] text-subtle">Nothing scheduled today.</p>
                <Link
                  href="/connect/meetings"
                  className={`text-[12px] font-medium text-accent hover:underline ${focusRing}`}
                >
                  Schedule a meeting →
                </Link>
              </div>
            )}
          </div>
        </section>
      </div>

      {failed && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-warn/25 bg-warn-soft px-4 py-2.5">
          <p className="flex-1 text-[12px] text-warn">Couldn&apos;t refresh — showing cached data.</p>
          <button
            onClick={() => void load()}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium text-warn transition-colors hover:bg-warn/10 ${focusRing}`}
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
