-- Migration: make every foreign key between two user-owned tables carry the owner
--
-- Until now each reference was a single-column foreign key: "Transactions"."CategoryID" only had
-- to name some category, not one of the same user. The module review of 2026-09-24 found requests
-- that stored another user's category, company, voucher, group, trip or transaction in eight
-- modules (TRANSACTIONS-02/03, TRIPS-01, VOUCHERS-01, RECURRING-02, FISCAL-DOCUMENTS-01,
-- FISCAL-MODELS-01, DASHBOARD-SUMMARY-01). The write guard (src/services/database/ownership.ts)
-- and migration 007 closed those paths in code; this makes the database refuse such a row
-- whatever code writes it.
--
-- How: each referenced table gets UNIQUE (<id>, "UserID"), and each single-column foreign key is
-- replaced by one on (<column>, "UserID"). A reference then only resolves to a row of the same
-- user. The guard stays: it answers a foreign id with the same 404 as a missing one, where the
-- constraint alone would surface as a 500.
--
-- Covered: the 21 references whose id can arrive in a request. Left out on purpose: the three
-- crypto references (CryptoRawEvents -> CryptoSyncJobs, TaxableEvents -> CryptoRawEvents,
-- CryptoDisposals -> TaxableEvents), which only the server writes from rows it just read for the
-- same user, and RecurringExpenseOccurrences -> Transactions, whose child has no "UserID".
--
-- ON DELETE is kept per reference. Where it was SET NULL, the new key uses the column-list form
-- ON DELETE SET NULL ("<column>") (PostgreSQL 15+), so deleting a company clears the reference and
-- never the child's "UserID". Local and Neon both run 17.
--
-- The old keys are found through the catalog, not by name: on Neon the invoice-prefix key is
-- "InvoicePrefixes_CompanyID_fkey", locally "FK_InvoicePrefixes_Company". Every other key matched.
--
-- Measured read-only on 2026-09-29, on local and on Neon: 0 violations in all 21 references and
-- 0 rows without a "UserID" in the referenced tables, so every new key validates. The first block
-- re-counts and aborts the whole file (nothing changed) if that is no longer true. Re-running the
-- file after it succeeded changes nothing.
--
-- Usage:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/008-owner-scoped-foreign-keys.sql

BEGIN;

CREATE TEMP TABLE owner_refs (child text, col text, parent text, pk text, set_null boolean, name text) ON COMMIT DROP;
INSERT INTO owner_refs VALUES
  ('Categories',        'ParentCategoryID',   'Categories',        'CategoryID',         false, 'FK_Categories_Parent_Owner'),
  ('Transactions',      'CategoryID',         'Categories',        'CategoryID',         false, 'FK_Transactions_Category_Owner'),
  ('RecurringExpenses', 'CategoryID',         'Categories',        'CategoryID',         false, 'FK_RecurringExpenses_Category_Owner'),
  ('Vouchers',          'CategoryID',         'Categories',        'CategoryID',         false, 'FK_Vouchers_Category_Owner'),
  ('Transactions',      'CompanyID',          'Companies',         'CompanyID',          true,  'FK_Transactions_Company_Owner'),
  ('RecurringExpenses', 'CompanyID',          'Companies',         'CompanyID',          true,  'FK_RecurringExpenses_Company_Owner'),
  ('InvoicePrefixes',   'CompanyID',          'Companies',         'CompanyID',          true,  'FK_InvoicePrefixes_Company_Owner'),
  ('Invoices',          'CompanyID',          'Companies',         'CompanyID',          true,  'FK_Invoices_Company_Owner'),
  ('FiscalDocuments',   'CompanyID',          'Companies',         'CompanyID',          true,  'FK_FiscalDocuments_Company_Owner'),
  ('Transactions',      'VoucherID',          'Vouchers',          'VoucherID',          true,  'FK_Transactions_Voucher_Owner'),
  ('Transactions',      'TripID',             'Trips',             'TripID',             false, 'FK_Transactions_Trip_Owner'),
  ('Transactions',      'TransactionGroupID', 'TransactionGroups', 'TransactionGroupID', false, 'FK_Transactions_TransactionGroup_Owner'),
  ('Transactions',      'RecurringExpenseID', 'RecurringExpenses', 'RecurringExpenseID', false, 'FK_Transactions_RecurringExpense_Owner'),
  ('Transactions',      'DeferralID',         'Deferrals',         'DeferralID',         true,  'FK_Transactions_Deferral_Owner'),
  ('Deferrals',         'FiscalDocumentID',   'FiscalDocuments',   'DocumentID',         true,  'FK_Deferrals_FiscalDocument_Owner'),
  ('Invoices',          'PrefixID',           'InvoicePrefixes',   'PrefixID',           false, 'FK_Invoices_Prefix_Owner'),
  ('SkydiveJumps',      'TransactionID',      'Transactions',      'TransactionID',      true,  'FK_SkydiveJumps_Transaction_Owner'),
  ('TunnelSessions',    'TransactionID',      'Transactions',      'TransactionID',      true,  'FK_TunnelSessions_Transaction_Owner'),
  ('Invoices',          'TransactionID',      'Transactions',      'TransactionID',      true,  'FK_Invoices_Transaction_Owner'),
  ('FiscalDocuments',   'TransactionID',      'Transactions',      'TransactionID',      true,  'FK_FiscalDocuments_Transaction_Owner'),
  ('FixedAssets',       'TransactionID',      'Transactions',      'TransactionID',      true,  'FK_FixedAssets_Transaction_Owner');

