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
 * Chrome for Sage Connect.
 *
 * Deliberately not SidebarLayout. Nexus's shell is a spine-plus-rail built for a
 * dozen unrelated destinations; Connect has nine, all of them communication, and
 * the roadmap's whole premise is that it should read as a different product —
 * "I need to talk" rather than "I need to work". One flat sidebar, no spine.
 *
 * Everything else is shared: same session cookie, same search, same notification
 * stream, same user. Signing into Nexus signs you into Connect.
 */

/**
 * lucide glyphs by the name CONNECT_NAV declares. An explicit map rather than a
 * dynamic lookup, so a typo in a nav entry fails the surface check instead of
 * rendering nothing, and so tree-shaking keeps working.
 */
const ICONS: Record<string, React.ElementType> = {
  House,
  MessageSquare,
  Users,
  Hash,
  Video,
  Phone,
  FolderOpen,
  Bell,
  Contact,
};

/** Sidebar grouping. Presentation only — access still comes from CONNECT_NAV. */
const SECTIONS: { label: string | null; hrefs: string[] }[] = [
  { label: null, hrefs: ["/connect"] },
  { label: "Conversations", hrefs: ["/connect/chat", "/connect/channels"] },
  { label: "Spaces", hrefs: ["/connect/teams"] },
  { label: "Live", hrefs: ["/connect/meetings", "/connect/calls"] },
  { label: "Reference", hrefs: ["/connect/files", "/connect/activity", "/connect/contacts"] },
];

/**
 * Which count belongs on which nav item. Unread state is the single most
 * important affordance in a messaging product — without it the sidebar is a
 * menu, not a status display, and people go hunting.
 */
const BADGE_FOR: Record<string, keyof ConnectHomeCounts> = {
  "/connect/chat": "unreadConversations",
  "/connect/activity": "mentions",
  "/connect/meetings": "meetingsToday",
};

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";

