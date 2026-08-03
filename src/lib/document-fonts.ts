/**
 * Fonts offered to users inside Sage Docs, Sheets and Slides.
 *
 * One registry, three apps — a font that exists in Docs but not Sheets makes a
 * document look different depending on where you opened it.
 *
 * ── Why not next/font/google ───────────────────────────────────────────────
 * `next/font` rewrites families to hashed names (`__Inter_a1b2c3`). Those
 * hashes change between builds, and a document stores the family name it was
 * written with — so every saved document would lose its font on the next
 * deploy. It stays the right tool for app chrome (see layout.tsx) and the wrong
 * one for user-selectable document fonts.
 *
 * ── Why not the upstream fonts repo ────────────────────────────────────────
 * Scosh/fonts is a desktop collection (.ttf/.otf) for installing on your OS,
 * with self-described "most are OFL, others various, as far as I am aware"
 * licensing and no releases. Redistributing unaudited binaries to every user's
 * browser is not a licensing position a security company can defend. Fontsource
 * ships the same OFL families as versioned npm packages with the licence
 * included, self-hosted, in woff2.
 *
 * ── Export behaviour ───────────────────────────────────────────────────────
 * DOCX and PPTX embed a font *name*, not the font. If the recipient lacks it,
 * their reader substitutes. `fallback` is therefore not decoration — it is what
 * the document degrades to in Word on a machine that has never heard of
 * Alegreya. Keep every fallback to a genuinely ubiquitous face.
 */

export type FontCategory = "Sans serif" | "Serif" | "Monospace" | "Display";

export type DocumentFont = {
  /** Stored in the document. Must be the real family name, never a hash. */
  name: string;
  category: FontCategory;
  /** Full CSS stack, including the fallback chain. */
  stack: string;
  /** false for system faces that need no webfont download. */
  webfont: boolean;
};

const sys = (name: string, category: FontCategory, fallback: string): DocumentFont =>
  ({ name, category, stack: `${name}, ${fallback}`, webfont: false });

const web = (name: string, category: FontCategory, fallback: string): DocumentFont =>
  ({ name, category, stack: `"${name}", ${fallback}`, webfont: true });

const SANS = "Helvetica, Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";
const MONO = "'Courier New', monospace";

export const DOCUMENT_FONTS: DocumentFont[] = [
  // ── System faces ─────────────────────────────────────────────────────────
  // Always present, never downloaded, and the safest choice for a document
  // that will be emailed to someone outside the company.
  sys("Arial", "Sans serif", SANS),
  sys("Verdana", "Sans serif", SANS),
  sys("Tahoma", "Sans serif", SANS),
  sys("Trebuchet MS", "Sans serif", SANS),
  sys("Georgia", "Serif", SERIF),
  sys("Times New Roman", "Serif", SERIF),
  sys("Courier New", "Monospace", MONO),

  // ── Sans serif ───────────────────────────────────────────────────────────
  web("Inter", "Sans serif", SANS),
  web("Source Sans 3", "Sans serif", SANS),
  web("Fira Sans", "Sans serif", SANS),
  web("IBM Plex Sans", "Sans serif", SANS),
  web("Work Sans", "Sans serif", SANS),
  web("Nunito Sans", "Sans serif", SANS),
  web("Alegreya Sans", "Sans serif", SANS),

  // ── Serif ────────────────────────────────────────────────────────────────
  web("Source Serif 4", "Serif", SERIF),
  web("EB Garamond", "Serif", SERIF),
  web("Libre Baskerville", "Serif", SERIF),
  web("Lora", "Serif", SERIF),
  web("Merriweather", "Serif", SERIF),
  web("Crimson Pro", "Serif", SERIF),

  // ── Monospace ────────────────────────────────────────────────────────────
  web("JetBrains Mono", "Monospace", MONO),
  web("IBM Plex Mono", "Monospace", MONO),
  web("Source Code Pro", "Monospace", MONO),

  // ── Display ──────────────────────────────────────────────────────────────
  // Headline faces. Deliberately few — a document app with thirty display
  // fonts produces thirty bad documents.
  web("Playfair Display", "Display", SERIF),
  web("Bebas Neue", "Display", SANS),
  web("Space Grotesk", "Display", SANS),
];

/** Category → fonts, in registry order. Drives the grouped picker. */
export const FONTS_BY_CATEGORY: { category: FontCategory; fonts: DocumentFont[] }[] =
  (["Sans serif", "Serif", "Monospace", "Display"] as const).map(category => ({
    category,
    fonts: DOCUMENT_FONTS.filter(f => f.category === category),
  }));

const BY_NAME = new Map(DOCUMENT_FONTS.map(f => [f.name, f]));

/**
 * CSS stack for a stored family name.
 *
 * Unknown names are passed through with a generic fallback rather than
 * dropped: a document imported from Word may carry Calibri or Cambria, and
 * silently rewriting someone's font on import is worse than approximating it.
 */
export function fontStack(name: string | null | undefined): string {
  if (!name) return "";
  const known = BY_NAME.get(name);
  if (known) return known.stack;
  return `"${name.replace(/"/g, "")}", ${SANS}`;
}

export function isKnownFont(name: string): boolean {
  return BY_NAME.has(name);
}

/** Families that need a webfont download — used to verify import coverage. */
export const WEBFONT_FAMILIES: string[] =
  DOCUMENT_FONTS.filter(f => f.webfont).map(f => f.name);