-- 1. Abort if any existing row would not validate. MATCH SIMPLE: a row with a NULL reference or a
--    NULL "UserID" is not checked, exactly as the new key will treat it.
DO $$
DECLARE
  r record;
  n bigint;
  report text := '';
BEGIN
  FOR r IN SELECT * FROM owner_refs LOOP
    EXECUTE format(
      'SELECT count(*) FROM %I x WHERE x.%I IS NOT NULL AND x."UserID" IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM %I y WHERE y.%I = x.%I AND y."UserID" = x."UserID")',
      r.child, r.col, r.parent, r.pk, r.col) INTO n;
    IF n > 0 THEN
      report := report || format('%s.%s -> %s: %s rows; ', r.child, r.col, r.parent, n);
    END IF;
  END LOOP;
  IF report <> '' THEN
    RAISE EXCEPTION 'Owner-scoped keys would not validate: %', report;
  END IF;
END $$;

-- 2. UNIQUE (<id>, "UserID") on every referenced table: a composite key needs one to point at.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT DISTINCT parent, pk FROM owner_refs LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'UQ_' || r.parent || '_Owner' AND conrelid = format('%I', r.parent)::regclass
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I UNIQUE (%I, "UserID")', r.parent, 'UQ_' || r.parent || '_Owner', r.pk);
    END IF;
  END LOOP;
END $$;

-- 3. Replace each single-column key with the owner-scoped one.
DO $$
DECLARE
  r record;
  old_name text;
BEGIN
  FOR r IN SELECT * FROM owner_refs LOOP
    FOR old_name IN
      SELECT con.conname
      FROM pg_constraint con
      WHERE con.contype = 'f'
        AND con.conrelid = format('%I', r.child)::regclass
        AND con.confrelid = format('%I', r.parent)::regclass
        AND con.conkey = ARRAY[(
          SELECT attnum FROM pg_attribute
          WHERE attrelid = format('%I', r.child)::regclass AND attname = r.col
        )]
    LOOP
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', r.child, old_name);
    END LOOP;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = r.name AND conrelid = format('%I', r.child)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I, "UserID") REFERENCES %I (%I, "UserID")%s',
        r.child, r.name, r.col, r.parent, r.pk,
        CASE WHEN r.set_null THEN format(' ON DELETE SET NULL (%I)', r.col) ELSE '' END);
    END IF;
  END LOOP;
END $$;

COMMIT;
