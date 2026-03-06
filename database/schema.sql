-- BudgetGuard Database Schema
-- Family Expense & Income Tracking System
-- All amounts stored in CENTS (integers) to avoid floating point precision errors
--
-- IDEMPOTENT: This script can be run multiple times safely.
-- It drops all existing objects before recreating them.

USE BudgetGuard;
GO

-- ============================================================
-- DROP EXISTING OBJECTS (in correct order for FK dependencies)
-- ============================================================

-- Drop triggers first (they depend on tables)
IF OBJECT_ID('TR_Accounts_UpdatedAt', 'TR') IS NOT NULL DROP TRIGGER TR_Accounts_UpdatedAt;
IF OBJECT_ID('TR_Users_UpdatedAt', 'TR') IS NOT NULL DROP TRIGGER TR_Users_UpdatedAt;
IF OBJECT_ID('TR_Transactions_UpdatedAt', 'TR') IS NOT NULL DROP TRIGGER TR_Transactions_UpdatedAt;
IF OBJECT_ID('TR_Categories_UpdatedAt', 'TR') IS NOT NULL DROP TRIGGER TR_Categories_UpdatedAt;
IF OBJECT_ID('TR_RecurringExpenses_UpdatedAt', 'TR') IS NOT NULL DROP TRIGGER TR_RecurringExpenses_UpdatedAt;
IF OBJECT_ID('TR_Trips_UpdatedAt', 'TR') IS NOT NULL DROP TRIGGER TR_Trips_UpdatedAt;
GO

-- Drop views (they depend on tables)
IF OBJECT_ID('vw_FiscalQuarterly', 'V') IS NOT NULL DROP VIEW vw_FiscalQuarterly;
IF OBJECT_ID('vw_MonthlyBalance', 'V') IS NOT NULL DROP VIEW vw_MonthlyBalance;
IF OBJECT_ID('vw_SubcategorySummary', 'V') IS NOT NULL DROP VIEW vw_SubcategorySummary;
IF OBJECT_ID('vw_MonthlySummary', 'V') IS NOT NULL DROP VIEW vw_MonthlySummary;
GO

-- Drop tables with foreign keys first
DROP TABLE IF EXISTS VerificationTokens;
DROP TABLE IF EXISTS Sessions;
DROP TABLE IF EXISTS Accounts;
DROP TABLE IF EXISTS RecurringExpenseOccurrences;
DROP TABLE IF EXISTS Transactions;
DROP TABLE IF EXISTS RecurringExpenses;
DROP TABLE IF EXISTS TransactionGroups;
DROP TABLE IF EXISTS Trips;

-- Drop base tables
DROP TABLE IF EXISTS Users;
DROP TABLE IF EXISTS Categories;
GO

-- ============================================================
-- CORE TABLES (Finance)
-- ============================================================

