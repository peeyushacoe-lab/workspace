#!/usr/bin/env node
/**
 * Nexus Icon System — conformance checker
 * =======================================
 *
 * A design system nobody can violate is the only kind that survives contact with
 * a growing codebase. <NexusIconProvider> makes the correct geometry the default;
 * this script makes deviation loud.
 *
 * Fails on:
 *   1. strokeWidth overrides    — the stroke is 2px, set once, in the provider
 *   2. filled icons             — Nexus icons are outlines, never filled
 *   3. off-scale icon sizes     — w-[13px] / size={13} instead of a size token
 *   4. emoji used as UI chrome  — emoji are content, lucide is chrome
 *
 * Precision matters more than reach here: a checker that cries wolf gets muted
 * and then deleted. So rules only fire on identifiers actually imported from
 * lucide-react in that file, and only in files that render UI.
 *
 * Run:  npm run check:icons
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

/** Permitted display sizes, in px. Mirrors ICON_SIZES in src/components/icons.tsx. */
const ALLOWED_PX = new Set([12, 14, 16, 18, 20, 24, 32]);

/**
 * Files where emoji are legitimate *content* rather than UI chrome:
 *   - the chat emoji picker and reaction bar (emoji are the feature)
 *   - the Docs special-character inserter (symbols the user inserts into a doc)
 *   - status-message presets the user picks and broadcasts as their own status
 */
const EMOJI_CONTENT_EXEMPT = new Set([
  "src/components/ChatView.tsx",
  "src/components/DocsView.tsx",
  "src/components/settings/SettingsView.tsx",
  // Announcement reactions — the emoji IS the user's reaction, same as chat.
  "src/app/(portal)/internship/page.tsx",
]);

/** Duplicate files left behind by iCloud sync ("page 2.tsx"). Not real sources. */
const IS_ICLOUD_DUPE = /\s\d+\.(tsx|ts)$/;

/**
 * Only these trees render UI. API routes, workers and libs emit strings that
 * travel to push notifications and HTML email, where an emoji is content and a
 * React icon component is not an option.
 */
const UI_TREES = ["src/app/", "src/components/"];
const NON_UI = ["src/app/api/", "src/lib/", "src/workers/"];

/** Pictographic emoji only — excludes arrows (→), box drawing (─), and ⌘. */
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;

/** Comment lines are prose, not UI. */
const IS_COMMENT = /^\s*(\/\/|\/\*|\*)/;

/** Raw SVG markup legitimately carries its own geometry attributes. */
const IS_RAW_SVG = /<(path|circle|rect|line|polyline|polygon|ellipse|svg)\b/;

/**
 * Data visualisation — sparklines, Recharts series — draws real geometry and is
 * not part of the icon language. Exempt from every rule here.
 */
const DATAVIZ_EXEMPT = new Set([
  "src/components/SheetsEditor.tsx",
  "src/components/charts/Sparkline.tsx",
]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Returns the set of identifiers this file imports from lucide-react, so the
 * size rule fires on `<Star size={13}>` but not on `<Avatar size={7}>` — where
 * `size` is a Tailwind scale unit belonging to a different component's API.
 */
function lucideIdentifiers(source) {
  const names = new Set();
  const re = /import\s*\{([\s\S]*?)\}\s*from\s*["']lucide-react["']/g;
  for (const m of source.matchAll(re)) {
    for (const raw of m[1].split(",")) {
      const name = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()?.trim();
      if (name) names.add(name);
    }
  }
  return names;
}

const violations = [];
const files = walk(SRC).filter((f) => !IS_ICLOUD_DUPE.test(f));

for (const file of files) {
  const rel = relative(ROOT, file).split("\\").join("/");
  const source = readFileSync(file, "utf8");
  const icons = lucideIdentifiers(source);
  const isUI = UI_TREES.some((p) => rel.startsWith(p)) && !NON_UI.some((p) => rel.startsWith(p));
  const emojiExempt = EMOJI_CONTENT_EXEMPT.has(rel);
  const datavizExempt = DATAVIZ_EXEMPT.has(rel);
  const iconAlt = icons.size ? [...icons].join("|") : null;

  source.split("\n").forEach((line, i) => {
    const at = `${rel}:${i + 1}`;

    // 1. strokeWidth overrides — geometry is owned by NexusIconProvider.
    if (
      !datavizExempt &&
      /strokeWidth\s*=\s*\{?["']?[\d.]+/.test(line) &&
      !IS_RAW_SVG.test(line)
    ) {
      violations.push([at, "strokeWidth override — stroke is 2px, set in NexusIconProvider", line]);
    }

    // 1b. Hand-rolled inline <svg> icons — a second icon language, drawn on a
    // different grid to the rest of the app. Icons come from lucide-react.
    if (isUI && !datavizExempt && /<svg\b/.test(line)) {
      violations.push([at, "hand-rolled <svg> icon — use a lucide glyph (rule 1)", line]);
    }

    if (iconAlt) {
      const onIcon = new RegExp(`<(${iconAlt})\\b[^>]*$|<(${iconAlt})\\b[^>]*>`);

      // 2. Filled icons — Nexus icons are outlines.
      if (onIcon.test(line) && /\bfill(-current|-\[|=)/.test(line)) {
        violations.push([at, "filled icon — Nexus icons are outlines (rule 4)", line]);
      }

      // 3. Off-scale `size={n}` on a lucide glyph.
      if (onIcon.test(line)) {
        for (const m of line.matchAll(/\bsize=\{(\d+)\}/g)) {
          if (!ALLOWED_PX.has(Number(m[1]))) {
            violations.push([at, `off-scale size={${m[1]}} — use <Icon size="..."> (rule 5)`, line]);
          }
        }
        // 3b. Off-scale arbitrary width class on a lucide glyph.
        for (const m of line.matchAll(/\bw-\[(\d+)px\]/g)) {
          const px = Number(m[1]);
          if (px <= 40 && !ALLOWED_PX.has(px)) {
            violations.push([at, `off-scale icon size w-[${px}px] — use a size token (rule 5)`, line]);
          }
        }
      }
    }

    // 4. Emoji standing in for an icon in UI chrome.
    if (isUI && !emojiExempt && !IS_COMMENT.test(line) && EMOJI_RE.test(line)) {
      violations.push([at, "emoji used as UI — use a lucide icon (rule 8)", line]);
    }
  });
}

if (violations.length === 0) {
  console.log(`✓ Nexus icon system: ${files.length} files clean.`);
  process.exit(0);
}

console.error(`\n✗ Nexus icon system: ${violations.length} violation(s)\n`);
for (const [at, rule, snippet] of violations) {
  console.error(`  ${at}\n    ${rule}\n    ${snippet.trim().slice(0, 120)}\n`);
}
console.error("See CLAUDE.md § Icon Design System.\n");
process.exit(1);
