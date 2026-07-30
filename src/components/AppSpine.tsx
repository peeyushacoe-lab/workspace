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
 * Spine width — 58px per the approved Atrium spec
 * (`grid-template-columns: 58px 214px ... 1fr`).
 */
export const SPINE_WIDTH = 58;

/**
 * Atrium icon spine — top-level app switcher.
 *
 * Icon-only by design: the spine answers "which app", the rail beside it answers
 * "where in that app" and carries the text labels. The rail is always present
 * (either the shell's NavRail or, for Mail/Chat/Drive/Docs, the view's own first
 * column), so labels are never hidden behind a hover.
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
        title={g.label}
        aria-label={g.label}
        aria-current={active ? "page" : undefined}
        className={`relative grid h-[38px] w-[38px] flex-none place-items-center rounded-[11px] transition-colors ${
          active
            ? "bg-surface text-accent shadow-sm"
            : "text-muted hover:bg-hover hover:text-foreground"
        }`}
      >
        <Icon className={iconSize("lg")} />
        {badge > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-crit px-1 text-[9px] font-semibold text-white">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <nav
      aria-label="Applications"
      className="hidden lg:flex lg:flex-col lg:items-center gap-1 py-2 w-full flex-1 overflow-y-auto overflow-x-hidden"
    >
      {main.map(row)}
      {footer.length > 0 && (
        <>
          <span className="my-1.5 h-px w-6 bg-border" aria-hidden />
          {footer.map(row)}
        </>
      )}
    </nav>
  );
}
