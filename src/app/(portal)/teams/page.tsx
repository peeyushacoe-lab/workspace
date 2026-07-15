"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Code2, Shield, DollarSign, Settings2, Crown, Users,
  MessageSquare, FolderOpen, CalendarDays, CheckSquare,
  ChevronDown, ChevronUp, Loader2,
  Megaphone, FlaskConical, ClipboardCheck, Headphones, GraduationCap,
} from "lucide-react";
import { PageHeader } from "@/components/Shell";
import { avatarGradient } from "@/lib/avatar";
import type { TeamWithMembers } from "@/app/api/teams/route";

// ── Icon map ───────────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ElementType> = {
  code:          Code2,
  shield:        Shield,
  "dollar-sign": DollarSign,
  settings:      Settings2,
  crown:         Crown,
  users:         Users,
  megaphone:     Megaphone,
  flask:         FlaskConical,
  clipboard:     ClipboardCheck,
  headphones:    Headphones,
  graduation:    GraduationCap,
};

function TeamIcon({ icon, color, size = 18 }: { icon: string; color: string; size?: number }) {
  const Icon = ICON_MAP[icon] ?? Users;
  return <Icon style={{ color, width: size, height: size, flexShrink: 0 }} />;
}

// ── Avatar stack ───────────────────────────────────────────────────────────────
function AvatarStack({ members, color: _color }: { members: { id: string; fullName: string }[]; color: string }) {
  const visible = members.slice(0, 4);
  const rest = members.length - visible.length;

  return (
    <div className="flex items-center">
      {visible.map((m, i) => (
        <div
          key={m.id}
          title={m.fullName}
          style={{
            marginLeft: i === 0 ? 0 : -8,
            zIndex: visible.length - i,
            background: avatarGradient(m.fullName),
            border: "2px solid #12151D",
          }}
          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-white uppercase"
        >
          {m.fullName.charAt(0)}
        </div>
      ))}
      {rest > 0 && (
        <div
          style={{ marginLeft: -8, zIndex: 0, background: "#1B1F2A", border: "2px solid #12151D" }}
          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-mono text-[#8A92A6] font-semibold"
        >
          +{rest}
        </div>
      )}
    </div>
  );
}

// ── Quick-link button ─────────────────────────────────────────────────────────
function QuickLink({
  href, icon: Icon, label, color,
}: { href: string; icon: React.ElementType; label: string; color: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[#1B1F2A]"
      style={{ color }}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </Link>
  );
}

// ── Expanded panel ─────────────────────────────────────────────────────────────
function ExpandedPanel({ team }: { team: TeamWithMembers }) {
  return (
    <div className="mt-4 pt-4 border-t" style={{ borderColor: "#262A35" }}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="bg-[#1B1F2A] border border-[#262A35] rounded-lg p-3 flex flex-col gap-1">
          <span className="text-[10px] text-[#5A6275]">Members</span>
          <span className="text-lg font-mono font-semibold" style={{ color: team.color }}>
            {team.memberCount}
          </span>
        </div>
        <div className="bg-[#1B1F2A] border border-[#262A35] rounded-lg p-3 flex flex-col gap-1">
          <span className="text-[10px] text-[#5A6275]">Unread messages</span>
          <span className="text-lg font-mono font-semibold text-[#E6E9F0]">0</span>
        </div>
        <div className="bg-[#1B1F2A] border border-[#262A35] rounded-lg p-3 flex flex-col gap-1">
          <span className="text-[10px] text-[#5A6275]">Activity</span>
          <span className="text-xs text-[#5A6275]">Activity feed coming soon</span>
        </div>
      </div>

      {team.members.length > 0 ? (
        <div className="space-y-1">
          <p className="text-[10px] text-[#5A6275] mb-2">Members</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {team.members.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-[#1B1F2A] border border-[#262A35]"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white uppercase flex-shrink-0"
                  style={{ background: avatarGradient(m.fullName) }}
                >
                  {m.fullName.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-[#E6E9F0] truncate leading-tight">{m.fullName}</p>
                  <p className="text-[10px] font-mono text-[#5A6275] leading-tight truncate uppercase">
                    {m.role.replace(/_/g, " ")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-6 gap-2">
          <TeamIcon icon={team.icon} color={team.color + "66"} size={28} />
          <p className="text-xs text-[#5A6275]">No members yet — this team is ready to grow.</p>
        </div>
      )}
    </div>
  );
}

// ── Team card ──────────────────────────────────────────────────────────────────
function TeamCard({
  team,
  isMine,
  isExpanded,
  onToggle,
}: {
  team: TeamWithMembers;
  isMine: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="bg-[#12151D] border rounded-xl overflow-hidden transition-all"
      style={{
        borderTopColor: isExpanded ? team.color + "44" : "#262A35",
        borderRightColor: isExpanded ? team.color + "44" : "#262A35",
        borderBottomColor: isExpanded ? team.color + "44" : "#262A35",
        borderLeftColor: team.color,
        borderLeftWidth: "4px",
        opacity: isMine ? 1 : 0.72,
      }}
    >
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-3 mb-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: team.color + "18" }}
          >
            <TeamIcon icon={team.icon} color={team.color} size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-[#E6E9F0] leading-tight">{team.name}</h3>
              {isMine && (
                <span
                  className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                  style={{ background: team.color + "22", color: team.color }}
                >
                  Yours
                </span>
              )}
            </div>
            <p className="text-xs font-mono text-[#5A6275] mt-0.5">
              {team.memberCount} {team.memberCount === 1 ? "member" : "members"}
            </p>
          </div>
          <AvatarStack members={team.members} color={team.color} />
        </div>

        {/* Quick links */}
        <div
          className="flex flex-wrap gap-0.5 mb-3 -mx-1 pb-3 border-b"
          style={{ borderColor: "#1C1F28" }}
        >
          <QuickLink href={`/chat?team=${team.id}`}     icon={MessageSquare} label="Chat"     color="#00d2ff" />
          <QuickLink href={`/drive?team=${team.id}`}    icon={FolderOpen}    label="Files"    color="#8b5cf6" />
          <QuickLink href={`/calendar?team=${team.id}`} icon={CalendarDays}  label="Calendar" color="#f59e0b" />
          <QuickLink href={`/tasks?team=${team.id}`}    icon={CheckSquare}   label="Tasks"    color="#22c55e" />
        </div>

        {/* View Space toggle */}
        <button
          onClick={onToggle}
          className="flex items-center gap-1.5 text-xs font-medium transition-colors"
          style={{ color: isExpanded ? team.color : "#5d6579" }}
        >
          {isExpanded ? (
            <><ChevronUp className="w-3.5 h-3.5" /> Collapse Space</>
          ) : (
            <><ChevronDown className="w-3.5 h-3.5" /> View Space</>
          )}
        </button>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4">
          <ExpandedPanel team={team} />
        </div>
      )}
    </div>
  );
}

// ── Teams grid ─────────────────────────────────────────────────────────────────
function TeamsGrid({
  teams,
  myTeamIds,
  expandedId,
  onToggle,
}: {
  teams: TeamWithMembers[];
  myTeamIds: string[];
  expandedId: string | null;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {teams.map((team) => (
        <TeamCard
          key={team.id}
          team={team}
          isMine={myTeamIds.includes(team.id)}
          isExpanded={expandedId === team.id}
          onToggle={() => onToggle(team.id)}
        />
      ))}
    </div>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────
function SectionLabel({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-xs font-semibold text-[#5A6275] whitespace-nowrap">{label}</span>
      {count !== undefined && (
        <span className="text-[10px] font-mono text-[#3A3F4B] bg-[#1B1F2A] px-2 py-0.5 rounded-full">
          {count}
        </span>
      )}
      <div className="flex-1 h-px bg-[#1C1F28]" />
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
type TeamsResponse = {
  teams: TeamWithMembers[];
  myTeamIds: string[];
  currentUserRole: string;
};

export default function TeamsPage() {
  const [data, setData] = useState<TeamsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/teams");
      if (res.ok) setData(await res.json() as TeamsResponse);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleToggle = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const myTeams   = data?.teams.filter((t) =>  data.myTeamIds.includes(t.id)) ?? [];
  const otherTeams = data?.teams.filter((t) => !data.myTeamIds.includes(t.id)) ?? [];

  return (
    <div className="min-h-screen bg-[#0B0D12] text-[#E6E9F0]">
      <PageHeader
        eyebrow="Workspace"
        title="Team Spaces"
        description="All department workspaces across the organisation"
      />

      <div className="px-6 pb-10 max-w-5xl space-y-10">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-[#5A6275]">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading team spaces…</span>
          </div>
        ) : !data ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Users className="w-10 h-10 text-[#5A6275]" />
            <p className="text-sm text-[#5A6275]">Unable to load team spaces.</p>
          </div>
        ) : (
          <>
            {myTeams.length > 0 && (
              <section>
                <SectionLabel label="My Teams" count={myTeams.length} />
                <TeamsGrid
                  teams={myTeams}
                  myTeamIds={data.myTeamIds}
                  expandedId={expandedId}
                  onToggle={handleToggle}
                />
              </section>
            )}

            {otherTeams.length > 0 && (
              <section>
                <SectionLabel label="All Teams" count={otherTeams.length} />
                <TeamsGrid
                  teams={otherTeams}
                  myTeamIds={data.myTeamIds}
                  expandedId={expandedId}
                  onToggle={handleToggle}
                />
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
