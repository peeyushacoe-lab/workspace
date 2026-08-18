import type { UserRole } from "@/generated/prisma/enums";

/**
 * Canonical definitions for the seeded ("system") team spaces.
 *
 * This file is the ONE source of truth. Before it existed the same list was
 * written out three times — in `src/app/api/teams/route.ts`, again inline in
 * `prisma/backfill-rbac.ts`, and implicitly in `/api/organizations/teams` —
 * and the copies had already drifted: the backfill script was missing the HR
 * and All Hands teams entirely and still carried the pre-Atrium colour values.
 * Anything that needs the seed list imports it from here.
 *
 * Colour is a literal hex because it is persisted to `Team.color` and read back
 * as an inline style value for per-team accents. That is the same documented
 * exception as email HTML and pdf-lib: a context a CSS variable cannot reach.
 * Do not copy these literals into a component — read them off the team record.
 */
export type TeamSeed = {
  /** Stable identifier. Unique per organisation via `Team.slug`. */
  slug: string;
  name: string;
  /** Key into the page's ICON_MAP — must resolve to a lucide glyph. */
  icon: string;
  color: string;
  /**
   * Roles auto-enrolled into this team when it is seeded. Membership is data
   * once seeded: adding or removing a member afterwards is a `TeamMember`
   * write, not a role change, and re-running the seed never removes anyone.
   */
  roles: UserRole[];
  /**
   * Org-wide team — every active user is enrolled, regardless of role.
   * Distinct from `roles: []`, which would enrol nobody.
   */
  everyone?: boolean;
};

export const TEAM_SEEDS: TeamSeed[] = [
  { slug: "leadership",  name: "Leadership",   icon: "crown",       color: "#c0362c", roles: ["CEO", "ADMIN", "CISO", "COO"] },
  { slug: "engineering", name: "Engineering",  icon: "code",        color: "#3b82f6", roles: ["DEVELOPER", "R_AND_D"] },
  { slug: "security",    name: "Security",     icon: "shield",      color: "#4f46e5", roles: ["CYBER_SECURITY", "CISO"] },
  { slug: "operations",  name: "Operations",   icon: "settings",    color: "#8b5cf6", roles: ["OPS_MANAGER", "OPERATIONS", "COO"] },
  { slug: "finance",     name: "Finance",      icon: "dollar-sign", color: "#b45309", roles: ["FINANCE"] },
  { slug: "marketing",   name: "Marketing",    icon: "megaphone",   color: "#f97316", roles: ["MARKETING"] },
  { slug: "research",    name: "Research",     icon: "flask",       color: "#7c5cd6", roles: ["RESEARCH"] },
  { slug: "qa",          name: "QA & Testing", icon: "clipboard",   color: "#22c55e", roles: ["QA"] },
  { slug: "support",     name: "Support",      icon: "headphones",  color: "#06b6d4", roles: ["SUPPORT"] },
  // Business Managers report into the Operations Manager, so the OM is seeded
  // into this team rather than only overseeing it from outside — the team space
  // is where the client book actually gets discussed.
  { slug: "business",    name: "Business",     icon: "briefcase",   color: "#0d9488", roles: ["BUSINESS_MANAGER", "OPS_MANAGER"] },
  { slug: "hr",          name: "HR",           icon: "users",       color: "#f472b6", roles: ["HR"] },
  { slug: "interns",     name: "Interns",      icon: "graduation",  color: "#ec4899", roles: ["INTERNSHIP"] },
  { slug: "all-hands",   name: "All Hands",    icon: "users",       color: "#6b6a65", roles: [], everyone: true },
];

/** Look up a seed definition by slug. */
export function teamSeedBySlug(slug: string): TeamSeed | undefined {
  return TEAM_SEEDS.find((t) => t.slug === slug);
}

/**
 * Which seeded teams a role is auto-enrolled into.
 *
 * This is the *seeding* rule, not the membership answer. Once teams exist in
 * the database, ask `TeamMember` who is in a team — a user may have been added
 * to Engineering by hand without their `User.role` saying DEVELOPER, and that
 * addition must survive.
 */
export function seedTeamSlugsForRole(role: UserRole): string[] {
  return TEAM_SEEDS.filter((t) => t.everyone || t.roles.includes(role)).map((t) => t.slug);
}
