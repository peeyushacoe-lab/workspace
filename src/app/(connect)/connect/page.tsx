"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  MessageSquare, AtSign, Video, FolderOpen, Bell, ArrowRight, Hash, Users, RefreshCw,
} from "lucide-react";
import { avatarGradient } from "@/lib/avatar";
import type {
  ConnectHomeResponse,
  ConnectConversation,
  ConnectMeeting,
} from "@/app/api/connect/home/route";

/**
 * Connect Home.
 *
 * The roadmap's brief was explicit: not a dashboard of statistics, but an answer
 * to "what do I need to respond to?". So the attention figures are a single
 * hairline-divided strip rather than five elevated cards — cards would make five
 * numbers compete with the one list that actually gets acted on. Every figure is
 * a link to the thing it counts, and a zero is greyed rather than emphasised.
 */

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

function greeting(d: Date): string {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** "now", "18m", "3h", "2d", "6 Aug" — the density a message list wants. */
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

function clockTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// ── Attention ledger ──────────────────────────────────────────────────────────

function LedgerItem({
  icon: Icon,
  count,
  label,
  href,
}: {
  icon: React.ElementType;
  count: number;
  label: string;
  href: string;
}) {
  const quiet = count === 0;
  return (
    <Link
      href={href}
      className={`group flex flex-1 items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-hover ${focusRing}`}
    >
      <Icon
        className={`h-4 w-4 flex-shrink-0 ${quiet ? "text-subtle" : "text-accent"}`}
        aria-hidden
      />
      <span className="min-w-0">
        <span
          className={`block text-lg font-semibold leading-none tabular-nums tracking-tight ${
            quiet ? "text-subtle" : "text-foreground"
          }`}
        >
          {count}
        </span>
        <span className="mt-1 block truncate text-xs text-muted">{label}</span>
      </span>
    </Link>
  );
}

// ── Rows ──────────────────────────────────────────────────────────────────────

function ConversationRow({ c, now }: { c: ConnectConversation; now: number }) {
  const KindIcon = c.kind === "CHANNEL" ? Hash : c.kind === "GROUP" ? Users : null;

  return (
    <Link
      href={`/connect/chat?channel=${encodeURIComponent(c.channelId)}`}
      className={`group relative flex items-start gap-3 rounded-lg py-2.5 pl-3 pr-3 transition-colors hover:bg-hover ${focusRing}`}
    >
      {c.unread && (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r-full bg-accent"
        />
      )}

      {KindIcon ? (
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-surface-sunken">
          <KindIcon className="h-4 w-4 text-muted" />
        </span>
      ) : (
        <span
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold uppercase text-accent-foreground"
          style={{ background: avatarGradient(c.title) }}
        >
          {c.title.charAt(0)}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span
            className={`truncate text-[13px] leading-tight ${
              c.unread ? "font-semibold text-foreground" : "font-medium text-muted"
            }`}
          >
            {c.title}
          </span>
          <time
            dateTime={c.at}
            className="ml-auto flex-shrink-0 text-[10px] tabular-nums text-subtle"
          >
            {relative(c.at, now)}
          </time>
        </span>
        <span className="mt-0.5 block truncate text-xs text-subtle">
          {c.authorName}: {c.preview}
        </span>
      </span>

      {c.unread && (
        <span className="sr-only">Unread</span>
      )}
    </Link>
  );
}

function MeetingRow({ m }: { m: ConnectMeeting }) {
  const live = m.status === "LIVE";
  return (
    <Link
      href={`/meet/${encodeURIComponent(m.roomName)}`}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-hover ${focusRing}`}
    >
      <time
        dateTime={m.at ?? undefined}
        className="w-12 flex-shrink-0 text-xs font-medium tabular-nums text-muted"
      >
        {clockTime(m.at)}
      </time>
      <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{m.title}</span>
      {live && (
        <span className="flex flex-shrink-0 items-center gap-1.5 rounded-full border border-ok/25 bg-ok-soft px-2 py-0.5 text-[10px] font-semibold text-ok">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ok" aria-hidden />
          Live
        </span>
      )}
    </Link>
  );
}

// ── Panels ────────────────────────────────────────────────────────────────────

function Panel({
  title,
  href,
  hrefLabel,
  children,
}: {
  title: string;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
        <h2 className="text-[13px] font-semibold tracking-tight text-foreground">{title}</h2>
        {href && (
          <Link
            href={href}
            className={`group flex items-center gap-1 rounded px-1 text-xs font-medium text-muted transition-colors hover:text-foreground ${focusRing}`}
          >
            {hrefLabel ?? "View all"}
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
      </div>
      <div className="p-1.5">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-3 py-8 text-center text-xs text-subtle">{text}</p>;
}

/**
 * Skeleton rather than a spinner. Home is polled and re-rendered often; a
 * centred spinner collapses the layout on every refresh, while a skeleton in the
 * final shape keeps the page from jumping under the cursor.
 */
function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="h-8 w-8 flex-shrink-0 animate-pulse rounded-full bg-surface-sunken" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="h-2.5 w-1/3 animate-pulse rounded bg-surface-sunken" />
        <div className="h-2 w-2/3 animate-pulse rounded bg-surface-sunken" />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ConnectHomePage() {
  const [data, setData] = useState<ConnectHomeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  /**
   * Wall-clock time, captured on the client only.
   *
   * Greetings and relative timestamps both depend on "now". Computing them
   * during render would run once on the server and again on the client, and
   * "Good morning" vs "Good afternoon" across that boundary is a hydration
   * mismatch. Null until mounted; the header renders without a greeting for one
   * frame instead of rendering the wrong one.
   */
  const [now, setNow] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/connect/home", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as ConnectHomeResponse);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setNow(Date.now());
    void load();
    // Home is a glanceable surface people leave open, so it refreshes itself.
    // 60s rather than the inbox's 30s — nothing here is time-critical enough to
    // justify doubling the query load.
    const t = setInterval(() => {
      setNow(Date.now());
      void load();
    }, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const counts = data?.counts;
  const allQuiet =
    !!counts &&
    counts.unreadConversations === 0 &&
    counts.mentions === 0 &&
    counts.notifications === 0;

  return (
    <div className="px-6 py-6 lg:px-8">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {now !== null && data
            ? `${greeting(new Date(now))}, ${data.greetingName}`
            : " "}
        </h1>
        <p className="mt-1 text-[13px] text-muted" aria-live="polite">
          {!data
            ? " "
            : allQuiet
              ? "Nothing is waiting on you right now."
              : "Here's what's waiting on you."}
        </p>
      </header>

      {/* Attention ledger — one surface, hairline dividers, no card grid. */}
      <div className="mb-6 flex flex-col divide-y divide-border-soft rounded-xl border border-border bg-surface shadow-sm sm:flex-row sm:divide-x sm:divide-y-0">
        {counts ? (
          <>
            <LedgerItem
              icon={MessageSquare}
              count={counts.unreadConversations}
              label="unread conversations"
              href="/connect/chat"
            />
            <LedgerItem icon={AtSign} count={counts.mentions} label="mentions" href="/connect/activity" />
            <LedgerItem icon={Video} count={counts.meetingsToday} label="meetings today" href="/connect/meetings" />
            <LedgerItem icon={FolderOpen} count={counts.filesShared} label="files shared with you" href="/connect/files" />
            <LedgerItem icon={Bell} count={counts.notifications} label="notifications" href="/notifications" />
          </>
        ) : (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex-1 space-y-2 px-3 py-2.5">
              <div className="h-4 w-6 animate-pulse rounded bg-surface-sunken" />
              <div className="h-2 w-20 animate-pulse rounded bg-surface-sunken" />
            </div>
          ))
        )}
      </div>

      {failed && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-warn/25 bg-warn-soft px-3 py-2">
          <p className="flex-1 text-xs text-warn">
            Couldn&apos;t refresh your summary. Showing the last result.
          </p>
          <button
            onClick={() => void load()}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-warn transition-colors hover:bg-warn/10 ${focusRing}`}
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel title="Recent conversations" href="/connect/chat">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
            ) : data && data.conversations.length > 0 && now !== null ? (
              data.conversations.map((c) => (
                <ConversationRow key={c.channelId} c={c} now={now} />
              ))
            ) : (
              <Empty text="No conversations yet — start one from Chat." />
            )}
          </Panel>
        </div>

        <Panel title="Upcoming" href="/connect/meetings">
          {loading ? (
            Array.from({ length: 2 }).map((_, i) => <SkeletonRow key={i} />)
          ) : data && data.upcoming.length > 0 ? (
            data.upcoming.map((m) => <MeetingRow key={m.id} m={m} />)
          ) : (
            <Empty text="Nothing scheduled today." />
          )}
        </Panel>
      </div>
    </div>
  );
}
