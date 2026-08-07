/* eslint-disable @next/next/no-img-element */
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LogOut, Menu, X, Settings, Inbox, MessageSquare, Video, Sparkles, Search,
  PanelLeftClose, PanelLeftOpen, ArrowUpRight,
} from "lucide-react";
import { appUrl } from "@/lib/subdomains";
import { iconSize } from "@/components/icons";
import { AppSpine, SPINE_WIDTH } from "./AppSpine";
import { NavRail } from "./NavRail";
import { SidebarNav } from "./SidebarNav";
import { SearchTrigger } from "./GlobalSearch";
import { NotificationCenter } from "./NotificationCenter";
import { ComposeButton } from "./ComposeButton";
import { roleLabels, type SessionUser } from "@/lib/auth";
import type { PortalNavItem } from "@/lib/auth";
import { activeGroupId, railVisible, type ResolvedGroup } from "@/lib/nav-groups";
import { avatarGradient } from "@/lib/avatar";
import { usableMediaUrl } from "@/lib/media-url";

/**
 * Atrium shell.
 *
 *   [ 60px icon spine ][ 212px contextual rail? ][ floating content panel ]
 *
 * The spine answers "which app", the rail "where in that app". Apps that render
 * their own second column (Mail, Chat, Drive, Docs) suppress the rail so the
 * shell never stacks a redundant column in front of them.
 *
 * Mobile keeps the drawer + bottom tab bar; the spine is desktop-only.
 */
