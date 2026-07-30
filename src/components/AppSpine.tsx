"use client";

import Link from "next/link";
import {
  Mail, MessageSquare, Video, CalendarDays, HardDrive, FileText,
  CheckSquare, Sparkles, ShieldAlert, Users, GraduationCap,
  LayoutDashboard, SlidersHorizontal, MoreHorizontal, type LucideIcon,
} from "lucide-react";
import { iconSize } from "@/components/icons";
import { SPINE_FOOTER, type NavGroupId, type ResolvedGroup } from "@/lib/nav-groups";

const GROUP_ICONS: Record<string, LucideIcon> = {
  mail: Mail,
  chat: MessageSquare,
  meet: Video,
  calendar: CalendarDays,
  drive: HardDrive,
  docs: FileText,
  tasks: CheckSquare,
  ai: Sparkles,
  security: ShieldAlert,
  people: Users,
  internship: GraduationCap,
  insights: LayoutDashboard,
  admin: SlidersHorizontal,
  more: MoreHorizontal,
};

/**
 * Spine width. The approved preview used a 58px icon-only spine with the labels
 * living in the rail, but icon-only tested badly in practice — the apps that
 * render their own first column suppress the rail, leaving no labels on screen
 * at all. Labels are therefore always shown here, and the rail stays for
 * sub-destinations within an app.
 */
export const SPINE_WIDTH = 208;

/**
 * Atrium app switcher — labelled spine.
 *
 * Every row shows its icon and name. The rail beside it answers "where in that
 * app" for groups with more than one destination.
 */
export function AppSpine({
  groups,
  activeId,
  unreadCount = 0,
  socCount = 0,
}: {
  groups: ResolvedGroup[];
  activeId: NavGroupId | null;
  unreadCount?: number;
  socCount?: number;
}) {
  const footer = groups.filter((g) => SPINE_FOOTER.includes(g.id));
  const main = groups.filter((g) => !SPINE_FOOTER.includes(g.id));

  const row = (g: ResolvedGroup) => {
    const Icon = GROUP_ICONS[g.icon] ?? MoreHorizontal;
    const active = g.id === activeId;
    const badge =
      g.id === "mail" ? unreadCount : g.id === "security" ? socCount : 0;

    return (
      <Link
        key={g.id}
        href={g.items[0].href}
        aria-current={active ? "page" : undefined}
        className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors ${
          active
            ? "bg-accent-soft text-accent"
            : "text-muted hover:bg-hover hover:text-foreground"
        }`}
      >
        <Icon className={`${iconSize("md")} flex-shrink-0`} />
        <span className="flex-1 truncate text-left">{g.label}</span>
        {badge > 0 && (
          <span className="flex h-4 min-w-4 flex-shrink-0 items-center justify-center rounded-full bg-crit px-1 text-[9px] font-semibold text-white">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <nav
      aria-label="Applications"
      className="hidden lg:flex lg:flex-col gap-0.5 px-2.5 py-2 w-full flex-1 overflow-y-auto overflow-x-hidden"
    >
      {main.map(row)}
      {footer.length > 0 && (
        <>
          <div className="my-2 h-px bg-border-soft mx-1" aria-hidden />
          {footer.map(row)}
        </>
      )}
    </nav>
  );
}
