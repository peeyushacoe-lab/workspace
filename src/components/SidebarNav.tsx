"use client";

import Link from "next/link";
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
                  ? "bg-[#e8f0fe] text-[#1a56db]"
                  : "text-[#5f6368] hover:bg-[#f1f3f4] hover:text-[#202124]"
              }`}
            >
              <Icon className="h-[17px] w-[17px]" />
              {showBadge && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#1a56db] text-[9px] font-semibold text-white px-0.5">
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
                ? "bg-[#e8f0fe] text-[#1a56db] font-medium"
                : "text-[#5f6368] hover:bg-[#f1f3f4] hover:text-[#202124]"
            }`}
          >
            <Icon className="h-[17px] w-[17px] flex-shrink-0" />
            <div className="flex flex-1 min-w-0 items-center justify-between">
              <span className="truncate text-[13.5px]">{item.label}</span>
              {showBadge && (
                <span className="ml-1.5 rounded-full bg-[#1a56db] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white tabular-nums">
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
