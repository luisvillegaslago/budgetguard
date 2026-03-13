-- BudgetGuard Database Schema (PostgreSQL / Neon)
-- Family Expense & Income Tracking System
-- All amounts stored in CENTS (integers) to avoid floating point precision errors
--
-- IDEMPOTENT: This script can be run multiple times safely.
-- It drops all existing objects before recreating them.

-- ============================================================
-- DROP EXISTING OBJECTS (in correct order for FK dependencies)
-- ============================================================

-- Drop triggers first
DROP TRIGGER IF EXISTS "TR_Categories_UpdatedAt" ON "Categories";
DROP TRIGGER IF EXISTS "TR_Transactions_UpdatedAt" ON "Transactions";
DROP TRIGGER IF EXISTS "TR_Users_UpdatedAt" ON "Users";
DROP TRIGGER IF EXISTS "TR_Accounts_UpdatedAt" ON "Accounts";
DROP TRIGGER IF EXISTS "TR_Trips_UpdatedAt" ON "Trips";
DROP TRIGGER IF EXISTS "TR_RecurringExpenses_UpdatedAt" ON "RecurringExpenses";
DROP TRIGGER IF EXISTS "TR_SkydiveJumps_UpdatedAt" ON "SkydiveJumps";
DROP TRIGGER IF EXISTS "TR_TunnelSessions_UpdatedAt" ON "TunnelSessions";
DROP TRIGGER IF EXISTS "TR_Companies_UpdatedAt" ON "Companies";
DROP TRIGGER IF EXISTS "TR_UserBillingProfiles_UpdatedAt" ON "UserBillingProfiles";
DROP TRIGGER IF EXISTS "TR_Invoices_UpdatedAt" ON "Invoices";
DROP TRIGGER IF EXISTS "TR_Transactions_SyncVendorName" ON "Transactions";
DROP TRIGGER IF EXISTS "TR_RecurringExpenses_SyncVendorName" ON "RecurringExpenses";
DROP TRIGGER IF EXISTS "TR_Companies_PropagateNameChange" ON "Companies";

-- Drop sync trigger functions
DROP FUNCTION IF EXISTS sync_vendor_name_from_company();
DROP FUNCTION IF EXISTS propagate_company_name_change();

-- Drop trigger function
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Drop views
DROP VIEW IF EXISTS "vw_JumpsByYear";
DROP VIEW IF EXISTS "vw_JumpsByType";
DROP VIEW IF EXISTS "vw_SkydivingStats";
DROP VIEW IF EXISTS "vw_FiscalQuarterly";
DROP VIEW IF EXISTS "vw_MonthlyBalance";
DROP VIEW IF EXISTS "vw_SubcategorySummary";
DROP VIEW IF EXISTS "vw_MonthlySummary";

-- Drop tables with foreign keys first
DROP TABLE IF EXISTS "InvoiceLineItems";
DROP TABLE IF EXISTS "Invoices";
DROP TABLE IF EXISTS "InvoicePrefixes";
DROP TABLE IF EXISTS "UserBillingProfiles";
DROP TABLE IF EXISTS "TunnelSessions";
DROP TABLE IF EXISTS "SkydiveJumps";
DROP TABLE IF EXISTS "VerificationTokens";
DROP TABLE IF EXISTS "Sessions";
DROP TABLE IF EXISTS "Accounts";
DROP TABLE IF EXISTS "RecurringExpenseOccurrences";
DROP TABLE IF EXISTS "Transactions";
DROP TABLE IF EXISTS "RecurringExpenses";
DROP TABLE IF EXISTS "TransactionGroups";
DROP TABLE IF EXISTS "Trips";
DROP TABLE IF EXISTS "Companies";

-- Drop base tables
DROP TABLE IF EXISTS "Users";
DROP TABLE IF EXISTS "Categories";

-- ============================================================
-- CORE TABLES (Finance)
-- ============================================================

