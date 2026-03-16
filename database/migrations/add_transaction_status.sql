-- Migration: Add Status column to Transactions
-- Allows marking transactions as paid, pending, or cancelled
-- Pending/cancelled transactions are excluded from summary views

-- 1. Add Status column with default 'paid' (non-breaking for existing data)
ALTER TABLE "Transactions" ADD COLUMN IF NOT EXISTS "Status" VARCHAR(15) NOT NULL DEFAULT 'paid'
  CHECK ("Status" IN ('paid', 'pending', 'cancelled'));

CREATE INDEX IF NOT EXISTS "IX_Transactions_Status" ON "Transactions"("Status");

-- 2. Recreate views to filter by Status = 'paid'

-- Drop views in dependency order
DROP VIEW IF EXISTS "vw_MonthlyBalance";
DROP VIEW IF EXISTS "vw_SubcategorySummary";
DROP VIEW IF EXISTS "vw_MonthlySummary";
DROP VIEW IF EXISTS "vw_FiscalQuarterly";

-- vw_MonthlySummary: only paid transactions count toward summaries
CREATE VIEW "vw_MonthlySummary" AS
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
INNER JOIN "Categories" c ON t."CategoryID" = c."CategoryID"
LEFT JOIN "Categories" parent ON c."ParentCategoryID" = parent."CategoryID"
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

-- vw_MonthlyBalance: inherits from vw_MonthlySummary (already filtered)
CREATE VIEW "vw_MonthlyBalance" AS
SELECT
    "UserID",
    "Month",
    SUM(CASE WHEN "Type" = 'income' THEN "TotalCents" ELSE 0 END) AS "IncomeCents",
    SUM(CASE WHEN "Type" = 'expense' THEN "TotalCents" ELSE 0 END) AS "ExpenseCents",
    SUM(CASE WHEN "Type" = 'income' THEN "TotalCents" ELSE -"TotalCents" END) AS "BalanceCents"
FROM "vw_MonthlySummary"
GROUP BY "UserID", "Month";

-- vw_SubcategorySummary: only paid transactions
CREATE VIEW "vw_SubcategorySummary" AS
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
INNER JOIN "Categories" c ON t."CategoryID" = c."CategoryID"
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

-- vw_FiscalQuarterly: only paid transactions with fiscal data
CREATE VIEW "vw_FiscalQuarterly" AS
SELECT
    t."UserID",
    EXTRACT(YEAR FROM t."TransactionDate")::INT AS "FiscalYear",
    EXTRACT(QUARTER FROM t."TransactionDate")::INT AS "FiscalQuarter",
    t."Type",
    t."TransactionID",
    t."CategoryID",
    c."Name" AS "CategoryName",
    COALESCE(parent."Name", c."Name") AS "ParentCategoryName",
    t."TransactionDate",
    t."VendorName",
    t."InvoiceNumber",
    t."Description",
    COALESCE(t."OriginalAmountCents", t."AmountCents") AS "FullAmountCents",
    COALESCE(t."VatPercent", 0) AS "VatPercent",
    COALESCE(t."DeductionPercent", 0) AS "DeductionPercent"
FROM "Transactions" t
INNER JOIN "Categories" c ON t."CategoryID" = c."CategoryID"
LEFT JOIN "Categories" parent ON c."ParentCategoryID" = parent."CategoryID"
WHERE t."Status" = 'paid'
    AND (t."VatPercent" IS NOT NULL OR t."DeductionPercent" IS NOT NULL
    OR t."InvoiceNumber" IS NOT NULL);
