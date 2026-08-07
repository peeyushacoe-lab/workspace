-- RFC-003 Teams & Channels + scheduled chat messages.
--
-- Two additive changes. Nothing is dropped or renamed. Written idempotently
-- (IF NOT EXISTS / DO blocks) because these objects were first created via
-- `prisma db push`, which syncs the schema without recording a migration.
-- A plain CREATE would fail with "relation already exists" the first time
-- anyone runs `prisma migrate deploy` against an existing database.
--
--   1. ChannelTabKind enum + ChannelTab table — pinned surfaces across the
--      top of a channel (Files, Doc, Sheet, Board, external Link).
--      ChatChannel also gains `teamId`, `driveFolderId`, and `position`.
--
--   2. ChatScheduledMessage — write-now/deliver-later messages. Kept in a
--      separate table so every existing chat query (timeline, unread counts,
--      read receipts) continues to exclude pending messages without any WHERE
--      clause changes.

-- ─── 1. ChannelTabKind enum ──────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ChannelTabKind') THEN
    CREATE TYPE "ChannelTabKind" AS ENUM ('FILES', 'DOC', 'SHEET', 'SLIDE', 'BOARD', 'LINK');
  END IF;
END $$;

-- ─── ChatChannel new columns ─────────────────────────────────────────────────
-- teamId links a channel to its parent team (nullable — DMs and org channels
-- have no team). driveFolderId is the team's shared Drive folder. position is
-- the sort order within a team's channel list.
ALTER TABLE "ChatChannel" ADD COLUMN IF NOT EXISTS "teamId"        TEXT;
ALTER TABLE "ChatChannel" ADD COLUMN IF NOT EXISTS "driveFolderId" TEXT;
ALTER TABLE "ChatChannel" ADD COLUMN IF NOT EXISTS "position"      INTEGER NOT NULL DEFAULT 0;

-- FK: ChatChannel → Team (conditional to survive fresh-DB deployments where
-- Team itself was created in an earlier db-push not covered by migrations).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Team')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChatChannel_teamId_fkey') THEN
    ALTER TABLE "ChatChannel"
      ADD CONSTRAINT "ChatChannel_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DROP INDEX IF EXISTS "ChatChannel_teamId_position_idx";
CREATE INDEX IF NOT EXISTS "ChatChannel_teamId_position_idx" ON "ChatChannel"("teamId", "position");

-- Team.driveFolderId — one shared Drive folder per team.
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "driveFolderId" TEXT;

-- ─── ChannelTab table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ChannelTab" (
    "id"          TEXT         NOT NULL,
    "channelId"   TEXT         NOT NULL,
    "kind"        "ChannelTabKind" NOT NULL,
    "label"       TEXT         NOT NULL,
    "target"      TEXT,
    "position"    INTEGER      NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChannelTab_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChannelTab_channelId_fkey') THEN
    ALTER TABLE "ChannelTab"
      ADD CONSTRAINT "ChannelTab_channelId_fkey"
      FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DROP INDEX IF EXISTS "ChannelTab_channelId_position_idx";
CREATE INDEX IF NOT EXISTS "ChannelTab_channelId_position_idx" ON "ChannelTab"("channelId", "position");

-- ─── 2. ChatScheduledMessage ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ChatScheduledMessage" (
    "id"              TEXT         NOT NULL,
    "channelId"       TEXT         NOT NULL,
    "userId"          TEXT         NOT NULL,
    "content"         TEXT         NOT NULL,
    "scheduledAt"     TIMESTAMP(3) NOT NULL,
    "sentAt"          TIMESTAMP(3),
    "failedAt"        TIMESTAMP(3),
    "failureReason"   TEXT,
    "parentId"        TEXT,
    "quotedMessageId" TEXT,
    "isUrgent"        BOOLEAN      NOT NULL DEFAULT false,
    "attachmentUrl"   TEXT,
    "attachmentName"  TEXT,
    "attachmentMime"  TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChatScheduledMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ChatScheduledMessage_userId_idx"
    ON "ChatScheduledMessage"("userId");
CREATE INDEX IF NOT EXISTS "ChatScheduledMessage_channelId_userId_idx"
    ON "ChatScheduledMessage"("channelId", "userId");
CREATE INDEX IF NOT EXISTS "ChatScheduledMessage_scheduledAt_sentAt_idx"
    ON "ChatScheduledMessage"("scheduledAt", "sentAt");
