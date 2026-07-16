-- ─── Phase 2 performance indexes (query-backed) ──────────────────────────────
-- Prod-safe application of the composite indexes added in prisma/schema.prisma.
--
-- WHY THIS FILE EXISTS: `prisma migrate` wraps each migration in a transaction and
-- generates plain `CREATE INDEX`, which takes an ACCESS EXCLUSIVE-ish lock and
-- blocks writes while the index builds — painful on large tables. `CREATE INDEX
-- CONCURRENTLY` avoids the write lock but cannot run inside a transaction, so it
-- can't go through Prisma's migration runner.
--
-- PROD ROLLOUT (existing large DB):
--   1. Apply this file manually (it does NOT hold write locks):
--        psql "$DATABASE_URL" -f scripts/perf-indexes.sql
--   2. Generate the matching Prisma migration WITHOUT running it:
--        npx prisma migrate dev --name perf_indexes --create-only
--   3. Mark it as already applied so Prisma won't try to re-create the indexes:
--        npx prisma migrate resolve --applied <timestamp>_perf_indexes
--
-- DEV / NEW DB: just run `npm run prisma:migrate` — plain CREATE INDEX is instant
-- on small/empty tables, so this file is unnecessary there.
--
-- Index names below match Prisma's auto-generated names, so step 3 reconciles cleanly.
-- IF NOT EXISTS makes this file safe to re-run.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "AuditLog_actorId_action_idx"
  ON "AuditLog" ("actorId", "action");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "DriveFile_ownerId_isTrashed_updatedAt_idx"
  ON "DriveFile" ("ownerId", "isTrashed", "updatedAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "DriveFile_folderId_isTrashed_idx"
  ON "DriveFile" ("folderId", "isTrashed");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Notification_userId_createdAt_idx"
  ON "Notification" ("userId", "createdAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "CalendarEvent_visibility_startAt_idx"
  ON "CalendarEvent" ("visibility", "startAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "AIInteraction_userId_createdAt_idx"
  ON "AIInteraction" ("userId", "createdAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "EmailLog_status_createdAt_idx"
  ON "EmailLog" ("status", "createdAt");
