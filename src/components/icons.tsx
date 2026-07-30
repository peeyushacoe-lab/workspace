"use client";

/**
 * Nexus Icon System
 * =================
 *
 * A single, enforced icon language for the whole app. Every icon in Nexus is a
 * Lucide glyph rendered under one fixed set of geometric rules — the same reason
 * Linear / Vercel / Raycast / Stripe icon sets read as "premium": zero deviation.
 *
 * The rules (do not deviate — see CLAUDE.md § Icon Design System):
 *
 *   1.  24 x 24 grid          every glyph draws inside a 24x24 viewBox
 *   2.  2px stroke            never 1.5, never 2.4, never 2.6, never mixed
 *   3.  Round caps + joins    strokeLinecap="round", strokeLinejoin="round"
 *   4.  No filled shapes      fill="none" — outlines only, never fill=
 *   5.  Uniform sizing        pick a size token, never an arbitrary w-[13px]
 *   6.  Equal visual weight   all icons carry a similar amount of "ink"
 *   7.  One concept per icon  no Folder+Lock+Cloud+Star pileups
 *   8.  No emoji as UI icons  emoji are content (chat reactions), never chrome
 *
 * Rules 1-4 are enforced at runtime by <NexusIconProvider>, which sits at the
 * root of the tree and feeds Lucide's context. Because it is the context (not a
 * per-call prop), any icon anywhere inherits the correct geometry for free — the
 * only way to break it is to pass an explicit override at the call site, which
 * `npm run check:icons` fails the build on.
 *
 * Rule 5 is enforced by the size token scale below. Rules 6-8 are review rules.
 *
 * Usage
 * -----
 *   // Preferred — size token, no geometry props:
 *   import { Icon } from "@/components/icons";
 *   import { Mail } from "lucide-react";
 *   <Icon as={Mail} size="md" className="text-subtle" />
 *
 *   // Also fine — bare Lucide icon with a token size class:
 *   import { iconSize } from "@/components/icons";
 *   <Mail className={`${iconSize("md")} text-subtle`} />
 */

import { LucideProvider, type LucideIcon } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";

/* -------------------------------------------------------------------------- */
/* Geometry — the invariants                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The locked geometry every Nexus icon renders with. Fed to Lucide's context by
 * <NexusIconProvider>. These values are the design system; changing one of them
 * changes the entire product's icon language, so they live in exactly one place.
 */
export const NEXUS_ICON_GEOMETRY = {
  /** 2px. Never 1.5, never 3, never mixed — consistency is what reads as premium. */
  strokeWidth: 2,
  /**
   * false = the 2px stroke scales with the glyph, which keeps optical weight
   * consistent across sizes. Absolute stroke widths make small icons look heavy
   * and large icons look spindly.
   */
  absoluteStrokeWidth: false,
  /** Inherit the surrounding text colour — icons are never independently coloured. */
  color: "currentColor",
} as const;

/* -------------------------------------------------------------------------- */
/* Size scale — the only permitted icon dimensions                             */
/* -------------------------------------------------------------------------- */

/**
 * The complete set of icon sizes in Nexus. Everything renders on the 24x24 grid;
 * these are the display sizes that grid is scaled to.
 *
 * Before this system the app used 17 different `size={n}` values and 5 different
 * arbitrary `w-[npx]` classes. That variance is invisible in isolation and very
 * visible in aggregate — it is what makes an interface feel unconsidered.
 *
 *   xs  12px  dense metadata, inline chips, badge affixes
 *   sm  14px  secondary UI — list-row affordances, table cells, meta rows
 *   md  16px  DEFAULT — buttons, nav items, toolbars, form adornments
 *   lg  18px  section headers, primary toolbar actions
 *   xl  20px  page headers, modal titles, prominent actions
 *   2xl 24px  the native grid — empty states, feature tiles, marketing surfaces
 *   3xl 32px  hero / empty-state focal glyphs only
 */
export const ICON_SIZES = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
} as const;

export type IconSize = keyof typeof ICON_SIZES;

/**
 * Tailwind width/height pairs for each token. Using classes rather than the
 * `size` prop keeps icons responsive to Tailwind variants and avoids inline
 * attributes that are harder to audit.
 */
const ICON_SIZE_CLASS: Record<IconSize, string> = {
  xs: "w-3 h-3",
  sm: "w-3.5 h-3.5",
  md: "w-4 h-4",
  lg: "w-[18px] h-[18px]",
  xl: "w-5 h-5",
  "2xl": "w-6 h-6",
  "3xl": "w-8 h-8",
};

/** Returns the Tailwind size classes for a token. `iconSize("md")` -> "w-4 h-4". */
export function iconSize(size: IconSize = "md"): string {
  return ICON_SIZE_CLASS[size];
}

/* -------------------------------------------------------------------------- */
/* Provider — enforces geometry for every icon in the tree                     */
/* -------------------------------------------------------------------------- */

/**
 * Wraps the app so every Lucide glyph inherits the Nexus geometry without any
 * call site having to know about it. Mounted once, in the root layout.
 *
 * This is the enforcement mechanism for rules 1-4: an icon rendered anywhere
 * below this provider is guaranteed 24x24 / 2px / round / unfilled unless it
 * explicitly opts out — and opting out is what the checker catches.
 */
export function NexusIconProvider({ children }: { children: React.ReactNode }) {
  return (
    <LucideProvider
      strokeWidth={NEXUS_ICON_GEOMETRY.strokeWidth}
      absoluteStrokeWidth={NEXUS_ICON_GEOMETRY.absoluteStrokeWidth}
      color={NEXUS_ICON_GEOMETRY.color}
    >
      {children}
    </LucideProvider>
  );
}

/* -------------------------------------------------------------------------- */
/* Icon — the preferred call site                                              */
/* -------------------------------------------------------------------------- */

export type IconProps = Omit<
  ComponentPropsWithoutRef<"svg">,
  "width" | "height" | "strokeWidth" | "fill" | "stroke"
> & {
  /** The Lucide glyph to render, e.g. `as={Mail}`. */
  as: LucideIcon;
  /** A size token. Defaults to `md` (16px). Arbitrary pixel sizes are not permitted. */
  size?: IconSize;
};

/**
 * The canonical way to render an icon in Nexus.
 *
 * Geometry props are deliberately stripped from the type: you cannot pass
 * `strokeWidth`, `fill`, `width` or `height` through this component, so a call
 * site physically cannot break the icon language. Colour comes from the
 * surrounding `text-*` class, size comes from the token.
 *
 *   <Icon as={ShieldCheck} size="lg" className="text-ok" />
 */
export function Icon({ as: Glyph, size = "md", className = "", ...rest }: IconProps) {
  return <Glyph className={`${iconSize(size)} ${className}`.trim()} {...rest} />;
}

/**
 * Re-exported so consumers can type an icon-accepting prop without importing
 * from lucide-react directly:
 *
 *   type Props = { icon: NexusIcon };
 */
export type NexusIcon = LucideIcon;
