"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Users, Hash, ScrollText, LayoutGrid, Search, ShieldOff, ShieldCheck,
  Lock, Megaphone, MessageSquare, UsersRound, RefreshCw,
  Building2, Shield, KeyRound, SlidersHorizontal, Archive, AlertTriangle,
} from "lucide-react";
import { Tabs, TabButton, Dialog, Button } from "@/components/connect/ui";
import type { ConnectPolicies } from "@/lib/connect-policies";

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

type OrgInfo = {
  org: {
    id: string; name: string; slug: string; domain: string | null; plan: string;
    maxUsers: number; isActive: boolean; createdAt: string;
    _count: { users: number; teams: number; departments: number; channels: number };
  } | null;
};

type TeamRow = {
  id: string; name: string; slug: string; color: string | null;
  department: string | null; members: number; channels: number;
};

type RolesInfo = {
  roles: { id: string; name: string; isSystem: boolean; holders: number }[];
  enumRoles: { role: string; people: number; canAdministerConnect: boolean }[];
};

type SecurityInfo = {
  activeSessions: number; deactivated: number; mfaOn: number; totalActive: number;
  legalHolds: number; adminActions7d: number; privateChannels: number;
  broadcastChannels: number; rbacEnforced: boolean;
};

type TabKey =
  | "overview" | "members" | "teams" | "channels" | "roles"
  | "policies" | "retention" | "audit" | "security" | "organisation";

const TABS: { key: TabKey; label: string; icon: typeof Users }[] = [
  { key: "overview", label: "Overview", icon: LayoutGrid },
  { key: "members", label: "Members", icon: Users },
  { key: "teams", label: "Teams", icon: UsersRound },
  { key: "channels", label: "Channels", icon: Hash },
  { key: "roles", label: "Roles", icon: KeyRound },
  { key: "policies", label: "Policies", icon: SlidersHorizontal },
  { key: "retention", label: "Retention", icon: Archive },
  { key: "audit", label: "Audit log", icon: ScrollText },
  { key: "security", label: "Security", icon: Shield },
  { key: "organisation", label: "Organisation", icon: Building2 },
];

/** Views with a text filter. The rest are single-object panels. */
const SEARCHABLE: TabKey[] = ["members", "teams", "channels", "audit"];

