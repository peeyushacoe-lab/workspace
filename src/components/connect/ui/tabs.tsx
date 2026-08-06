"use client";

import { X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * The underline tab strip — ChannelTabs.tsx's `TabButton` (the app's one
 * formalized tab abstraction before this), generalized so it isn't private to
 * that one file. Class strings copied verbatim from there, so migrating
 * ChannelTabs onto this changes no pixels.
 */
export function Tabs({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex items-center gap-0.5 ${className}`}>{children}</div>;
}

export function TabButton({
  icon: Icon,
  label,
  accent,
  active,
  onClick,
  onRemove,
}: {
  icon: LucideIcon;
  label: string;
  /** CSS colour value (e.g. `var(--accent)`) — carries the accent of whatever
   *  the tab points at, same as it did in ChannelTabs. */
  accent: string;
  active: boolean;
  onClick: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className="group relative flex items-center">
      <button
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        className={`flex h-9 items-center gap-2 rounded-t-md px-3 text-[13px] transition-colors ${
          active
            ? "font-medium text-foreground"
            : "text-muted hover:bg-hover hover:text-foreground"
        }`}
      >
        <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: active ? accent : undefined }} />
        <span className="max-w-[140px] truncate">{label}</span>
        {onRemove && (
          <span
            role="button"
            tabIndex={0}
            aria-label={`Remove ${label} tab`}
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onRemove(); } }}
            className="-mr-1 flex h-4 w-4 items-center justify-center rounded text-subtle opacity-0
                       transition-opacity hover:text-crit focus:opacity-100 group-hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </span>
        )}
      </button>
      {active && (
        <span
          className="pointer-events-none absolute inset-x-1 bottom-0 h-0.5 rounded-full"
          style={{ background: accent }}
        />
      )}
    </div>
  );
}
