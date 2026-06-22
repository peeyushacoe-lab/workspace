#!/usr/bin/env ts-node
/**
 * check-versions.ts
 *
 * Runs as `prebuild` to catch package version drift before it reaches production.
 * Add any package here whose major/minor version matters for runtime correctness.
 *
 * Exit 1 = version mismatch → build is blocked.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

const root = resolve(__dirname, "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const all = { ...pkg.dependencies, ...pkg.devDependencies };

// Format: [packageName, minMajor, minMinor, maxMajor (exclusive)]
// Keep these in sync with the versions that were tested together.
const CONSTRAINTS: [string, number, number, number][] = [
  ["next",            15, 0, 16],
  ["react",           19, 0, 20],
  ["prisma",           7, 0,  8],
  ["@prisma/client",   7, 0,  8],
  ["bullmq",           5, 0,  6],
  ["ioredis",          5, 0,  6],
  ["socket.io",        4, 0,  5],
  ["typescript",       5, 0,  6],
];

function stripRange(version: string): string {
  // Remove leading ^, ~, >=, =, v etc. and take first segment
  return version.replace(/^[\^~>=v]+/, "").split(/\s/)[0];
}

let failed = false;

for (const [name, minMajor, minMinor, maxMajor] of CONSTRAINTS) {
  const raw = all[name];
  if (!raw) {
    console.warn(`⚠  ${name} not found in package.json — skipping`);
    continue;
  }
  const clean = stripRange(raw);
  const [major, minor] = clean.split(".").map(Number);

  const tooLow  = major < minMajor || (major === minMajor && minor < minMinor);
  const tooHigh = major >= maxMajor;

  if (tooLow || tooHigh) {
    console.error(
      `✖  ${name}@${clean} is outside the tested range ` +
      `[${minMajor}.${minMinor}, ${maxMajor}.0). ` +
      `Update check-versions.ts if you intentionally upgraded.`
    );
    failed = true;
  } else {
    console.log(`✔  ${name}@${clean}`);
  }
}

// ---------------------------------------------------------------------------
// Guard: schema.prisma must NOT contain url=env() — the Prisma 7 datasource
// pattern drives the URL from prisma.config.ts. Re-adding url= silently breaks
// connection pooling and causes Vercel cold-start timeouts.
// ---------------------------------------------------------------------------
const schemaPath = resolve(root, "prisma/schema.prisma");
try {
  const schema = readFileSync(schemaPath, "utf8");
  if (/^\s*url\s*=/m.test(schema)) {
    console.error("✖  prisma/schema.prisma contains `url =` in the datasource block.");
    console.error("   Remove it — DATABASE_URL is provided via prisma.config.ts, not schema.prisma.");
    failed = true;
  } else {
    console.log("✔  schema.prisma has no url= (correct for Prisma 7 adapter pattern)");
  }
} catch {
  console.warn("⚠  Could not read prisma/schema.prisma — skipping url= check");
}

// ---------------------------------------------------------------------------
// Guard: iCloud sync — building inside an iCloud-synced folder while iCloud is
// actively uploading/downloading can corrupt .next artifacts or hang indefinitely.
// This is a warning only (not a hard fail) because the path check can't tell
// if iCloud sync is actually active right now.
// ---------------------------------------------------------------------------
import * as os from "os";
const cwd = process.cwd();
const iCloudPatterns = [
  /\/Library\/Mobile Documents\//,
  /\/iCloud Drive\//,
  /iCloudDrive/i,
];
const onDesktop = cwd.includes(`${os.homedir()}/Desktop`);
const inICloud = iCloudPatterns.some(p => p.test(cwd));

if (inICloud) {
  console.warn(
    "\n⚠  BUILD PATH IS INSIDE AN iCLOUD-SYNCED FOLDER:\n" +
    `   ${cwd}\n` +
    "   iCloud can corrupt .next artifacts or hang the build.\n" +
    "   Move the project to a non-synced location (e.g. ~/Projects/) before deploying.\n"
  );
} else if (onDesktop) {
  // Desktop is synced to iCloud by default on macOS
  console.warn(
    "\n⚠  PROJECT IS ON THE DESKTOP — which is iCloud-synced by default on macOS:\n" +
    `   ${cwd}\n` +
    "   If iCloud sync is enabled for Desktop, builds can hang or produce stale artifacts.\n" +
    "   Recommended: move to ~/Projects/ or disable iCloud Desktop & Documents sync.\n"
  );
} else {
  console.log("✔  Build path is not in an iCloud-synced location.");
}

if (failed) {
  console.error("\nVersion check failed. Fix package.json or update the constraints in scripts/check-versions.ts.");
  process.exit(1);
} else {
  console.log("\nAll version constraints satisfied.");
}
