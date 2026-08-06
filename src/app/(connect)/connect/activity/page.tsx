"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AtSign, CornerDownRight, Smile, Hash, Loader2, Bell } from "lucide-react";
import { avatarGradient } from "@/lib/avatar";
import type {
  ConnectActivityItem,
  ConnectActivityResponse,
  ActivityKind,
} from "@/app/api/connect/activity/route";

/** Filters, in the order the roadmap lists them. */
const FILTERS: { key: "all" | ActivityKind; label: string }[] = [
  { key: "all", label: "All" },
  { key: "mention", label: "Mentions" },
  { key: "reply", label: "Replies" },
  { key: "reaction", label: "Reactions" },
];

const KIND_ICON: Record<ActivityKind, React.ElementType> = {
  mention: AtSign,
  reply: CornerDownRight,
  reaction: Smile,
};

const KIND_VERB: Record<ActivityKind, string> = {
  mention: "mentioned you in",
  reply: "replied to you in",
  reaction: "reacted to your message in",
};

function relative(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function ActivityRow({ item }: { item: ConnectActivityItem }) {
  const Kind = KIND_ICON[item.kind];

  return (
    <Link
      href={`/connect/chat?channel=${encodeURIComponent(item.channelId)}`}
      className="flex items-start gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-hover"
    >
      <div className="relative flex-shrink-0">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold uppercase text-accent-foreground"
          style={{ background: avatarGradient(item.actorName) }}
        >
          {item.actorName.charAt(0)}
        </div>
        <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-surface">
          <Kind className="h-3 w-3 text-muted" />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-snug text-foreground">
          <span className="font-semibold">{item.actorName}</span>{" "}
          <span className="text-muted">{KIND_VERB[item.kind]}</span>{" "}
          <span className="inline-flex items-baseline gap-0.5 font-medium">
            {!item.isDirect && <Hash className="h-3 w-3 self-center text-subtle" />}
            {item.channelName}
          </span>
        </p>
        <p className="mt-0.5 truncate text-xs text-subtle">
          {item.kind === "reaction" ? `Reacted ${item.excerpt}` : item.excerpt}
        </p>
      </div>

      <span className="flex-shrink-0 text-[10px] text-subtle">{relative(item.at)}</span>
    </Link>
  );
}

export default function ConnectActivityPage() {
  const [items, setItems] = useState<ConnectActivityItem[] | null>(null);
  const [filter, setFilter] = useState<"all" | ActivityKind>("all");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/connect/activity", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as ConnectActivityResponse;
      setItems(data.items);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(
    () => (items ?? []).filter((i) => filter === "all" || i.kind === filter),
    [items, filter],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items?.length ?? 0 };
    for (const i of items ?? []) c[i.kind] = (c[i.kind] ?? 0) + 1;
    return c;
  }, [items]);

  return (
    <div className="px-6 py-6 lg:px-8">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Activity</h1>
        <p className="mt-1 text-[13px] text-muted">
          Mentions, replies and reactions addressed to you. Workspace-wide alerts live in{" "}
          <Link href="/notifications" className="text-accent hover:underline">
            Notifications
          </Link>
          .
        </p>
      </header>

      <div className="mb-4 flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={[
              "rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
              filter === f.key
                ? "bg-accent-soft text-accent"
                : "text-muted hover:bg-hover hover:text-foreground",
            ].join(" ")}
          >
            {f.label}
            {counts[f.key] ? (
              <span className="ml-1.5 text-[10px] text-subtle">{counts[f.key]}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-surface p-1.5 shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-subtle">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading activity…</span>
          </div>
        ) : failed ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <Bell className="h-8 w-8 text-subtle" />
            <p className="text-sm text-subtle">Couldn&apos;t load your activity.</p>
            <button
              onClick={() => void load()}
              className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-hover hover:text-foreground"
            >
              Try again
            </button>
          </div>
        ) : shown.length === 0 ? (
          <p className="py-16 text-center text-xs text-subtle">
            {filter === "all"
              ? "Nothing addressed to you in the last 30 days."
              : `No ${filter}s in the last 30 days.`}
          </p>
        ) : (
          shown.map((i) => <ActivityRow key={i.id} item={i} />)
        )}
      </div>
    </div>
  );
}
