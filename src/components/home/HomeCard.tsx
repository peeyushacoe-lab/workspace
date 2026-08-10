"use client";

import type { ReactNode } from "react";
import { AppLink } from "@/components/AppLink";
import { ArrowRight, type LucideIcon } from "lucide-react";

/**
 * The one card shell every Home section uses.
 *
 * Home shows eight features side by side. If each card invented its own header,
 * padding and empty state, the page would read as eight dashboards stapled
 * together — the exact "collection of tools" feeling Home exists to remove.
 * Every section therefore renders through this, and only the rows differ.
 */
export function HomeCard({
  title,
  icon: Icon,
  href,
  hrefLabel = "Open",
  count,
  countTone = "neutral",
  children,
  empty,
  emptyIcon: EmptyIcon,
}: {
  title: string;
  icon: LucideIcon;
  /** Where the card's own feature lives. */
  href: string;
  hrefLabel?: string;
  /** Badge in the header — omitted when zero, since "0" is just noise. */
  count?: number;
  countTone?: "neutral" | "accent" | "warn" | "crit";
  children?: ReactNode;
  /** Shown instead of `children` when there is nothing to list. */
  empty?: string;
  emptyIcon?: LucideIcon;
}) {
  const isEmpty = !children;

  const countClass =
    countTone === "crit"
      ? "text-crit bg-crit-soft border-crit/25"
      : countTone === "warn"
        ? "text-warn bg-warn-soft border-warn/25"
        : countTone === "accent"
          ? "text-accent-strong bg-accent-soft border-accent/25"
          : "text-muted bg-surface-sunken border-border";

  return (
    <section className="flex flex-col rounded-xl border border-border bg-surface shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-border-soft px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="w-3.5 h-3.5 flex-shrink-0 text-subtle" />
          <h2 className="truncate text-[13px] font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          {count ? (
            <span
              className={`flex-shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${countClass}`}
            >
              {count > 99 ? "99+" : count}
            </span>
          ) : null}
        </div>

        <AppLink
          href={href}
          className="group inline-flex flex-shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-hover hover:text-foreground"
        >
          {hrefLabel}
          <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
        </AppLink>
      </header>

      {isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
          {EmptyIcon && <EmptyIcon className="w-5 h-5 text-subtle" />}
          <p className="text-xs text-subtle">{empty ?? "Nothing here yet"}</p>
        </div>
      ) : (
        <div className="flex-1 divide-y divide-border-soft">{children}</div>
      )}
    </section>
  );
}

/** A single tappable row inside a HomeCard. Keeps hit areas and padding uniform. */
export function HomeRow({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <AppLink
      href={href}
      className="block px-4 py-2.5 transition-colors hover:bg-hover focus:bg-hover focus:outline-none"
    >
      {children}
    </AppLink>
  );
}
