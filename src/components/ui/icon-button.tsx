"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * The icon-only button, extracted.
 *
 * `grep -c "hover:bg-hover hover:text-foreground"` across src/components turns
 * up 55 occurrences in 22 files — every toolbar and header in the app hand-types
 * some variant of `flex h-8 w-8 items-center justify-center rounded-lg
 * text-muted hover:bg-hover hover:text-foreground transition-colors`, each one
 * a chance for the radius, size, or hover state to drift from the others.
 *
 * This does not retrofit those 55 call sites — most sit inside ChatView.tsx's
 * already-large surface area, and rewriting working, tested markup for a purely
 * cosmetic win is its own risk. It exists so new work (starting with the
 * meeting control bar) has a real primitive to build on instead of adding a
 * 56th hand-rolled copy, and so a future pass through the existing call sites
 * has something correct to converge on.
 */

export type IconButtonSize = "sm" | "md" | "lg";

const SIZE: Record<IconButtonSize, { box: string; icon: string }> = {
  sm: { box: "h-7 w-7", icon: "h-3.5 w-3.5" },
  md: { box: "h-8 w-8", icon: "h-4 w-4" },
  lg: { box: "h-10 w-10", icon: "h-[18px] w-[18px]" },
};

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  icon: LucideIcon;
  /** Required, not optional — an icon-only control with no accessible name is
   *  the single most common a11y gap in icon-button code, so this isn't a
   *  string you can forget to pass. */
  label: string;
  size?: IconButtonSize;
  /** Toggle state — a mic/camera button that's currently "on". Renders as a
   *  filled accent chip rather than the default ghost hover state. */
  active?: boolean;
  /** Renders as a solid critical-colour action — hangup/leave/delete triggers,
   *  the one icon button that should read as dangerous before it's pressed. */
  destructive?: boolean;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, size = "md", active = false, destructive = false, className = "", ...rest },
  ref,
) {
  const { box, icon } = SIZE[size];
  const tone = destructive
    ? "bg-crit text-white hover:bg-crit/90"
    : active
      ? "bg-accent-soft text-accent-strong hover:bg-accent-soft"
      : "text-muted hover:bg-hover hover:text-foreground";

  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      className={`flex flex-shrink-0 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${box} ${tone} ${className}`}
      {...rest}
    >
      <Icon className={icon} />
    </button>
  );
});
