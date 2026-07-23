import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/generated/prisma/enums";

export type TeamDef = {
  id: string;
  name: string;
  icon: string;
  color: string;
  roles: UserRole[];
};

export type TeamMember = {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  avatarUrl: string | null;
};

export type TeamWithMembers = TeamDef & {
  memberCount: number;
  members: TeamMember[];
};

const DEFAULT_TEAMS: TeamDef[] = [
  { id: "leadership",   name: "Leadership",   icon: "crown",        color: "#ef4444", roles: ["CEO", "ADMIN", "CISO", "COO"] },
  { id: "engineering",  name: "Engineering",  icon: "code",         color: "#3b82f6", roles: ["DEVELOPER", "R_AND_D"] },
  { id: "security",     name: "Security",     icon: "shield",       color: "#00d2ff", roles: ["CYBER_SECURITY", "CISO"] },
  { id: "operations",   name: "Operations",   icon: "settings",     color: "#8b5cf6", roles: ["OPS_MANAGER", "OPERATIONS", "COO"] },
  { id: "finance",      name: "Finance",      icon: "dollar-sign",  color: "#f59e0b", roles: ["FINANCE"] },
  { id: "marketing",    name: "Marketing",    icon: "megaphone",    color: "#f97316", roles: ["MARKETING"] },
  { id: "research",     name: "Research",     icon: "flask",        color: "#a855f7", roles: ["RESEARCH"] },
  { id: "qa",           name: "QA & Testing", icon: "clipboard",    color: "#22c55e", roles: ["QA"] },
  { id: "support",      name: "Support",      icon: "headphones",   color: "#06b6d4", roles: ["SUPPORT"] },
  { id: "hr",           name: "HR",           icon: "users",        color: "#f472b6", roles: ["HR"] },
  { id: "interns",      name: "Interns",      icon: "graduation",   color: "#ec4899", roles: ["INTERNSHIP"] },
  { id: "all-hands",    name: "All Hands",    icon: "users",        color: "#6b7280", roles: [] },
];

/**
 * Resolve which team IDs a given role belongs to.
 * "all-hands" is open to everyone.
 */
function teamsForRole(role: UserRole): string[] {
  const ids: string[] = ["all-hands"];
  for (const team of DEFAULT_TEAMS) {
    if (team.roles.includes(role)) ids.push(team.id);
  }
  return ids;
}

/** Build the full member list for a single team definition. */
async function resolveTeam(
  team: TeamDef,
  organizationId: string | null | undefined,
): Promise<TeamWithMembers> {
  // "all-hands" = all users; otherwise filter by role
  const roleFilter: UserRole[] | undefined =
    team.roles.length === 0 ? undefined : team.roles;

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      ...(organizationId ? { organizationId } : {}),
      ...(roleFilter ? { role: { in: roleFilter } } : {}),
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      avatarUrl: true,
    },
    orderBy: { fullName: "asc" },
  });

  return {
    ...team,
    memberCount: users.length,
    members: users,
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

  // ── Single-team detail ────────────────────────────────────────────────────
  if (teamId) {
    const teamDef = DEFAULT_TEAMS.find((t) => t.id === teamId);
    if (!teamDef) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Access check: admin can view all; others only if they belong
    if (!isAdmin) {
      const myTeams = teamsForRole(currentUser.role);
      if (!myTeams.includes(teamId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const team = await resolveTeam(teamDef, currentUser.organizationId);
    return NextResponse.json(team);
  }

  // ── All-teams list ────────────────────────────────────────────────────────
  const myTeamIds = teamsForRole(currentUser.role);

  // All users see all teams; myTeamIds just marks which ones they belong to
  const visibleDefs = DEFAULT_TEAMS;

  const teams = await Promise.all(
    visibleDefs.map((t) => resolveTeam(t, currentUser.organizationId)),
  );

  return NextResponse.json({
    teams,
    myTeamIds,
    currentUserRole: currentUser.role,
  });
}
