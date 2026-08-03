/**
 * Document font checker — `npm run check:fonts`.
 *
 * Three ways the font system silently breaks, all of which look like a bug to
 * the user rather than an error to us:
 *
 *   1. A family is offered in the picker but never imported. It renders as the
 *      fallback, so the picker appears to do nothing.
 *   2. A family is imported but not offered. Dead download weight nobody can
 *      reach.
 *   3. A family is imported but missing from package.json, so the build fails
 *      on a machine that hasn't got a stale node_modules.
 *
 * None of these produce a type error, which is exactly why they need a check.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DOCUMENT_FONTS, WEBFONT_FAMILIES } from "../src/lib/document-fonts";

const ROOT = join(__dirname, "..");
const imports = readFileSync(join(ROOT, "src/app/document-fonts.ts"), "utf8");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  dependencies: Record<string, string>;
};

/** "Source Sans 3" → "source-sans-3", matching Fontsource's package naming. */
const slug = (name: string) =>
  name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

const failures: string[] = [];

// ── 1. every offered webfont is imported and declared ───────────────────────
for (const family of WEBFONT_FAMILIES) {
  const pkgName = `@fontsource/${slug(family)}`;
  if (!imports.includes(`${pkgName}/`)) {
    failures.push(`"${family}" is in the picker but never imported (${pkgName})`);
  }
  if (!pkg.dependencies[pkgName]) {
    failures.push(`"${family}" is imported but missing from package.json (${pkgName})`);
  }
}

// ── 2. nothing is imported that the picker doesn't offer ────────────────────
const offered = new Set(WEBFONT_FAMILIES.map(slug));
for (const m of imports.matchAll(/@fontsource\/([a-z0-9-]+)\//g)) {
  if (!offered.has(m[1])) {
    failures.push(`@fontsource/${m[1]} is imported but no font in the registry uses it`);
  }
}

// ── 3. system faces must not be imported ────────────────────────────────────
// Arial and friends come from the OS. Downloading a lookalike would change how
// existing documents render.
for (const font of DOCUMENT_FONTS.filter(f => !f.webfont)) {
  if (imports.includes(`@fontsource/${slug(font.name)}/`)) {
    failures.push(`"${font.name}" is a system face but a webfont is imported for it`);
  }
}

// ── 4. every font carries a fallback ────────────────────────────────────────
for (const font of DOCUMENT_FONTS) {
  if (!font.stack.includes(",")) {
    failures.push(`"${font.name}" has no fallback — it will vanish in Word if absent`);
  }
}

if (failures.length === 0) {
  const web = WEBFONT_FAMILIES.length;
  const sys = DOCUMENT_FONTS.length - web;
  console.log(`✓ document fonts: ${DOCUMENT_FONTS.length} offered (${web} webfont, ${sys} system), all imported and declared.`);
  process.exit(0);
}

console.log(`✗ document fonts: ${failures.length} issue(s)\n`);
for (const f of failures) console.log(`    ${f}`);
process.exit(1);
