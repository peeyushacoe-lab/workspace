-- Safe migration: add columns that may be missing from production
-- All statements use IF NOT EXISTS so they're idempotent

-- ChatChannel: isBroadcast flag (used for announcement channels)
ALTER TABLE "ChatChannel" ADD COLUMN IF NOT EXISTS "isBroadcast" BOOLEAN NOT NULL DEFAULT false;

-- ChatMessage: soft-delete support
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- ChatMessage: urgent/priority flag
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "isUrgent" BOOLEAN NOT NULL DEFAULT false;

-- ChatMessage: voice note fields
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "voiceNoteUrl" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "voiceNoteDuration" INTEGER;

-- ChatMessage: file attachment fields
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "attachmentUrl" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "attachmentName" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "attachmentMime" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "attachmentSize" INTEGER;

-- ChatMessage: mention tracking
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "mentionedUserIds" TEXT[] NOT NULL DEFAULT '{}';

-- ChatMessage: forwarded message reference
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "forwardedFromId" TEXT;

-- ChatMessage: pinned state
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "isPinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "pinnedAt" TIMESTAMP(3);

-- ChatMessage: thread/poll reference
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "parentId" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "pollId" TEXT;

-- ChatChannel: topic / pinned message
ALTER TABLE "ChatChannel" ADD COLUMN IF NOT EXISTS "topic" TEXT;
ALTER TABLE "ChatChannel" ADD COLUMN IF NOT EXISTS "pinnedMessageId" TEXT;
ALTER TABLE "ChatChannel" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
