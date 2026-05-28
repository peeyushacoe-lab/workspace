/**
 * Database backup script — Phase 35
 * Exports critical tables to JSON files and optionally uploads to S3/R2.
 *
 * Usage:
 *   tsx scripts/backup.ts                    # full backup to ./backups/
 *   tsx scripts/backup.ts --upload           # backup + upload to object storage
 *   tsx scripts/backup.ts --tables users,mailboxes
 */
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";
import { createGzip } from "zlib";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

const args = process.argv.slice(2);
const UPLOAD = args.includes("--upload");
const TABLE_ARG = args.find((a) => a.startsWith("--tables="))?.replace("--tables=", "");
const BACKUP_DIR = path.resolve(process.cwd(), "backups");

const TABLES: { name: string; fetch: () => Promise<unknown[]> }[] = [
  { name: "users",           fetch: () => prisma.user.findMany({ select: { id: true, email: true, fullName: true, role: true, createdAt: true } }) },
  { name: "mailboxes",       fetch: () => prisma.mailbox.findMany() },
  { name: "inbox_threads",   fetch: () => prisma.inboxThread.findMany({ take: 10_000, orderBy: { createdAt: "desc" } }) },
  { name: "audit_logs",      fetch: () => prisma.auditLog.findMany({ take: 50_000, orderBy: { createdAt: "desc" } }) },
  { name: "organizations",   fetch: () => prisma.organization.findMany() },
  { name: "calendar_events", fetch: () => prisma.calendarEvent.findMany({ take: 5_000, orderBy: { startAt: "desc" } }) },
  { name: "drive_files",     fetch: () => prisma.driveFile.findMany({ take: 10_000, orderBy: { createdAt: "desc" } }) },
];

async function writeGzip(filePath: string, data: unknown): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  const readable = Readable.from([json]);
  const gzip = createGzip();
  const dest = fs.createWriteStream(filePath);
  await pipeline(readable, gzip, dest);
}

async function uploadToS3(filePath: string, key: string): Promise<void> {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const accessKey = process.env.S3_ACCESS_KEY;
  const secretKey = process.env.S3_SECRET_KEY;

  if (!endpoint || !bucket || !accessKey || !secretKey) {
    console.warn("[backup] S3 env vars not set — skipping upload");
    return;
  }

  // Dynamic import to avoid bundling AWS SDK unless needed
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({ endpoint, region: process.env.S3_REGION ?? "auto", credentials: { accessKeyId: accessKey, secretAccessKey: secretKey } });
  const body = fs.readFileSync(filePath);
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentEncoding: "gzip", ContentType: "application/json" }));
  console.log(`[backup] Uploaded → s3://${bucket}/${key}`);
}

async function main() {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  const outDir = path.join(BACKUP_DIR, ts);
  fs.mkdirSync(outDir, { recursive: true });

  const selectedTables = TABLE_ARG ? TABLE_ARG.split(",") : null;
  const tables = selectedTables ? TABLES.filter((t) => selectedTables.includes(t.name)) : TABLES;

  console.log(`[backup] Starting backup of ${tables.length} tables → ${outDir}`);

  for (const table of tables) {
    const start = Date.now();
    const rows = await table.fetch();
    const filePath = path.join(outDir, `${table.name}.json.gz`);
    await writeGzip(filePath, rows);
    const sizeKb = Math.round(fs.statSync(filePath).size / 1024);
    console.log(`[backup] ✓ ${table.name}: ${rows.length} rows, ${sizeKb} KB (${Date.now() - start}ms)`);

    if (UPLOAD) {
      await uploadToS3(filePath, `cybersage-backup/${ts}/${table.name}.json.gz`);
    }
  }

  const manifestPath = path.join(outDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify({
    timestamp: ts,
    tables: tables.map((t) => t.name),
    uploaded: UPLOAD,
    version: "1.0",
  }, null, 2));

  console.log(`[backup] Complete. Manifest: ${manifestPath}`);
}

main()
  .catch((err) => { console.error("[backup] Failed:", err); process.exit(1); })
  .finally(() => prisma.$disconnect());