function NavLink({
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
  const live = isLive(item);
  const showBadge = typeof badge === "number" && badge > 0;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={item.hint}
      aria-current={active ? "page" : undefined}
      className={[
        "group relative flex items-center gap-2.5 rounded-lg py-2 pl-2.5 pr-2 text-[13px] transition-colors",
        focusRing,
        active
          ? "bg-accent-soft font-semibold text-accent"
          : "font-medium text-muted hover:bg-hover hover:text-foreground",
      ].join(" ")}
    >
      {/* Left rail on the active row. The tint alone reads as a hover state at
          a glance; the bar is what makes "you are here" unambiguous. */}
      <span
        aria-hidden
        className={[
          "absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-accent transition-opacity",
          active ? "opacity-100" : "opacity-0",
        ].join(" ")}
      />
      <Glyph className="h-4 w-4 flex-shrink-0" />
      <span className="truncate">{item.label}</span>

      {showBadge ? (
        <span
          className={[
            "ml-auto min-w-[18px] flex-shrink-0 rounded-full px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums",
            active ? "bg-accent text-accent-foreground" : "bg-accent-soft text-accent-strong",
          ].join(" ")}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : !live ? (
        // Sections whose phase hasn't landed stay navigable but say so, rather
        // than looking broken or being hidden and forgotten.
        <span className="ml-auto flex-shrink-0 rounded-full bg-surface-sunken px-1.5 py-0.5 text-[9px] font-semibold text-subtle">
          Phase {item.phase}
        </span>
      ) : null}
    </Link>
  );
}

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
  const activeHref = CONNECT_NAV.filter(
    (i) => pathname === i.href || pathname.startsWith(`${i.href}/`),
  ).sort((a, b) => b.href.length - a.href.length)[0]?.href;

  const byHref = new Map(CONNECT_NAV.map((i) => [i.href, i]));

  const loadCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/connect/home?counts=1", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as ConnectHomeResponse;
      setCounts(data.counts);
    } catch {
      // Badges are decoration on top of navigation — a failed poll should never
      // interrupt it, so this stays silent and retries on the next tick.
    }
  }, []);

  useEffect(() => {
    void loadCounts();
    const t = setInterval(() => void loadCounts(), 60_000);
    return () => clearInterval(t);
  }, [loadCounts]);

  // Re-check on navigation: opening a conversation is the most common way a
  // count changes, and waiting up to a minute to reflect that feels broken.
  useEffect(() => {
    void loadCounts();
  }, [pathname, loadCounts]);

  // Escape closes the mobile drawer — expected of anything modal, and the only
  // way out for keyboard users once the scrim covers the page.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const nav = (
    <nav aria-label="Sage Connect" className="flex-1 space-y-5 overflow-y-auto px-3 py-3">
      {SECTIONS.map((section, i) => {
        const items = section.hrefs
          .map((h) => byHref.get(h))
          .filter((x): x is ConnectNavItem => Boolean(x));
        if (items.length === 0) return null;

        return (
          <div key={section.label ?? `group-${i}`} className="space-y-0.5">
            {section.label && (
              <p className="px-2.5 pb-1 text-xs font-medium text-subtle">{section.label}</p>
            )}
            {items.map((item) => {
              const key = BADGE_FOR[item.href];
              return (
                <NavLink
                  key={item.href}
                  item={item}
                  active={activeHref === item.href}
                  badge={key && counts ? counts[key] : undefined}
                  onNavigate={() => setMobileOpen(false)}
                />
              );
            })}
          </div>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="space-y-0.5 border-t border-border-soft px-3 py-3">
      {nexusHref && (
        <a
          href={nexusHref}
          className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-hover hover:text-foreground ${focusRing}`}
        >
          <ArrowUpRight className="h-4 w-4 flex-shrink-0" />
          <span className="truncate">Open Nexus</span>
        </a>
      )}
      <Link
        href="/settings"
        className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-hover hover:text-foreground ${focusRing}`}
      >
        <Settings className="h-4 w-4 flex-shrink-0" />
        <span className="truncate">Settings</span>
      </Link>
      {/* POST, matching the Nexus shell — logout mutates session state and must
          not be reachable by a link prefetch or a stray GET. */}
      <form action="/api/auth/logout" method="post">
        <button
          type="submit"
          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-crit-soft hover:text-crit ${focusRing}`}
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          <span className="truncate">Sign out</span>
        </button>
      </form>
    </div>
  );

  const brand = (
    <Link
      href="/connect"
      aria-label="Sage Connect home"
      className={`flex h-14 flex-shrink-0 items-center gap-2.5 rounded-lg px-4 ${focusRing}`}
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent">
        <MessageSquare className="h-4 w-4 text-accent-foreground" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold leading-tight tracking-tight text-foreground">
          Sage Connect
        </span>
        <span className="block truncate text-[10px] leading-tight text-subtle">Cybersage</span>
      </span>
    </Link>
  );

  return (
    <div className="min-h-screen bg-canvas text-foreground">
      <a
        href="#connect-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-pop"
      >
        Skip to content
      </a>

      <div className="flex">
        {/* ── Sidebar (desktop) ── */}
        <aside className="sticky top-0 hidden h-screen w-60 flex-shrink-0 flex-col lg:flex">
          {brand}
          {nav}
          {footer}
        </aside>

        {/* ── Sidebar (mobile drawer) ── */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true">
            <div
              className="absolute inset-0 bg-overlay backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
              aria-hidden
            />
            <aside className="relative flex w-64 flex-col border-r border-border bg-surface shadow-pop">
              <div className="flex items-center justify-between pr-2">
                {brand}
                <button
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close navigation"
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-hover ${focusRing}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {nav}
              {footer}
            </aside>
          </div>
        )}

        {/* ── Main column ── */}
        <div className="min-w-0 flex-1 lg:py-3 lg:pr-3">
          <header className="flex h-14 items-center gap-2 px-4 lg:px-0 lg:pb-3">
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              className={`flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-hover lg:hidden ${focusRing}`}
            >
              <Menu className="h-4 w-4" />
            </button>

            <div className="min-w-0 flex-1 lg:pl-1">
              <SearchTrigger variant="topbar" />
            </div>

            <div className="flex flex-shrink-0 items-center gap-1.5">
              <NotificationCenter userId={currentUser.id} />
              <Link
                href="/profile"
                title={`${currentUser.fullName} — profile`}
                aria-label={`${currentUser.fullName} — profile`}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold uppercase text-accent-foreground ${focusRing}`}
                style={{ background: avatarGradient(currentUser.fullName) }}
              >
                {currentUser.fullName.charAt(0)}
              </Link>
            </div>
          </header>

          <main
            id="connect-main"
            className="min-h-[calc(100vh-5rem)] overflow-hidden bg-surface lg:rounded-panel lg:border lg:border-border lg:shadow-panel"
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
