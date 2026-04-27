-- Migration: Add "Comisiones bancarias" subcategory under "Trabajo"
-- Required for the invoice "mark as paid" flow with optional bank-transfer fee.
-- Idempotent: safe to run multiple times.
--
-- Usage:
--   psql "$DATABASE_URL" -f database/migrations/add_bank_fee_subcategory.sql

INSERT INTO "Categories"
  ("Name", "Type", "Icon", "Color", "SortOrder", "ParentCategoryID", "DefaultShared", "Modelo100CasillaCode", "UserID")
SELECT
  'Comisiones bancarias',
  'expense',
  'landmark',
  '#F59E0B',
  6,
  parent."CategoryID",
  FALSE,
  NULL,
  parent."UserID"
FROM "Categories" parent
WHERE parent."Name" = 'Trabajo'
  AND parent."ParentCategoryID" IS NULL
  AND parent."UserID" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "Categories" sub
    WHERE sub."ParentCategoryID" = parent."CategoryID"
      AND sub."Name" = 'Comisiones bancarias'
      AND sub."UserID" = parent."UserID"
  );
