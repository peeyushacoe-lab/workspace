"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Contact,
  LayoutDashboard,
  Users,
  Inbox,
  MessageSquare,
  HardDrive,
  CalendarDays,
  Sparkles,
  Settings2,
  User,
  StickyNote,
  BookOpen,
  CreditCard,
  Video,
  FileText,
  Building2,
  PenLine,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { PortalNavItem } from "@/lib/auth";

const icons: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/contacts": Contact,
  "/settings": Settings2,
  "/users": Users,
  "/inbox": Inbox,
  "/chat": MessageSquare,
  "/meet": Video,
  "/drive": HardDrive,
  "/calendar": CalendarDays,
  "/notes": StickyNote,
  "/docs": FileText,
  "/ai": Sparkles,
  "/whiteboard": PenLine,
  "/org": Building2,
  "/admin": User,
  "/compliance": BookOpen,
  "/billing": CreditCard,
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
      <nav className="px-1.5 space-y-0.5 py-2">
        {nav.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = icons[item.href] ?? LayoutDashboard;
          const showBadge = item.href === "/inbox" && unreadCount > 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`relative flex h-8 w-8 mx-auto items-center justify-center rounded-md transition-colors ${
                active ? "bg-white/[0.08]" : "hover:bg-[#262939]"
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? "text-[#eceef8]" : "text-[#9aa3b8]"}`} />
              {showBadge && (
                <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#00d2ff] text-[8px] font-semibold text-[#003543] px-0.5">
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
    <nav className="px-2 space-y-0.5 py-2">
      {nav.map((item) => {
        const active = pathname.startsWith(item.href);
        const Icon = icons[item.href] ?? LayoutDashboard;
        const showBadge = item.href === "/inbox" && unreadCount > 0;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`group flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors duration-150 ${
              active
                ? "bg-white/[0.07] text-[#eceef8]"
                : "text-[#9aa3b8] hover:bg-white/[0.04] hover:text-[#dfe1f6]"
            }`}
          >
            <Icon
              className={`h-4 w-4 flex-shrink-0 transition-colors ${
                active
                  ? "text-[#eceef8]"
                  : "text-[#707a90] group-hover:text-[#dfe1f6]"
              }`}
            />
            <div className="flex flex-1 min-w-0 items-center justify-between">
              <span className="truncate text-[13px] font-medium">{item.label}</span>
              {showBadge && (
                <span className="ml-1 rounded-full bg-[#00d2ff]/15 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-[#00d2ff] tabular-nums">
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
