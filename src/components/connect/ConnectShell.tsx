"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House, MessageSquare, Users, UsersRound, Hash, Video, Phone, FolderOpen, Bell, Contact,
  Shield, Menu, X, Settings, ArrowUpRight, LogOut, Pencil,
} from "lucide-react";
import { CONNECT_NAV, visibleConnectNav, isLive, type ConnectNavItem } from "@/lib/connect";
import type { SessionUser } from "@/lib/auth";
import { SearchTrigger } from "@/components/GlobalSearch";
import { NotificationCenter } from "@/components/NotificationCenter";
import { ConnectProfileMenu } from "@/components/connect/ConnectProfileMenu";
import { ConnectWordmark } from "@/components/connect/ConnectBrand";
import type { ConnectHomeCounts, ConnectHomeResponse } from "@/app/api/connect/home/route";

/**
 * Chrome for Sage Connect — a labelled sidebar, same lineage as Nexus's own
 * shell and Teams' left rail once you include its section list underneath the
 * app-switcher. An icon-only rail was tried first to reclaim width from Chat's
 * own conversation column, but nine destinations reduced to a glyph and a
 * 9.5px label is not legible at a glance — it turns navigation into a puzzle.
 * Width belongs to being able to read where you are.
 *
 * Deliberately not SidebarLayout — Nexus's spine-and-rail is built for a dozen
 * unrelated destinations. Everything else is shared: same session cookie, same
 * search, same notification stream, same user.
 */

/**
 * lucide glyphs by the name CONNECT_NAV declares. An explicit map rather than a
 * dynamic lookup, so a typo in a nav entry fails the surface check instead of
 * rendering nothing, and so tree-shaking keeps working.
 */
const ICONS: Record<string, React.ElementType> = {
  House, MessageSquare, Users, UsersRound, Hash, Video, Phone, FolderOpen, Bell, Contact, Shield,
};

/** Rail grouping with optional section labels. Presentation only. */
const GROUPS: { hrefs: string[]; label?: string }[] = [
  { hrefs: ["/connect"] },
  {
    label: "Messaging",
    hrefs: ["/connect/chat", "/connect/groups", "/connect/channels"],
  },
  {
    label: "Collaborate",
    hrefs: ["/connect/teams", "/connect/meetings", "/connect/calls"],
  },
  {
    label: "More",
    hrefs: ["/connect/files", "/connect/activity", "/connect/contacts"],
  },
  { hrefs: ["/connect/admin"] },
];

/**
 * Which count belongs on which destination. Unread state is the single most
 * important affordance in a messaging product — without it the rail is a menu,
 * not a status display, and people go hunting.
 */
const BADGE_FOR: Record<string, keyof ConnectHomeCounts> = {
  "/connect/chat": "unreadConversations",
  "/connect/activity": "mentions",
  "/connect/meetings": "meetingsToday",
};

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";

// ── Sidebar destination ────────────────────────────────────────────────────────

/**
 * One nav row: icon, label, trailing badge or "Soon" tag. Used for both the
 * desktop sidebar and the mobile drawer — the two only ever differed in
 * whether width was scarce, and it no longer is on either.
 */
