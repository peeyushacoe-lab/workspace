"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";

/**
 * Connect's design primitives — a separate namespace from
 * `src/components/ui/`, deliberately.
 *
 * `src/components/ui/button.tsx` (and `dialog.tsx`, `select.tsx`, `card.tsx`,
 * `table.tsx`, `badge.tsx`) already exist, are a pre-Atrium shadcn scaffold
 * (`bg-primary`, `class-variance-authority`, `@radix-ui/react-slot`), and —
 * unlike what an earlier pass assumed — are NOT dead code: `/users` and
 * `/users/[id]/logins` both import `Button`/`Dialog`/`Select`/`Card`/`Table`/
 * `Badge` from there today. Overwriting those files or re-exporting a second
 * `Button` from the same barrel would either break those admin pages or fail
 * to compile on the duplicate export. Rather than risk either, this is a new,
 * distinctly-pathed module — `@/components/connect/ui/*` — so Connect adopts
 * an Atrium-correct system without touching the one thing still standing on
 * the legacy one. `IconButton` and `Panel` (added earlier, used by the
 * meeting shell) stay in `src/components/ui/` since neither name collided.
 *
 * Class strings match CLAUDE.md's documented "Primary button" / "Secondary /
 * ghost button" patterns exactly, so adopting this changes no pixels.
 */

export type ButtonVariant = "solid" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md";

const VARIANT: Record<ButtonVariant, string> = {
  solid: "bg-accent text-accent-foreground hover:bg-accent-hover",
  secondary: "text-muted hover:text-foreground hover:bg-hover",
  ghost: "text-muted hover:text-foreground hover:bg-hover bg-transparent",
  destructive: "bg-crit text-white hover:bg-crit/90",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-[13px]",
  md: "px-4 py-2 text-sm",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "solid", size = "md", loading = false, disabled, className = "", children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin" />}
      {children}
    </button>
  );
});
