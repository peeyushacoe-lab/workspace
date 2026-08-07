/**
 * Pre-launch checks. Run before a production deploy:
 *
 *   npm run preflight
 *
 * Exits non-zero when something would actually break, so it can gate a deploy
 * in CI. Feature-level gaps are reported but don't fail the run — a pilot
 * without GIFs is fine, a pilot without Redis is not.
 */
import "dotenv/config";
import { checkEnv, checkEnvSanity } from "../src/lib/env-check";
import { prisma } from "../src/lib/prisma";
import { redis } from "../src/lib/redis";

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

let hardFailures = 0;

function section(title: string) {
  console.log(`\n${title}`);
  console.log("─".repeat(title.length));
}

async function main() {
  console.log("Sage Connect / Nexus — preflight\n");

  // ── Environment ──────────────────────────────────────────────────────────
  section("Environment");
  const env = checkEnv();

  for (const v of env.missingRequired) {
    console.log(`${RED}✗ ${v.name}${RESET} — ${v.impact}`);
    hardFailures++;
  }
  for (const v of env.missingFeature) {
    console.log(`${YELLOW}○ ${v.name}${RESET} ${DIM}— ${v.impact}${RESET}`);
  }
  if (!env.missingRequired.length && !env.missingFeature.length) {
    console.log(`${GREEN}✓${RESET} All ${env.all.length} variables set`);
  } else {
    const set = env.all.length - env.missingRequired.length - env.missingFeature.length;
    console.log(`${DIM}${set}/${env.all.length} set${RESET}`);
  }

  const warnings = checkEnvSanity();
  if (warnings.length) {
    section("Configuration warnings");
    for (const w of warnings) console.log(`${YELLOW}! ${RESET}${w}`);
  }

  // ── Database ─────────────────────────────────────────────────────────────
  section("Database");
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log(`${GREEN}✓${RESET} Connected`);

    // Schema drift is the failure mode that looks like a code bug: the app
    // deploys fine and then 500s the first time it touches a missing table.
    // Probing the newest tables directly is cheaper than diffing migrations
    // and catches "migrate never ran in this environment" exactly.
    const tables: [string, string][] = [
      ["ChatScheduledMessage", "Scheduled send will 500"],
      ["ChannelTab", "Channel tabs will 500"],
      ["Team", "Teams and team channels will 500"],
      ["TeamMember", "Team membership will 500"],
      ["Role", "RBAC will 500"],
    ];
    for (const [table, impact] of tables) {
      const [{ exists }] = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1) AS exists`,
        table,
      );
      if (exists) {
        console.log(`${GREEN}✓${RESET} ${table}`);
      } else {
        console.log(`${RED}✗ ${table} missing${RESET} — ${impact}. Run: npm run prisma:migrate`);
        hardFailures++;
      }
    }
  } catch (err) {
    console.log(`${RED}✗ Cannot connect${RESET} — ${err instanceof Error ? err.message : err}`);
    hardFailures++;
  }

  // ── Redis ────────────────────────────────────────────────────────────────
  section("Redis");
  try {
    await redis.ping();
    console.log(`${GREEN}✓${RESET} Reachable`);
    try {
      const policy = (await redis.call("CONFIG", "GET", "maxmemory-policy")) as string[];
      if (policy.length >= 2 && policy[1] !== "noeviction") {
        console.log(`${YELLOW}!${RESET} maxmemory-policy is "${policy[1]}" — BullMQ jobs can be silently evicted`);
      }
    } catch {
      console.log(`${DIM}  (managed Redis doesn't expose CONFIG GET — verify noeviction manually)${RESET}`);
    }
  } catch (err) {
    console.log(`${RED}✗ Unreachable${RESET} — ${err instanceof Error ? err.message : err}`);
    console.log(`${DIM}  No live delivery, presence, typing, calls or rate limiting.${RESET}`);
    hardFailures++;
  }

  // ── Data integrity ───────────────────────────────────────────────────────
  // Orphans mean a previous hard-delete ran before offboarding existed. They
  // don't block a deploy but they do skew every count in the pilot metrics.
  section("Data integrity");
  try {
    const [orphanMembers, orphanMessages] = await Promise.all([
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) AS count FROM "ChatMember" m
        WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = m."userId")`,
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) AS count FROM "ChatMessage" msg
        WHERE NOT EXISTS (SELECT 1 FROM "ChatChannel" c WHERE c.id = msg."channelId")`,
    ]);
    const om = Number(orphanMembers[0].count);
    const omsg = Number(orphanMessages[0].count);
    if (om === 0 && omsg === 0) {
      console.log(`${GREEN}✓${RESET} No orphaned chat rows`);
    } else {
      if (om) console.log(`${YELLOW}!${RESET} ${om} ChatMember rows reference a deleted user`);
      if (omsg) console.log(`${YELLOW}!${RESET} ${omsg} ChatMessage rows reference a deleted channel`);
    }
  } catch (err) {
    console.log(`${DIM}  Skipped — ${err instanceof Error ? err.message : err}${RESET}`);
  }

  // ── Jitsi ────────────────────────────────────────────────────────────────
  section("Jitsi");
  const jitsiDomain = process.env.NEXT_PUBLIC_JITSI_DOMAIN;
  const jitsiAppId = process.env.JITSI_JWT_APP_ID;
  const jitsiAppSecret = process.env.JITSI_JWT_APP_SECRET;

  if (!jitsiDomain) {
    console.log(`${YELLOW}○ NEXT_PUBLIC_JITSI_DOMAIN${RESET} ${DIM}— Using public meet.jit.si. Rooms are unauthenticated and carry Jitsi branding.${RESET}`);
    console.log(`  ${DIM}Self-host: docker-compose from github.com/jitsi/docker-jitsi-meet, then set NEXT_PUBLIC_JITSI_DOMAIN=meet.yourdomain.com${RESET}`);
  } else {
    console.log(`${GREEN}✓${RESET} Custom domain: ${jitsiDomain}`);

    // Warn on the silent split-brain case where only the server var is set.
    if (process.env.JITSI_DOMAIN && !jitsiDomain) {
      console.log(`${YELLOW}!${RESET} JITSI_DOMAIN is set but NEXT_PUBLIC_JITSI_DOMAIN is not — browser embeds still use meet.jit.si`);
    }
  }

  const jwtBothSet = jitsiAppId && jitsiAppSecret;
  const jwtNeitherSet = !jitsiAppId && !jitsiAppSecret;
  if (jwtBothSet) {
    console.log(`${GREEN}✓${RESET} JWT auth configured (JITSI_JWT_APP_ID + SECRET) — rooms require a server-signed token`);
    if (!jitsiDomain) {
      console.log(`${YELLOW}!${RESET} JWT vars set but no custom domain — JWT has no effect on meet.jit.si`);
    }
  } else if (jwtNeitherSet) {
    console.log(`${YELLOW}○ No JWT auth${RESET} ${DIM}— set JITSI_JWT_APP_ID + JITSI_JWT_APP_SECRET on a self-hosted instance to lock rooms${RESET}`);
  } else {
    // One var set, other missing — always a misconfiguration.
    console.log(`${YELLOW}!${RESET} Only one of JITSI_JWT_APP_ID / JITSI_JWT_APP_SECRET is set — JWT auth will silently fail`);
  }

  // ── Verdict ──────────────────────────────────────────────────────────────
  console.log("");
  if (hardFailures > 0) {
    console.log(`${RED}Preflight failed — ${hardFailures} blocking issue${hardFailures === 1 ? "" : "s"}.${RESET}\n`);
    process.exit(1);
  }
  console.log(`${GREEN}Preflight passed.${RESET}${env.missingFeature.length ? ` ${env.missingFeature.length} optional integration(s) not configured.` : ""}\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`${RED}Preflight crashed:${RESET}`, err);
  process.exit(1);
});
