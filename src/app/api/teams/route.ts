import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { TEAM_SEEDS, seedTeamSlugsForRole } from "@/lib/teams";
import type { UserRole } from "@/generated/prisma/enums";

// ─── Team spaces ──────────────────────────────────────────────────────────────
// Reads the `Team` / `TeamMember` tables. Membership is data: a user is in a
// team because a TeamMember row says so, not because their User.role happens to
// match a hardcoded list. `npm run backfill:rbac` seeds those rows from
// TEAM_SEEDS; after that, adding and removing members is a write.
//
// The role-derived list this route used to hardcode now lives in src/lib/teams.ts
// and survives here only as a read-only fallback — see `roleDerivedPayload`.

export type TeamMember = {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  avatarUrl: string | null;
  isLead: boolean;
};

export type TeamWithMembers = {
  id: string;
  slug: string;
  name: string;
  icon: string;
  color: string;
  isSystem: boolean;
  memberCount: number;
  members: TeamMember[];
};

export type TeamsResponse = {
  teams: TeamWithMembers[];
  myTeamIds: string[];
  currentUserRole: UserRole;
  /**
   * Which path produced this payload. "roles" means the Team tables are empty
   * or unavailable and the response was derived from User.role — the page still
   * renders, but membership is not yet editable. Run `npm run backfill:rbac`.
   */
  source: "database" | "roles";
};

const MEMBER_SELECT = {
  isLead: true,
  user: {
    select: { id: true, fullName: true, email: true, role: true, avatarUrl: true },
  },
} as const;

type MemberRow = { isLead: boolean; user: Omit<TeamMember, "isLead"> };

const toMember = (m: MemberRow): TeamMember => ({ ...m.user, isLead: m.isLead });

/**
 * Fallback for a workspace whose Team tables are empty or not yet migrated.
 * Reproduces the previous role-derived behaviour exactly so /teams keeps
 * rendering instead of showing an empty state. Read-only by definition —
 * there is nothing to write a membership row against.
 */
async function roleDerivedPayload(currentUser: {
  role: UserRole;
  organizationId?: string | null;
}): Promise<TeamsResponse> {
  const orgFilter = currentUser.organizationId
    ? { organizationId: currentUser.organizationId }
    : {};

  const teams: TeamWithMembers[] = await Promise.all(
    TEAM_SEEDS.map(async (seed) => {
      const users = await prisma.user.findMany({
        where: {
          isActive: true,
          ...orgFilter,
          ...(seed.everyone ? {} : { role: { in: seed.roles } }),
        },
        select: { id: true, fullName: true, email: true, role: true, avatarUrl: true },
        orderBy: { fullName: "asc" },
      });

      return {
        id: seed.slug,
        slug: seed.slug,
        name: seed.name,
        icon: seed.icon,
        color: seed.color,
        isSystem: true,
        memberCount: users.length,
        members: users.map((u) => ({ ...u, isLead: false })),
      };
    }),
  );

  return {
    teams,
    myTeamIds: seedTeamSlugsForRole(currentUser.role),
    currentUserRole: currentUser.role,
    source: "roles",
  };
}

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get("id");
  const isAdmin = currentUser.role === "ADMIN";
  const orgFilter = currentUser.organizationId
    ? { organizationId: currentUser.organizationId }
    : {};

  // ── Single-team detail ────────────────────────────────────────────────────
  if (teamId) {
    // Accept either the record id or the slug, so links written before the
    // migration (which used slugs as ids) keep resolving.
    const team = await prisma.team.findFirst({
      where: { ...orgFilter, OR: [{ id: teamId }, { slug: teamId }] },
      include: { members: { select: MEMBER_SELECT, orderBy: { user: { fullName: "asc" } } } },
    });
    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    if (!isAdmin && !team.members.some((m) => m.user.id === currentUser.id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const detail: TeamWithMembers = {
      id: team.id,
      slug: team.slug,
      name: team.name,
      icon: team.icon ?? "users",
      color: team.color ?? "#6b6a65",
      isSystem: team.isSystem,
      memberCount: team.members.length,
      members: team.members.map(toMember),
    };
    return NextResponse.json(detail);
  }

  // ── All-teams list ────────────────────────────────────────────────────────
  let rows;
  try {
    rows = await prisma.team.findMany({
      where: orgFilter,
      include: { members: { select: MEMBER_SELECT, orderBy: { user: { fullName: "asc" } } } },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    });
  } catch (err) {
    // The Team tables may not exist yet on an environment that hasn't had the
    // RFC-001 migration applied. Degrade to the role-derived view rather than
    // 500-ing the page.
    console.warn("[api/teams] Team table unavailable, falling back to roles:", err);
    return NextResponse.json(await roleDerivedPayload(currentUser));
  }

  if (rows.length === 0) {
    return NextResponse.json(await roleDerivedPayload(currentUser));
  }

  const teams: TeamWithMembers[] = rows.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    icon: t.icon ?? "users",
    color: t.color ?? "#6b6a65",
    isSystem: t.isSystem,
    memberCount: t.members.length,
    members: t.members.map(toMember),
  }));

  // Every team stays visible to everyone — myTeamIds only flags which ones the
  // user belongs to, which is what the page splits "My Teams" on.
  const myTeamIds = rows
    .filter((t) => t.members.some((m) => m.user.id === currentUser.id))
    .map((t) => t.id);

  const payload: TeamsResponse = {
    teams,
    myTeamIds,
    currentUserRole: currentUser.role,
    source: "database",
  };
  return NextResponse.json(payload);
}
