import type { UserRole } from "@/generated/prisma/enums";
import { getPortalNavForRole, type PortalNavItem } from "@/lib/auth";

/**
 * Atrium navigation model — icon spine + contextual rail.
 *
 * The flat 19-item nav list is grouped into top-level "apps" (the icon spine) each
 * owning a set of rail links. The rail then only shows what belongs to the app you
 * are in, instead of every destination in the product at once.
 *
 * Access control is unchanged: `getPortalNavForRole` remains the single source of
 * truth. Groups are derived from its output, so a role can never gain a link here.
 * Anything a role can reach that isn't explicitly grouped lands in "More", so a
 * destination can never silently disappear either.
 */

export type NavGroupId =
  | "mail" | "chat" | "meet" | "calendar" | "drive" | "docs"
  | "tasks" | "ai" | "security" | "people" | "internship"
  | "insights" | "admin" | "more";

export type RailItem = {
  href: string;
  label: string;
  hint?: string;
  /** Rail sub-heading this link sits under, if any. */
  section?: string;
};

type GroupDef = {
  id: NavGroupId;
  /** Rail heading and spine tooltip. */
  label: string;
  /** Icon key — resolved to a lucide glyph in the spine component. */
  icon: string;
  /**
   * The view renders its own secondary column (mail folders, chat channels, drive
   * sections), so the shell must NOT add a nav rail on top of it — that was the
   * old duplication: flat nav + the view's own column + list + detail.
   */
  selfNav?: boolean;
  /** hrefs from portalNavItems that this app owns, in rail order. */
  owns: string[];
  /**
   * Rail links that are gated in `pathAccess` but absent from `portalNavItems`
   * (Drive, Notes and Docs were reachable by URL only — no nav entry existed).
   * These carry their own role gate.
   */
  extra?: Array<RailItem & { roles: "all" | "non-hr" | UserRole[] }>;
  /**
   * Href that must sort to items[0]. The spine icon navigates to items[0], and
   * `owns` is built before `extra`, so without this an owned-but-secondary route
   * becomes the group's landing page (clicking Docs used to open Whiteboard).
   */
  lead?: string;
};

const HR_ROLE = "HR" as UserRole;

export const NAV_GROUPS: GroupDef[] = [
  {
    id: "mail", label: "Mail", icon: "mail", selfNav: true,
    owns: ["/inbox", "/contacts"],
    extra: [{ href: "/compose", label: "Compose", roles: "all", section: "Write" }],
  },
  { id: "chat", label: "Chat", icon: "chat", selfNav: true, owns: ["/connect/chat"] },
  { id: "meet", label: "Meet", icon: "meet", owns: ["/meet"] },
  { id: "calendar", label: "Calendar", icon: "calendar", owns: ["/calendar"] },
  {
    // Whiteboard and Notes stay on the hub; Docs/Sheets/Slides/Drive do not —
    // see the "more" group below.
    id: "docs", label: "Notes", icon: "docs", lead: "/notes",
    owns: ["/whiteboard"],
    extra: [
      { href: "/notes", label: "Notes", roles: "all" },
    ],
  },
  { id: "tasks", label: "Tasks", icon: "tasks", owns: ["/tasks"] },
  { id: "ai", label: "AI assistant", icon: "ai", owns: ["/ai"] },
  {
    id: "security", label: "Security", icon: "security",
    owns: ["/soc", "/compliance"],
  },
  {
    id: "people", label: "People", icon: "people",
    owns: ["/people", "/teams", "/users"],
  },
  {
    id: "internship", label: "Internship", icon: "internship",
    owns: ["/internship", "/mentor", "/internship/attendance", "/admin/hr"],
  },
  { id: "insights", label: "Insights", icon: "insights", owns: ["/dashboard"] },
  {
    id: "admin", label: "Admin", icon: "admin",
    owns: ["/admin", "/org", "/billing"],
  },
  // Overflow: personal + low-frequency destinations. Also the catch-all, so
  // nothing a role can reach ever vanishes from the nav.
  // "My HR" and "Apps" live here deliberately — My HR is personal (leave,
  // documents) not internship admin, and Apps is a user-facing marketplace,
  // not a system-administration screen.
  // Docs, Sheets, Slides and Drive live here rather than on the spine: each is
  // now a separate app on its own hostname (docs./drive.cybersage.uk), so the
  // spine — which is for moving *within* the workspace — is the wrong place for
  // them. Selecting one is a launch, not a tab switch, and AppLink turns these
  // hrefs into full navigations to the right subdomain.
  {
    id: "more", label: "More", icon: "more",
    owns: ["/notifications", "/hr", "/apps"],
    extra: [
      { href: "/docs", label: "Sage Docs", roles: "all", section: "Apps" },
      { href: "/apps/sheets", label: "Sage Sheets", roles: "non-hr", section: "Apps" },
      { href: "/apps/slides", label: "Sage Slides", roles: "non-hr", section: "Apps" },
      { href: "/drive", label: "Drive", roles: "all", section: "Apps" },
    ],
  },
];

