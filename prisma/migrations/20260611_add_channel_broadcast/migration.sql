-- Safe: skip if ChatChannel table doesn't exist (shadow DB starting from scratch)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ChatChannel'
  ) THEN
    ALTER TABLE "ChatChannel" ADD COLUMN IF NOT EXISTS "isBroadcast" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;