-- Categories table for organizing transactions
-- Supports hierarchical subcategories via self-referencing ParentCategoryID
-- UserID scopes categories per user (each user has their own categories)
CREATE TABLE "Categories" (
    "CategoryID" SERIAL PRIMARY KEY,
    "Name" VARCHAR(100) NOT NULL,
    "Type" VARCHAR(10) NOT NULL CHECK ("Type" IN ('income', 'expense')),
    "Icon" VARCHAR(50) NULL,
    "Color" VARCHAR(7) NULL,
    "SortOrder" INT DEFAULT 0,
    "IsActive" BOOLEAN DEFAULT TRUE,
    "ParentCategoryID" INT NULL,
    "DefaultShared" BOOLEAN DEFAULT FALSE NOT NULL,
    "DefaultVatPercent" NUMERIC(5,2) NULL,
    "DefaultDeductionPercent" NUMERIC(5,2) NULL,
    "UserID" INT NULL,
    "CreatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FK_Categories_Parent" FOREIGN KEY ("ParentCategoryID")
        REFERENCES "Categories"("CategoryID") ON DELETE NO ACTION
);

-- Indexes for category lookups
CREATE INDEX "IX_Categories_Type" ON "Categories"("Type");
CREATE INDEX "IX_Categories_Active" ON "Categories"("IsActive");
CREATE INDEX "IX_Categories_Parent" ON "Categories"("ParentCategoryID");
CREATE INDEX "IX_Categories_UserID" ON "Categories"("UserID");

-- Companies/Providers for normalized vendor data and fiscal billing details
CREATE TABLE "Companies" (
    "CompanyID" SERIAL PRIMARY KEY,
    "Name" VARCHAR(150) NOT NULL,
    "TradingName" VARCHAR(150) NULL,
    "TaxId" VARCHAR(30) NULL,
    "Address" VARCHAR(250) NULL,
    "City" VARCHAR(100) NULL,
    "PostalCode" VARCHAR(20) NULL,
    "Country" VARCHAR(100) NULL,
    "InvoiceLanguage" VARCHAR(5) NULL DEFAULT 'es',
    "Role" VARCHAR(10) NOT NULL DEFAULT 'client',
    "UserID" INT NULL,
    "IsActive" BOOLEAN DEFAULT TRUE,
    "CreatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UQ_Company_Name_User" UNIQUE("Name", "UserID"),
    CONSTRAINT "CK_Companies_Role" CHECK ("Role" IN ('client', 'provider'))
);

CREATE INDEX "IX_Companies_UserID" ON "Companies"("UserID");
CREATE INDEX "IX_Companies_Active" ON "Companies"("IsActive");
CREATE INDEX "IX_Companies_Role" ON "Companies"("Role");

