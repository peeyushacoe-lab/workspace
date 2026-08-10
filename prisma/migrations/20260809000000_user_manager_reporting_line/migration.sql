-- People: individual reporting line (User.managerId).
--
-- Nexus already had two "manager" columns — Department.managerId and
-- Team.managerId — but both answer "who heads this *group*". Neither answers
-- "who does this person report to", which is what a directory profile needs and
-- is frequently not the department head.
--
-- Additive and idempotent (IF NOT EXISTS / DO blocks), matching the house style:
-- some objects in this schema were first created with `prisma db push`, so a
-- plain ALTER would fail the first time anyone runs `prisma migrate deploy`
-- against an existing database.
--
-- ON DELETE SET NULL is deliberate. Deleting a manager must orphan their reports,
-- never cascade-delete people. A CASCADE here would let removing one leaver wipe
-- their whole team.

-- ─── 1. managerId column ─────────────────────────────────────────────────────
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "managerId" TEXT;

-- ─── 2. Self-referencing FK ──────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_managerId_fkey'
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_managerId_fkey"
      FOREIGN KEY ("managerId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ─── 3. Index for "direct reports" ───────────────────────────────────────────
-- The profile page runs `WHERE managerId = $1` on every view; without this it is
-- a full table scan of User.
CREATE INDEX IF NOT EXISTS "User_managerId_idx" ON "User"("managerId");

-- ─── 4. Guard against self-management ────────────────────────────────────────
-- Cheap to enforce here and impossible to bypass from application code. Longer
-- reporting cycles (A -> B -> A) can't be expressed as a CHECK constraint, so
-- those are validated in the API before write — see /api/users manager update.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_manager_not_self'
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_manager_not_self"
      CHECK ("managerId" IS NULL OR "managerId" <> "id");
  END IF;
END $$;
