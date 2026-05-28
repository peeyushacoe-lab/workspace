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
        const res = await fetch("/api/inbox/unread-count");
        if (res.ok) {
          const data = await res.json();
          setUnreadCount(data.count);
        }
      } catch {}
    };

    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
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
                active ? "bg-[#00d2ff]/15 border-l-2 border-[#00d2ff]" : "hover:bg-[#262939]"
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? "text-[#00d2ff]" : "text-[#bbc9cf]"}`} />
              {showBadge && (
                <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#00d2ff] text-[8px] font-bold text-[#003543] px-0.5">
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
            className={`group flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors duration-150 ${
              active
                ? "bg-[#00d2ff]/10 text-[#00d2ff] border-l-2 border-[#00d2ff] shadow-[0_0_12px_rgba(0,210,255,0.15)]"
                : "text-[#bbc9cf] hover:bg-[#262939]/60 hover:text-[#dfe1f6]"
            }`}
          >
            <Icon
              className={`h-4 w-4 flex-shrink-0 transition-colors ${
                active
                  ? "text-[#00d2ff]"
                  : "text-[#bbc9cf] group-hover:text-[#dfe1f6]"
              }`}
            />
            <div className="flex flex-col flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="truncate font-medium text-[13px] font-[family-name:var(--font-geist)]">{item.label}</span>
                {showBadge && (
                  <span className="bg-[#00d2ff]/20 text-[#00d2ff] text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-1 leading-none">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </div>
              {item.hint && (
                <span className="text-[10px] text-[#bbc9cf]/60 font-normal truncate leading-tight">{item.hint}</span>
              )}
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
