#!/usr/bin/env ts-node
/**
 * safe-migrate.ts
 *
 * A thin wrapper around `prisma migrate deploy` that refuses to run against the
 * production DATABASE_URL unless you explicitly pass --force-production.
 *
 * Usage:
 *   npx tsx scripts/safe-migrate.ts                  # staging / local only
 *   npx tsx scripts/safe-migrate.ts --force-production  # prod (requires confirmation)
 *
 * Add to package.json:
 *   "migrate": "tsx scripts/safe-migrate.ts",
 *   "migrate:prod": "tsx scripts/safe-migrate.ts --force-production"
 */

import "dotenv/config";
import { execSync } from "child_process";
import * as readline from "readline";

const PROD_URL_PATTERNS = [
  /nexus\.cybersage\.uk/,
  /cybersage\.uk/,
  /neon\.tech/,       // Neon managed Postgres in prod
  /supabase\.co/,     // if switched to Supabase
];

const FORCE = process.argv.includes("--force-production");
const dbUrl = process.env.DATABASE_URL ?? "";

function isProduction(url: string): boolean {
  return PROD_URL_PATTERNS.some(p => p.test(url));
}

function redact(url: string): string {
  try {
    const u = new URL(url);
    u.password = "****";
    return u.toString();
  } catch {
    return url.slice(0, 40) + "...";
  }
}

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "yes");
    });
  });
}

async function main() {
  if (!dbUrl) {
    console.error("❌  DATABASE_URL is not set. Aborting.");
    process.exit(1);
  }

  if (isProduction(dbUrl)) {
    if (!FORCE) {
      console.error("❌  DATABASE_URL looks like production:");
      console.error(`   ${redact(dbUrl)}`);
      console.error("");
      console.error("   Refusing to migrate. To migrate production, run:");
      console.error("   npm run migrate:prod");
      console.error("");
      console.error("   Or use the staging database URL instead.");
      process.exit(1);
    }

    console.warn("⚠️  You are about to run migrations against PRODUCTION:");
    console.warn(`   ${redact(dbUrl)}`);
    console.warn("");
    const ok = await confirm("Type 'yes' to confirm: ");
    if (!ok) {
      console.log("Aborted.");
      process.exit(0);
    }
  }

  console.log(`Running: prisma migrate deploy`);
  console.log(`Target:  ${redact(dbUrl)}`);
  console.log("");

  execSync("npx prisma migrate deploy", { stdio: "inherit" });
}

main().catch(err => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
