/**
 * Sage Connect — the real-time communication product.
 *
 * Nexus is where work is stored and managed; Connect is where people talk about
 * it. They are one Next.js deployment and one identity, split by shell rather
 * than by codebase: `/connect/*` is a route group with its own layout and
 * navigation, served at `connect.cybersage.uk` via the same Host-header rewrite
 * that already backs docs./drive./meet. (see src/lib/subdomains.ts).
 *
 * That split was chosen over a second Next.js app deliberately. A separate
 * deployment would need a shared component package, a second middleware chain,
 * duplicated RBAC edge logic, a session cookie rescoped to `.cybersage.uk` and
 * CORS on the Socket.IO server — for a product boundary this file already draws.
 *
 * This module is the single source of truth for that boundary. Nav, shell,
 * middleware gating and the parity check all read from `CONNECT_NAV`, so a
 * section cannot exist in the sidebar without a matching access rule, or vice
 * versa — the failure mode that put Teams in three places.
 */

/** Connect's root path in the portal path space. */
export const CONNECT_ROOT = "/connect";

/**
 * Roadmap phase in which a section becomes usable. Sections past the current
 * phase render a placeholder naming what is coming rather than a dead link, so
 * the shell is navigable end-to-end from day one.
 *
 * Note this tracks *usability*, not polish. Chat, Teams, Meetings and Files are
 * phase 1 because the engines behind them already ship in Nexus and Connect
 * mounts them directly — later phases re-present them (threaded channels,
 * conversation-scoped files) rather than build them.
 */
export type ConnectPhase = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Phase the product is currently building. Sections at or below this are live. */
export const CURRENT_PHASE: ConnectPhase = 1;

export type ConnectNavItem = {
  /** Full portal path, e.g. "/connect/chat". */
  href: string;
  label: string;
  /** lucide-react export name. Resolved to a component in the shell's icon map. */
  icon: string;
  /** One-line description, used by the shell and by placeholder pages. */
  hint: string;
  /**
   * Permission key gating the route. Deliberately reuses keys already in
   * PERMISSION_CATALOG — Connect introduces no new permissions, so it needs no
   * catalog reseed and no permEpoch bump to go live.
   */
  permission: string;
  phase: ConnectPhase;
  /**
   * Portal route this section delegates to, when the engine already exists in
   * Nexus. Connect does not fork chat or meetings — it re-presents them.
   */
  delegatesTo?: string;
  /**
   * Section renders its own full-height application chrome (its own column
   * layout, its own list pane, its own search) rather than page content.
   *
   * These must NOT sit inside the shell's floating panel: doing so produced a
   * panel inside a panel — two rounded borders, two shadows, two gutters — and
   * a second search field stacked under the top bar's. The shell drops its
   * padding, its panel and its own search for these, and hands over the frame.
   */
  fullBleed?: boolean;
  /**
   * Only shown in the rail to people who hold `permission`. Everything else in
   * Connect is reachable by the whole workspace, so this is the exception, not
   * the pattern — see `visibleConnectNav`.
   */
  restricted?: boolean;
};

/**
 * Sidebar sections, in display order.
 *
 * Grouping mirrors the roadmap: what needs my attention (Home, Chat), where I
 * belong (Teams, Channels), what is happening live (Meetings, Calls), and what
 * came out of it (Files, Activity, Contacts).
 */
