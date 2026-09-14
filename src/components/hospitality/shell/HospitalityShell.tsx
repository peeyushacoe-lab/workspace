/* eslint-disable @next/next/no-img-element */
"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, BedDouble, Brush, BellRing, ListChecks, Package, ArrowLeftRight,
  ChartColumn, Users, Plug, Mail, MessageSquare, Video, CalendarDays, Settings,
  LogOut, Menu, X, Star, type LucideIcon,
} from "lucide-react";
import { iconSize } from "@/components/icons";
import { NotificationCenter } from "@/components/NotificationCenter";
import { DesktopBridge } from "@/components/DesktopBridge";
import { PushNotificationSetup } from "@/components/PushNotificationSetup";
import { CallProvider } from "@/components/call/CallProvider";
import { dicebearUrl } from "@/lib/avatar";
import { usableMediaUrl } from "@/lib/media-url";
import { appUrl } from "@/lib/subdomains";
import type { SessionUser } from "@/lib/auth";

/**
 * Nexus Hospitality shell — the hotel product's own chrome.
 *
 *   [ 248px lagoon sidebar ][ top bar + one floating content panel ]
 *
 * Deliberately not SidebarLayout: hotel staff get a property-first navigation
 * (rooms, housekeeping, stock, team) with communication tucked beneath it, and
 * none of the core workspace apps. `.hosp-workspace` re-points the accent tokens
 * so every screen inside — mail and calendar included — carries the hotel look.
 */

type Counts = { dirtyRooms: number; openAlerts: number; lowStock: number };

type PropertyInfo = {
  property: { name: string; city?: string | null; country?: string | null; starRating?: number | null };
  orgName: string | null;
  counts: Counts;
  isManager: boolean;
};

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: keyof Counts;
  badgeTone?: "crit" | "warn";
  managerOnly?: boolean;
  /** Lives on another host (Sage Connect) — full navigation, not a client route. */
  external?: boolean;
};

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Property",
    items: [
      { href: "/hospitality", label: "Dashboard", icon: LayoutDashboard },
      { href: "/hospitality/rooms", label: "Rooms", icon: BedDouble },
      { href: "/hospitality/housekeeping", label: "Housekeeping", icon: Brush, badge: "dirtyRooms", badgeTone: "warn" },
      { href: "/hospitality/tasks", label: "Tasks", icon: ListChecks },
      { href: "/hospitality/alerts", label: "Alerts", icon: BellRing, badge: "openAlerts", badgeTone: "crit" },
    ],
  },
  {
    section: "Stock",
    items: [
      { href: "/hospitality/inventory", label: "Inventory", icon: Package, badge: "lowStock", badgeTone: "warn" },
      { href: "/hospitality/inventory/movements", label: "Stock movements", icon: ArrowLeftRight },
    ],
  },
  {
    section: "Management",
    items: [
      { href: "/hospitality/reports", label: "Reports", icon: ChartColumn },
      { href: "/hospitality/team", label: "Team", icon: Users },
      { href: "/hospitality/integrations", label: "Integrations", icon: Plug, managerOnly: true },
    ],
  },
  {
    section: "Communication",
    items: [
      { href: "/inbox", label: "Mail", icon: Mail },
      { href: "/connect/chat", label: "Chat", icon: MessageSquare, external: true },
      { href: "/meet", label: "Meet", icon: Video },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
    ],
  },
];

const MOBILE_TABS: NavItem[] = [
  { href: "/hospitality", label: "Home", icon: LayoutDashboard },
  { href: "/hospitality/rooms", label: "Rooms", icon: BedDouble },
  { href: "/hospitality/inventory", label: "Stock", icon: Package },
  { href: "/hospitality/tasks", label: "Tasks", icon: ListChecks },
  { href: "/inbox", label: "Mail", icon: Mail },
];

const ALL_HREFS = NAV.flatMap((s) => s.items.map((i) => i.href));