export function SidebarLayout({
  nav,
  groups,
  currentUser,
  children,
}: {
  nav: PortalNavItem[];
  groups: ResolvedGroup[];
  currentUser: SessionUser | null | undefined;
  children: React.ReactNode;
}) {
  const [railOpen, setRailOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const pathname = usePathname() ?? "";
  const currentUserId = currentUser?.id;

  // Sheet/slide editors open full-screen (no portal chrome), like opening a file
  // in Google Drive. /docs is NOT in this list: DocsView switches between its
  // list and editor with internal state on the same route, so making the route
  // chromeless stranded the user with no nav and no way back.
  const fullScreen = /^\/apps\/(sheets|slides)\/[^/]+$/.test(pathname);

  const activeId = useMemo(() => activeGroupId(groups, pathname), [groups, pathname]);
  const activeGroup = groups.find((g) => g.id === activeId);
  const showRail = mounted && railOpen && railVisible(activeGroup);

  useEffect(() => {
    setMounted(true);
    try {
      if (localStorage.getItem("nav_rail_closed") === "true") setRailOpen(false);
    } catch {}
    if (currentUserId) {
      fetch("/api/profile")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { const u = usableMediaUrl(d?.avatarUrl); if (u) setAvatarUrl(u); })
        .catch(() => {});
    }
  }, [currentUserId]);

  // Unread mail count feeds the spine badge.
  useEffect(() => {
    const load = () =>
      fetch("/api/inbox/unread-count", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (typeof d?.count === "number") setUnreadCount(d.count); })
        .catch(() => {});
    load();
    const id = setInterval(load, 30000);
    const onRefresh = () => load();
    window.addEventListener("cybersage:unread-refresh", onRefresh);
    return () => {
      clearInterval(id);
      window.removeEventListener("cybersage:unread-refresh", onRefresh);
    };
  }, []);

  const toggleRail = () => {
    setRailOpen((prev) => {
      const next = !prev;
      try { localStorage.setItem("nav_rail_closed", String(!next)); } catch {}
      return next;
    });
  };

  const avatar = (size: string, ring = false) =>
    avatarUrl ? (
      <img
        src={avatarUrl}
        alt={currentUser?.fullName ?? ""}
        className={`${size} rounded-full object-cover ${ring ? "ring-2 ring-border" : ""}`}
      />
    ) : (
      <div
        className={`${size} flex items-center justify-center rounded-full text-[11px] font-semibold text-white ${ring ? "ring-2 ring-border" : ""}`}
        style={{ background: avatarGradient(currentUser?.fullName ?? "U") }}
      >
        {(currentUser?.fullName ?? "U").charAt(0).toUpperCase()}
      </div>
    );

  if (fullScreen) {
    return <div className="h-screen w-screen overflow-hidden bg-canvas">{children}</div>;
  }

  // Desktop sidebar width — spec: 58px spine + 214px rail (+8px gutter between).
  const RAIL_W = 214;
  const sidebarW = showRail ? SPINE_WIDTH + RAIL_W + 8 : SPINE_WIDTH;

  /**
   * Multi-pane views (mail, chat, drive) render their own panes as floating cards
   * on the canvas — that's the Atrium look. For those the shell must NOT add an
   * outer panel, or the cards end up nested inside a card and read as flat regions.
   * Single-surface pages keep the shell panel.
   */
  // `docs` belongs here too: DocsView renders its own list sidebar + editor +
  // right-hand panels, each scrolling independently, exactly like drive. It was
  // missing from this list, so the shell wrapped it in a panel AND clipped it.
  const panedView = /^\/(inbox|chat|drive|docs)(\/|$)/.test(pathname);

  return (
    <div className="min-h-screen bg-canvas">

      {/* ══ Desktop: icon spine + contextual rail, both riding on the canvas ══ */}
      <div
        className="hidden lg:flex lg:fixed lg:inset-y-0 lg:left-0 z-30 bg-canvas transition-[width] duration-200"
        style={{ width: sidebarW }}
      >
        <div className="flex h-full flex-col flex-shrink-0" style={{ width: SPINE_WIDTH }}>
          {/* Brand mark doubles as the spine header */}
          <Link href="/inbox" aria-label="Nexus home" className="flex h-[56px] flex-shrink-0 items-center gap-2.5 px-4">
            <img src="/nexus.png" alt="Nexus" className="h-6 w-6 flex-shrink-0 object-contain" />
            <span className="truncate text-[13.5px] font-semibold text-foreground">Nexus</span>
          </Link>
          <AppSpine groups={groups} activeId={activeId} unreadCount={unreadCount} />
          <div className="flex flex-col gap-0.5 px-2.5 pb-3">
            <div className="my-1.5 h-px bg-border-soft mx-1" aria-hidden />
            {/* Doorway to the sibling product. Same session — no second login. */}
            <a
              href={appUrl("/connect")}
              className="flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium text-muted hover:bg-hover hover:text-foreground transition-colors"
            >
              <MessageSquare className={`${iconSize("md")} flex-shrink-0`} />
              Sage Connect
              <ArrowUpRight className={`${iconSize("sm")} ml-auto flex-shrink-0 text-subtle`} />
            </a>
            <Link
              href="/settings"
              className="flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium text-muted hover:bg-hover hover:text-foreground transition-colors"
            >
              <Settings className={`${iconSize("md")} flex-shrink-0`} />
              Settings
            </Link>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-[13px] font-medium text-muted hover:bg-crit-soft hover:text-crit transition-colors"
              >
                <LogOut className={`${iconSize("md")} flex-shrink-0`} />
                Sign out
              </button>
            </form>
            {currentUser && (
              <Link href="/profile" className="mt-1 flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-hover transition-colors">
                {avatar("h-7 w-7")}
                <span className="truncate text-[12.5px] font-medium text-foreground">{currentUser.fullName}</span>
              </Link>
            )}
          </div>
        </div>

        {showRail && activeGroup && (
          <div className="flex flex-1 min-w-0 py-2 pl-2">
            <NavRail group={activeGroup} />
          </div>
        )}
      </div>

      {/* ══ Mobile drawer ══ */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-overlay" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-10 flex w-[264px] flex-col bg-surface shadow-pop border-r border-border">
            <div className="flex h-[52px] items-center gap-2.5 border-b border-border-soft px-4">
              <img src="/nexusLogo.png" alt="CyberSage Nexus" className="h-[24px] w-auto object-contain max-w-[130px] dark:hidden" />
              <img src="/nexusLogo-dark.png" alt="" aria-hidden className="hidden h-[24px] w-auto object-contain max-w-[130px] dark:block" />
              <div className="flex-1" />
              <button onClick={() => setMobileOpen(false)} className="p-1.5 rounded-lg text-subtle hover:bg-surface-sunken">
                <X className={iconSize("md")} />
              </button>
            </div>
            <div className="flex flex-1 flex-col overflow-y-auto">
              <div className="px-3 pt-3 pb-1">
                {currentUser && <ComposeButton userRole={currentUser.role} collapsed={false} />}
              </div>
              {/* Mobile keeps the flat list — a spine needs hover tooltips to be legible */}
              <SidebarNav nav={nav} collapsed={false} />
              {currentUser && (
                <div className="mt-auto border-t border-border-soft px-3 py-3 space-y-1">
                  <Link href="/profile" className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-surface-sunken transition-colors">
                    {avatar("h-8 w-8")}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-foreground truncate leading-tight">{currentUser.fullName}</p>
                      <p className="text-[11.5px] text-subtle leading-tight truncate">{roleLabels[currentUser.role]}</p>
                    </div>
                  </Link>
                  <form action="/api/auth/logout" method="post">
                    <button className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] text-muted hover:bg-crit-soft hover:text-crit transition-colors">
                      <LogOut className={`${iconSize("md")} flex-shrink-0`} />
                      Sign out
                    </button>
                  </form>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* ══ Mobile top bar ══ */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-40 flex h-[60px] items-center gap-2 bg-canvas px-3">
        <button
          onClick={() => setMobileOpen(true)}
          className="flex-shrink-0 p-1.5 rounded-lg text-muted hover:bg-hover transition-colors"
          aria-label="Open menu"
        >
          <Menu className={iconSize("xl")} />
        </button>
        <Suspense fallback={
          <div className="flex-1 flex items-center gap-2.5 h-[40px] rounded-full bg-surface-sunken border border-border px-4 cursor-pointer">
            <Search className={`${iconSize("md")} text-subtle flex-shrink-0`} />
            <span className="text-[13px] text-subtle">Search in Nexus</span>
          </div>
        }>
          <SearchTrigger variant="searchbar" />
        </Suspense>
        <Link href="/profile" aria-label="Profile" className="flex-shrink-0">{avatar("h-8 w-8", true)}</Link>
      </div>

      {/* ══ Mobile bottom tabs ══ */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-surface border-t border-border"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex h-[56px] items-stretch">
          {([
            { href: "/inbox", icon: Inbox,          label: "Inbox" },
            { href: "/connect/chat", icon: MessageSquare, label: "Chat" },
            { href: "/meet",  icon: Video,          label: "Meet"  },
            { href: "/ai",    icon: Sparkles,       label: "AI"    },
          ] as const).map(({ href, icon: Icon, label }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className="flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors"
                style={{ color: active ? "var(--accent)" : "var(--subtle)" }}
              >
                <Icon className={iconSize("2xl")} />
                {active
                  ? <span className="w-[20px] h-[3px] rounded-full mt-0.5" style={{ background: "var(--accent)" }} />
                  : <span className="text-[10px] font-medium mt-0.5">{label}</span>}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ══ Desktop top bar — centred command bar ══ */}
      <div
        className="hidden lg:flex fixed top-0 right-0 z-20 h-[56px] items-center gap-3 pl-3 pr-4 bg-canvas transition-[left] duration-200"
        style={{ left: sidebarW }}
      >
        {railVisible(activeGroup) && (
          <button
            onClick={toggleRail}
            title={railOpen ? "Hide navigation" : "Show navigation"}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-foreground transition-colors"
          >
            {railOpen ? <PanelLeftClose className={iconSize("md")} /> : <PanelLeftOpen className={iconSize("md")} />}
          </button>
        )}
        <div className="flex-1 flex justify-center">
          <SearchTrigger variant="topbar" />
        </div>
        {currentUser && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Compose used to live in the old sidebar. The mail app owns its own
                second column, so the primary action moves to the bar instead. */}
            {activeId === "mail" && (
              <div className="w-[124px]">
                <ComposeButton userRole={currentUser.role} collapsed={false} />
              </div>
            )}
            <Suspense fallback={null}>
              <NotificationCenter userId={currentUser.id} />
            </Suspense>
          </div>
        )}
      </div>

      {/* ══ Content — one floating panel on the canvas ══
          Left padding is two literal, static Tailwind classes picked by `showRail`
          (never a CSS custom property) — that was the actual bug: --shell-inset
          could silently fail to resolve and collapse padding-left to 0, sliding
          the panel under the fixed-position spine. Static classes can't do that. */}
      <div className="pt-[60px] pb-[56px] lg:pt-[56px] lg:pb-0 overflow-x-hidden">
        <main
          className={`overflow-x-hidden transition-[padding-left] duration-200 lg:pr-2 lg:pb-2 ${
            showRail ? "lg:pl-[438px]" : "lg:pl-[216px]"
          }`}
        >
          {/* Scroll ownership.
              The panel is a fixed-height box, so SOMETHING has to scroll or tall
              content is silently clipped with no scrollbar — which is exactly
              what happened on ~30 single-surface pages (settings, users, people,
              teams, billing, compliance, admin/*, apps/*): they render a long
              list straight into the panel and the overflow was unreachable.

              Paned views (inbox, chat, drive) own their internal scrolling —
              each pane scrolls independently — so they must keep
              `overflow-hidden`, otherwise the whole three-pane layout scrolls as
              one block and the column headers slide away.

              Hence: hidden for paned views, auto for everything else. */}
          <div
            key={pathname}
            className={`nexpage h-full min-h-[calc(100vh-116px)] lg:h-[calc(100vh-64px)] lg:min-h-[calc(100vh-64px)] ${
              panedView
                ? "overflow-hidden bg-surface lg:bg-transparent"
                : "overflow-y-auto overflow-x-hidden bg-surface lg:rounded-panel lg:border lg:border-border lg:shadow-panel"
            }`}
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
