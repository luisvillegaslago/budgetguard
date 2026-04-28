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
DROP TRIGGER IF EXISTS "TR_FiscalDocuments_UpdatedAt" ON "FiscalDocuments";
DROP TRIGGER IF EXISTS "TR_FiscalDeadlineSettings_UpdatedAt" ON "FiscalDeadlineSettings";
DROP TRIGGER IF EXISTS "TR_ExchangeCredentials_UpdatedAt" ON "ExchangeCredentials";
DROP TRIGGER IF EXISTS "TR_CryptoSyncJobs_UpdatedAt" ON "CryptoSyncJobs";
DROP TRIGGER IF EXISTS "TR_TaxableEvents_UpdatedAt" ON "TaxableEvents";

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
DROP TABLE IF EXISTS "TaxableEvents";
DROP TABLE IF EXISTS "CryptoPriceCache";
DROP TABLE IF EXISTS "BinanceRawEvents";
DROP TABLE IF EXISTS "CryptoSyncJobs";
DROP TABLE IF EXISTS "ExchangeApiCallLog";
DROP TABLE IF EXISTS "ExchangeCredentials";
DROP TABLE IF EXISTS "FiscalDeadlineSettings";
DROP TABLE IF EXISTS "FiscalDocuments";
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
    "Modelo100CasillaCode" VARCHAR(4) NULL,
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
    "DefaultBankFeeCents" INT NULL,
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
    "StartDate" DATE,
    "EndDate" DATE,
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
    "Status" VARCHAR(15) NOT NULL DEFAULT 'paid'
        CHECK ("Status" IN ('paid', 'pending', 'cancelled')),
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
CREATE INDEX "IX_Transactions_Status" ON "Transactions"("Status");

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
      CASE WHEN t."TripID" IS NOT NULL THEN tr."StartDate" ELSE t."TransactionDate" END,
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
LEFT JOIN "Trips" tr ON t."TripID" = tr."TripID"
WHERE t."Status" = 'paid'
GROUP BY
    t."UserID",
    TO_CHAR(
      CASE WHEN t."TripID" IS NOT NULL THEN tr."StartDate" ELSE t."TransactionDate" END,
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
      CASE WHEN t."TripID" IS NOT NULL THEN tr."StartDate" ELSE t."TransactionDate" END,
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
LEFT JOIN "Trips" tr ON t."TripID" = tr."TripID"
WHERE t."Status" = 'paid'
GROUP BY
    t."UserID",
    TO_CHAR(
      CASE WHEN t."TripID" IS NOT NULL THEN tr."StartDate" ELSE t."TransactionDate" END,
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
WHERE t."Status" = 'paid'
    AND (t."VatPercent" IS NOT NULL OR t."DeductionPercent" IS NOT NULL
    OR t."InvoiceNumber" IS NOT NULL);

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
    "InvoiceNumber" VARCHAR(20) NULL,
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
);

-- Partial unique index: only enforced when InvoiceNumber is assigned (at finalization)
CREATE UNIQUE INDEX "UQ_InvoiceNumber_User" ON "Invoices" ("InvoiceNumber", "UserID")
    WHERE "InvoiceNumber" IS NOT NULL;
CREATE INDEX "IX_Invoices_UserID" ON "Invoices"("UserID");
CREATE INDEX "IX_Invoices_CompanyID" ON "Invoices"("CompanyID");
CREATE INDEX "IX_Invoices_Status" ON "Invoices"("Status");
CREATE INDEX "IX_Invoices_InvoiceDate" ON "Invoices"("InvoiceDate");

-- Invoice line items (individual concepts)
CREATE TABLE "InvoiceLineItems" (
    "LineItemID" SERIAL PRIMARY KEY,
    "InvoiceID" INT NOT NULL,
    "SortOrder" INT NOT NULL DEFAULT 0,
    "Description" VARCHAR(2000) NOT NULL,
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
-- FISCAL DOCUMENTS & DEADLINE SETTINGS
-- ============================================================

-- Fiscal documents: uploaded tax filings and received invoices
CREATE TABLE "FiscalDocuments" (
    "DocumentID" SERIAL PRIMARY KEY,
    "UserID" INT NOT NULL REFERENCES "Users"("UserID"),
    "DocumentType" VARCHAR(20) NOT NULL CHECK ("DocumentType" IN ('modelo', 'factura_recibida', 'factura_emitida')),
    "ModeloType" VARCHAR(10) NULL CHECK ("ModeloType" IN ('303', '130', '390', '100')),
    "FiscalYear" INT NOT NULL,
    "FiscalQuarter" INT NULL CHECK ("FiscalQuarter" BETWEEN 1 AND 4),
    "Status" VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK ("Status" IN ('pending', 'filed', 'postponed')),
    -- File storage (Vercel Blob)
    "BlobUrl" VARCHAR(500) NOT NULL,
    "BlobPathname" VARCHAR(300) NOT NULL,
    "FileName" VARCHAR(255) NOT NULL,
    "FileSizeBytes" INT NOT NULL,
    "ContentType" VARCHAR(100) NOT NULL,
    -- Money (cents convention)
    "TaxAmountCents" INT NULL,
    -- Traceability
    "TransactionID" INT NULL REFERENCES "Transactions"("TransactionID") ON DELETE SET NULL,
    "TransactionGroupID" INT NULL,
    "CompanyID" INT NULL REFERENCES "Companies"("CompanyID") ON DELETE SET NULL,
    "Description" VARCHAR(255) NULL,
    "DocumentDate" DATE NULL,
    "VendorName" VARCHAR(255) NULL,
    -- OCR extraction
    "ExtractedData" JSONB DEFAULT NULL,
    "ExtractionStatus" VARCHAR(20) DEFAULT 'not_extracted'
        CHECK ("ExtractionStatus" IN ('not_extracted', 'extracting', 'extracted', 'failed')),
    "CreatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    -- Modelos require ModeloType; facturas do not
    CONSTRAINT "CK_FiscalDoc_ModeloType" CHECK (
        ("DocumentType" = 'modelo' AND "ModeloType" IS NOT NULL)
        OR ("DocumentType" IN ('factura_recibida', 'factura_emitida') AND "ModeloType" IS NULL)
    ),
    -- Annual modelos (390,100) → quarter NULL; quarterly → quarter NOT NULL
    CONSTRAINT "CK_FiscalDoc_Quarter" CHECK (
        ("ModeloType" IN ('390', '100') AND "FiscalQuarter" IS NULL)
        OR ("ModeloType" IN ('303', '130') AND "FiscalQuarter" IS NOT NULL)
        OR "ModeloType" IS NULL
    )
);

CREATE INDEX "IX_FiscalDocuments_UserYear" ON "FiscalDocuments"("UserID", "FiscalYear");
CREATE INDEX "IX_FiscalDocuments_Type" ON "FiscalDocuments"("DocumentType");
CREATE INDEX "IX_FiscalDocuments_Status" ON "FiscalDocuments"("Status");
CREATE INDEX "idx_fiscal_docs_date" ON "FiscalDocuments"("DocumentDate");
CREATE INDEX "idx_fiscal_docs_vendor" ON "FiscalDocuments"("VendorName");

CREATE TRIGGER "TR_FiscalDocuments_UpdatedAt"
    BEFORE UPDATE ON "FiscalDocuments"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Fiscal deadline reminder settings (1 per user)
CREATE TABLE "FiscalDeadlineSettings" (
    "SettingID" SERIAL PRIMARY KEY,
    "UserID" INT NOT NULL UNIQUE REFERENCES "Users"("UserID"),
    "ReminderDaysBefore" INT NOT NULL DEFAULT 7,
    "PostponementReminder" BOOLEAN NOT NULL DEFAULT TRUE,
    "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "CreatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER "TR_FiscalDeadlineSettings_UpdatedAt"
    BEFORE UPDATE ON "FiscalDeadlineSettings"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- CRYPTO MODULE (Phase 1: encrypted exchange credentials + audit log)
-- ============================================================

-- Encrypted API credentials for connected crypto exchanges (1 row per user × exchange).
-- ApiKey/ApiSecret are encrypted with AES-256-GCM using CRYPTO_MASTER_KEY.
-- Permissions JSONB caches the result of the exchange's apiRestrictions endpoint
-- so we can display "Connected (read-only)" without re-validating on every request.
-- Each encrypted blob has the format "<iv-base64>.<authTag-base64>.<cipher-base64>"
-- so a single TEXT column carries the cipher plus its (per-encryption) GCM
-- metadata. This avoids ever reusing an IV across two encryptions with the
-- same key (which would defeat AES-GCM's confidentiality guarantee).
CREATE TABLE "ExchangeCredentials" (
    "CredentialID" SERIAL PRIMARY KEY,
    "UserID" INT NOT NULL REFERENCES "Users"("UserID") ON DELETE CASCADE,
    "Exchange" VARCHAR(20) NOT NULL CHECK ("Exchange" IN ('binance')),
    "ApiKeyEncrypted" TEXT NOT NULL,
    "ApiSecretEncrypted" TEXT NOT NULL,
    "EncryptionKeyVersion" VARCHAR(10) NOT NULL DEFAULT 'v1',
    "Permissions" JSONB NOT NULL,
    "ApiKeyLast4" VARCHAR(4) NOT NULL,
    "LastValidatedAt" TIMESTAMPTZ,
    "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "CreatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UQ_ExchangeCredentials_UserExchange" UNIQUE ("UserID", "Exchange")
);

CREATE INDEX "IX_ExchangeCredentials_UserActive" ON "ExchangeCredentials"("UserID", "IsActive");

CREATE TRIGGER "TR_ExchangeCredentials_UpdatedAt"
    BEFORE UPDATE ON "ExchangeCredentials"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Audit log of every outgoing call to an exchange API (rate-limit detection,
-- 429/418 forensics, weight tracking). Append-only; periodically pruned.
CREATE TABLE "ExchangeApiCallLog" (
    "LogID" BIGSERIAL PRIMARY KEY,
    "UserID" INT NOT NULL REFERENCES "Users"("UserID") ON DELETE CASCADE,
    "Exchange" VARCHAR(20) NOT NULL,
    "Endpoint" VARCHAR(120) NOT NULL,
    "StatusCode" INT,
    "WeightUsed" INT,
    "DurationMs" INT,
    "ErrorCode" VARCHAR(60),
    "CreatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "IX_ExchangeApiCallLog_UserCreated" ON "ExchangeApiCallLog"("UserID", "CreatedAt" DESC);
CREATE INDEX "IX_ExchangeApiCallLog_Status" ON "ExchangeApiCallLog"("StatusCode") WHERE "StatusCode" >= 400;

-- Sync job lifecycle: one row per backfill or incremental run.
-- Status transitions: pending -> running -> (completed | failed).
-- Progress is a JSONB map: { endpoint: { fetched, totalWindows, lastWindowEnd } }
-- so the UI can render a progress bar without polling the row count.
CREATE TABLE "CryptoSyncJobs" (
    "JobID" SERIAL PRIMARY KEY,
    "UserID" INT NOT NULL REFERENCES "Users"("UserID") ON DELETE CASCADE,
    "Exchange" VARCHAR(20) NOT NULL,
    "Mode" VARCHAR(15) NOT NULL CHECK ("Mode" IN ('full', 'incremental')),
    "Status" VARCHAR(15) NOT NULL DEFAULT 'pending'
        CHECK ("Status" IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    "ScopeFrom" TIMESTAMPTZ NOT NULL,
    "ScopeTo" TIMESTAMPTZ NOT NULL,
    "Progress" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "ErrorCode" VARCHAR(60),
    "ErrorMessage" TEXT,
    "EventsIngested" INT NOT NULL DEFAULT 0,
    "StartedAt" TIMESTAMPTZ,
    "FinishedAt" TIMESTAMPTZ,
    "CreatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "IX_CryptoSyncJobs_UserStatus" ON "CryptoSyncJobs"("UserID", "Status", "CreatedAt" DESC);
CREATE INDEX "IX_CryptoSyncJobs_UserExchange" ON "CryptoSyncJobs"("UserID", "Exchange", "FinishedAt" DESC);

CREATE TRIGGER "TR_CryptoSyncJobs_UpdatedAt"
    BEFORE UPDATE ON "CryptoSyncJobs"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Raw events ingested from Binance, one row per upstream event. Idempotent
-- by (UserID, EventType, ExternalID) — re-running a sync window inserts
-- 0 duplicates. RawPayload is the verbatim JSON from the API for AEAT
-- reproducibility and to allow re-normalisation when Phase 3+ logic changes.
CREATE TABLE "BinanceRawEvents" (
    "EventID" BIGSERIAL PRIMARY KEY,
    "UserID" INT NOT NULL REFERENCES "Users"("UserID") ON DELETE CASCADE,
    "EventType" VARCHAR(30) NOT NULL,
    "ExternalID" VARCHAR(120) NOT NULL,
    "OccurredAt" TIMESTAMPTZ NOT NULL,
    "RawPayload" JSONB NOT NULL,
    "IngestedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "NormalizedAt" TIMESTAMPTZ NULL,
    "JobID" INT REFERENCES "CryptoSyncJobs"("JobID") ON DELETE SET NULL,
    CONSTRAINT "UQ_BinanceRawEvents_UserTypeExternal" UNIQUE ("UserID", "EventType", "ExternalID")
);

CREATE INDEX "IX_BinanceRawEvents_UserOccurred" ON "BinanceRawEvents"("UserID", "OccurredAt" DESC);
CREATE INDEX "IX_BinanceRawEvents_TypeOccurred" ON "BinanceRawEvents"("EventType", "OccurredAt" DESC);
CREATE INDEX "IX_BinanceRawEvents_UnnormalizedFast" ON "BinanceRawEvents"("UserID") WHERE "NormalizedAt" IS NULL;

-- Historical EUR price cache. Inmutable once written: every (Asset, DateUtc)
-- pair is resolved exactly once, then re-used for any normaliser pass that
-- needs that price. Source records which path of the cascade produced it
-- (binance_eur, binance_usdt_cross, coingecko, stablecoin) so AEAT can later
-- audit the chain of evidence.
CREATE TABLE "CryptoPriceCache" (
    "Asset" VARCHAR(20) NOT NULL,
    "DateUtc" DATE NOT NULL,
    "EurPriceCents" BIGINT NOT NULL,
    "Source" VARCHAR(30) NOT NULL,
    "ResolvedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("Asset", "DateUtc")
);

-- Normalised, fiscally-relevant events derived from BinanceRawEvents.
-- One raw event may produce 0, 1, or N taxable events (e.g. a spot trade
-- BTC→USDT yields a `disposal` of BTC + an `acquisition` of USDT).
-- RawEventID + Kind are unique together so re-running the normaliser is
-- idempotent (UPSERT semantics) without losing the multi-leg expansion.
CREATE TABLE "TaxableEvents" (
    "EventID" BIGSERIAL PRIMARY KEY,
    "UserID" INT NOT NULL REFERENCES "Users"("UserID") ON DELETE CASCADE,
    "RawEventID" BIGINT NOT NULL REFERENCES "BinanceRawEvents"("EventID") ON DELETE CASCADE,
    "Kind" VARCHAR(20) NOT NULL CHECK (
        "Kind" IN ('disposal', 'acquisition', 'airdrop', 'staking_reward', 'transfer_in', 'transfer_out')
    ),
    "OccurredAt" TIMESTAMPTZ NOT NULL,
    "Asset" VARCHAR(20) NOT NULL,
    "QuantityNative" NUMERIC(38, 18) NOT NULL,
    "CounterAsset" VARCHAR(20),
    "CounterQuantityNative" NUMERIC(38, 18),
    "FeeAsset" VARCHAR(20),
    "FeeQuantityNative" NUMERIC(38, 18),
    "UnitPriceEurCents" BIGINT NOT NULL,
    "GrossValueEurCents" BIGINT NOT NULL,
    "FeeEurCents" BIGINT NOT NULL DEFAULT 0,
    "PriceSource" VARCHAR(30) NOT NULL,
    "Contraprestacion" CHAR(1) CHECK ("Contraprestacion" IN ('F', 'N')),
    "CreatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    -- A single raw event can split into multiple legs of different kinds
    -- (a spot trade BTC→USDT = disposal of BTC + acquisition of USDT), so the
    -- idempotency key includes Kind + Asset to keep both legs distinct.
    CONSTRAINT "UQ_TaxableEvents_RawKindAsset" UNIQUE ("RawEventID", "Kind", "Asset")
);

CREATE INDEX "IX_TaxableEvents_UserOccurred" ON "TaxableEvents"("UserID", "OccurredAt" DESC);
CREATE INDEX "IX_TaxableEvents_UserKindAsset" ON "TaxableEvents"("UserID", "Kind", "Asset", "OccurredAt");
CREATE INDEX "IX_TaxableEvents_UserContrap" ON "TaxableEvents"("UserID", "Contraprestacion") WHERE "Contraprestacion" IS NOT NULL;

CREATE TRIGGER "TR_TaxableEvents_UpdatedAt"
    BEFORE UPDATE ON "TaxableEvents"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- SCHEMA COMPLETE
-- Run seed.sql next to populate initial categories
-- ============================================================
