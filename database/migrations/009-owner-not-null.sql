-- Migration: make "UserID" mandatory on the four user-owned tables that still allowed NULL
--
-- Migration 008 put "UserID" into every foreign key between user-owned tables. Those keys are
-- MATCH SIMPLE: a child row whose "UserID" is NULL skips the whole composite check, including the
-- existence check the old single-column key made. "Vouchers", "SkydiveJumps" and "TunnelSessions"
-- are children in those keys and still allowed a NULL owner; "Companies" is a parent, and a company
-- without an owner could never be referenced by any row of a user. The application always writes
-- the owner on these tables, so the NULL is only a hole in the guarantee, not a state anyone uses.
--
-- Measured read-only on 2026-09-29, on local and on Neon: 0 rows without "UserID" in all four.
-- The first block re-counts and aborts the file (nothing changed) if that is no longer true.
-- SET NOT NULL on a column that already is NOT NULL is a no-op, so re-running the file is safe.
--
-- Not included on purpose: "Categories", "Transactions", "RecurringExpenses", "TransactionGroups"
-- and "Trips" are already NOT NULL on both databases, while database/schema.sql still declares
-- them nullable because seed.sql inserts ownerless categories for the first user to inherit
-- (createUser -> assignOrphanedDataToUser). That drift predates this migration and is left for a
-- decision on the first-user bootstrap.
--
-- Usage:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/009-owner-not-null.sql

BEGIN;

DO $$
DECLARE
  t text;
  n bigint;
  report text := '';
BEGIN
  FOREACH t IN ARRAY ARRAY['Companies', 'Vouchers', 'SkydiveJumps', 'TunnelSessions'] LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE "UserID" IS NULL', t) INTO n;
    IF n > 0 THEN
      report := report || format('%s: %s rows; ', t, n);
    END IF;
  END LOOP;
  IF report <> '' THEN
    RAISE EXCEPTION 'Rows without an owner would block NOT NULL: %', report;
  END IF;
END $$;

ALTER TABLE "Companies" ALTER COLUMN "UserID" SET NOT NULL;
ALTER TABLE "Vouchers" ALTER COLUMN "UserID" SET NOT NULL;
ALTER TABLE "SkydiveJumps" ALTER COLUMN "UserID" SET NOT NULL;
ALTER TABLE "TunnelSessions" ALTER COLUMN "UserID" SET NOT NULL;

COMMIT;