function NavItem({
  item,
  active,
  badge,
  onNavigate,
}: {
  item: ConnectNavItem;
  active: boolean;
  badge?: number;
  onNavigate?: () => void;
}) {
  const Glyph = ICONS[item.icon] ?? MessageSquare;
  const showBadge = typeof badge === "number" && badge > 0;

  return (
    <Link
      href={item.href}
      title={item.hint}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={[
        "group relative flex items-center gap-2.5 rounded-lg py-[7px] pl-3 pr-2.5 text-[13px] transition-colors",
        focusRing,
        active ? "bg-accent-soft font-semibold text-accent" : "font-medium text-muted hover:bg-hover hover:text-foreground",
      ].join(" ")}
    >
      {/* Left accent bar — "you are here" */}
      <span
        aria-hidden
        className={[
          "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent transition-opacity",
          active ? "opacity-100" : "opacity-0",
        ].join(" ")}
      />

      <Glyph className="h-4 w-4 flex-shrink-0" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>

      {showBadge && (
        <span className="min-w-[18px] flex-shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-center text-[10px] font-bold leading-none tabular-nums text-accent-foreground">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
      {!showBadge && !isLive(item) && (
        <span className="flex-shrink-0 rounded-md bg-surface-sunken px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-subtle">Soon</span>
      )}
    </Link>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────

export function ConnectShell({
  currentUser,
  /** Absolute URL back to Nexus, or null in local dev where there are no subdomains. */
  nexusHref,
  children,
}: {
  currentUser: SessionUser;
  nexusHref: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [counts, setCounts] = useState<ConnectHomeCounts | null>(null);

  // Longest-match so /connect/chat/abc highlights Chat, not Home.
  const section = CONNECT_NAV.filter(
    (i) => pathname === i.href || pathname.startsWith(`${i.href}/`),
  ).sort((a, b) => b.href.length - a.href.length)[0];
  const activeHref = section?.href;
  // Team detail (/connect/teams/[id]) is a chat surface — same category as
  // Chat/Groups/Channels — even though the Teams list it sits under is not.
  // CONNECT_NAV's fullBleed flag is per-section, not per-route, so a section
  // can't be "sometimes full-bleed"; this is the one place that distinction
  // has to be made by pathname instead. Without it the team page inherits the
  // Teams list's padded panel, and ChatView's `h-full` resolves against a
  // `min-h-*` ancestor instead of a real height — the exact composer/scroll
  // bug this shell's height-chain comment already warns about below.
  const isTeamDetail = /^\/connect\/teams\/[^/]+$/.test(pathname);
  const fullBleed = section?.fullBleed === true || isTeamDetail;

  // Restricted sections (Admin) are dropped for people without the permission,
  // so the rail never offers a destination that 403s on click.
  const nav = visibleConnectNav(currentUser.perms, currentUser.role);
  const byHref = new Map(nav.map((i) => [i.href, i]));
  const badgeFor = (href: string) => {
    const key = BADGE_FOR[href];
    return key && counts ? counts[key] : undefined;
  };

  const loadCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/connect/home?counts=1", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as ConnectHomeResponse;
      setCounts(data.counts);
    } catch {
      // Badges decorate navigation — a failed poll must never interrupt it.
    }
  }, []);

  useEffect(() => {
    void loadCounts();
    const t = setInterval(() => void loadCounts(), 60_000);
    return () => clearInterval(t);
  }, [loadCounts]);

  // Opening a conversation is the most common way a count changes; waiting up
  // to a minute to reflect that feels broken.
  useEffect(() => {
    void loadCounts();
  }, [pathname, loadCounts]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    // A full-bleed section manages its own internal scrolling, so the shell is
    // pinned to the viewport and does not scroll behind it.
    <div className={`bg-canvas text-foreground ${fullBleed ? "h-screen overflow-hidden" : "min-h-screen"}`}>
      <a
        href="#connect-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-pop"
      >
        Skip to content
      </a>

      {/* This row MUST carry a definite height for full-bleed sections. Without
          it the chain `h-screen → flex row (auto) → main (flex-1) → ChatView
          (h-full)` breaks: a percentage height against an auto-height parent
          resolves to auto, so ChatView grew to its content height, the composer
          was pushed below the clipped viewport, and scrollIntoView scrolled the
          whole document instead of the message list. */}
      <div className={`flex ${fullBleed ? "h-screen" : "min-h-screen"}`}>
        {/* ── Sidebar (desktop) ── */}
        <nav
          aria-label="Sage Connect"
          className="sticky top-0 hidden h-screen w-[232px] flex-shrink-0 flex-col border-r border-border-soft bg-surface lg:flex"
        >
          <Link
            href="/connect"
            aria-label="Sage Connect home"
            className={`flex h-14 flex-shrink-0 items-center px-4 ${focusRing}`}
          >
            {/* The real wordmark, not an icon-in-a-square placeholder. Two
                theme-specific files per the Atrium rule: the navy artwork is
                ~2.5:1 on a dark surface, so dark mode gets a lifted variant
                rather than the same file at lower opacity. */}
            <ConnectWordmark className="h-[22px] w-auto" />
          </Link>

          {/* Compose button */}
          <div className="px-2.5 pb-1 pt-1 flex-shrink-0">
            <Link
              href="/connect/chat"
              className={`flex w-full items-center gap-2.5 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-accent-foreground shadow-sm transition-all hover:opacity-90 active:scale-[0.98] ${focusRing}`}
            >
              <Pencil className="h-[15px] w-[15px] flex-shrink-0" />
              New message
            </Link>
          </div>

          <div className="flex w-full flex-1 flex-col overflow-y-auto px-2.5 py-1">
            {GROUPS.map((group, gi) => {
              const items = group.hrefs
                .map((h) => byHref.get(h))
                .filter((x): x is ConnectNavItem => Boolean(x));
              if (items.length === 0) return null;
              return (
                <div key={gi} className="flex w-full flex-col">
                  {gi > 0 && <span aria-hidden className="my-1 h-px w-full bg-border-soft" />}
                  {group.label && (
                    <p className="mt-1 mb-0.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-subtle">
                      {group.label}
                    </p>
                  )}
                  <div className="flex flex-col gap-0.5">
                    {items.map((item) => (
                      <NavItem
                        key={item.href}
                        item={item}
                        active={activeHref === item.href}
                        badge={badgeFor(item.href)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex w-full flex-col gap-0.5 border-t border-border-soft px-2.5 py-2.5">
            {nexusHref && (
              <a
                href={nexusHref}
                className={`flex items-center gap-3 rounded-lg py-2 pl-3.5 pr-2.5 text-[13.5px] font-medium text-muted transition-colors hover:bg-hover hover:text-foreground ${focusRing}`}
              >
                <ArrowUpRight className="h-[18px] w-[18px] flex-shrink-0" />
                Open Nexus
              </a>
            )}
            <Link
              href="/connect/settings"
              className={`flex items-center gap-3 rounded-lg py-2 pl-3.5 pr-2.5 text-[13.5px] font-medium text-muted transition-colors hover:bg-hover hover:text-foreground ${focusRing}`}
            >
              <Settings className="h-[18px] w-[18px] flex-shrink-0" />
              Settings
            </Link>
            <form action="/api/auth/logout" method="post">
              {/* POST, matching the Nexus shell — logout mutates session state
                  and must not be reachable by a link prefetch or a stray GET. */}
              <button
                type="submit"
                className={`flex w-full items-center gap-3 rounded-lg py-2 pl-3.5 pr-2.5 text-[13.5px] font-medium text-muted transition-colors hover:bg-crit-soft hover:text-crit ${focusRing}`}
              >
                <LogOut className="h-[18px] w-[18px] flex-shrink-0" />
                Sign out
              </button>
            </form>
            <div className="mt-1.5">
              <ConnectProfileMenu currentUser={currentUser} showName placement="top" />
            </div>
          </div>
        </nav>

        {/* ── Drawer (mobile) ── */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true">
            <div
              className="absolute inset-0 bg-overlay backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
              aria-hidden
            />
            <aside className="relative flex w-64 flex-col border-r border-border bg-surface shadow-pop">
              <div className="flex h-14 flex-shrink-0 items-center gap-2.5 px-4">
                <ConnectWordmark className="h-5 w-auto flex-1" />
                <button
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close navigation"
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-hover ${focusRing}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
                {nav.map((item) => (
                  <NavItem
                    key={item.href}
                    item={item}
                    active={activeHref === item.href}
                    badge={badgeFor(item.href)}
                    onNavigate={() => setMobileOpen(false)}
                  />
                ))}
              </div>

              <div className="space-y-0.5 border-t border-border-soft px-3 py-3">
                {nexusHref && (
                  <a
                    href={nexusHref}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted hover:bg-hover"
                  >
                    <ArrowUpRight className="h-[18px] w-[18px]" />
                    Open Nexus
                  </a>
                )}
                <Link
                  href="/connect/settings"
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted hover:bg-hover"
                >
                  <Settings className="h-[18px] w-[18px]" />
                  Settings
                </Link>
                <form action="/api/auth/logout" method="post">
                  <button
                    type="submit"
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted hover:bg-crit-soft hover:text-crit"
                  >
                    <LogOut className="h-[18px] w-[18px]" />
                    Sign out
                  </button>
                </form>
              </div>
            </aside>
          </div>
        )}

        {/* ── Main column ──
            A full-bleed section owns its whole frame: no gutter, no panel, no
            top-bar search, because it ships its own. */}
        <div className={`flex min-w-0 flex-1 flex-col ${fullBleed ? "" : "lg:py-3 lg:pr-3"}`}>
          <header
            className={`flex h-14 flex-shrink-0 items-center gap-2 px-4 ${
              fullBleed ? "lg:pr-4" : "lg:px-0 lg:pb-3"
            }`}
          >
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              className={`flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-hover lg:hidden ${focusRing}`}
            >
              <Menu className="h-4 w-4" />
            </button>

            <div className="min-w-0 flex-1 lg:pl-1">
              {fullBleed ? (
                <h1 className="truncate text-[15px] font-semibold tracking-tight text-foreground">
                  {section?.label}
                </h1>
              ) : (
                <SearchTrigger variant="topbar" />
              )}
            </div>

            <div className="flex flex-shrink-0 items-center gap-1.5">
              {fullBleed && <SearchTrigger variant="icon" />}
              <NotificationCenter userId={currentUser.id} />
              <span className="lg:hidden">
                <ConnectProfileMenu currentUser={currentUser} placement="bottom" />
              </span>
            </div>
          </header>

          <main
            id="connect-main"
            className={
              fullBleed
                ? "min-h-0 flex-1 overflow-hidden border-t border-border-soft bg-surface"
                : "min-h-[calc(100vh-5rem)] overflow-hidden bg-surface lg:rounded-panel lg:border lg:border-border lg:shadow-panel"
            }
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
