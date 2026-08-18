-- Add BUSINESS_MANAGER to the UserRole enum.
--
-- Regional business managers (India, UK, …) all share this single role; the
-- region is a display label in User.customRole, so adding a country later
-- needs no migration.
--
-- Postgres cannot add an enum value inside a transaction on older versions,
-- hence IF NOT EXISTS rather than a guarded DO block.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'BUSINESS_MANAGER';
