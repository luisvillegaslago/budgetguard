-- Migration: join categories and vouchers in the summary views only when they share the row's owner
--
-- The foreign keys from "Transactions" to "Categories" and "Vouchers" are single-column, so until
-- the write guard of 2026-09-28 (src/services/database/ownership.ts) a second account could store
-- a movement pointing at another user's category or voucher. The views then:
--   - joined that category by id alone and put its name, icon and colour on the second account's
--     dashboard, trends and subcategory drill-down (DASHBOARD-SUMMARY-01, the read side of
--     TRANSACTIONS-02);
--   - counted the movement against the other user's voucher, lowering a balance its owner could
--     not explain (TRANSACTIONS-03).
-- The guard stops new rows of that kind. This migration makes the views ignore any that already
-- exist: the category joins, the parent join and the voucher join now also require the same
-- "UserID" as the movement.
--
-- Measured on the local database on 2026-09-28 (read-only): 0 of 4.614 transactions reference a
-- category, parent category or voucher of another user, so every view returns exactly the rows it
-- returned before. Production was not queried.
--
-- DELIBERATE: the two summary bodies reproduce the LIVE views (pg_get_viewdef on local, PG 17.9,
-- written by add_transaction_status.sql), not database/schema.sql. The live views put trip rows in
-- the month of the trip's first paid movement ("tripAgg"); schema.sql uses "Trips"."StartDate"
-- since 7453ddf and no migration ever applied that. The drift is TRANSACTIONS-12 and the rule is
-- still undecided. Replaying schema.sql's body here would decide it silently and, on local data,
-- drop the 26 paid rows (971,43 EUR) of the one trip with no StartDate from every summary. The
-- guard below refuses to run where the live views do not use "tripAgg", so an environment already
-- on the other rule is never switched by accident.
--
-- Columns, their order and types, and every Status = 'paid' filter are unchanged, which is what
-- lets CREATE OR REPLACE VIEW keep "vw_MonthlyBalance" (built on "vw_MonthlySummary") in place.
-- Re-running the file recreates the same views.
--
-- Usage:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/007-scope-view-joins-to-owner.sql

BEGIN;

DO $$
BEGIN
  IF position('"tripAgg"' IN pg_get_viewdef('"vw_MonthlySummary"'::regclass)) = 0
     OR position('"tripAgg"' IN pg_get_viewdef('"vw_SubcategorySummary"'::regclass)) = 0 THEN
    RAISE EXCEPTION '007: the summary views here do not bucket trips by "tripAgg"; settle TRANSACTIONS-12 first';
  END IF;
END $$;

-- vw_MonthlySummary: paid movements per parent category, joined only to the owner's categories
CREATE OR REPLACE VIEW "vw_MonthlySummary" AS
SELECT
    t."UserID",
    TO_CHAR(
      CASE WHEN t."TripID" IS NOT NULL THEN "tripAgg"."TripStartDate" ELSE t."TransactionDate" END,
      'YYYY-MM'
    ) AS "Month",
    t."Type",
    COALESCE(c."ParentCategoryID", c."CategoryID") AS "CategoryID",
    COALESCE(parent."Name", c."Name") AS "CategoryName",
    COALESCE(parent."Icon", c."Icon") AS "CategoryIcon",
    COALESCE(parent."Color", c."Color") AS "CategoryColor",
    SUM(t."AmountCents") AS "TotalCents",
    COUNT(*) AS "TransactionCount"
FROM "Transactions" t
INNER JOIN "Categories" c ON t."CategoryID" = c."CategoryID" AND c."UserID" = t."UserID"
LEFT JOIN "Categories" parent ON c."ParentCategoryID" = parent."CategoryID" AND parent."UserID" = t."UserID"
LEFT JOIN (
    SELECT "TripID", MIN("TransactionDate") AS "TripStartDate"
    FROM "Transactions" WHERE "TripID" IS NOT NULL AND "Status" = 'paid'
    GROUP BY "TripID"
) "tripAgg" ON t."TripID" = "tripAgg"."TripID"
WHERE t."Status" = 'paid'
GROUP BY
    t."UserID",
    TO_CHAR(
      CASE WHEN t."TripID" IS NOT NULL THEN "tripAgg"."TripStartDate" ELSE t."TransactionDate" END,
      'YYYY-MM'
    ),
    t."Type",
    COALESCE(c."ParentCategoryID", c."CategoryID"),
    COALESCE(parent."Name", c."Name"),
    COALESCE(parent."Icon", c."Icon"),
    COALESCE(parent."Color", c."Color");

-- vw_SubcategorySummary: paid movements per subcategory, joined only to the owner's categories
CREATE OR REPLACE VIEW "vw_SubcategorySummary" AS
SELECT
    t."UserID",
    TO_CHAR(
      CASE WHEN t."TripID" IS NOT NULL THEN "tripAgg"."TripStartDate" ELSE t."TransactionDate" END,
      'YYYY-MM'
    ) AS "Month",
    COALESCE(c."ParentCategoryID", c."CategoryID") AS "ParentCategoryID",
    t."CategoryID" AS "SubcategoryID",
    c."Name" AS "SubcategoryName",
    c."Icon" AS "SubcategoryIcon",
    c."Color" AS "SubcategoryColor",
    c."ParentCategoryID" AS "IsSubcategory",
    SUM(t."AmountCents") AS "TotalCents",
    COUNT(*) AS "TransactionCount"
FROM "Transactions" t
INNER JOIN "Categories" c ON t."CategoryID" = c."CategoryID" AND c."UserID" = t."UserID"
LEFT JOIN (
    SELECT "TripID", MIN("TransactionDate") AS "TripStartDate"
    FROM "Transactions" WHERE "TripID" IS NOT NULL AND "Status" = 'paid'
    GROUP BY "TripID"
) "tripAgg" ON t."TripID" = "tripAgg"."TripID"
WHERE t."Status" = 'paid'
GROUP BY
    t."UserID",
    TO_CHAR(
      CASE WHEN t."TripID" IS NOT NULL THEN "tripAgg"."TripStartDate" ELSE t."TransactionDate" END,
      'YYYY-MM'
    ),
    COALESCE(c."ParentCategoryID", c."CategoryID"),
    t."CategoryID",
    c."Name",
    c."Icon",
    c."Color",
    c."ParentCategoryID";

-- vw_VoucherBalance: only the voucher owner's paid movements consume it
CREATE OR REPLACE VIEW "vw_VoucherBalance" AS
SELECT
    v."VoucherID",
    v."UserID",
    v."CategoryID",
    v."Description",
    v."TotalAmountCents",
    v."TotalUnits",
    v."UnitLabel",
    v."PurchaseDate",
    v."ExpiryDate",
    v."CreatedAt",
    v."UpdatedAt",
    COALESCE(SUM(t."AmountCents"), 0) AS "ConsumedCents",
    v."TotalAmountCents" - COALESCE(SUM(t."AmountCents"), 0) AS "RemainingCents",
    COALESCE(SUM(t."VoucherUnits"), 0) AS "ConsumedUnits",
    COUNT(t."TransactionID") AS "ConsumptionCount"
FROM "Vouchers" v
LEFT JOIN "Transactions" t
    ON t."VoucherID" = v."VoucherID" AND t."Status" = 'paid' AND t."UserID" = v."UserID"
GROUP BY v."VoucherID";

COMMIT;
