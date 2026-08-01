-- Office suite: version history, note tags, and per-user recent items.
--
-- Three additive changes. Nothing is dropped or renamed, so this is safe to
-- apply to a live database and safe to roll back by reverting the code (the new
-- columns and tables simply go unused).
--
--   1. Note.tags        — tags moved out of the `content` JSON blob into a real,
--                         indexable column. Backfill: `npm run migrate:note-tags`.
--   2. DocumentVersion  — server-persisted version history for every Note-backed
--                         document (Docs, Sheets, Slides, Notes).
--   3. RecentItem       — per-user "last opened", powering the Recent views.
--
-- ⚠️ Written idempotently (IF NOT EXISTS / DO blocks) on purpose. These objects
-- were first created with `prisma db push`, which syncs the schema WITHOUT
-- recording a migration. A plain CREATE TABLE would then fail with "relation
-- already exists" the first time anyone runs `prisma migrate deploy`. As
-- written, this applies cleanly whether or not the objects are already there.

-- ─── 1. Note.tags ────────────────────────────────────────────────────────────
-- Defaults to an empty array so existing rows need no backfill to be valid.
ALTER TABLE "Note" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- GIN, not B-tree: every query against this column is array containment
-- (`tags: { has }` / `{ hasEvery }`), which a B-tree cannot serve.
DROP INDEX IF EXISTS "Note_tags_idx";
CREATE INDEX IF NOT EXISTS "Note_tags_idx" ON "Note" USING GIN ("tags");

-- ─── 2. DocumentVersion ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "DocumentVersion" (
    "id"        TEXT NOT NULL,
    "noteId"    TEXT NOT NULL,
    "authorId"  TEXT,
    "label"     TEXT NOT NULL DEFAULT 'Auto-save',
    "content"   TEXT NOT NULL,
    "title"     TEXT,
    "size"      INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- Serves the history list, which is always "newest first for one document".
CREATE INDEX IF NOT EXISTS "DocumentVersion_noteId_createdAt_idx"
    ON "DocumentVersion"("noteId", "createdAt");
CREATE INDEX IF NOT EXISTS "DocumentVersion_authorId_idx"
    ON "DocumentVersion"("authorId");

-- Deleting a document takes its history with it.
-- `authorId` is deliberately NOT a foreign key: deleting a user should leave
-- their versions intact and attributable rather than cascading them away.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'DocumentVersion_noteId_fkey'
    ) THEN
        ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_noteId_fkey"
            FOREIGN KEY ("noteId") REFERENCES "Note"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- ─── 3. RecentItem ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "RecentItem" (
    "id"           TEXT NOT NULL,
    "userId"       TEXT NOT NULL,
    -- "file" (DriveFile) or "doc" | "sheet" | "slide" | "note" (Note).
    "resourceType" TEXT NOT NULL,
    "resourceId"   TEXT NOT NULL,
    "lastOpenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecentItem_pkey" PRIMARY KEY ("id")
);

-- The upsert key: re-opening something moves its timestamp instead of
-- inserting a duplicate row.
CREATE UNIQUE INDEX IF NOT EXISTS "RecentItem_userId_resourceType_resourceId_key"
    ON "RecentItem"("userId", "resourceType", "resourceId");

-- Serves the read path: one user's items, most recently opened first.
CREATE INDEX IF NOT EXISTS "RecentItem_userId_lastOpenedAt_idx"
    ON "RecentItem"("userId", "lastOpenedAt");

-- No FK on `resourceId`: it points at either Note or DriveFile depending on
-- `resourceType`, so a constraint cannot express it. The read path filters out
-- rows whose resource no longer exists.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'RecentItem_userId_fkey'
    ) THEN
        ALTER TABLE "RecentItem" ADD CONSTRAINT "RecentItem_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
