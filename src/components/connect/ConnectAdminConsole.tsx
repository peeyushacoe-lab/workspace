"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Users, Hash, ScrollText, LayoutGrid, Search, ShieldOff, ShieldCheck,
  Lock, Megaphone, MessageSquare, UsersRound, RefreshCw,
} from "lucide-react";
import { Tabs, TabButton, Dialog, Button } from "@/components/connect/ui";

/**
 * Connect Admin console.
 *
 * Four tabs on purpose, not eleven. Overview, Members, Channels and Audit are
 * what an administrator needs on day one of a pilot — policies, retention and
 * meeting rules are all decisions that should be shaped by observed usage
 * rather than guessed at before anyone has sent a message. Building them now
 * would mean choosing defaults with no evidence, and then defending them.
 *
 * Everything here is read-only except member deactivation, which is the one
 * administrative action that cannot wait for a pilot to finish: someone leaves,
 * their access has to stop that day.
 */

type Overview = {
  totalMembers: number; activeMembers: number; deactivatedMembers: number;
  totalChannels: number; privateChannels: number; teams: number;
  messages24h: number; messages7d: number; activeSenders7d: number; scheduledPending: number;
};

type Member = {
  id: string; fullName: string; email: string; role: string; isActive: boolean;
  avatarUrl: string | null; createdAt: string; channels: number; teams: number;
  lastMessageAt: string | null;
};

type Channel = {
  id: string; name: string; type: string; isPrivate: boolean; isBroadcast: boolean;
  teamName: string | null; members: number; messages: number; updatedAt: string;
};

type AuditRow = {
  id: string; action: string; actorName: string; targetType: string | null;
  targetId: string | null; ipAddress: string | null; createdAt: string;
};

type TabKey = "overview" | "members" | "channels" | "audit";

const TABS: { key: TabKey; label: string; icon: typeof Users }[] = [
  { key: "overview", label: "Overview", icon: LayoutGrid },
  { key: "members", label: "Members", icon: Users },
  { key: "channels", label: "Channels", icon: Hash },
  { key: "audit", label: "Audit log", icon: ScrollText },
];

