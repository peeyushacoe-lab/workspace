/**
 * Restore drill — actually proves a backup can be loaded back into Postgres.
 *
 * Previously `/admin/backups` → "Test Restore" just ran `SELECT 1`, which
 * verifies DB connectivity but nothing about the backup itself. This script:
 *   1. Finds the most recent backup produced by `scripts/backup.ts`
 *   2. Gunzips + parses each table's JSON export
 *   3. Loads every row into a scratch table (`_restore_drill_scratch`) via a
 *      real INSERT — proving the data round-trips through Postgres
 *   4. Verifies the loaded row count matches the backup file's row count
 *   5. Drops the scratch table and records a BackupVerification row
 *
 * The scratch table is dedicated to this drill and never touches
 * production tables — safe to run against the primary database.
 *
 * Usage: tsx scripts/restore-drill.ts
 */
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";
import { createGunzip } from "zlib";
import { pipeline } from "stream/promises";
import { Writable } from "stream";

const BACKUP_DIR = path.resolve(process.cwd(), "backups");
const SCRATCH_TABLE = "_restore_drill_scratch";

async function readGzipJson(filePath: string): Promise<unknown[]> {
  const chunks: Buffer[] = [];
  const sink = new Writable({
    write(chunk, _enc, cb) { chunks.push(chunk); cb(); },
  });
  await pipeline(fs.createReadStream(filePath), createGunzip(), sink);
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  if (!Array.isArray(parsed)) throw new Error(`${path.basename(filePath)} did not contain a JSON array`);
  return parsed;
}

function findLatestBackup(): { dir: string; timestamp: string; tables: string[] } | null {
  if (!fs.existsSync(BACKUP_DIR)) return null;
  const entries = fs.readdirSync(BACKUP_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .reverse();
  if (entries.length === 0) return null;

  const dir = path.join(BACKUP_DIR, entries[0]);
  const manifestPath = path.join(dir, "manifest.json");
  if (!fs.existsSync(manifestPath)) return null;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { timestamp: string; tables: string[] };
  return { dir, timestamp: manifest.timestamp, tables: manifest.tables };
}

export async function runRestoreDrill(): Promise<{
  ok: boolean;
  tablesVerified: number;
  rowsVerified: number;
  backupTimestamp: string | null;
  details: Record<string, { fileRows: number; loadedRows: number; match: boolean }>;
  error?: string;
}> {
  const backup = findLatestBackup();
  if (!backup) {
    return { ok: false, tablesVerified: 0, rowsVerified: 0, backupTimestamp: null, details: {}, error: "No backup found in ./backups — run `npm run backup` first." };
  }

  const details: Record<string, { fileRows: number; loadedRows: number; match: boolean }> = {};
  let totalRows = 0;
  let allMatch = true;

  try {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${SCRATCH_TABLE}"`);
    await prisma.$executeRawUnsafe(`CREATE TABLE "${SCRATCH_TABLE}" (id SERIAL PRIMARY KEY, table_name TEXT NOT NULL, row_data JSONB NOT NULL)`);

    for (const table of backup.tables) {
      const filePath = path.join(backup.dir, `${table}.json.gz`);
      if (!fs.existsSync(filePath)) {
        details[table] = { fileRows: 0, loadedRows: 0, match: false };
        allMatch = false;
        continue;
      }
      const rows = await readGzipJson(filePath);

      // Load the whole table's rows in a single parameterized INSERT using
      // jsonb_array_elements — no string concatenation of row data, so this
      // is safe even though the rows come from a file.
      await prisma.$executeRaw`
        INSERT INTO "_restore_drill_scratch" (table_name, row_data)
        SELECT ${table}, elem
        FROM jsonb_array_elements(${JSON.stringify(rows)}::jsonb) AS elem
      `;

      const loadedCountResult = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM "_restore_drill_scratch" WHERE table_name = ${table}
      `;
      const loadedRows = Number(loadedCountResult[0]?.count ?? 0);
      const match = loadedRows === rows.length;
      if (!match) allMatch = false;
      details[table] = { fileRows: rows.length, loadedRows, match };
      totalRows += loadedRows;
    }
  } catch (err) {
    return {
      ok: false,
      tablesVerified: Object.keys(details).length,
      rowsVerified: totalRows,
      backupTimestamp: backup.timestamp,
      details,
      error: (err as Error).message,
    };
  } finally {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${SCRATCH_TABLE}"`).catch(() => {});
  }

  return {
    ok: allMatch,
    tablesVerified: Object.keys(details).length,
    rowsVerified: totalRows,
    backupTimestamp: backup.timestamp,
    details,
  };
}

/** Runs the drill and persists a BackupVerification record. Shared by the
 * CLI entrypoint (scripts/restore-drill-cli.ts) and the admin API route. */
export async function runAndRecordRestoreDrill() {
  const result = await runRestoreDrill();

  await prisma.backupVerification.create({
    data: {
      status: result.ok ? "PASSED" : "FAILED",
      tablesVerified: result.tablesVerified,
      rowsVerified: result.rowsVerified,
      backupTimestamp: result.backupTimestamp,
      details: result.details,
      error: result.error ?? null,
    },
  });

  return result;
}