/** Groups pinned to the bottom of the spine, above the avatar. */
export const SPINE_FOOTER: NavGroupId[] = ["insights", "admin", "more"];

export type ResolvedGroup = {
  id: NavGroupId;
  label: string;
  icon: string;
  selfNav: boolean;
  items: RailItem[];
  /** Longest-matching href prefixes used to decide which group a path belongs to. */
  prefixes: string[];
};

function extraAllowed(roles: "all" | "non-hr" | UserRole[], role: UserRole): boolean {
  if (roles === "all") return true;
  if (roles === "non-hr") return role !== HR_ROLE;
  return roles.includes(role);
}

/**
 * Build the spine + rail for a role. Only groups with at least one reachable
 * link are returned, so an intern sees a short spine and an admin a long one.
 */
export function getNavGroups(role: UserRole): ResolvedGroup[] {
  const allowed: PortalNavItem[] = getPortalNavForRole(role);
  const byHref = new Map(allowed.map((i) => [i.href, i]));
  const claimed = new Set<string>();

  const resolved: ResolvedGroup[] = [];

  for (const def of NAV_GROUPS) {
    const items: RailItem[] = [];

    for (const href of def.owns) {
      const item = byHref.get(href);
      if (!item) continue;
      claimed.add(href);
      items.push({ href, label: item.label, hint: item.hint });
    }
    for (const ex of def.extra ?? []) {
      if (!extraAllowed(ex.roles, role)) continue;
      items.push({ href: ex.href, label: ex.label, hint: ex.hint, section: ex.section });
    }

    if (items.length === 0) continue;

    // Promote the declared lead href so the spine icon lands on it.
    if (def.lead) {
      const i = items.findIndex((it) => it.href === def.lead);
      if (i > 0) items.unshift(items.splice(i, 1)[0]);
    }

    resolved.push({
      id: def.id,
      label: def.label,
      icon: def.icon,
      selfNav: def.selfNav ?? false,
      items,
      prefixes: items.map((i) => i.href),
    });
  }

  // Anything reachable but ungrouped goes into More rather than disappearing.
  const orphans = allowed.filter((i) => !claimed.has(i.href));
  if (orphans.length) {
    const more = resolved.find((g) => g.id === "more");
    const extraItems = orphans.map((i) => ({ href: i.href, label: i.label, hint: i.hint }));
    if (more) {
      more.items.push(...extraItems);
      more.prefixes.push(...extraItems.map((i) => i.href));
    } else {
      resolved.push({
        id: "more", label: "More", icon: "more", selfNav: false,
        items: extraItems, prefixes: extraItems.map((i) => i.href),
      });
    }
  }

  return resolved;
}

/** Which app does this pathname belong to? Longest prefix wins. */
export function activeGroupId(groups: ResolvedGroup[], pathname: string): NavGroupId | null {
  let best: { id: NavGroupId; len: number } | null = null;
  for (const g of groups) {
    for (const p of g.prefixes) {
      if (pathname === p || pathname.startsWith(p + "/")) {
        if (!best || p.length > best.len) best = { id: g.id, len: p.length };
      }
    }
  }
  return best?.id ?? null;
}

/**
 * Does the shell render a nav rail for this app?
 * No, if the view owns its own column, or if the app has a single destination
 * (a one-item rail is pure chrome — the page takes the full width instead).
 */
export function railVisible(group: ResolvedGroup | undefined): boolean {
  if (!group) return false;
  // selfNav apps (Mail, Chat, Drive, Docs) already render a labelled first
  // column, so a rail there would be a redundant third column.
  if (group.selfNav) return false;
  // Otherwise always show it, even for a single destination: the spine is
  // icon-only, so the rail is what carries the visible text labels. Hiding it
  // for one-item groups left those screens with no labels anywhere.
  return true;
}
