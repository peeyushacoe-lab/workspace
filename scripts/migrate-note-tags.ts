/**
 * One-off migration: lift note tags out of the `content` JSON blob into the
 * real `Note.tags` column.
 *
 * Tags were previously stored as `{"body": "...", "tags": ["x"]}` inside
 * `content`, which made them unfilterable server-side and invisible to search.
 * This reads every note that still looks like the legacy shape, copies its tags
 * onto the column, and leaves `content` untouched — so a rollback to the
 * previous build keeps working.
 *
 * Safe to re-run: notes that already have tags on the column are skipped.
 *
 *   npm run migrate:note-tags
 */

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { legacyTagsFromContent } from "../src/lib/note-tags";

// Prisma 7 requires an explicit driver adapter — matches the pattern in
// scripts/migrate-tasks-redis-to-pg.ts.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`[note-tags] starting${dryRun ? " (dry run)" : ""}…`);

  const notes = await prisma.note.findMany({
    select: { id: true, title: true, content: true, tags: true },
  });

  let migrated = 0;
  let skipped = 0;

  for (const note of notes) {
    // Already migrated (or tagged natively) — don't clobber.
    if (note.tags.length > 0) { skipped++; continue; }

    const tags = legacyTagsFromContent(note.content);
    if (!tags.length) { skipped++; continue; }

    if (dryRun) {
      console.log(`  would tag "${note.title}" → ${tags.join(", ")}`);
    } else {
      await prisma.note.update({ where: { id: note.id }, data: { tags } });
    }
    migrated++;
  }

  console.log(
    `[note-tags] done — ${migrated} note${migrated === 1 ? "" : "s"} ${dryRun ? "would be " : ""}migrated, ${skipped} skipped.`,
  );
}

main()
  .catch(err => {
    console.error("[note-tags] failed:", err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
