"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House, MessageSquare, Users, Hash, Video, Phone, FolderOpen, Bell, Contact,
  Menu, X, Settings, ArrowUpRight, LogOut,
} from "lucide-react";
import { CONNECT_NAV, isLive, type ConnectNavItem } from "@/lib/connect";
import type { SessionUser } from "@/lib/auth";
import { avatarGradient } from "@/lib/avatar";
import { SearchTrigger } from "@/components/GlobalSearch";
import { NotificationCenter } from "@/components/NotificationCenter";
import type { ConnectHomeCounts, ConnectHomeResponse } from "@/app/api/connect/home/route";

/**
 * Chrome for Sage Connect — an icon rail, in the Teams/Discord lineage.
 *
 * The first cut used a 240px labelled sidebar. That was wrong for this product:
 * Chat brings its own 256px conversation column, so the screen opened with
 * ~500px of navigation before a single message. Teams solves exactly this with a
 * narrow rail of icon+label targets, and the second column becomes whatever the
 * section needs. Same nine destinations, ~170px handed back to content.
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
  House, MessageSquare, Users, Hash, Video, Phone, FolderOpen, Bell, Contact,
};

/** Rail grouping. Presentation only — access still comes from CONNECT_NAV. */
const GROUPS: string[][] = [
  ["/connect"],
  ["/connect/chat", "/connect/channels", "/connect/teams"],
  ["/connect/meetings", "/connect/calls"],
  ["/connect/files", "/connect/activity", "/connect/contacts"],
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

// ── Rail destination ──────────────────────────────────────────────────────────

function RailItem({
  item,
  active,
  badge,
}: {
  item: ConnectNavItem;
  active: boolean;
  badge?: number;
}) {
  const Glyph = ICONS[item.icon] ?? MessageSquare;
  const showBadge = typeof badge === "number" && badge > 0;

  return (
    <Link
      href={item.href}
      title={item.hint}
      aria-current={active ? "page" : undefined}
      className={[
        "group relative flex h-[52px] w-full flex-col items-center justify-center gap-1 rounded-lg transition-colors",
        focusRing,
        active ? "bg-accent-soft text-accent" : "text-muted hover:bg-hover hover:text-foreground",
      ].join(" ")}
    >
      {/* Left marker on the active destination. The tint alone reads as hover at
          a glance; the bar is what makes "you are here" unambiguous. */}
      <span
        aria-hidden
        className={[
          "absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-accent transition-opacity",
          active ? "opacity-100" : "opacity-0",
        ].join(" ")}
      />

      <span className="relative">
        <Glyph className="h-[18px] w-[18px]" />
        {showBadge && (
          <span className="absolute -right-2 -top-1.5 min-w-[15px] rounded-full bg-accent px-1 text-center text-[9px] font-semibold leading-[15px] tabular-nums text-white">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
        {!showBadge && !isLive(item) && (
          // Unbuilt sections stay reachable and say so, rather than looking
          // broken or being hidden and forgotten.
          <span
            aria-hidden
            className="absolute -right-1.5 -top-1 h-1.5 w-1.5 rounded-full bg-border-strong"
          />
        )}
      </span>

      <span className="max-w-full truncate px-1 text-[9.5px] font-medium leading-none">
        {item.label}
      </span>
    </Link>
  );
}

/** Full-label row, used only in the mobile drawer where width is not scarce. */
function DrawerItem({
  item,
  active,
  badge,
  onNavigate,
}: {
  item: ConnectNavItem;
  active: boolean;
  badge?: number;
  onNavigate: () => void;
}) {
  const Glyph = ICONS[item.icon] ?? MessageSquare;
  const showBadge = typeof badge === "number" && badge > 0;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={[
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
        focusRing,
        active ? "bg-accent-soft font-semibold text-accent" : "font-medium text-muted hover:bg-hover",
      ].join(" ")}
    >
      <Glyph className="h-[18px] w-[18px] flex-shrink-0" />
      <span className="truncate">{item.label}</span>
      {showBadge && (
        <span className="ml-auto min-w-[18px] rounded-full bg-accent px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
      {!showBadge && !isLive(item) && (
        <span className="ml-auto text-[10px] font-medium text-subtle">Soon</span>
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
  const fullBleed = section?.fullBleed === true;

  const byHref = new Map(CONNECT_NAV.map((i) => [i.href, i]));
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

  const avatar = (
    <Link
      href="/profile"
      title={`${currentUser.fullName} — profile`}
      aria-label={`${currentUser.fullName} — profile`}
      className={`relative flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold uppercase text-white ${focusRing}`}
      style={{ background: avatarGradient(currentUser.fullName) }}
    >
      {currentUser.fullName.charAt(0)}
      {/* Presence pip. Teams puts one on every avatar; on your own it is the
          quickest confirmation that the socket is actually connected. */}
      <span
        aria-hidden
        className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-canvas bg-ok"
      />
    </Link>
  );

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

      <div className="flex">
        {/* ── Icon rail (desktop) ── */}
        <nav
          aria-label="Sage Connect"
          className="sticky top-0 hidden h-screen w-[72px] flex-shrink-0 flex-col items-center lg:flex"
        >
          <Link
            href="/connect"
            aria-label="Sage Connect home"
            title="Sage Connect"
            className={`flex h-14 flex-shrink-0 items-center ${focusRing}`}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
              <MessageSquare className="h-[18px] w-[18px] text-accent-foreground" />
            </span>
          </Link>

          <div className="flex w-full flex-1 flex-col gap-1 overflow-y-auto px-2 py-1">
            {GROUPS.map((hrefs, gi) => {
              const items = hrefs
                .map((h) => byHref.get(h))
                .filter((x): x is ConnectNavItem => Boolean(x));
              if (items.length === 0) return null;
              return (
                <div key={gi} className="flex w-full flex-col gap-0.5">
                  {gi > 0 && <span aria-hidden className="my-1 h-px w-full bg-border-soft" />}
                  {items.map((item) => (
                    <RailItem
                      key={item.href}
                      item={item}
                      active={activeHref === item.href}
                      badge={badgeFor(item.href)}
                    />
                  ))}
                </div>
              );
            })}
          </div>

          <div className="flex w-full flex-col items-center gap-1 px-2 pb-3">
            <span aria-hidden className="mb-1 h-px w-full bg-border-soft" />
            {nexusHref && (
              <a
                href={nexusHref}
                title="Open Nexus"
                className={`flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-foreground ${focusRing}`}
              >
                <ArrowUpRight className="h-[18px] w-[18px]" />
              </a>
            )}
            <Link
              href="/settings"
              title="Settings"
              className={`flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-foreground ${focusRing}`}
            >
              <Settings className="h-[18px] w-[18px]" />
            </Link>
            <form action="/api/auth/logout" method="post" className="contents">
              {/* POST, matching the Nexus shell — logout mutates session state
                  and must not be reachable by a link prefetch or a stray GET. */}
              <button
                type="submit"
                title="Sign out"
                className={`flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-crit-soft hover:text-crit ${focusRing}`}
              >
                <LogOut className="h-[18px] w-[18px]" />
              </button>
            </form>
            <div className="pt-1">{avatar}</div>
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
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent">
                  <MessageSquare className="h-4 w-4 text-accent-foreground" />
                </span>
                <span className="flex-1 truncate text-[13px] font-semibold tracking-tight">
                  Sage Connect
                </span>
                <button
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close navigation"
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-hover ${focusRing}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
                {CONNECT_NAV.map((item) => (
                  <DrawerItem
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
                  href="/settings"
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
              <span className="lg:hidden">{avatar}</span>
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
