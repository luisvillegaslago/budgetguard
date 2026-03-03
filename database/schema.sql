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
GO

-- Drop views (they depend on tables)
IF OBJECT_ID('vw_MonthlyBalance', 'V') IS NOT NULL DROP VIEW vw_MonthlyBalance;
IF OBJECT_ID('vw_MonthlySummary', 'V') IS NOT NULL DROP VIEW vw_MonthlySummary;
GO

-- Drop tables with foreign keys first
DROP TABLE IF EXISTS VerificationTokens;
DROP TABLE IF EXISTS Sessions;
DROP TABLE IF EXISTS Accounts;
DROP TABLE IF EXISTS Transactions;

-- Drop base tables
DROP TABLE IF EXISTS Users;
DROP TABLE IF EXISTS Categories;
GO

-- ============================================================
-- CORE TABLES (Finance)
-- ============================================================

-- Categories table for organizing transactions
CREATE TABLE Categories (
    CategoryID INT IDENTITY(1,1) PRIMARY KEY,
    Name NVARCHAR(100) NOT NULL,
    Type NVARCHAR(10) NOT NULL CHECK (Type IN ('income', 'expense')),
    Icon NVARCHAR(50) NULL,           -- Lucide icon name
    Color NVARCHAR(7) NULL,           -- Hex color (#4F46E5)
    SortOrder INT DEFAULT 0,
    IsActive BIT DEFAULT 1,
    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 DEFAULT GETUTCDATE()
);

-- Indexes for category lookups
CREATE INDEX IX_Categories_Type ON Categories(Type);
CREATE INDEX IX_Categories_Active ON Categories(IsActive);

-- Transactions table for income and expenses
-- IMPORTANT: AmountCents stores money in cents to avoid floating point errors
-- Example: €419.28 is stored as 41928
CREATE TABLE Transactions (
    TransactionID INT IDENTITY(1,1) PRIMARY KEY,
    CategoryID INT NOT NULL FOREIGN KEY REFERENCES Categories(CategoryID),
    AmountCents INT NOT NULL,         -- Stored in cents (41928 = €419.28)
    Description NVARCHAR(255) NULL,
    TransactionDate DATE NOT NULL,
    Type NVARCHAR(10) NOT NULL CHECK (Type IN ('income', 'expense')),
    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 DEFAULT GETUTCDATE()
);

-- Indexes for efficient querying by date and type
CREATE INDEX IX_Transactions_Date ON Transactions(TransactionDate);
CREATE INDEX IX_Transactions_Type_Date ON Transactions(Type, TransactionDate);
CREATE INDEX IX_Transactions_Category ON Transactions(CategoryID);
CREATE INDEX IX_Transactions_YearMonth ON Transactions(TransactionDate) INCLUDE (Type, AmountCents, CategoryID);

GO

-- ============================================================
-- VIEWS (Pre-calculated aggregations)
-- ============================================================

-- View: Monthly summary by category
-- All calculations done in SQL, not in client JavaScript
CREATE VIEW vw_MonthlySummary AS
SELECT
    FORMAT(t.TransactionDate, 'yyyy-MM') AS Month,
    t.Type,
    t.CategoryID,
    c.Name AS CategoryName,
    c.Icon AS CategoryIcon,
    c.Color AS CategoryColor,
    SUM(t.AmountCents) AS TotalCents,
    COUNT(*) AS TransactionCount
FROM Transactions t
INNER JOIN Categories c ON t.CategoryID = c.CategoryID
GROUP BY
    FORMAT(t.TransactionDate, 'yyyy-MM'),
    t.Type,
    t.CategoryID,
    c.Name,
    c.Icon,
    c.Color;
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

-- ============================================================
-- SCHEMA COMPLETE
-- Run seed.sql next to populate initial categories
-- ============================================================