-- Categories table for organizing transactions
-- Supports hierarchical subcategories via self-referencing ParentCategoryID
CREATE TABLE Categories (
    CategoryID INT IDENTITY(1,1) PRIMARY KEY,
    Name NVARCHAR(100) NOT NULL,
    Type NVARCHAR(10) NOT NULL CHECK (Type IN ('income', 'expense')),
    Icon NVARCHAR(50) NULL,           -- Lucide icon name
    Color NVARCHAR(7) NULL,           -- Hex color (#4F46E5)
    SortOrder INT DEFAULT 0,
    IsActive BIT DEFAULT 1,
    ParentCategoryID INT NULL,        -- Self-referencing FK for subcategories (NULL = parent)
    DefaultShared BIT DEFAULT 0 NOT NULL, -- Auto-toggle shared checkbox in form
    DefaultVatPercent DECIMAL(5,2) NULL,      -- Fiscal: default VAT % for transactions
    DefaultDeductionPercent DECIMAL(5,2) NULL, -- Fiscal: default deduction % for transactions
    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 DEFAULT GETUTCDATE(),
    CONSTRAINT FK_Categories_Parent FOREIGN KEY (ParentCategoryID)
        REFERENCES Categories(CategoryID) ON DELETE NO ACTION
);

-- Indexes for category lookups
CREATE INDEX IX_Categories_Type ON Categories(Type);
CREATE INDEX IX_Categories_Active ON Categories(IsActive);
CREATE INDEX IX_Categories_Parent ON Categories(ParentCategoryID);

-- Trips for multi-day, multi-category travel expense tracking
-- Trip expenses are regular Transactions with a TripID FK
CREATE TABLE Trips (
    TripID INT IDENTITY(1,1) PRIMARY KEY,
    Name NVARCHAR(100) NOT NULL,
    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 DEFAULT GETUTCDATE()
);

-- Transaction Groups for linking related transactions (e.g., outings with multiple subcategory expenses)
-- Minimal identity anchor; description/date come from the transactions themselves
CREATE TABLE TransactionGroups (
    TransactionGroupID INT IDENTITY(1,1) PRIMARY KEY,
    CreatedAt DATETIME2 DEFAULT GETUTCDATE()
);

-- Transactions table for income and expenses
-- IMPORTANT: AmountCents stores money in cents to avoid floating point errors
-- Example: €419.28 is stored as 41928
-- SharedDivisor: 1 = not shared, 2 = split between 2, etc.
-- OriginalAmountCents: full amount before division (only when SharedDivisor > 1)
CREATE TABLE Transactions (
    TransactionID INT IDENTITY(1,1) PRIMARY KEY,
    CategoryID INT NOT NULL FOREIGN KEY REFERENCES Categories(CategoryID),
    AmountCents INT NOT NULL,         -- Effective amount (halved if shared) in cents
    Description NVARCHAR(255) NULL,
    TransactionDate DATE NOT NULL,
    Type NVARCHAR(10) NOT NULL CHECK (Type IN ('income', 'expense')),
    SharedDivisor TINYINT DEFAULT 1 NOT NULL, -- 1=personal, 2=split-by-2, etc.
    OriginalAmountCents INT NULL,     -- Full amount before division (NULL if not shared)
    TransactionGroupID INT NULL,     -- FK to TransactionGroups (NULL if standalone)
    TripID INT NULL,                -- FK to Trips (NULL if not a trip expense)
    VatPercent DECIMAL(5,2) NULL,        -- Fiscal: VAT percentage (NULL = not fiscal)
    DeductionPercent DECIMAL(5,2) NULL,  -- Fiscal: deduction percentage
    VendorName NVARCHAR(150) NULL,       -- Fiscal: vendor/supplier name
    InvoiceNumber NVARCHAR(50) NULL,     -- Fiscal: invoice number
    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 DEFAULT GETUTCDATE(),
    CONSTRAINT FK_Transactions_TransactionGroup
        FOREIGN KEY (TransactionGroupID) REFERENCES TransactionGroups(TransactionGroupID),
    CONSTRAINT FK_Transactions_Trip
        FOREIGN KEY (TripID) REFERENCES Trips(TripID)
);

-- Indexes for efficient querying by date and type
CREATE INDEX IX_Transactions_Date ON Transactions(TransactionDate);
CREATE INDEX IX_Transactions_Type_Date ON Transactions(Type, TransactionDate);
CREATE INDEX IX_Transactions_Category ON Transactions(CategoryID);
CREATE INDEX IX_Transactions_YearMonth ON Transactions(TransactionDate) INCLUDE (Type, AmountCents, CategoryID);
CREATE INDEX IX_Transactions_Shared ON Transactions(SharedDivisor);
CREATE INDEX IX_Transactions_TransactionGroup ON Transactions(TransactionGroupID);
CREATE INDEX IX_Transactions_TripID ON Transactions(TripID);
CREATE INDEX IX_Transactions_Fiscal ON Transactions(VatPercent, DeductionPercent)
    WHERE VatPercent IS NOT NULL;
CREATE INDEX IX_Transactions_InvoiceNumber ON Transactions(InvoiceNumber)
    WHERE InvoiceNumber IS NOT NULL;

GO

-- ============================================================
-- RECURRING EXPENSES
-- ============================================================

-- RecurringExpenses: Rules defining recurring expenses
CREATE TABLE RecurringExpenses (
    RecurringExpenseID INT IDENTITY(1,1) PRIMARY KEY,
    CategoryID INT NOT NULL FOREIGN KEY REFERENCES Categories(CategoryID),
    AmountCents INT NOT NULL,
    Description NVARCHAR(255) NULL,
    Frequency NVARCHAR(10) NOT NULL CHECK (Frequency IN ('weekly', 'monthly', 'yearly')),
    DayOfWeek TINYINT NULL,            -- 0=Sunday .. 6=Saturday (for weekly)
    DayOfMonth TINYINT NULL,           -- 1-31 (for monthly/yearly)
    MonthOfYear TINYINT NULL,          -- 1-12 (for yearly)
    StartDate DATE NOT NULL,
    EndDate DATE NULL,
    IsActive BIT DEFAULT 1 NOT NULL,
    SharedDivisor TINYINT DEFAULT 1 NOT NULL,
    OriginalAmountCents INT NULL,
    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 DEFAULT GETUTCDATE(),

    CONSTRAINT CK_RecurringExpenses_Weekly
        CHECK (Frequency != 'weekly' OR DayOfWeek IS NOT NULL),
    CONSTRAINT CK_RecurringExpenses_Monthly
        CHECK (Frequency != 'monthly' OR DayOfMonth IS NOT NULL),
    CONSTRAINT CK_RecurringExpenses_Yearly
        CHECK (Frequency != 'yearly' OR (DayOfMonth IS NOT NULL AND MonthOfYear IS NOT NULL)),
    CONSTRAINT CK_RecurringExpenses_DayOfWeek_Range
        CHECK (DayOfWeek IS NULL OR (DayOfWeek >= 0 AND DayOfWeek <= 6)),
    CONSTRAINT CK_RecurringExpenses_DayOfMonth_Range
        CHECK (DayOfMonth IS NULL OR (DayOfMonth >= 1 AND DayOfMonth <= 31)),
    CONSTRAINT CK_RecurringExpenses_MonthOfYear_Range
        CHECK (MonthOfYear IS NULL OR (MonthOfYear >= 1 AND MonthOfYear <= 12))
);

CREATE INDEX IX_RecurringExpenses_Active ON RecurringExpenses(IsActive);
CREATE INDEX IX_RecurringExpenses_Category ON RecurringExpenses(CategoryID);

-- RecurringExpenseOccurrences: Individual occurrence tracking per date
CREATE TABLE RecurringExpenseOccurrences (
    OccurrenceID INT IDENTITY(1,1) PRIMARY KEY,
    RecurringExpenseID INT NOT NULL,
    OccurrenceDate DATE NOT NULL,
    Status NVARCHAR(10) NOT NULL DEFAULT 'pending'
        CHECK (Status IN ('pending', 'confirmed', 'skipped')),
    TransactionID INT NULL,
    ModifiedAmountCents INT NULL,
    ProcessedAt DATETIME2 NULL,

    CONSTRAINT FK_Occurrences_RecurringExpense
        FOREIGN KEY (RecurringExpenseID) REFERENCES RecurringExpenses(RecurringExpenseID)
        ON DELETE CASCADE,
    CONSTRAINT FK_Occurrences_Transaction
        FOREIGN KEY (TransactionID) REFERENCES Transactions(TransactionID)
        ON DELETE SET NULL,
    CONSTRAINT UQ_Occurrence_Date
        UNIQUE (RecurringExpenseID, OccurrenceDate)
);

CREATE INDEX IX_Occurrences_Status ON RecurringExpenseOccurrences(Status);
CREATE INDEX IX_Occurrences_Date ON RecurringExpenseOccurrences(OccurrenceDate);

GO

-- Add RecurringExpenseID column to Transactions
ALTER TABLE Transactions
ADD RecurringExpenseID INT NULL
    CONSTRAINT FK_Transactions_RecurringExpense
    FOREIGN KEY REFERENCES RecurringExpenses(RecurringExpenseID);

CREATE INDEX IX_Transactions_RecurringExpense ON Transactions(RecurringExpenseID);

GO

-- ============================================================
-- VIEWS (Pre-calculated aggregations)
-- ============================================================

-- View: Monthly summary grouped by PARENT category
-- Subcategory transactions aggregate under their parent
-- Trip-linked transactions use trip start date (MIN date) for month attribution
CREATE VIEW vw_MonthlySummary AS
SELECT
    FORMAT(
      CASE WHEN t.TripID IS NOT NULL THEN tripAgg.TripStartDate ELSE t.TransactionDate END,
      'yyyy-MM'
    ) AS Month,
    t.Type,
    COALESCE(c.ParentCategoryID, c.CategoryID) AS CategoryID,
    COALESCE(parent.Name, c.Name) AS CategoryName,
    COALESCE(parent.Icon, c.Icon) AS CategoryIcon,
    COALESCE(parent.Color, c.Color) AS CategoryColor,
    SUM(t.AmountCents) AS TotalCents,
    COUNT(*) AS TransactionCount
FROM Transactions t
INNER JOIN Categories c ON t.CategoryID = c.CategoryID
LEFT JOIN Categories parent ON c.ParentCategoryID = parent.CategoryID
LEFT JOIN (
    SELECT TripID, MIN(TransactionDate) AS TripStartDate
    FROM Transactions WHERE TripID IS NOT NULL
    GROUP BY TripID
) tripAgg ON t.TripID = tripAgg.TripID
GROUP BY
    FORMAT(
      CASE WHEN t.TripID IS NOT NULL THEN tripAgg.TripStartDate ELSE t.TransactionDate END,
      'yyyy-MM'
    ),
    t.Type,
    COALESCE(c.ParentCategoryID, c.CategoryID),
    COALESCE(parent.Name, c.Name),
    COALESCE(parent.Icon, c.Icon),
    COALESCE(parent.Color, c.Color);
GO

-- View: Monthly balance totals (income, expense, net balance)
CREATE VIEW vw_MonthlyBalance AS
SELECT
    Month,
    SUM(CASE WHEN Type = 'income' THEN TotalCents ELSE 0 END) AS IncomeCents,
    SUM(CASE WHEN Type = 'expense' THEN TotalCents ELSE 0 END) AS ExpenseCents,
    SUM(CASE WHEN Type = 'income' THEN TotalCents ELSE -TotalCents END) AS BalanceCents
FROM vw_MonthlySummary
GROUP BY Month;
GO

-- View: Subcategory drill-down within a parent category
-- Trip-linked transactions use trip start date for month attribution
CREATE VIEW vw_SubcategorySummary AS
SELECT
    FORMAT(
      CASE WHEN t.TripID IS NOT NULL THEN tripAgg.TripStartDate ELSE t.TransactionDate END,
      'yyyy-MM'
    ) AS Month,
    COALESCE(c.ParentCategoryID, c.CategoryID) AS ParentCategoryID,
    t.CategoryID AS SubcategoryID,
    c.Name AS SubcategoryName,
    c.Icon AS SubcategoryIcon,
    c.Color AS SubcategoryColor,
    c.ParentCategoryID AS IsSubcategory,
    SUM(t.AmountCents) AS TotalCents,
    COUNT(*) AS TransactionCount
FROM Transactions t
INNER JOIN Categories c ON t.CategoryID = c.CategoryID
LEFT JOIN (
    SELECT TripID, MIN(TransactionDate) AS TripStartDate
    FROM Transactions WHERE TripID IS NOT NULL
    GROUP BY TripID
) tripAgg ON t.TripID = tripAgg.TripID
GROUP BY
    FORMAT(
      CASE WHEN t.TripID IS NOT NULL THEN tripAgg.TripStartDate ELSE t.TransactionDate END,
      'yyyy-MM'
    ),
    COALESCE(c.ParentCategoryID, c.CategoryID),
    t.CategoryID,
    c.Name,
    c.Icon,
    c.Color,
    c.ParentCategoryID;
GO

-- View: Fiscal quarterly data (raw data, calculations in TypeScript)
-- Used for Modelo 303 (IVA) and Modelo 130 (IRPF) reports
CREATE VIEW vw_FiscalQuarterly AS
SELECT
    YEAR(t.TransactionDate) AS FiscalYear,
    DATEPART(QUARTER, t.TransactionDate) AS FiscalQuarter,
    t.Type,
    t.TransactionID,
    t.CategoryID,
    c.Name AS CategoryName,
    COALESCE(parent.Name, c.Name) AS ParentCategoryName,
    t.TransactionDate,
    t.VendorName,
    t.InvoiceNumber,
    t.Description,
    COALESCE(t.OriginalAmountCents, t.AmountCents) AS FullAmountCents,
    ISNULL(t.VatPercent, 0) AS VatPercent,
    ISNULL(t.DeductionPercent, 0) AS DeductionPercent
FROM Transactions t
INNER JOIN Categories c ON t.CategoryID = c.CategoryID
LEFT JOIN Categories parent ON c.ParentCategoryID = parent.CategoryID
WHERE t.VatPercent IS NOT NULL OR t.DeductionPercent IS NOT NULL
    OR t.InvoiceNumber IS NOT NULL;
GO

-- ============================================================
-- USER AUTHENTICATION TABLES (NextAuth compatible)
-- ============================================================

-- Users table for authentication and preferences
CREATE TABLE Users (
    UserID INT IDENTITY(1,1) PRIMARY KEY,
    Email NVARCHAR(255) NOT NULL UNIQUE,
    PasswordHash NVARCHAR(255) NULL,        -- NULL for OAuth users
    Name NVARCHAR(100) NULL,
    Image NVARCHAR(500) NULL,               -- Profile picture URL
    Locale NVARCHAR(5) DEFAULT 'es',        -- Language preference (es, en)
    EmailVerified DATETIME2 NULL,
    IsActive BIT DEFAULT 1,
    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 DEFAULT GETUTCDATE()
);

-- Indexes for user lookups
CREATE INDEX IX_Users_Email ON Users(Email);
CREATE INDEX IX_Users_Active ON Users(IsActive);

GO

-- NextAuth Accounts table for OAuth providers
CREATE TABLE Accounts (
    AccountID INT IDENTITY(1,1) PRIMARY KEY,
    UserID INT NOT NULL FOREIGN KEY REFERENCES Users(UserID) ON DELETE CASCADE,
    Type NVARCHAR(50) NOT NULL,             -- 'oauth', 'email', 'credentials'
    Provider NVARCHAR(50) NOT NULL,         -- 'google', 'credentials', etc.
    ProviderAccountId NVARCHAR(255) NOT NULL,
    RefreshToken NVARCHAR(MAX) NULL,
    AccessToken NVARCHAR(MAX) NULL,
    ExpiresAt INT NULL,
    TokenType NVARCHAR(50) NULL,
    Scope NVARCHAR(255) NULL,
    IdToken NVARCHAR(MAX) NULL,
    SessionState NVARCHAR(255) NULL,
    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 DEFAULT GETUTCDATE(),
    CONSTRAINT UQ_Provider_ProviderAccountId UNIQUE (Provider, ProviderAccountId)
);

CREATE INDEX IX_Accounts_UserID ON Accounts(UserID);

GO

-- NextAuth Sessions table
CREATE TABLE Sessions (
    SessionID INT IDENTITY(1,1) PRIMARY KEY,
    UserID INT NOT NULL FOREIGN KEY REFERENCES Users(UserID) ON DELETE CASCADE,
    SessionToken NVARCHAR(255) NOT NULL UNIQUE,
    Expires DATETIME2 NOT NULL,
    CreatedAt DATETIME2 DEFAULT GETUTCDATE()
);

CREATE INDEX IX_Sessions_SessionToken ON Sessions(SessionToken);
CREATE INDEX IX_Sessions_UserID ON Sessions(UserID);

GO

-- NextAuth Verification Tokens for email verification
CREATE TABLE VerificationTokens (
    Identifier NVARCHAR(255) NOT NULL,
    Token NVARCHAR(255) NOT NULL UNIQUE,
    Expires DATETIME2 NOT NULL,
    PRIMARY KEY (Identifier, Token)
);

GO

-- ============================================================
-- TRIGGERS (Auto-update UpdatedAt timestamps)
-- ============================================================

CREATE TRIGGER TR_Categories_UpdatedAt
ON Categories
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE Categories
    SET UpdatedAt = GETUTCDATE()
    FROM Categories c
    INNER JOIN inserted i ON c.CategoryID = i.CategoryID;
END;
GO

CREATE TRIGGER TR_Transactions_UpdatedAt
ON Transactions
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE Transactions
    SET UpdatedAt = GETUTCDATE()
    FROM Transactions t
    INNER JOIN inserted i ON t.TransactionID = i.TransactionID;
END;
GO

CREATE TRIGGER TR_Users_UpdatedAt
ON Users
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE Users
    SET UpdatedAt = GETUTCDATE()
    FROM Users u
    INNER JOIN inserted i ON u.UserID = i.UserID;
END;
GO

CREATE TRIGGER TR_Accounts_UpdatedAt
ON Accounts
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE Accounts
    SET UpdatedAt = GETUTCDATE()
    FROM Accounts a
    INNER JOIN inserted i ON a.AccountID = i.AccountID;
END;
GO

CREATE TRIGGER TR_Trips_UpdatedAt
ON Trips
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE Trips
    SET UpdatedAt = GETUTCDATE()
    FROM Trips t
    INNER JOIN inserted i ON t.TripID = i.TripID;
END;
GO

CREATE TRIGGER TR_RecurringExpenses_UpdatedAt
ON RecurringExpenses
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE RecurringExpenses
    SET UpdatedAt = GETUTCDATE()
    FROM RecurringExpenses r
    INNER JOIN inserted i ON r.RecurringExpenseID = i.RecurringExpenseID;
END;
GO

-- ============================================================
-- SCHEMA COMPLETE
-- Run seed.sql next to populate initial categories
-- ============================================================
