import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Users, Code2, Shield, DollarSign, Settings2, Crown, Megaphone,
  FlaskConical, ClipboardCheck, Headphones, GraduationCap,
} from "lucide-react";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ChatView } from "@/components/ChatView";

/**
 * A team's own space: its channels, scoped so this mount never shows another
 * team's conversations. This is RFC-003's "build pending" half — the schema
 * (ChatChannel.teamId) has existed since the last migration, but nothing
 * before this page read or wrote it. See docs/rfc-003-teams-and-channels.md.
 *
 * Reuses ChatView rather than a parallel chat surface: a team channel is a
 * CHANNEL-type ChatChannel like any other, so threads, pins, reactions, the
 * composer and the info panel all work here for free. What's different is
 * scope — teamId filters the channel list to this team and routes channel
 * creation through /api/teams/[id]/channels instead of the org-wide endpoint.
 */
export default async function ConnectTeamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) redirect("/login");

  const { id } = await params;
  const team = await prisma.team.findFirst({
    where: {
      ...(user.organizationId ? { organizationId: user.organizationId } : {}),
      OR: [{ id }, { slug: id }],
    },
    select: {
      id: true,
      name: true,
      icon: true,
      color: true,
      _count: { select: { members: true } },
    },
  });
  if (!team) notFound();

  const Glyph = ICON_MAP[team.icon ?? "users"] ?? Users;
  const color = team.color ?? "#6b6a65";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-border-soft px-4 py-3">
        <Link
          href="/connect/teams"
          aria-label="Back to teams"
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
          style={{ background: `${color}18` }}
        >
          <Glyph className="h-4 w-4" style={{ color }} />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold leading-tight text-foreground">{team.name}</h1>
          <p className="text-[11px] text-subtle">
            {team._count.members} {team._count.members === 1 ? "member" : "members"} · Team channels
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <ChatView currentUserId={user.id} userRole={user.role} scope="channel" teamId={team.id} />
      </div>
    </div>
  );
}

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
};
