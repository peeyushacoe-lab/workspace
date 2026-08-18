"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Code2, Shield, DollarSign, Settings2, Crown, Users, Megaphone, FlaskConical,
  ClipboardCheck, Headphones, GraduationCap, Briefcase, Loader2, MessageSquare, Hash,
} from "lucide-react";
import { avatarGradient } from "@/lib/avatar";
import type { TeamWithMembers, TeamsResponse } from "@/app/api/teams/route";

/**
 * Teams inside Connect.
 *
 * Reads the same DB-backed /api/teams as Nexus — team membership has one
 * source of truth (the TeamMember table) and this view does not get its own.
 * What differs is the framing: Nexus's /teams is a directory of spaces, this is
 * a list of places to go and talk, so each card leads into the conversation.
 */

const ICON_MAP: Record<string, React.ElementType> = {
  code: Code2,
  shield: Shield,
  "dollar-sign": DollarSign,
  settings: Settings2,
  crown: Crown,
  users: Users,
  megaphone: Megaphone,
  flask: FlaskConical,
  clipboard: ClipboardCheck,
  headphones: Headphones,
  graduation: GraduationCap,
  briefcase: Briefcase,
};

function TeamCard({ team, mine }: { team: TeamWithMembers; mine: boolean }) {
  const Glyph = ICON_MAP[team.icon] ?? Users;
  const visible = team.members.slice(0, 5);
  const rest = team.memberCount - visible.length;

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-start gap-3">
        <div
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
          style={{ background: `${team.color}18` }}
        >
          <Glyph className="h-[18px] w-[18px]" style={{ color: team.color }} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold leading-tight text-foreground">
              {team.name}
            </h3>
            {mine && (
              <span
                className="flex-shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                style={{ background: `${team.color}22`, color: team.color }}
              >
                Yours
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-subtle">
            {team.memberCount} {team.memberCount === 1 ? "member" : "members"}
          </p>
        </div>
      </div>

      <div className="mb-3 flex items-center">
        {visible.map((m, i) => (
          <div
            key={m.id}
            title={m.fullName}
            style={{
              marginLeft: i === 0 ? 0 : -8,
              zIndex: visible.length - i,
              background: avatarGradient(m.fullName),
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface text-[10px] font-semibold uppercase text-accent-foreground"
          >
            {m.fullName.charAt(0)}
          </div>
        ))}
        {rest > 0 && (
          <div
            style={{ marginLeft: -8 }}
            className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-surface-sunken text-[10px] font-semibold text-muted"
          >
            +{rest}
          </div>
        )}
        {team.memberCount === 0 && (
          <p className="text-xs text-subtle">No members yet.</p>
        )}
      </div>

      <div className="flex gap-1 border-t border-border-soft pt-3">
        <Link
          href="/connect/chat"
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-hover hover:text-foreground"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Chat
        </Link>
        {/* Team-scoped, via ChatChannel.teamId — /connect/teams/[id] filters
            ChatView to this team's channels instead of every channel in the
            workspace, and bootstraps a General channel the first time anyone
            opens a team that doesn't have one yet. */}
        <Link
          href={`/connect/teams/${team.id}`}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-hover hover:text-foreground"
        >
          <Hash className="h-3.5 w-3.5" />
          Channels
        </Link>
      </div>
    </div>
  );
}

function Section({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <span className="whitespace-nowrap text-xs font-semibold text-subtle">{label}</span>
        <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[10px] text-subtle">
          {count}
        </span>
        <div className="h-px flex-1 bg-border-soft" />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{children}</div>
    </section>
  );
}

export default function ConnectTeamsPage() {
  const [data, setData] = useState<TeamsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/teams", { cache: "no-store" });
      if (res.ok) setData((await res.json()) as TeamsResponse);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const mine = data?.teams.filter((t) => data.myTeamIds.includes(t.id)) ?? [];
  const others = data?.teams.filter((t) => !data.myTeamIds.includes(t.id)) ?? [];

  return (
    <div className="px-6 py-6 lg:px-8">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Teams</h1>
        <p className="mt-1 text-[13px] text-muted">
          Every team space across the organisation.
        </p>
        {data?.source === "roles" && (
          // Surfaced rather than hidden: in this mode membership is inferred
          // from each person's role and cannot be edited, which would otherwise
          // look like a broken join button.
          <p className="mt-2 rounded-lg border border-warn/25 bg-warn-soft px-3 py-2 text-xs text-warn">
            Showing role-derived membership — team records haven&apos;t been seeded yet.
            Run <code className="font-mono">npm run backfill:rbac</code> to make membership editable.
          </p>
        )}
      </header>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-subtle">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading team spaces…</span>
        </div>
      ) : !data ? (
        <div className="flex flex-col items-center gap-3 py-20">
          <Users className="h-8 w-8 text-subtle" />
          <p className="text-sm text-subtle">Unable to load team spaces.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {mine.length > 0 && (
            <Section label="My teams" count={mine.length}>
              {mine.map((t) => (
                <TeamCard key={t.id} team={t} mine />
              ))}
            </Section>
          )}
          {others.length > 0 && (
            <Section label="All teams" count={others.length}>
              {others.map((t) => (
                <TeamCard key={t.id} team={t} mine={false} />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}