export const CONNECT_NAV: ConnectNavItem[] = [
  {
    href: "/connect",
    label: "Home",
    icon: "House",
    hint: "What needs your attention",
    permission: "chat.read",
    phase: 1,
  },
  {
    href: "/connect/chat",
    label: "Chat",
    icon: "MessageSquare",
    hint: "One-to-one direct messages",
    permission: "chat.read",
    phase: 1,
    delegatesTo: "/chat",
    fullBleed: true,
  },
  {
    href: "/connect/groups",
    label: "Groups",
    icon: "UsersRound",
    hint: "Private conversations with a few people",
    permission: "chat.read",
    phase: 1,
    fullBleed: true,
  },
  {
    href: "/connect/channels",
    label: "Channels",
    icon: "Hash",
    hint: "Open topics anyone in the workspace can join",
    permission: "chat.read",
    phase: 1,
    fullBleed: true,
  },
  {
    href: "/connect/teams",
    label: "Teams",
    icon: "Users",
    hint: "Team spaces and membership",
    permission: "teams.read",
    phase: 1,
    delegatesTo: "/teams",
  },
  {
    href: "/connect/meetings",
    label: "Meetings",
    icon: "Video",
    hint: "Scheduled and live meetings",
    permission: "meet.join",
    phase: 1,
    delegatesTo: "/meet",
    fullBleed: true,
  },
  {
    href: "/connect/calls",
    label: "Calls",
    icon: "Phone",
    hint: "Direct audio and video calls",
    permission: "meet.join",
    phase: 7,
  },
  {
    href: "/connect/files",
    label: "Files",
    icon: "FolderOpen",
    hint: "Files shared in conversations",
    permission: "drive.read",
    phase: 1,
    delegatesTo: "/drive",
    fullBleed: true,
  },
  {
    href: "/connect/activity",
    label: "Activity",
    icon: "Bell",
    hint: "Mentions, replies and reactions",
    permission: "chat.read",
    phase: 1,
  },
  {
    href: "/connect/contacts",
    label: "Contacts",
    icon: "Contact",
    hint: "People across the organisation",
    permission: "people.read",
    phase: 1,
    delegatesTo: "/people",
  },
  {
    href: "/connect/admin",
    label: "Admin",
    icon: "Shield",
    hint: "Members, channels, policies and audit",
    // Reuses the existing catalog key rather than introducing `connect.admin`.
    // A new permission would need a catalog reseed and a permEpoch bump for
    // every user before anyone could reach the console — and "manage the
    // organisation" is exactly what this console does.
    permission: "org.manage",
    phase: 1,
    // Hidden from the rail unless the viewer actually holds the permission.
    // Every other Connect section is reachable by everyone, so this is the one
    // place the nav needs to differ per person — see `visibleConnectNav`.
    restricted: true,
  },
];

/**
 * The sections a given person should see in the rail.
 *
 * Only `restricted` items are filtered. Everything else stays unconditional:
 * hiding a section someone can technically reach makes the product feel
 * inconsistent between colleagues, and the middleware is the real gate either
 * way. What's avoided here is specifically the opposite failure — showing an
 * Admin tab to every employee that 403s the moment they click it.
 *
 * `perms === undefined` means a cookie issued before the RBAC rollout. Falls
 * back to the enum role so a stale cookie doesn't lock an admin out of their
 * own console.
 */
export function visibleConnectNav(
  perms: string[] | undefined,
  role?: string,
): ConnectNavItem[] {
  return CONNECT_NAV.filter((item) => {
    if (!item.restricted) return true;
    // ADMIN is a super-role in RFC-001 — it implicitly holds every permission,
    // so its cookie may not list `org.manage` explicitly. Checking the role
    // first avoids hiding the console from the one person who definitely has
    // it, which is exactly the bug a perms-only check would produce.
    if (role === "ADMIN") return true;
    if (perms) return perms.includes(item.permission);
    return role === "CEO" || role === "CISO";
  });
}

/** True once a section's phase has been reached. */
export function isLive(item: ConnectNavItem): boolean {
  return item.phase <= CURRENT_PHASE;
}

/** Look up a section by its exact href. */
export function connectItem(href: string): ConnectNavItem | undefined {
  return CONNECT_NAV.find((i) => i.href === href);
}

/**
 * The Connect section a pathname belongs to, matching the longest href first so
 * `/connect/chat/abc` resolves to Chat rather than Home.
 */
export function connectSectionFor(pathname: string): ConnectNavItem | undefined {
  return CONNECT_NAV.filter(
    (i) => pathname === i.href || pathname.startsWith(`${i.href}/`),
  ).sort((a, b) => b.href.length - a.href.length)[0];
}

/**
 * Route-gating rules derived from the nav, in the shape src/lib/auth.ts's
 * `routePermission` expects. Longest-prefix-first is applied by the matcher
 * there, so ordering here is presentational only.
 *
 * Deriving rather than hand-writing is the point: a section added to CONNECT_NAV
 * is gated automatically, and one removed stops being reachable.
 */
export function connectRoutePermissions(): Array<{ prefix: string; permission: string }> {
  return CONNECT_NAV.map((i) => ({ prefix: i.href, permission: i.permission }));
}
