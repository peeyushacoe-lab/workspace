/* eslint-disable @next/next/no-img-element */
"use client";

/**
 * Sage Connect brand assets.
 *
 * Two shapes, each in two themes:
 *   ConnectWordmark — mark + "Sage Connect" type. Sidebar headers, sign-in.
 *   ConnectMark     — the glyph alone, square. Favicons, avatars, tight slots.
 *
 * Both render BOTH theme files and let CSS pick, rather than reading the theme
 * in JS. A `useTheme()` hook would render the wrong artwork for one frame on
 * hydration — a visible flash of an invisible logo, which is the exact failure
 * CLAUDE.md calls out for the Nexus marks.
 *
 * The dark files are not the light files at lower opacity: the source navy sits
 * at roughly 2.5:1 against Atrium's dark surface, well under the 4.5:1 floor, so
 * the dark variants are lightness-lifted while holding the same hue.
 *
 * Plain <img> rather than next/image on purpose — these are small fixed-size
 * transparent PNGs in the app shell, present on every screen. The optimiser
 * pipeline buys nothing here and next/image's wrapper complicates sizing inside
 * a flex header.
 */

type BrandProps = {
  /** Size via height, e.g. "h-[22px] w-auto". */
  className?: string;
  /** Set when adjacent text already names the product. */
  decorative?: boolean;
};

export function ConnectWordmark({ className = "h-5 w-auto", decorative = false }: BrandProps) {
  const alt = decorative ? "" : "Sage Connect";
  return (
    <>
      <img
        src="/connect/logo.png"
        alt={alt}
        aria-hidden={decorative || undefined}
        className={`${className} dark:hidden`}
        draggable={false}
      />
      <img
        src="/connect/logo-dark.png"
        alt={alt}
        aria-hidden={decorative || undefined}
        className={`${className} hidden dark:block`}
        draggable={false}
      />
    </>
  );
}

export function ConnectMark({ className = "h-7 w-7", decorative = false }: BrandProps) {
  const alt = decorative ? "" : "Sage Connect";
  return (
    <>
      <img
        src="/connect/mark.png"
        alt={alt}
        aria-hidden={decorative || undefined}
        className={`${className} dark:hidden`}
        draggable={false}
      />
      <img
        src="/connect/mark-dark.png"
        alt={alt}
        aria-hidden={decorative || undefined}
        className={`${className} hidden dark:block`}
        draggable={false}
      />
    </>
  );
}
