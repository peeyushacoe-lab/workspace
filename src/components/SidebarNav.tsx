"use client";

// Nav targets may live on an app subdomain (docs./drive./meet.), which a
// next/link cannot reach — AppLink falls back to a plain <a> for those and
// behaves exactly like next/link for everything else.
import { AppLink as Link } from "@/components/AppLink";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Inbox,
  MessageSquare,
  HardDrive,
  CalendarDays,
  Sparkles,
  SlidersHorizontal,
  User,
  StickyNote,
  BookOpen,
  CreditCard,
  Video,
  FileText,
  Building2,
  PenLine,
  Contact,
  ShieldAlert,
  CheckSquare,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { iconSize } from "@/components/icons";
import type { PortalNavItem } from "@/lib/auth";

const icons: Record<string, LucideIcon> = {
  "/dashboard":  LayoutDashboard,
  "/contacts":   Contact,
  "/settings":   SlidersHorizontal,
  "/users":      Users,
  "/inbox":      Inbox,
  "/chat":       MessageSquare,
  "/meet":       Video,
  "/drive":      HardDrive,
  "/calendar":   CalendarDays,
  "/notes":      StickyNote,
  "/docs":       FileText,
  "/ai":         Sparkles,
  "/whiteboard": PenLine,
  "/org":        Building2,
  "/admin":      SlidersHorizontal,
  "/compliance": BookOpen,
  "/billing":    CreditCard,
  "/soc":        ShieldAlert,
  "/tasks":      CheckSquare,
  "/people":     Users,
  "/teams":      LayoutGrid,
  "/apps":       LayoutGrid,
  "/profile":    User,
};

export function SidebarNav({
  nav,
  collapsed = false,
}: {
  nav: PortalNavItem[];
  collapsed?: boolean;
}) {
  const pathname = usePathname() ?? "";
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const res = await fetch("/api/inbox/unread-count", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setUnreadCount(data.count);
        }
      } catch {}
    };

    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    const onRefresh = () => fetchUnread();
    window.addEventListener("cybersage:unread-refresh", onRefresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener("cybersage:unread-refresh", onRefresh);
    };
  }, []);

  if (collapsed) {
    return (
      <nav className="px-2 space-y-0.5 py-2">
        {nav.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = icons[item.href] ?? LayoutDashboard;
          const showBadge = item.href === "/inbox" && unreadCount > 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`relative flex h-9 w-9 mx-auto items-center justify-center rounded-xl transition-colors ${
                active
                  ? "bg-accent-soft text-accent"
                  : "text-muted hover:bg-surface-sunken hover:text-foreground"
              }`}
            >
              <Icon className={iconSize("lg")} />
              {showBadge && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent text-[9px] font-semibold text-accent-foreground px-0.5">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="px-3 space-y-0.5 py-2">
      {nav.map((item) => {
        const active = pathname.startsWith(item.href);
        const Icon = icons[item.href] ?? LayoutDashboard;
        const showBadge = item.href === "/inbox" && unreadCount > 0;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`group flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors duration-150 ${
              active
                ? "bg-accent-soft text-accent font-medium"
                : "text-muted hover:bg-surface-sunken hover:text-foreground"
            }`}
          >
            <Icon className={`${iconSize("lg")} flex-shrink-0`} />
            <div className="flex flex-1 min-w-0 items-center justify-between">
              <span className="truncate text-[13.5px]">{item.label}</span>
              {showBadge && (
                <span className="ml-1.5 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold leading-none text-accent-foreground tabular-nums">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