-- Trips for multi-day, multi-category travel expense tracking
CREATE TABLE "Trips" (
    "TripID" SERIAL PRIMARY KEY,
    "Name" VARCHAR(100) NOT NULL,
    "UserID" INT NULL,
    "CreatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Transaction Groups for linking related transactions (e.g., outings)
CREATE TABLE "TransactionGroups" (
    "TransactionGroupID" SERIAL PRIMARY KEY,
    "UserID" INT NULL,
    "CreatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Transactions table for income and expenses
-- IMPORTANT: AmountCents stores money in cents to avoid floating point errors
CREATE TABLE "Transactions" (
    "TransactionID" SERIAL PRIMARY KEY,
    "CategoryID" INT NOT NULL REFERENCES "Categories"("CategoryID"),
    "AmountCents" INT NOT NULL,
    "Description" VARCHAR(255) NULL,
    "TransactionDate" DATE NOT NULL,
    "Type" VARCHAR(10) NOT NULL CHECK ("Type" IN ('income', 'expense')),
    "SharedDivisor" SMALLINT DEFAULT 1 NOT NULL,
    "OriginalAmountCents" INT NULL,
    "TransactionGroupID" INT NULL,
    "TripID" INT NULL,
    "RecurringExpenseID" INT NULL,
    "VatPercent" NUMERIC(5,2) NULL,
    "DeductionPercent" NUMERIC(5,2) NULL,
    "VendorName" VARCHAR(150) NULL,
    "InvoiceNumber" VARCHAR(50) NULL,
    "CompanyID" INT NULL,
    "UserID" INT NULL,
    "CreatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FK_Transactions_TransactionGroup"
        FOREIGN KEY ("TransactionGroupID") REFERENCES "TransactionGroups"("TransactionGroupID"),
    CONSTRAINT "FK_Transactions_Trip"
        FOREIGN KEY ("TripID") REFERENCES "Trips"("TripID"),
    CONSTRAINT "FK_Transactions_Company"
        FOREIGN KEY ("CompanyID") REFERENCES "Companies"("CompanyID") ON DELETE SET NULL
);

-- Indexes for efficient querying
CREATE INDEX "IX_Transactions_Date" ON "Transactions"("TransactionDate");
CREATE INDEX "IX_Transactions_Type_Date" ON "Transactions"("Type", "TransactionDate");
CREATE INDEX "IX_Transactions_Category" ON "Transactions"("CategoryID");
CREATE INDEX "IX_Transactions_YearMonth" ON "Transactions"("TransactionDate", "Type", "AmountCents", "CategoryID");
CREATE INDEX "IX_Transactions_Shared" ON "Transactions"("SharedDivisor");
CREATE INDEX "IX_Transactions_TransactionGroup" ON "Transactions"("TransactionGroupID");
CREATE INDEX "IX_Transactions_TripID" ON "Transactions"("TripID");
CREATE INDEX "IX_Transactions_RecurringExpense" ON "Transactions"("RecurringExpenseID");
CREATE INDEX "IX_Transactions_Fiscal" ON "Transactions"("VatPercent", "DeductionPercent")
    WHERE "VatPercent" IS NOT NULL;
CREATE INDEX "IX_Transactions_InvoiceNumber" ON "Transactions"("InvoiceNumber")
    WHERE "InvoiceNumber" IS NOT NULL;
CREATE INDEX "IX_Transactions_UserID" ON "Transactions"("UserID");
CREATE INDEX "IX_Transactions_CompanyID" ON "Transactions"("CompanyID");

-- ============================================================
-- RECURRING EXPENSES
-- ============================================================

CREATE TABLE "RecurringExpenses" (
    "RecurringExpenseID" SERIAL PRIMARY KEY,
    "CategoryID" INT NOT NULL REFERENCES "Categories"("CategoryID"),
    "AmountCents" INT NOT NULL,
    "Description" VARCHAR(255) NULL,
    "Frequency" VARCHAR(10) NOT NULL CHECK ("Frequency" IN ('weekly', 'monthly', 'yearly')),
    "DayOfWeek" SMALLINT NULL,
    "DayOfMonth" SMALLINT NULL,
    "MonthOfYear" SMALLINT NULL,
    "StartDate" DATE NOT NULL,
    "EndDate" DATE NULL,
    "IsActive" BOOLEAN DEFAULT TRUE NOT NULL,
    "SharedDivisor" SMALLINT DEFAULT 1 NOT NULL,
    "OriginalAmountCents" INT NULL,
    "VatPercent" NUMERIC(5,2) NULL,
    "DeductionPercent" NUMERIC(5,2) NULL,
    "VendorName" VARCHAR(150) NULL,
    "CompanyID" INT NULL,
    "UserID" INT NULL,
    "CreatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FK_RecurringExpenses_Company"
        FOREIGN KEY ("CompanyID") REFERENCES "Companies"("CompanyID") ON DELETE SET NULL,
    CONSTRAINT "CK_RecurringExpenses_Weekly"
        CHECK ("Frequency" != 'weekly' OR "DayOfWeek" IS NOT NULL),
    CONSTRAINT "CK_RecurringExpenses_Monthly"
        CHECK ("Frequency" != 'monthly' OR "DayOfMonth" IS NOT NULL),
    CONSTRAINT "CK_RecurringExpenses_Yearly"
        CHECK ("Frequency" != 'yearly' OR ("DayOfMonth" IS NOT NULL AND "MonthOfYear" IS NOT NULL)),
    CONSTRAINT "CK_RecurringExpenses_DayOfWeek_Range"
        CHECK ("DayOfWeek" IS NULL OR ("DayOfWeek" >= 0 AND "DayOfWeek" <= 6)),
    CONSTRAINT "CK_RecurringExpenses_DayOfMonth_Range"
        CHECK ("DayOfMonth" IS NULL OR ("DayOfMonth" >= 1 AND "DayOfMonth" <= 31)),
    CONSTRAINT "CK_RecurringExpenses_MonthOfYear_Range"
        CHECK ("MonthOfYear" IS NULL OR ("MonthOfYear" >= 1 AND "MonthOfYear" <= 12))
);

CREATE INDEX "IX_RecurringExpenses_Active" ON "RecurringExpenses"("IsActive");
CREATE INDEX "IX_RecurringExpenses_Category" ON "RecurringExpenses"("CategoryID");
CREATE INDEX "IX_RecurringExpenses_UserID" ON "RecurringExpenses"("UserID");
CREATE INDEX "IX_RecurringExpenses_CompanyID" ON "RecurringExpenses"("CompanyID");

CREATE TABLE "RecurringExpenseOccurrences" (
    "OccurrenceID" SERIAL PRIMARY KEY,
    "RecurringExpenseID" INT NOT NULL,
    "OccurrenceDate" DATE NOT NULL,
    "Status" VARCHAR(10) NOT NULL DEFAULT 'pending'
        CHECK ("Status" IN ('pending', 'confirmed', 'skipped')),
    "TransactionID" INT NULL,
    "ModifiedAmountCents" INT NULL,
    "ProcessedAt" TIMESTAMPTZ NULL,

    CONSTRAINT "FK_Occurrences_RecurringExpense"
        FOREIGN KEY ("RecurringExpenseID") REFERENCES "RecurringExpenses"("RecurringExpenseID")
        ON DELETE CASCADE,
    CONSTRAINT "FK_Occurrences_Transaction"
        FOREIGN KEY ("TransactionID") REFERENCES "Transactions"("TransactionID")
        ON DELETE SET NULL,
    CONSTRAINT "UQ_Occurrence_Date"
        UNIQUE ("RecurringExpenseID", "OccurrenceDate")
);

CREATE INDEX "IX_Occurrences_Status" ON "RecurringExpenseOccurrences"("Status");
CREATE INDEX "IX_Occurrences_Date" ON "RecurringExpenseOccurrences"("OccurrenceDate");

-- Add RecurringExpenseID FK to Transactions
ALTER TABLE "Transactions"
ADD CONSTRAINT "FK_Transactions_RecurringExpense"
    FOREIGN KEY ("RecurringExpenseID") REFERENCES "RecurringExpenses"("RecurringExpenseID");

-- ============================================================
-- SKYDIVING TABLES
-- ============================================================

CREATE TABLE "SkydiveJumps" (
    "JumpID" SERIAL PRIMARY KEY,
    "JumpNumber" INT NOT NULL,
    "Title" VARCHAR(255) NULL,
    "JumpDate" DATE NOT NULL,
    "Dropzone" VARCHAR(150) NULL,
    "Canopy" VARCHAR(100) NULL,
    "Wingsuit" VARCHAR(100) NULL,
    "FreefallTimeSec" INT NULL,
    "JumpType" VARCHAR(100) NULL,
    "Aircraft" VARCHAR(150) NULL,
    "ExitAltitudeFt" INT NULL,
    "LandingDistanceM" INT NULL,
    "Comment" TEXT NULL,
    "PriceCents" INT NULL,
    "TransactionID" INT NULL,
    "UserID" INT NULL,
    "CreatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FK_SkydiveJumps_Transaction"
        FOREIGN KEY ("TransactionID") REFERENCES "Transactions"("TransactionID") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "UQ_SkydiveJumps_Number_User" ON "SkydiveJumps"("JumpNumber", "UserID");
CREATE INDEX "IX_SkydiveJumps_UserID" ON "SkydiveJumps"("UserID");
CREATE INDEX "IX_SkydiveJumps_JumpDate" ON "SkydiveJumps"("JumpDate");

CREATE TABLE "TunnelSessions" (
    "SessionID" SERIAL PRIMARY KEY,
    "SessionDate" DATE NOT NULL,
    "Location" VARCHAR(150) NULL,
    "SessionType" VARCHAR(100) NULL,
    "DurationSec" INT NOT NULL,
    "Notes" TEXT NULL,
    "PriceCents" INT NULL,
    "TransactionID" INT NULL,
    "UserID" INT NULL,
    "CreatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FK_TunnelSessions_Transaction"
        FOREIGN KEY ("TransactionID") REFERENCES "Transactions"("TransactionID") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "UQ_TunnelSessions_Dedup" ON "TunnelSessions"("SessionDate", "Location", "DurationSec", "UserID");
CREATE INDEX "IX_TunnelSessions_UserID" ON "TunnelSessions"("UserID");
CREATE INDEX "IX_TunnelSessions_SessionDate" ON "TunnelSessions"("SessionDate");

-- ============================================================
-- VIEWS (Pre-calculated aggregations)
-- ============================================================

-- View: Monthly summary grouped by PARENT category (user-scoped)
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
    FROM "Transactions" WHERE "TripID" IS NOT NULL
    GROUP BY "TripID"
) "tripAgg" ON t."TripID" = "tripAgg"."TripID"
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

-- View: Monthly balance totals (user-scoped)
CREATE VIEW "vw_MonthlyBalance" AS
SELECT
    "UserID",
    "Month",
    SUM(CASE WHEN "Type" = 'income' THEN "TotalCents" ELSE 0 END) AS "IncomeCents",
    SUM(CASE WHEN "Type" = 'expense' THEN "TotalCents" ELSE 0 END) AS "ExpenseCents",
    SUM(CASE WHEN "Type" = 'income' THEN "TotalCents" ELSE -"TotalCents" END) AS "BalanceCents"
FROM "vw_MonthlySummary"
GROUP BY "UserID", "Month";

-- View: Subcategory drill-down within a parent category (user-scoped)
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
    FROM "Transactions" WHERE "TripID" IS NOT NULL
    GROUP BY "TripID"
) "tripAgg" ON t."TripID" = "tripAgg"."TripID"
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

-- View: Fiscal quarterly data (user-scoped)
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
WHERE t."VatPercent" IS NOT NULL OR t."DeductionPercent" IS NOT NULL
    OR t."InvoiceNumber" IS NOT NULL;

-- View: Skydiving statistics (user-scoped)
CREATE VIEW "vw_SkydivingStats" AS
SELECT
  u."UserID",
  COALESCE(j."TotalJumps", 0) AS "TotalJumps",
  COALESCE(j."TotalFreefallSec", 0) AS "TotalFreefallSec",
  COALESCE(j."UniqueDropzones", 0) AS "UniqueDropzones",
  j."LastJumpDate",
  COALESCE(t."TotalTunnelSec", 0) AS "TotalTunnelSec",
  COALESCE(t."TotalTunnelSessions", 0) AS "TotalTunnelSessions"
FROM "Users" u
LEFT JOIN (
  SELECT "UserID",
    COUNT("JumpID") AS "TotalJumps",
    COALESCE(SUM("FreefallTimeSec"), 0) AS "TotalFreefallSec",
    COUNT(DISTINCT "Dropzone") AS "UniqueDropzones",
    MAX("JumpDate") AS "LastJumpDate"
  FROM "SkydiveJumps"
  GROUP BY "UserID"
) j ON j."UserID" = u."UserID"
LEFT JOIN (
  SELECT "UserID",
    COALESCE(SUM("DurationSec"), 0) AS "TotalTunnelSec",
    COUNT("SessionID") AS "TotalTunnelSessions"
  FROM "TunnelSessions"
  GROUP BY "UserID"
) t ON t."UserID" = u."UserID";

-- View: Jumps grouped by type (user-scoped)
CREATE VIEW "vw_JumpsByType" AS
SELECT
  "UserID",
  COALESCE("JumpType", 'Unknown') AS "JumpType",
  COUNT(*) AS "Count",
  COALESCE(SUM("FreefallTimeSec"), 0) AS "TotalFreefallSec"
FROM "SkydiveJumps"
GROUP BY "UserID", COALESCE("JumpType", 'Unknown');

-- View: Jumps grouped by year (user-scoped)
CREATE VIEW "vw_JumpsByYear" AS
SELECT
  "UserID",
  EXTRACT(YEAR FROM "JumpDate")::INT AS "Year",
  COUNT(*) AS "Count",
  COALESCE(SUM("FreefallTimeSec"), 0) AS "TotalFreefallSec"
FROM "SkydiveJumps"
GROUP BY "UserID", EXTRACT(YEAR FROM "JumpDate")::INT;

-- ============================================================
-- USER AUTHENTICATION TABLES (NextAuth compatible)
-- ============================================================

CREATE TABLE "Users" (
    "UserID" SERIAL PRIMARY KEY,
    "Email" VARCHAR(255) NOT NULL UNIQUE,
    "PasswordHash" VARCHAR(255) NULL,
    "Name" VARCHAR(100) NULL,
    "Image" VARCHAR(500) NULL,
    "Locale" VARCHAR(5) DEFAULT 'es',
    "EmailVerified" TIMESTAMPTZ NULL,
    "IsActive" BOOLEAN DEFAULT TRUE,
    "CreatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "IX_Users_Email" ON "Users"("Email");
CREATE INDEX "IX_Users_Active" ON "Users"("IsActive");

CREATE TABLE "Accounts" (
    "AccountID" SERIAL PRIMARY KEY,
    "UserID" INT NOT NULL REFERENCES "Users"("UserID") ON DELETE CASCADE,
    "Type" VARCHAR(50) NOT NULL,
    "Provider" VARCHAR(50) NOT NULL,
    "ProviderAccountId" VARCHAR(255) NOT NULL,
    "RefreshToken" TEXT NULL,
    "AccessToken" TEXT NULL,
    "ExpiresAt" INT NULL,
    "TokenType" VARCHAR(50) NULL,
    "Scope" VARCHAR(255) NULL,
    "IdToken" TEXT NULL,
    "SessionState" VARCHAR(255) NULL,
    "CreatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UQ_Provider_ProviderAccountId" UNIQUE ("Provider", "ProviderAccountId")
);

CREATE INDEX "IX_Accounts_UserID" ON "Accounts"("UserID");

CREATE TABLE "Sessions" (
    "SessionID" SERIAL PRIMARY KEY,
    "UserID" INT NOT NULL REFERENCES "Users"("UserID") ON DELETE CASCADE,
    "SessionToken" VARCHAR(255) NOT NULL UNIQUE,
    "Expires" TIMESTAMPTZ NOT NULL,
    "CreatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "IX_Sessions_SessionToken" ON "Sessions"("SessionToken");
CREATE INDEX "IX_Sessions_UserID" ON "Sessions"("UserID");

CREATE TABLE "VerificationTokens" (
    "Identifier" VARCHAR(255) NOT NULL,
    "Token" VARCHAR(255) NOT NULL UNIQUE,
    "Expires" TIMESTAMPTZ NOT NULL,
    PRIMARY KEY ("Identifier", "Token")
);

-- ============================================================
-- FOREIGN KEYS: UserID references (added after Users table exists)
-- ============================================================

ALTER TABLE "Categories" ADD CONSTRAINT "FK_Categories_User"
    FOREIGN KEY ("UserID") REFERENCES "Users"("UserID");
ALTER TABLE "Companies" ADD CONSTRAINT "FK_Companies_User"
    FOREIGN KEY ("UserID") REFERENCES "Users"("UserID");
ALTER TABLE "Trips" ADD CONSTRAINT "FK_Trips_User"
    FOREIGN KEY ("UserID") REFERENCES "Users"("UserID");
ALTER TABLE "TransactionGroups" ADD CONSTRAINT "FK_TransactionGroups_User"
    FOREIGN KEY ("UserID") REFERENCES "Users"("UserID");
ALTER TABLE "Transactions" ADD CONSTRAINT "FK_Transactions_User"
    FOREIGN KEY ("UserID") REFERENCES "Users"("UserID");
ALTER TABLE "RecurringExpenses" ADD CONSTRAINT "FK_RecurringExpenses_User"
    FOREIGN KEY ("UserID") REFERENCES "Users"("UserID");
ALTER TABLE "SkydiveJumps" ADD CONSTRAINT "FK_SkydiveJumps_User"
    FOREIGN KEY ("UserID") REFERENCES "Users"("UserID");
ALTER TABLE "TunnelSessions" ADD CONSTRAINT "FK_TunnelSessions_User"
    FOREIGN KEY ("UserID") REFERENCES "Users"("UserID");

CREATE INDEX "IX_TransactionGroups_UserID" ON "TransactionGroups"("UserID");
CREATE INDEX "IX_Trips_UserID" ON "Trips"("UserID");

-- ============================================================
-- TRIGGERS (Auto-update UpdatedAt timestamps)
-- ============================================================

-- Single reusable function for all UpdatedAt triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."UpdatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TR_Categories_UpdatedAt"
    BEFORE UPDATE ON "Categories"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER "TR_Transactions_UpdatedAt"
    BEFORE UPDATE ON "Transactions"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER "TR_Users_UpdatedAt"
    BEFORE UPDATE ON "Users"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER "TR_Accounts_UpdatedAt"
    BEFORE UPDATE ON "Accounts"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER "TR_Trips_UpdatedAt"
    BEFORE UPDATE ON "Trips"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER "TR_RecurringExpenses_UpdatedAt"
    BEFORE UPDATE ON "RecurringExpenses"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER "TR_SkydiveJumps_UpdatedAt"
    BEFORE UPDATE ON "SkydiveJumps"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER "TR_TunnelSessions_UpdatedAt"
    BEFORE UPDATE ON "TunnelSessions"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER "TR_Companies_UpdatedAt"
    BEFORE UPDATE ON "Companies"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- VENDOR NAME SYNC TRIGGERS (Company → Transactions/RecurringExpenses)
-- ============================================================

-- Sync VendorName from Companies on INSERT/UPDATE of CompanyID
CREATE OR REPLACE FUNCTION sync_vendor_name_from_company()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."CompanyID" IS NOT NULL THEN
        SELECT "Name" INTO NEW."VendorName" FROM "Companies" WHERE "CompanyID" = NEW."CompanyID";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TR_Transactions_SyncVendorName"
    BEFORE INSERT OR UPDATE OF "CompanyID" ON "Transactions"
    FOR EACH ROW EXECUTE FUNCTION sync_vendor_name_from_company();

CREATE TRIGGER "TR_RecurringExpenses_SyncVendorName"
    BEFORE INSERT OR UPDATE OF "CompanyID" ON "RecurringExpenses"
    FOR EACH ROW EXECUTE FUNCTION sync_vendor_name_from_company();

-- Propagate company name changes to all linked rows
CREATE OR REPLACE FUNCTION propagate_company_name_change()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."Name" <> OLD."Name" THEN
        UPDATE "Transactions" SET "VendorName" = NEW."Name" WHERE "CompanyID" = NEW."CompanyID";
        UPDATE "RecurringExpenses" SET "VendorName" = NEW."Name" WHERE "CompanyID" = NEW."CompanyID";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TR_Companies_PropagateNameChange"
    AFTER UPDATE OF "Name" ON "Companies"
    FOR EACH ROW EXECUTE FUNCTION propagate_company_name_change();

-- ============================================================
-- INVOICING TABLES
-- ============================================================

-- User billing profile (issuer data for invoices, 1 per user)
CREATE TABLE "UserBillingProfiles" (
    "BillingProfileID" SERIAL PRIMARY KEY,
    "UserID" INT NOT NULL UNIQUE,
    "FullName" VARCHAR(150) NOT NULL,
    "Nif" VARCHAR(30) NOT NULL,
    "Address" VARCHAR(500) NULL,
    "Phone" VARCHAR(30) NULL,
    "PaymentMethod" VARCHAR(20) NOT NULL DEFAULT 'bank_transfer'
        CHECK ("PaymentMethod" IN ('bank_transfer', 'paypal', 'other')),
    "BankName" VARCHAR(150) NULL,
    "Iban" VARCHAR(34) NULL,
    "Swift" VARCHAR(11) NULL,
    "BankAddress" VARCHAR(500) NULL,
    "DefaultHourlyRateCents" INT NULL,
    "CreatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FK_BillingProfiles_User"
        FOREIGN KEY ("UserID") REFERENCES "Users"("UserID")
);

-- Invoice prefixes (numbering series)
CREATE TABLE "InvoicePrefixes" (
    "PrefixID" SERIAL PRIMARY KEY,
    "Prefix" VARCHAR(10) NOT NULL,
    "NextNumber" INT NOT NULL DEFAULT 1,
    "Description" VARCHAR(100) NULL,
    "UserID" INT NOT NULL,
    "CompanyID" INT NULL,
    "IsActive" BOOLEAN DEFAULT TRUE,
    "CreatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FK_InvoicePrefixes_User"
        FOREIGN KEY ("UserID") REFERENCES "Users"("UserID"),
    CONSTRAINT "FK_InvoicePrefixes_Company"
        FOREIGN KEY ("CompanyID") REFERENCES "Companies"("CompanyID") ON DELETE SET NULL,
    CONSTRAINT "UQ_InvoicePrefix_User" UNIQUE ("Prefix", "UserID")
);

CREATE INDEX "IX_InvoicePrefixes_UserID" ON "InvoicePrefixes"("UserID");

-- Invoices (issued invoices with frozen snapshots)
CREATE TABLE "Invoices" (
    "InvoiceID" SERIAL PRIMARY KEY,
    "PrefixID" INT NOT NULL,
    "InvoiceNumber" VARCHAR(20) NOT NULL,
    "InvoiceDate" DATE NOT NULL,
    "CompanyID" INT NULL,
    "TransactionID" INT NULL,
    "TotalCents" INT NOT NULL DEFAULT 0,
    "Currency" VARCHAR(3) NOT NULL DEFAULT 'EUR',
    "Status" VARCHAR(15) NOT NULL DEFAULT 'draft'
        CHECK ("Status" IN ('draft', 'finalized', 'paid', 'cancelled')),
    -- Biller snapshot (frozen at creation)
    "BillerName" VARCHAR(150) NOT NULL,
    "BillerNif" VARCHAR(30) NOT NULL,
    "BillerAddress" VARCHAR(500) NULL,
    "BillerPhone" VARCHAR(30) NULL,
    "BillerPaymentMethod" VARCHAR(20) NOT NULL,
    "BillerBankName" VARCHAR(150) NULL,
    "BillerIban" VARCHAR(34) NULL,
    "BillerSwift" VARCHAR(11) NULL,
    "BillerBankAddress" VARCHAR(500) NULL,
    -- Client snapshot (frozen at creation)
    "ClientName" VARCHAR(150) NOT NULL,
    "ClientTradingName" VARCHAR(150) NULL,
    "ClientTaxId" VARCHAR(30) NULL,
    "ClientAddress" VARCHAR(250) NULL,
    "ClientCity" VARCHAR(100) NULL,
    "ClientPostalCode" VARCHAR(20) NULL,
    "ClientCountry" VARCHAR(100) NULL,
    -- Metadata
    "Notes" TEXT NULL,
    "UserID" INT NOT NULL,
    "CreatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FK_Invoices_Prefix"
        FOREIGN KEY ("PrefixID") REFERENCES "InvoicePrefixes"("PrefixID"),
    CONSTRAINT "FK_Invoices_Company"
        FOREIGN KEY ("CompanyID") REFERENCES "Companies"("CompanyID") ON DELETE SET NULL,
    CONSTRAINT "FK_Invoices_Transaction"
        FOREIGN KEY ("TransactionID") REFERENCES "Transactions"("TransactionID") ON DELETE SET NULL,
    CONSTRAINT "FK_Invoices_User"
        FOREIGN KEY ("UserID") REFERENCES "Users"("UserID"),
    CONSTRAINT "UQ_InvoiceNumber_User" UNIQUE ("InvoiceNumber", "UserID")
);

CREATE INDEX "IX_Invoices_UserID" ON "Invoices"("UserID");
CREATE INDEX "IX_Invoices_CompanyID" ON "Invoices"("CompanyID");
CREATE INDEX "IX_Invoices_Status" ON "Invoices"("Status");
CREATE INDEX "IX_Invoices_InvoiceDate" ON "Invoices"("InvoiceDate");

-- Invoice line items (individual concepts)
CREATE TABLE "InvoiceLineItems" (
    "LineItemID" SERIAL PRIMARY KEY,
    "InvoiceID" INT NOT NULL,
    "SortOrder" INT NOT NULL DEFAULT 0,
    "Description" VARCHAR(500) NOT NULL,
    "Hours" NUMERIC(8,2) NULL,
    "HourlyRateCents" INT NULL,
    "AmountCents" INT NOT NULL,
    CONSTRAINT "FK_LineItems_Invoice"
        FOREIGN KEY ("InvoiceID") REFERENCES "Invoices"("InvoiceID") ON DELETE CASCADE
);

CREATE INDEX "IX_InvoiceLineItems_InvoiceID" ON "InvoiceLineItems"("InvoiceID");

-- UpdatedAt triggers for invoice tables
CREATE TRIGGER "TR_UserBillingProfiles_UpdatedAt"
    BEFORE UPDATE ON "UserBillingProfiles"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER "TR_Invoices_UpdatedAt"
    BEFORE UPDATE ON "Invoices"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- SCHEMA COMPLETE
-- Run seed.sql next to populate initial categories
-- ============================================================
