-- Safe migration: add columns that may be missing from production
-- Wrapped in DO blocks so shadow DB (which may not have these tables) skips gracefully

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ChatChannel'
  ) THEN
    ALTER TABLE "ChatChannel" ADD COLUMN IF NOT EXISTS "isBroadcast"      BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE "ChatChannel" ADD COLUMN IF NOT EXISTS "topic"             TEXT;
    ALTER TABLE "ChatChannel" ADD COLUMN IF NOT EXISTS "pinnedMessageId"   TEXT;
    ALTER TABLE "ChatChannel" ADD COLUMN IF NOT EXISTS "organizationId"    TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ChatMessage'
  ) THEN
    ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "deletedAt"         TIMESTAMP(3);
    ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "isUrgent"          BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "voiceNoteUrl"      TEXT;
    ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "voiceNoteDuration" INTEGER;
    ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "attachmentUrl"     TEXT;
    ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "attachmentName"    TEXT;
    ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "attachmentMime"    TEXT;
    ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "attachmentSize"    INTEGER;
    ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "mentionedUserIds"  TEXT[] NOT NULL DEFAULT '{}';
    ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "forwardedFromId"   TEXT;
    ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "isPinned"          BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "pinnedAt"          TIMESTAMP(3);
    ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "parentId"          TEXT;
    ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "pollId"            TEXT;
  END IF;
END $$;
