#!/usr/bin/env ts-node
/**
 * check-nul-bytes.ts
 *
 * Scans src/ for NUL bytes (\x00) and other dangerous control characters
 * (\x01-\x08, \x0b-\x0c, \x0e-\x1f) that can be silently injected by the
 * sandbox FUSE layer during file edits. These corrupt template literals and
 * string constants and only manifest as runtime errors in production.
 *
 * Runs as `prebuild` alongside check-versions.ts. Exit 1 blocks the build.
 */

import { execSync } from "child_process";
import { readdirSync, statSync, readFileSync } from "fs";
import { resolve, join, extname } from "path";

const ROOT = resolve(__dirname, "..");
const SCAN_DIRS = ["src", "scripts", "prisma", "electron"];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".prisma"]);

// Control chars that should never appear in source: NUL + C0 controls except
// tab (\x09), newline (\x0a), carriage return (\x0d)
const DANGEROUS = /[\x00-\x08\x0b\x0c\x0e-\x1f]/;

function* walk(dir: string): Generator<string> {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    if (entry.startsWith(".") || entry === "node_modules" || entry === ".next" || entry === "generated") continue;
    const full = join(dir, entry);
    let stat;
    try { stat = statSync(full); } catch { continue; }
    if (stat.isDirectory()) yield* walk(full);
    else if (EXTENSIONS.has(extname(entry))) yield full;
  }
}

let found = false;

for (const dir of SCAN_DIRS) {
  const abs = join(ROOT, dir);
  for (const file of walk(abs)) {
    let content: string;
    try { content = readFileSync(file, "utf8"); } catch { continue; }

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (DANGEROUS.test(lines[i])) {
        const rel = file.replace(ROOT + "/", "");
        const col = lines[i].search(DANGEROUS) + 1;
        const hex = lines[i].charCodeAt(lines[i].search(DANGEROUS)).toString(16).padStart(2, "0");
        console.error(`✖  ${rel}:${i + 1}:${col}  — control char \\x${hex} detected`);
        found = true;
      }
    }
  }
}

// Also try a fast grep as a second pass (catches binary-mode injections
// that might fool the UTF-8 decoder)
try {
  execSync(`grep -rlP '[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f]' ${SCAN_DIRS.map(d => join(ROOT, d)).join(" ")} 2>/dev/null`, {
    encoding: "utf8",
  });
  // If grep exits 0 it found something — our JS pass should have caught it,
  // but flag just in case.
  if (!found) {
    console.error("✖  grep detected control chars that the JS pass missed — check output above");
    found = true;
  }
} catch {
  // grep exits 1 when nothing found — that's the happy path, do nothing
}

if (found) {
  console.error(
    "\nNUL/control-byte check failed.\n" +
    "These characters are injected by FUSE sandbox edits and corrupt runtime strings.\n" +
    "Fix: open each file in VS Code, find & remove the hidden character, then re-run `npm run build`."
  );
  process.exit(1);
} else {
  console.log("✔  No NUL or control characters found in source files.");
}