export function ConnectAdminConsole({ currentUserId }: { currentUserId: string }) {
  const [tab, setTab] = useState<TabKey>("overview");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [confirmTarget, setConfirmTarget] = useState<Member | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(async (view: TabKey, q: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/connect/admin?view=${view}&q=${encodeURIComponent(q)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      if (view === "overview") setOverview(data as Overview);
      if (view === "members") setMembers(data as Member[]);
      if (view === "channels") setChannels(data as Channel[]);
      if (view === "audit") setAuditRows(data as AuditRow[]);
    } catch {
      toast.error("Could not load that view");
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced so typing in the filter doesn't fire a request per keystroke
  // against tables that can hold every message in the workspace.
  useEffect(() => {
    const t = setTimeout(() => void load(tab, query), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [tab, query, load]);

  const toggleActive = async (m: Member) => {
    setWorking(true);
    try {
      const res = await fetch(`/api/users/${m.id}/deactivate`, {
        method: m.isActive ? "POST" : "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; channelsLeft?: number };
      if (!res.ok) throw new Error(data.error ?? "Failed");

      toast.success(
        m.isActive
          ? `${m.fullName} deactivated — removed from ${data.channelsLeft ?? 0} conversation${data.channelsLeft === 1 ? "" : "s"}. Their messages remain.`
          : `${m.fullName} reactivated`,
      );
      setConfirmTarget(null);
      void load("members", query);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update that account");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium text-muted">Sage Connect</p>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-foreground">Admin</h1>
        <p className="mt-1 text-[13px] text-muted">
          Workspace membership, conversations and the record of what administrators have done.
        </p>
      </div>

      <Tabs className="border-b border-border">
        {TABS.map((t) => (
          <TabButton
            key={t.key}
            icon={t.icon}
            label={t.label}
            accent="var(--accent)"
            active={tab === t.key}
            onClick={() => { setTab(t.key); setQuery(""); }}
          />
        ))}
      </Tabs>

      {tab !== "overview" && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                tab === "members" ? "Search name or email"
                : tab === "channels" ? "Search channels"
                : "Search action or target id"
              }
              className="w-full rounded-lg border border-border bg-surface-sunken py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-subtle focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </div>
          <button
            onClick={() => void load(tab, query)}
            aria-label="Refresh"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-foreground"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      )}

      {loading && !overview && tab === "overview" ? (
        <SkeletonGrid />
      ) : tab === "overview" ? (
        <OverviewPanel data={overview} />
      ) : tab === "members" ? (
        <MembersPanel
          rows={members}
          loading={loading}
          currentUserId={currentUserId}
          onToggle={setConfirmTarget}
        />
      ) : tab === "channels" ? (
        <ChannelsPanel rows={channels} loading={loading} />
      ) : (
        <AuditPanel rows={auditRows} loading={loading} />
      )}

      {confirmTarget && (
        <Dialog
          title={confirmTarget.isActive ? "Deactivate account" : "Reactivate account"}
          size="sm"
          onClose={() => setConfirmTarget(null)}
          footer={
            <>
              <Button variant="secondary" className="flex-1" onClick={() => setConfirmTarget(null)}>
                Cancel
              </Button>
              <Button
                variant={confirmTarget.isActive ? "destructive" : "solid"}
                className="flex-1"
                loading={working}
                onClick={() => void toggleActive(confirmTarget)}
              >
                {confirmTarget.isActive ? "Deactivate" : "Reactivate"}
              </Button>
            </>
          }
        >
          {confirmTarget.isActive ? (
            <div className="space-y-3 text-[13px] leading-relaxed text-muted">
              <p>
                <span className="font-medium text-foreground">{confirmTarget.fullName}</span> will be
                signed out everywhere and removed from {confirmTarget.channels} conversation
                {confirmTarget.channels === 1 ? "" : "s"} and {confirmTarget.teams} team
                {confirmTarget.teams === 1 ? "" : "s"}. Any messages they had scheduled will be cancelled.
              </p>
              {/* The single most important thing to say here, because the old
                  behaviour did the opposite and people will assume it still does. */}
              <p className="rounded-lg border border-border bg-surface-sunken px-3 py-2">
                Everything they have written stays exactly where it is. Conversation history is not
                affected, and this can be undone.
              </p>
            </div>
          ) : (
            <p className="text-[13px] leading-relaxed text-muted">
              <span className="font-medium text-foreground">{confirmTarget.fullName}</span> will be able
              to sign in again and will rejoin open channels automatically. Team membership is not
              restored — add them back to the teams they need.
            </p>
          )}
        </Dialog>
      )}
    </div>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────

function OverviewPanel({ data }: { data: Overview | null }) {
  if (!data) return <SkeletonGrid />;

  // Adoption, not headcount. "42 accounts exist" tells you nothing during a
  // pilot; "11 of 42 people sent a message this week" tells you whether it's
  // working.
  const adoption = data.activeMembers
    ? Math.round((data.activeSenders7d / data.activeMembers) * 100)
    : 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active members" value={data.activeMembers} sub={data.deactivatedMembers ? `${data.deactivatedMembers} deactivated` : "None deactivated"} />
        <Stat label="Sent this week" value={data.activeSenders7d} sub={`${adoption}% of active members`} highlight={adoption < 40} />
        <Stat label="Messages · 24h" value={data.messages24h} sub={`${data.messages7d.toLocaleString()} over 7 days`} />
        <Stat label="Conversations" value={data.totalChannels} sub={`${data.privateChannels} private · ${data.teams} teams`} />
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground">Pilot readiness</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          Adoption is the number worth watching. A workspace where most accounts exist but few
          people send anything is not a communication platform yet — it is an inbox nobody opens.
        </p>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
          <Row term="Messages scheduled and pending" value={data.scheduledPending.toLocaleString()} />
          <Row term="Average messages per sender (7d)" value={data.activeSenders7d ? Math.round(data.messages7d / data.activeSenders7d).toLocaleString() : "—"} />
        </dl>
      </div>
    </div>
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border-soft py-1.5">
      <dt className="text-muted">{term}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}

function Stat({ label, value, sub, highlight = false }: { label: string; value: number; sub: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{value.toLocaleString()}</p>
      <p className={`mt-0.5 text-[11px] ${highlight ? "text-warn" : "text-subtle"}`}>{sub}</p>
    </div>
  );
}

// ── Members ───────────────────────────────────────────────────────────────────

function MembersPanel({
  rows, loading, currentUserId, onToggle,
}: {
  rows: Member[]; loading: boolean; currentUserId: string; onToggle: (m: Member) => void;
}) {
  if (loading && !rows.length) return <SkeletonRows />;
  if (!rows.length) return <Empty icon={Users} title="No members match" hint="Try a different name or email." />;

  return (
    <TableShell head={["Member", "Role", "In", "Last message", ""]}>
      {rows.map((m) => (
        <tr key={m.id} className="border-t border-border-soft transition-colors hover:bg-hover">
          <td className="px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent">
                {m.fullName.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-foreground">
                  {m.fullName}
                  {!m.isActive && (
                    <span className="ml-2 rounded-full bg-surface-sunken px-1.5 py-0.5 text-[10px] font-semibold text-subtle">
                      Deactivated
                    </span>
                  )}
                </p>
                <p className="truncate text-[11px] text-subtle">{m.email}</p>
              </div>
            </div>
          </td>
          <td className="px-4 py-2.5 text-[12px] text-muted">{m.role}</td>
          <td className="px-4 py-2.5 text-[12px] text-muted">
            {m.channels} conv · {m.teams} team{m.teams === 1 ? "" : "s"}
          </td>
          <td className="px-4 py-2.5 text-[12px] text-muted">
            {m.lastMessageAt ? relative(m.lastMessageAt) : <span className="text-subtle">Never</span>}
          </td>
          <td className="px-4 py-2.5 text-right">
            {m.id === currentUserId ? (
              <span className="text-[11px] text-subtle">You</span>
            ) : (
              <button
                onClick={() => onToggle(m)}
                className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium transition-colors ${
                  m.isActive
                    ? "text-muted hover:bg-crit-soft hover:text-crit"
                    : "text-muted hover:bg-ok-soft hover:text-ok"
                }`}
              >
                {m.isActive ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                {m.isActive ? "Deactivate" : "Reactivate"}
              </button>
            )}
          </td>
        </tr>
      ))}
    </TableShell>
  );
}

// ── Channels ──────────────────────────────────────────────────────────────────

function ChannelsPanel({ rows, loading }: { rows: Channel[]; loading: boolean }) {
  if (loading && !rows.length) return <SkeletonRows />;
  if (!rows.length) return <Empty icon={Hash} title="No conversations match" hint="Try a different name." />;

  return (
    <TableShell head={["Conversation", "Kind", "People", "Messages", "Last activity"]}>
      {rows.map((c) => {
        const Glyph = c.type === "DIRECT" ? MessageSquare : c.type === "GROUP" ? UsersRound : Hash;
        return (
          <tr key={c.id} className="border-t border-border-soft transition-colors hover:bg-hover">
            <td className="px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <Glyph className="h-3.5 w-3.5 flex-shrink-0 text-subtle" />
                <span className="truncate text-[13px] font-medium text-foreground">{c.name}</span>
                {c.isPrivate && <Lock className="h-3 w-3 flex-shrink-0 text-subtle" aria-label="Private" />}
                {c.isBroadcast && <Megaphone className="h-3 w-3 flex-shrink-0 text-subtle" aria-label="Broadcast" />}
              </div>
              {c.teamName && <p className="mt-0.5 pl-5.5 text-[11px] text-subtle">Team · {c.teamName}</p>}
            </td>
            <td className="px-4 py-2.5 text-[12px] text-muted">{c.type.toLowerCase()}</td>
            <td className="px-4 py-2.5 text-[12px] text-muted">{c.members}</td>
            <td className="px-4 py-2.5 text-[12px] text-muted">{c.messages.toLocaleString()}</td>
            <td className="px-4 py-2.5 text-[12px] text-muted">{relative(c.updatedAt)}</td>
          </tr>
        );
      })}
    </TableShell>
  );
}

// ── Audit ─────────────────────────────────────────────────────────────────────

function AuditPanel({ rows, loading }: { rows: AuditRow[]; loading: boolean }) {
  if (loading && !rows.length) return <SkeletonRows />;
  if (!rows.length) return <Empty icon={ScrollText} title="No audit entries" hint="Administrative actions appear here as they happen." />;

  return (
    <TableShell head={["Action", "By", "Target", "IP", "When"]}>
      {rows.map((r) => (
        <tr key={r.id} className="border-t border-border-soft transition-colors hover:bg-hover">
          <td className="px-4 py-2.5">
            <span className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] ${
              r.action.startsWith("USER_PURGED") || r.action.includes("DELETE")
                ? "bg-crit-soft text-crit"
                : "bg-surface-sunken text-muted"
            }`}>
              {r.action}
            </span>
          </td>
          <td className="px-4 py-2.5 text-[12px] text-muted">{r.actorName}</td>
          <td className="px-4 py-2.5 text-[12px] text-muted">
            {r.targetType ? `${r.targetType} ${r.targetId?.slice(0, 8) ?? ""}` : "—"}
          </td>
          <td className="px-4 py-2.5 font-mono text-[11px] text-subtle">{r.ipAddress ?? "—"}</td>
          <td className="px-4 py-2.5 text-[12px] text-muted">{relative(r.createdAt)}</td>
        </tr>
      ))}
    </TableShell>
  );
}

// ── Shared bits ───────────────────────────────────────────────────────────────

function TableShell({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-surface-sunken">
            <tr>
              {head.map((h, i) => (
                <th key={i} className="px-4 py-2 text-[11px] font-medium text-subtle">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

function Empty({ icon: Icon, title, hint }: { icon: typeof Users; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface px-6 py-14 text-center shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-sunken">
        <Icon className="h-5 w-5 text-subtle" />
      </div>
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-[12px] text-muted">{hint}</p>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid animate-pulse gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-24 rounded-xl border border-border bg-surface-sunken" />
      ))}
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="animate-pulse space-y-px overflow-hidden rounded-xl border border-border bg-surface">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <div className="h-7 w-7 flex-shrink-0 rounded-full bg-surface-sunken" />
          <div className="h-3 flex-1 rounded bg-surface-sunken" style={{ maxWidth: `${30 + ((i * 13) % 45)}%` }} />
        </div>
      ))}
    </div>
  );
}

/** Compact relative time. Absolute timestamps in a dense table are noise. */
function relative(iso: string) {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