/** Longest matching nav href wins, so /hospitality/inventory/movements doesn't light up Inventory. */
function activeHref(pathname: string): string | null {
  let best: string | null = null;
  for (const href of ALL_HREFS) {
    const hit = href === "/hospitality" ? pathname === href : pathname === href || pathname.startsWith(href + "/");
    if (hit && (!best || href.length > best.length)) best = href;
  }
  return best;
}

function todayLabel() {
  return new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

export function HospitalityShell({
  currentUser,
  children,
}: {
  currentUser: SessionUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const [info, setInfo] = useState<PropertyInfo | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [date, setDate] = useState("");

  const loadInfo = useCallback(() => {
    fetch("/api/hospitality/property", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: PropertyInfo | null) => { if (d) setInfo(d); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setDate(todayLabel());
    loadInfo();
    const id = setInterval(loadInfo, 60_000);
    // Views dispatch this after changing a room, stock or an alert so the
    // sidebar badges update immediately instead of on the next poll.
    window.addEventListener("hospitality:refresh", loadInfo);
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { const u = usableMediaUrl(d?.avatarUrl); if (u) setAvatarUrl(u); })
      .catch(() => {});
    return () => {
      clearInterval(id);
      window.removeEventListener("hospitality:refresh", loadInfo);
    };
  }, [loadInfo]);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const current = useMemo(() => activeHref(pathname), [pathname]);
  const pageLabel = NAV.flatMap((s) => s.items).find((i) => i.href === current)?.label ?? "";
  const isManager = info?.isManager ?? false;
  const propertyName = info?.property.name ?? currentUser.fullName;
  const place = [info?.property.city, info?.property.country].filter(Boolean).join(", ");

  // Mail owns its own panes and scrolling, exactly as in the core shell.
  const panedView = /^\/inbox(\/|$)/.test(pathname);

  const avatar = (size: string) => (
    <img
      src={avatarUrl || dicebearUrl(currentUser.fullName)}
      alt={currentUser.fullName}
      className={`${size} flex-shrink-0 rounded-full bg-hosp-sidebar-hover object-cover`}
    />
  );

  const renderItem = (item: NavItem) => {
    if (item.managerOnly && !isManager) return null;
    const active = current === item.href;
    const count = item.badge ? info?.counts[item.badge] ?? 0 : 0;
    const Icon = item.icon;
    const cls = `group flex h-9 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors ${
      active
        ? "bg-hosp-sidebar-active text-hosp-sidebar-fg"
        : "text-hosp-sidebar-muted hover:bg-hosp-sidebar-hover hover:text-hosp-sidebar-fg"
    }`;
    const inner = (
      <>
        <Icon className={`${iconSize("md")} flex-shrink-0 ${active ? "text-hosp-sidebar-mark" : ""}`} />
        <span className="flex-1 truncate">{item.label}</span>
        {count > 0 && (
          <span
            className={`min-w-[20px] rounded-full px-1.5 py-px text-center text-[10.5px] font-semibold tabular-nums ${
              item.badgeTone === "crit" ? "bg-crit-soft text-crit" : "bg-warn-soft text-warn"
            }`}
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </>
    );
    return item.external ? (
      <a key={item.href} href={appUrl(item.href)} className={cls}>{inner}</a>
    ) : (
      <Link key={item.href} href={item.href} className={cls} aria-current={active ? "page" : undefined}>
        {inner}
      </Link>
    );
  };

  const sidebar = (
    <div className="flex h-full flex-col bg-hosp-sidebar text-hosp-sidebar-fg">
      {/* Property identity — the hotel, not the platform, is the brand here. */}
      <Link href="/hospitality" className="flex items-start gap-3 px-4 pb-4 pt-5">
        {/* Navy mark on a light tile — it would disappear straight on the dark sidebar. */}
        <img src="/brand/nexus-hospitality-mark.png" alt="Nexus Hospitality" className="h-9 w-9 flex-shrink-0 rounded-xl bg-surface object-contain p-0.5" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold leading-tight tracking-tight">{propertyName}</span>
          <span className="mt-0.5 flex items-center gap-1 truncate text-[11.5px] text-hosp-sidebar-muted">
            {info?.property.starRating ? (
              <>
                {info.property.starRating}
                <Star className={`${iconSize("xs")} text-hosp-sidebar-mark`} />
                <span aria-hidden>·</span>
              </>
            ) : null}
            {place || "Nexus Hospitality"}
          </span>
        </span>
      </Link>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {NAV.map((group) => (
          <div key={group.section}>
            <p className="mb-1.5 px-3 text-[11px] font-medium text-hosp-sidebar-muted">{group.section}</p>
            <div className="space-y-0.5">{group.items.map(renderItem)}</div>
          </div>
        ))}
      </nav>

      <div className="border-t border-hosp-sidebar-line px-3 py-3">
        <Link
          href="/settings"
          className="flex h-9 items-center gap-3 rounded-lg px-3 text-[13px] font-medium text-hosp-sidebar-muted transition-colors hover:bg-hosp-sidebar-hover hover:text-hosp-sidebar-fg"
        >
          <Settings className={`${iconSize("md")} flex-shrink-0`} />
          Settings
        </Link>
        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            className="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-[13px] font-medium text-hosp-sidebar-muted transition-colors hover:bg-hosp-sidebar-hover hover:text-hosp-sidebar-fg"
          >
            <LogOut className={`${iconSize("md")} flex-shrink-0`} />
            Sign out
          </button>
        </form>
        <Link href="/profile" className="mt-2 flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-hosp-sidebar-hover">
          {avatar("h-7 w-7")}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-medium">{currentUser.fullName}</span>
            <span className="block truncate text-[11px] text-hosp-sidebar-muted">{isManager ? "Manager" : "Team member"}</span>
          </span>
        </Link>
      </div>
    </div>
  );

  return (
    <div className="hosp-workspace min-h-screen bg-canvas text-foreground">
      <DesktopBridge />
      <PushNotificationSetup />

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] lg:block">{sidebar}</aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="absolute inset-0 bg-overlay" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-10 w-[272px] max-w-[85vw] shadow-pop">
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              className="absolute right-2 top-4 z-10 rounded-lg p-1.5 text-hosp-sidebar-muted hover:bg-hosp-sidebar-hover"
            >
              <X className={iconSize("md")} />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      {/* Top bar */}
      <header className="fixed inset-x-0 top-0 z-20 flex h-14 items-center gap-3 bg-canvas px-3 lg:left-[248px] lg:px-5">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="rounded-lg p-1.5 text-muted transition-colors hover:bg-hover lg:hidden"
        >
          <Menu className={iconSize("xl")} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold tracking-tight text-foreground lg:hidden">{propertyName}</p>
          <p className="hidden truncate text-[13px] text-muted lg:block">
            <span className="font-medium text-foreground">{pageLabel || "Nexus Hospitality"}</span>
            {date && <span className="text-subtle"> · {date}</span>}
          </p>
        </div>
        <Suspense fallback={null}>
          <NotificationCenter userId={currentUser.id} />
        </Suspense>
        <Link href="/profile" aria-label="Profile" className="hidden lg:block">{avatar("h-8 w-8")}</Link>
      </header>

      {/* Content — one floating panel, same geometry as the core shell */}
      <div className="pb-[60px] pt-14 lg:pb-0 lg:pl-[248px]">
        <main className="lg:pb-2 lg:pr-2">
          <div
            key={pathname}
            className={`h-[calc(100dvh-116px)] lg:h-[calc(100vh-64px)] ${
              panedView
                ? "overflow-hidden bg-surface lg:bg-transparent"
                : "overflow-y-auto overflow-x-hidden bg-surface lg:rounded-panel lg:border lg:border-border lg:shadow-panel"
            }`}
          >
            <CallProvider currentUserName={currentUser.fullName}>{children}</CallProvider>
          </div>
        </main>
      </div>

      {/* Mobile tabs */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex h-[56px] items-stretch">
          {MOBILE_TABS.map(({ href, label, icon: Icon }) => {
            const active = current === href || (href === "/inbox" && pathname.startsWith("/inbox"));
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                  active ? "text-accent" : "text-subtle"
                }`}
              >
                <Icon className={iconSize("xl")} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
