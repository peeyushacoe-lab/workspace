-- Internship Hub: per-module quizzes + per-intern module completion
-- Idempotent / shadow-DB safe: guarded so it skips gracefully if the table is absent.

-- 1. Add quiz JSON column to module (InternWeekTopic)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'InternWeekTopic'
  ) THEN
    ALTER TABLE "InternWeekTopic" ADD COLUMN IF NOT EXISTS "quiz" JSONB;
  END IF;
END $$;

-- 2. Per-intern module completion table
CREATE TABLE IF NOT EXISTS "InternModuleCompletion" (
  "id"        TEXT NOT NULL,
  "topicId"   TEXT NOT NULL,
  "weekId"    TEXT NOT NULL,
  "internId"  TEXT NOT NULL,
  "answers"   JSONB,
  "score"     INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InternModuleCompletion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "InternModuleCompletion_topicId_internId_key"
  ON "InternModuleCompletion" ("topicId", "internId");
CREATE INDEX IF NOT EXISTS "InternModuleCompletion_internId_idx"
  ON "InternModuleCompletion" ("internId");
CREATE INDEX IF NOT EXISTS "InternModuleCompletion_weekId_idx"
  ON "InternModuleCompletion" ("weekId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'InternModuleCompletion_topicId_fkey'
  ) THEN
    ALTER TABLE "InternModuleCompletion"
      ADD CONSTRAINT "InternModuleCompletion_topicId_fkey"
      FOREIGN KEY ("topicId") REFERENCES "InternWeekTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'InternModuleCompletion_internId_fkey'
  ) THEN
    ALTER TABLE "InternModuleCompletion"
      ADD CONSTRAINT "InternModuleCompletion_internId_fkey"
      FOREIGN KEY ("internId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