export function ConnectAdminConsole({ currentUserId }: { currentUserId: string }) {
  const [tab, setTab] = useState<TabKey>("overview");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [teamRows, setTeamRows] = useState<TeamRow[]>([]);
  const [rolesInfo, setRolesInfo] = useState<RolesInfo | null>(null);
  const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null);
  const [securityInfo, setSecurityInfo] = useState<SecurityInfo | null>(null);
  const [policies, setPolicies] = useState<ConnectPolicies | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<Member | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(async (view: TabKey, q: string) => {
    setLoading(true);
    try {
      const apiView = view === "retention" ? "policies" : view;
      const res = await fetch(`/api/connect/admin?view=${apiView}&q=${encodeURIComponent(q)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      if (view === "overview") setOverview(data as Overview);
      if (view === "members") setMembers(data as Member[]);
      if (view === "channels") setChannels(data as Channel[]);
      if (view === "audit") setAuditRows(data as AuditRow[]);
      if (view === "teams") setTeamRows(data as TeamRow[]);
      if (view === "roles") setRolesInfo(data as RolesInfo);
      if (view === "organisation") setOrgInfo(data as OrgInfo);
      if (view === "security") setSecurityInfo(data as SecurityInfo);
      // Policies and Retention are two views of the same object — one fetch
      // backs both, so switching between them is instant.
      if (view === "policies" || view === "retention") {
        setPolicies((data as { policies: ConnectPolicies }).policies);
      }
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

  const savePolicies = async (patch: Record<string, Record<string, unknown>>) => {
    // Optimistic, like the user settings page: these are all instantly
    // reversible, and a switch that waits on a round trip reads as broken.
    const previous = policies;
    setPolicies((p) =>
      p
        ? {
            messaging: { ...p.messaging, ...(patch.messaging ?? {}) },
            files: { ...p.files, ...(patch.files ?? {}) },
            retention: { ...p.retention, ...(patch.retention ?? {}) },
          }
        : p,
    );
    try {
      const res = await fetch("/api/connect/admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policies: patch }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; policies?: ConnectPolicies };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      if (data.policies) setPolicies(data.policies);
    } catch (e) {
      setPolicies(previous);
      toast.error(e instanceof Error ? e.message : "Couldn't save that policy");
    }
  };

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

      {SEARCHABLE.includes(tab) && (
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
      ) : tab === "teams" ? (
        <TeamsPanel rows={teamRows} loading={loading} />
      ) : tab === "roles" ? (
        <RolesPanel data={rolesInfo} loading={loading} />
      ) : tab === "policies" ? (
        <PoliciesPanel policies={policies} loading={loading} onSave={savePolicies} />
      ) : tab === "retention" ? (
        <RetentionPanel policies={policies} loading={loading} onSave={savePolicies} />
      ) : tab === "security" ? (
        <SecurityPanel data={securityInfo} loading={loading} />
      ) : tab === "organisation" ? (
        <OrganisationPanel data={orgInfo} loading={loading} />
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

// ── Teams ─────────────────────────────────────────────────────────────────────

function TeamsPanel({ rows, loading }: { rows: TeamRow[]; loading: boolean }) {
  if (loading && !rows.length) return <SkeletonRows />;
  if (!rows.length) return <Empty icon={UsersRound} title="No teams" hint="Teams are created from the Teams page." />;

  return (
    <TableShell head={["Team", "Department", "People", "Channels"]}>
      {rows.map((t) => (
        <tr key={t.id} className="border-t border-border-soft transition-colors hover:bg-hover">
          <td className="px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className="h-2 w-2 flex-shrink-0 rounded-full"
                style={{ background: t.color ?? "var(--subtle)" }}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-foreground">{t.name}</p>
                <p className="truncate text-[11px] text-subtle">{t.slug}</p>
              </div>
            </div>
          </td>
          <td className="px-4 py-2.5 text-[12px] text-muted">{t.department ?? "—"}</td>
          <td className="px-4 py-2.5 text-[12px] text-muted">{t.members}</td>
          <td className="px-4 py-2.5 text-[12px] text-muted">
            {t.channels === 0 ? <span className="text-warn">None yet</span> : t.channels}
          </td>
        </tr>
      ))}
    </TableShell>
  );
}

// ── Roles ─────────────────────────────────────────────────────────────────────

function RolesPanel({ data, loading }: { data: RolesInfo | null; loading: boolean }) {
  if (loading && !data) return <SkeletonRows />;
  if (!data) return <Empty icon={KeyRound} title="Couldn't load roles" hint="Try refreshing." />;

  const admins = data.enumRoles.filter((r) => r.canAdministerConnect);

  return (
    <div className="space-y-4">
      {/* The question an auditor actually asks, answered first. */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground">Who can administer Connect</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
          These roles hold <code className="rounded bg-surface-sunken px-1 py-0.5 text-[11px]">org.manage</code>,
          which is what gates this console — including deactivating people and setting retention.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {admins.length === 0 ? (
            <span className="text-[13px] text-muted">Nobody — only a full system admin can reach this page.</span>
          ) : (
            admins.map((r) => (
              <span
                key={r.role}
                className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent-soft px-2.5 py-1 text-[12px] font-medium text-accent-strong"
              >
                {r.role}
                <span className="opacity-70">{r.people}</span>
              </span>
            ))
          )}
        </div>
      </div>

      <TableShell head={["Role", "People", "Can administer Connect"]}>
        {data.enumRoles.map((r) => (
          <tr key={r.role} className="border-t border-border-soft transition-colors hover:bg-hover">
            <td className="px-4 py-2.5 text-[13px] font-medium text-foreground">{r.role}</td>
            <td className="px-4 py-2.5 text-[12px] text-muted">{r.people}</td>
            <td className="px-4 py-2.5">
              {r.canAdministerConnect ? (
                <span className="text-[12px] font-medium text-accent">Yes</span>
              ) : (
                <span className="text-[12px] text-subtle">No</span>
              )}
            </td>
          </tr>
        ))}
      </TableShell>

      {data.roles.length > 0 && (
        <TableShell head={["Custom & system roles", "Kind", "Assigned to"]}>
          {data.roles.map((r) => (
            <tr key={r.id} className="border-t border-border-soft transition-colors hover:bg-hover">
              <td className="px-4 py-2.5 text-[13px] font-medium text-foreground">{r.name}</td>
              <td className="px-4 py-2.5 text-[12px] text-muted">{r.isSystem ? "System" : "Custom"}</td>
              <td className="px-4 py-2.5 text-[12px] text-muted">{r.holders}</td>
            </tr>
          ))}
        </TableShell>
      )}

      <p className="text-[12px] text-subtle">
        Editing roles lives in the main workspace admin at <code className="rounded bg-surface-sunken px-1 py-0.5 text-[11px]">/org</code> —
        this view is read-only so the two can&apos;t drift apart.
      </p>
    </div>
  );
}

// ── Policies ──────────────────────────────────────────────────────────────────

type SaveFn = (patch: Record<string, Record<string, unknown>>) => Promise<void>;

function PoliciesPanel({
  policies, loading, onSave,
}: {
  policies: ConnectPolicies | null; loading: boolean; onSave: SaveFn;
}) {
  if (loading && !policies) return <SkeletonRows />;
  if (!policies) return <Empty icon={SlidersHorizontal} title="Couldn't load policies" hint="Try refreshing." />;

  return (
    <div className="space-y-4">
      <AdminPanel
        title="Messaging"
        description="Applies to everyone in the workspace. All of these are enforced on the server, so turning one off actually blocks the action rather than hiding the button."
      >
        <NumberField
          label="Maximum message length"
          suffix="characters"
          value={policies.messaging.maxMessageLength}
          min={280}
          max={40000}
          onCommit={(v) => void onSave({ messaging: { maxMessageLength: v } })}
        />
        <AdminToggle
          label="Allow attachments in chat"
          hint="Off blocks new file and image attachments. Existing ones stay."
          checked={policies.messaging.allowAttachments}
          onChange={(v) => void onSave({ messaging: { allowAttachments: v } })}
        />
        <AdminToggle
          label="Allow editing sent messages"
          checked={policies.messaging.allowEditing}
          onChange={(v) => void onSave({ messaging: { allowEditing: v } })}
        />
        <AdminToggle
          label="Allow people to delete their own messages"
          hint="Workspace admins can always delete, so moderation keeps working when this is off."
          checked={policies.messaging.allowDeleting}
          onChange={(v) => void onSave({ messaging: { allowDeleting: v } })}
        />
        <AdminToggle
          label="Allow the urgent flag"
          hint="Urgent messages bypass everyone's notification preferences — which is exactly why you might turn it off."
          checked={policies.messaging.allowUrgent}
          onChange={(v) => void onSave({ messaging: { allowUrgent: v } })}
        />
      </AdminPanel>

      <AdminPanel title="Files" description="Upload limits for chat attachments and Drive.">
        <NumberField
          label="Maximum upload size"
          suffix="MB"
          value={policies.files.maxUploadMb}
          min={1}
          max={500}
          onCommit={(v) => void onSave({ files: { maxUploadMb: v } })}
        />
        <p className="text-[12px] text-subtle">
          Capped at 100 MB by the storage tier — a higher number here won&apos;t raise it.
        </p>
      </AdminPanel>

      {/* Said plainly rather than shipped as a switch that does nothing. */}
      <AdminPanel title="Meetings" description="Not configurable yet, and deliberately not shown as toggles.">
        <p className="text-[12.5px] leading-relaxed text-muted">
          Meeting behaviour is set by Jitsi on the client, so a control here would be a request rather than
          a rule — anyone could ignore it. Enforceable meeting policy needs the self-hosted Jitsi with
          signed tokens. Until then there is nothing honest to put here.
        </p>
      </AdminPanel>
    </div>
  );
}

// ── Retention ─────────────────────────────────────────────────────────────────

function RetentionPanel({
  policies, loading, onSave,
}: {
  policies: ConnectPolicies | null; loading: boolean; onSave: SaveFn;
}) {
  if (loading && !policies) return <SkeletonRows />;
  if (!policies) return <Empty icon={Archive} title="Couldn't load retention" hint="Try refreshing." />;

  const days = policies.retention.messageRetentionDays;

  return (
    <AdminPanel
      title="Message retention"
      description="Automatically delete chat messages after a set period. Runs once a day at 03:00."
    >
      {days > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-crit/25 bg-crit-soft px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-crit" />
          <div className="text-[12.5px] leading-relaxed text-crit">
            <span className="font-semibold">This deletes messages permanently.</span> Anything older than{" "}
            {days} days is removed and cannot be recovered. Accounts under an active legal hold are skipped.
          </div>
        </div>
      )}

      <NumberField
        label="Delete messages older than"
        suffix="days"
        value={days}
        min={0}
        max={3650}
        onCommit={(v) => void onSave({ retention: { messageRetentionDays: v } })}
      />
      <p className="text-[12px] text-subtle">
        Set to <strong>0</strong> to keep everything forever. That is the default, and nothing is deleted
        until you deliberately change it.
      </p>
    </AdminPanel>
  );
}

// ── Security ──────────────────────────────────────────────────────────────────

function SecurityPanel({ data, loading }: { data: SecurityInfo | null; loading: boolean }) {
  if (loading && !data) return <SkeletonGrid />;
  if (!data) return <Empty icon={Shield} title="Couldn't load security" hint="Try refreshing." />;

  const mfaPct = data.totalActive ? Math.round((data.mfaOn / data.totalActive) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Signed-in sessions" value={data.activeSessions} sub="Across all devices" />
        <Stat label="Two-factor enabled" value={data.mfaOn} sub={`${mfaPct}% of active members`} highlight={mfaPct < 80} />
        <Stat label="Deactivated accounts" value={data.deactivated} sub="Access revoked, history kept" />
        <Stat label="Admin actions · 7d" value={data.adminActions7d} sub="See the audit log" />
      </div>

      <AdminPanel title="Posture" description="Read from live data, not a checklist.">
        <PostureRow
          ok={data.rbacEnforced}
          label="Permission enforcement"
          okText="Enforced — pages are gated by permission"
          badText="Shadow mode — pages still gated by the older role check. Set RBAC_ENFORCE=true once the parity test passes."
        />
        <PostureRow
          ok={mfaPct >= 80}
          label="Two-factor coverage"
          okText={`${mfaPct}% of active members have it on`}
          badText={`Only ${mfaPct}% of active members have two-factor on`}
        />
        <PostureRow
          ok
          label="Legal holds"
          okText={
            data.legalHolds === 0
              ? "None active"
              : `${data.legalHolds} active — those accounts are excluded from retention deletion`
          }
          badText=""
        />
        <PostureRow
          ok
          label="Restricted conversations"
          okText={`${data.privateChannels} private · ${data.broadcastChannels} broadcast`}
          badText=""
        />
      </AdminPanel>
    </div>
  );
}

function PostureRow({ ok, label, okText, badText }: { ok: boolean; label: string; okText: string; badText: string }) {
  return (
    <div className="flex items-start gap-2.5 border-b border-border-soft py-2.5 last:border-0">
      {ok ? (
        <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-ok" />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warn" />
      )}
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-foreground">{label}</p>
        <p className={`mt-0.5 text-[12px] leading-relaxed ${ok ? "text-muted" : "text-warn"}`}>
          {ok ? okText : badText}
        </p>
      </div>
    </div>
  );
}

// ── Organisation ──────────────────────────────────────────────────────────────

function OrganisationPanel({ data, loading }: { data: OrgInfo | null; loading: boolean }) {
  if (loading && !data) return <SkeletonRows />;
  if (!data?.org) {
    return (
      <Empty
        icon={Building2}
        title="No organisation attached"
        hint="This account isn't linked to an organisation, so policies and retention can't be set."
      />
    );
  }
  const o = data.org;
  const usage = o.maxUsers ? Math.round((o._count.users / o.maxUsers) * 100) : 0;

  return (
    <div className="space-y-4">
      <AdminPanel title={o.name} description={`${o.slug} · created ${new Date(o.createdAt).toLocaleDateString()}`}>
        <dl className="grid gap-x-6 text-[13px] sm:grid-cols-2">
          <DetailRow term="Domain" value={o.domain ?? "Not set"} />
          <DetailRow term="Plan" value={o.plan} />
          <DetailRow term="Members" value={`${o._count.users} of ${o.maxUsers}`} warn={usage > 90} />
          <DetailRow term="Teams" value={String(o._count.teams)} />
          <DetailRow term="Departments" value={String(o._count.departments)} />
          <DetailRow term="Conversations" value={String(o._count.channels)} />
        </dl>
      </AdminPanel>
      <p className="text-[12px] text-subtle">
        Name, domain, plan and SSO are managed in the main workspace admin at{" "}
        <code className="rounded bg-surface-sunken px-1 py-0.5 text-[11px]">/org</code>.
      </p>
    </div>
  );
}

function DetailRow({ term, value, warn = false }: { term: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border-soft py-2">
      <dt className="text-muted">{term}</dt>
      <dd className={`font-medium ${warn ? "text-warn" : "text-foreground"}`}>{value}</dd>
    </div>
  );
}

// ── Admin form bits ───────────────────────────────────────────────────────────

function AdminPanel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {description && <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function AdminToggle({
  label, hint, checked, onChange,
}: {
  label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-foreground">{label}</p>
        {hint && <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{hint}</p>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-5 w-9 flex-shrink-0 rounded-full transition-colors ${checked ? "bg-accent" : "bg-border-strong"}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow-sm transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`}
        />
      </button>
    </div>
  );
}

/**
 * Commits on blur or Enter, not on every keystroke — typing "100" through a
 * per-character save would briefly persist a limit of 1, and for retention
 * that would mean a day of history deleted at 03:00.
 */
function NumberField({
  label, suffix, value, min, max, onCommit,
}: {
  label: string; suffix: string; value: number; min: number; max: number; onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);

  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) { setDraft(String(value)); return; }
    const clamped = Math.min(max, Math.max(min, Math.round(parsed)));
    setDraft(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };

  return (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor={`num-${label}`} className="text-[13px] font-medium text-foreground">{label}</label>
      <div className="flex flex-shrink-0 items-center gap-2">
        <input
          id={`num-${label}`}
          type="number"
          value={draft}
          min={min}
          max={max}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
          className="w-28 rounded-lg border border-border bg-surface-sunken px-3 py-1.5 text-right text-sm text-foreground focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
        <span className="w-20 text-[12px] text-muted">{suffix}</span>
      </div>
    </div>
  );
}
