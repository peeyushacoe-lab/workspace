"use client";

import { useCallback, useState, useTransition } from "react";
import {
  Mail, CalendarDays, CheckSquare, Video, FileText, HardDrive,
  MessageSquare, Bell, Clock, PenLine, FilePlus2, Upload, CalendarPlus,
  RefreshCw, Loader2, Star, Globe, Table2, Presentation, StickyNote,
  Radio, MapPin, History, Inbox, type LucideIcon,
} from "lucide-react";
import { AppLink } from "@/components/AppLink";
import { RelativeTime } from "@/components/RelativeTime";
import { DailyBriefing } from "@/components/home/DailyBriefing";
import { HomeCard, HomeRow } from "@/components/home/HomeCard";
import { TaskSourceChip } from "@/components/tasks/TaskSourceChip";
import type { HomeData } from "@/lib/home";

/**
 * Nexus Home — the command centre.
 *
 * Rendered with server data already in hand (`initial`), so the first screen
 * after login paints complete rather than as eight spinners. The client role here
 * is refresh and the AI briefing, nothing more.
 *
 * Every card is gated by `data.sections`, computed server-side from the same role
 * gate middleware enforces. An intern and a CISO get a different Home from the
 * same component, and neither can see a section their role cannot reach by URL.
 */

// ─── Formatting ───────────────────────────────────────────────────────────────

const GREETING: Record<HomeData["partOfDay"], string> = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
};

/**
 * Fixed-locale, fixed-UTC time formatting.
 *
 * `toLocaleTimeString()` with no locale reads the host's locale and timezone,
 * which differ between the Node server and the browser — the same hydration
 * mismatch (React #418) that RelativeTime exists to avoid. Pinning both makes
 * the string a pure function of the input.
 */
function eventTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function eventDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

/** Strips the display-name wrapper off `Ada Lovelace <ada@x.com>`. */
function senderName(from: string): string {
  const match = from.match(/^\s*"?([^"<]+?)"?\s*</);
  return (match?.[1] ?? from.split("@")[0] ?? from).trim();
}

const DOC_ICON: Record<string, LucideIcon> = {
  doc: FileText,
  sheet: Table2,
  slide: Presentation,
  note: StickyNote,
  file: HardDrive,
};

const PRIORITY_CLASS: Record<string, string> = {
  URGENT: "text-crit bg-crit-soft border-crit/25",
  HIGH: "text-warn bg-warn-soft border-warn/25",
  MEDIUM: "text-muted bg-surface-sunken border-border",
  LOW: "text-subtle bg-surface-sunken border-border",
};

/**
 * Task origin was a plain text label here. It is now a real backlink via
 * TaskSourceChip, so "from mail" actually opens the email.
 */

// ─── Quick actions ────────────────────────────────────────────────────────────

type QuickAction = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Which `sections` flag must be true for this action to appear. */
  section: keyof HomeData["sections"];
};

/**
 * Every href here is a route that exists today. Earlier drafts used `?new=1` /
 * `?upload=1` deep links to open a feature's create dialog directly — none of
 * those views read such a param, so the button would have looked like a shortcut
 * and behaved like a plain link. Landing on the feature's own create surface is
 * one click further and actually true.
 */
const QUICK_ACTIONS: QuickAction[] = [
  { label: "Compose", href: "/compose", icon: PenLine, section: "mail" },
  { label: "New document", href: "/docs", icon: FilePlus2, section: "docs" },
  { label: "Upload files", href: "/drive", icon: Upload, section: "drive" },
  { label: "Schedule", href: "/calendar", icon: CalendarPlus, section: "calendar" },
  { label: "Start conversation", href: "/connect/chat", icon: MessageSquare, section: "chat" },
];

/**
 * Connect splits messaging by scope — DMs, groups and channels are three pages
 * mounting the same engine. A conversation row therefore has to route by type;
 * sending a channel to /connect/chat would open the DM list instead.
 */
function conversationHref(type: string): string {
  if (type === "DIRECT") return "/connect/chat";
  if (type === "GROUP") return "/connect/groups";
  return "/connect/channels";
}

// ─── View ─────────────────────────────────────────────────────────────────────

