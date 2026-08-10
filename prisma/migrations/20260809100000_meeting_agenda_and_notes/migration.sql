-- Meetings: structured agenda + shared notes.
--
-- Nexus could host a meeting (Jitsi room, participants, recording) but had
-- nowhere to say what the meeting was *for* or what came out of it. `aiSummary`
-- and `actionItems` only exist if someone pasted a transcript into
-- /meet/intelligence; there was no place for a human-written agenda or notes.
--
-- The agenda is a table rather than a text column on Meeting because it is the
-- thing a meeting is run from: items get ticked off live, owned by a person,
-- time-boxed, and converted to tasks individually. A markdown blob supports none
-- of that.
--
-- Additive and idempotent (IF NOT EXISTS / DO blocks), matching the house style:
-- parts of this schema were first created with `prisma db push`, so a plain
-- CREATE would fail the first time `prisma migrate deploy` runs against an
-- existing database.

-- ─── 1. Shared notes on the meeting ──────────────────────────────────────────
ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "notes" TEXT;

-- ─── 2. Agenda items ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "MeetingAgendaItem" (
  "id"        TEXT         NOT NULL,
  "meetingId" TEXT         NOT NULL,
  "position"  INTEGER      NOT NULL DEFAULT 0,
  "title"     TEXT         NOT NULL,
  "ownerId"   TEXT,
  "minutes"   INTEGER,
  "done"      BOOLEAN      NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MeetingAgendaItem_pkey" PRIMARY KEY ("id")
);

-- ─── 3. Foreign keys ─────────────────────────────────────────────────────────
-- Meeting: CASCADE — an agenda has no meaning without its meeting.
-- Owner:   SET NULL — a departing employee must not delete the agenda of every
--          meeting they ever led an item in.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MeetingAgendaItem_meetingId_fkey') THEN
    ALTER TABLE "MeetingAgendaItem"
      ADD CONSTRAINT "MeetingAgendaItem_meetingId_fkey"
      FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MeetingAgendaItem_ownerId_fkey') THEN
    ALTER TABLE "MeetingAgendaItem"
      ADD CONSTRAINT "MeetingAgendaItem_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ─── 4. Indexes ──────────────────────────────────────────────────────────────
-- The list is always read whole, in order, for a single meeting.
CREATE INDEX IF NOT EXISTS "MeetingAgendaItem_meetingId_position_idx"
  ON "MeetingAgendaItem"("meetingId", "position");
CREATE INDEX IF NOT EXISTS "MeetingAgendaItem_ownerId_idx"
  ON "MeetingAgendaItem"("ownerId");