export function HomeView({ initial }: { initial: HomeData }) {
  const [data, setData] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [, startTransition] = useTransition();

  const refresh = useCallback(() => {
    setRefreshing(true);
    void (async () => {
      try {
        const res = await fetch("/api/home", { cache: "no-store" });
        if (res.ok) {
          const next = (await res.json()) as HomeData;
          startTransition(() => setData(next));
        }
      } catch {
        // Silent: the page already shows valid, if slightly stale, data. An
        // error toast on the landing page for a failed background refresh is
        // more alarming than the staleness it reports.
      } finally {
        setRefreshing(false);
      }
    })();
  }, []);

  const { sections, counts } = data;
  const actions = QUICK_ACTIONS.filter((a) => sections[a.section]);

  return (
    <div className="px-6 py-6 lg:px-8">
      {/* ── Greeting ─────────────────────────────────────────────────────── */}
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1 text-[11px] font-medium tracking-wide text-subtle">Nexus</p>
          <h1 className="text-2xl font-semibold leading-snug tracking-[-0.02em] text-foreground">
            {GREETING[data.partOfDay]}, {data.firstName}
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            <Summary counts={counts} sections={sections} events={data.events.length} />
          </p>
        </div>

        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="inline-flex flex-shrink-0 items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-hover hover:text-foreground disabled:opacity-60"
        >
          {refreshing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          Refresh
        </button>
      </header>

      {/* ── Quick actions ────────────────────────────────────────────────── */}
      {actions.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {actions.map(({ label, href, icon: Icon }) => (
            <AppLink
              key={href}
              href={href}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:border-border-strong hover:bg-hover"
            >
              <Icon className="w-3.5 h-3.5 text-accent" />
              {label}
            </AppLink>
          ))}
        </div>
      )}

      {/* ── AI briefing ──────────────────────────────────────────────────── */}
      <div className="mb-5">
        <DailyBriefing />
      </div>

      {/* ── Continue where you left off ──────────────────────────────────── */}
      {data.resume.length > 0 && (
        <section className="mb-5">
          <div className="mb-2 flex items-center gap-2">
            <History className="w-3.5 h-3.5 text-subtle" />
            <h2 className="text-[13px] font-semibold tracking-tight text-foreground">
              Continue where you left off
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {data.resume.map((item) => {
              const Icon = DOC_ICON[item.kind] ?? FileText;
              return (
                <AppLink
                  key={`${item.kind}:${item.id}`}
                  href={item.href}
                  className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 shadow-sm transition-colors hover:border-border-strong hover:bg-hover"
                >
                  <Icon className="w-4 h-4 text-accent" />
                  <span className="line-clamp-2 text-xs font-medium leading-snug text-foreground">
                    {item.title}
                  </span>
                  <RelativeTime
                    date={item.lastOpenedAt}
                    className="text-[10px] text-subtle"
                  />
                </AppLink>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Cards ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {/* Today's schedule */}
        {sections.calendar && (
          <HomeCard
            title="Today"
            icon={CalendarDays}
            href="/calendar"
            count={data.events.length}
            empty="Nothing on your calendar today"
            emptyIcon={CalendarDays}
          >
            {data.events.length > 0
              ? data.events.map((e) => (
                  <HomeRow key={e.id} href="/calendar">
                    <div className="flex items-start gap-3">
                      <span className="w-11 flex-shrink-0 pt-0.5 text-[11px] font-semibold tabular-nums text-accent">
                        {e.allDay ? "All day" : eventTime(e.startAt)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-foreground">
                          {e.title}
                        </p>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-subtle">
                          {e.location && (
                            <span className="flex min-w-0 items-center gap-1">
                              <MapPin className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{e.location}</span>
                            </span>
                          )}
                          {!e.isOrganizer && (
                            <span className="truncate">{e.organizerName}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </HomeRow>
                ))
              : undefined}
          </HomeCard>
        )}

        {/* Unread mail */}
        {sections.mail && (
          <HomeCard
            title="Unread mail"
            icon={Mail}
            href="/inbox"
            count={counts.unreadMail}
            countTone="accent"
            empty="Inbox is clear"
            emptyIcon={Inbox}
          >
            {data.mail.length > 0
              ? data.mail.map((m) => (
                  <HomeRow key={m.id} href={`/inbox?thread=${m.id}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="truncate text-[13px] font-medium text-foreground">
                        {senderName(m.from)}
                      </span>
                      <div className="flex flex-shrink-0 items-center gap-1.5">
                        {m.isStarred && <Star className="w-3 h-3 text-warn" />}
                        {m.isExternal && (
                          <span className="inline-flex items-center gap-0.5 rounded-full border border-warn/25 bg-warn-soft px-1.5 py-0.5 text-[9px] font-semibold text-warn">
                            <Globe className="w-3 h-3" />
                            EXT
                          </span>
                        )}
                        <RelativeTime
                          date={m.receivedAt}
                          className="text-[10px] text-subtle"
                        />
                      </div>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted">{m.subject}</p>
                    {m.preview && (
                      <p className="mt-0.5 truncate text-[11px] text-subtle">{m.preview}</p>
                    )}
                  </HomeRow>
                ))
              : undefined}
          </HomeCard>
        )}

        {/* Tasks */}
        {sections.tasks && (
          <HomeCard
            title="Your tasks"
            icon={CheckSquare}
            href="/tasks"
            count={counts.overdueTasks || counts.tasksDueToday}
            countTone={counts.overdueTasks ? "crit" : "warn"}
            empty="No tasks due this week"
            emptyIcon={CheckSquare}
          >
            {data.tasks.length > 0
              ? data.tasks.map((t) => {
                  const overdue =
                    t.dueDate !== null && new Date(t.dueDate).getTime() < Date.now();
                  return (
                    <HomeRow key={t.id} href="/tasks">
                      <div className="flex items-start justify-between gap-2">
                        <span className="truncate text-[13px] font-medium text-foreground">
                          {t.title}
                        </span>
                        <span
                          className={`flex-shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${
                            PRIORITY_CLASS[t.priority] ?? PRIORITY_CLASS.MEDIUM
                          }`}
                        >
                          {t.priority}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px]">
                        {t.dueDate ? (
                          <span
                            className={`flex items-center gap-1 ${
                              overdue ? "font-medium text-crit" : "text-subtle"
                            }`}
                          >
                            <Clock className="w-3 h-3" />
                            {overdue ? "Overdue" : eventDay(t.dueDate)}
                          </span>
                        ) : (
                          <span className="text-subtle">No due date</span>
                        )}
                        {t.listName && <span className="truncate text-subtle">{t.listName}</span>}
                        <TaskSourceChip sourceType={t.sourceType} sourceId={t.sourceId} />
                      </div>
                    </HomeRow>
                  );
                })
              : undefined}
          </HomeCard>
        )}

        {/* Meetings */}
        {sections.meet && (
          <HomeCard
            title="Meetings"
            icon={Video}
            href="/meet"
            count={data.meetings.filter((m) => m.status === "LIVE").length}
            countTone="crit"
            empty="No upcoming meetings"
            emptyIcon={Video}
          >
            {data.meetings.length > 0
              ? data.meetings.map((m) => (
                  <HomeRow key={m.id} href={`/meet/${m.roomName}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="truncate text-[13px] font-medium text-foreground">
                        {m.title}
                      </span>
                      {m.status === "LIVE" ? (
                        <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-crit/25 bg-crit-soft px-1.5 py-0.5 text-[9px] font-semibold text-crit">
                          <Radio className="w-3 h-3" />
                          LIVE
                        </span>
                      ) : (
                        m.scheduledAt && (
                          <span className="flex-shrink-0 text-[10px] tabular-nums text-subtle">
                            {eventTime(m.scheduledAt)}
                          </span>
                        )
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-subtle">
                      {m.participantCount} participant{m.participantCount === 1 ? "" : "s"}
                      {m.isOrganizer && " · you're hosting"}
                    </p>
                  </HomeRow>
                ))
              : undefined}
          </HomeCard>
        )}

        {/* Recent documents */}
        {sections.docs && (
          <HomeCard
            title="Recent documents"
            icon={FileText}
            href="/docs"
            empty="No documents yet"
            emptyIcon={FileText}
          >
            {data.docs.length > 0
              ? data.docs.map((d) => {
                  const Icon = DOC_ICON[d.kind] ?? FileText;
                  return (
                    <HomeRow key={d.id} href={d.href}>
                      <div className="flex items-center gap-2.5">
                        <Icon className="w-3.5 h-3.5 flex-shrink-0 text-accent" />
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                          {d.title}
                        </span>
                        <RelativeTime
                          date={d.updatedAt}
                          className="flex-shrink-0 text-[10px] text-subtle"
                        />
                      </div>
                    </HomeRow>
                  );
                })
              : undefined}
          </HomeCard>
        )}

        {/* Drive */}
        {sections.drive && (
          <HomeCard
            title="Recent files"
            icon={HardDrive}
            href="/drive"
            empty="No files in your Drive"
            emptyIcon={HardDrive}
          >
            {data.files.length > 0
              ? data.files.map((f) => (
                  <HomeRow key={f.id} href={`/drive?file=${f.id}`}>
                    <div className="flex items-center gap-2.5">
                      <HardDrive className="w-3.5 h-3.5 flex-shrink-0 text-subtle" />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                        {f.name}
                      </span>
                      {f.isStarred && <Star className="w-3 h-3 flex-shrink-0 text-warn" />}
                      <span className="flex-shrink-0 text-[10px] tabular-nums text-subtle">
                        {fileSize(f.size)}
                      </span>
                    </div>
                  </HomeRow>
                ))
              : undefined}
          </HomeCard>
        )}

        {/* Conversations */}
        {sections.chat && (
          <HomeCard
            title="Conversations"
            icon={MessageSquare}
            href="/connect/chat"
            count={data.conversations.filter((c) => c.unreadCount > 0).length}
            countTone="accent"
            empty="No conversations yet"
            emptyIcon={MessageSquare}
          >
            {data.conversations.length > 0
              ? data.conversations.map((c) => (
                  <HomeRow key={c.id} href={`${conversationHref(c.type)}?channel=${c.id}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        {c.unreadCount > 0 && (
                          <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
                        )}
                        <span className="truncate text-[13px] font-medium text-foreground">
                          {c.isDirect ? c.name : `#${c.name}`}
                        </span>
                      </span>
                      {c.lastMessageAt && (
                        <RelativeTime
                          date={c.lastMessageAt}
                          className="flex-shrink-0 text-[10px] text-subtle"
                        />
                      )}
                    </div>
                    {c.lastMessagePreview && (
                      <p className="mt-0.5 truncate text-[11px] text-subtle">
                        {c.lastMessageAuthor && (
                          <span className="text-muted">{c.lastMessageAuthor}: </span>
                        )}
                        {c.lastMessagePreview}
                      </p>
                    )}
                  </HomeRow>
                ))
              : undefined}
          </HomeCard>
        )}

        {/* Notifications */}
        <HomeCard
          title="Notifications"
          icon={Bell}
          href="/notifications"
          count={counts.unreadNotifications}
          countTone="warn"
          empty="You're all caught up"
          emptyIcon={Bell}
        >
          {data.notifications.length > 0
            ? data.notifications.map((n) => (
                <HomeRow key={n.id} href={n.link ?? "/notifications"}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate text-[13px] font-medium text-foreground">
                      {n.title}
                    </span>
                    <RelativeTime
                      date={n.createdAt}
                      className="flex-shrink-0 text-[10px] text-subtle"
                    />
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-subtle">{n.body}</p>
                </HomeRow>
              ))
            : undefined}
        </HomeCard>
      </div>
    </div>
  );
}

// ─── Summary line ─────────────────────────────────────────────────────────────

/**
 * One-line state of play under the greeting.
 *
 * Only mentions what is actually non-zero and only for sections the user can
 * see — "0 unread, 0 tasks, 0 meetings" is noise, and naming a section a role
 * cannot open is worse than saying nothing.
 */
function Summary({
  counts,
  sections,
  events,
}: {
  counts: HomeData["counts"];
  sections: HomeData["sections"];
  events: number;
}) {
  const parts: string[] = [];

  if (sections.calendar && events > 0) {
    parts.push(`${events} event${events === 1 ? "" : "s"} today`);
  }
  if (sections.mail && counts.unreadMail > 0) {
    parts.push(`${counts.unreadMail} unread`);
  }
  if (sections.tasks && counts.overdueTasks > 0) {
    parts.push(`${counts.overdueTasks} overdue`);
  } else if (sections.tasks && counts.tasksDueToday > 0) {
    parts.push(`${counts.tasksDueToday} due today`);
  }
  if (counts.unreadNotifications > 0) {
    parts.push(`${counts.unreadNotifications} notification${counts.unreadNotifications === 1 ? "" : "s"}`);
  }

  if (parts.length === 0) return <>Nothing needs you right now.</>;
  return <>{parts.join(" · ")}</>;
}
