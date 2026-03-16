# BudgetGuard Data Models

This document describes all data models used in BudgetGuard: database schema, TypeScript interfaces, Zod validation schemas, and constants.

---

## Database Schema (SQL Server)

### Core Tables

#### Categories

Organizes transactions into income and expense categories. Supports hierarchical subcategories via a self-referencing foreign key (`ParentCategoryID`).

```sql
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
    DefaultVatPercent DECIMAL(5,2) NULL,    -- Default VAT % for fiscal module (0-100)
    DefaultDeductionPercent DECIMAL(5,2) NULL, -- Default deduction % for fiscal module (0-100)
    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 DEFAULT GETUTCDATE(),
    CONSTRAINT FK_Categories_Parent FOREIGN KEY (ParentCategoryID)
        REFERENCES Categories(CategoryID) ON DELETE NO ACTION
);
```

| Column | Type | Description |
|--------|------|-------------|
| `CategoryID` | INT | Auto-increment primary key |
| `Name` | NVARCHAR(100) | Category display name |
| `Type` | NVARCHAR(10) | `'income'` or `'expense'` |
| `Icon` | NVARCHAR(50) | Lucide React icon name |
| `Color` | NVARCHAR(7) | Hex color for UI (#4F46E5) |
| `SortOrder` | INT | Display order in lists |
| `IsActive` | BIT | Soft delete flag |
| `ParentCategoryID` | INT NULL | Self-referencing FK. `NULL` = top-level parent category. Non-null = subcategory pointing to its parent |
| `DefaultShared` | BIT | When `1`, the shared expense checkbox is pre-checked in forms for this category |
| `DefaultVatPercent` | DECIMAL(5,2) NULL | Default VAT percentage (0-100) applied to transactions in this category. Pre-fills the VAT field in transaction forms. Used by fiscal module |
| `DefaultDeductionPercent` | DECIMAL(5,2) NULL | Default tax deduction percentage (0-100) for this category. Pre-fills the deduction field in transaction forms. Used by fiscal module |

**Hierarchy rules:**
- A category with `ParentCategoryID = NULL` is a top-level (parent) category.
- A category with `ParentCategoryID` set is a subcategory. Subcategories inherit their parent's `Type`.
- Only one level of nesting is supported (no grandchildren).

---

#### Trips

Multi-day travel expense tracking. Trip expenses are regular transactions linked via a `TripID` foreign key.

```sql
CREATE TABLE Trips (
    TripID INT IDENTITY(1,1) PRIMARY KEY,
    Name NVARCHAR(100) NOT NULL,
    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 DEFAULT GETUTCDATE()
);
```

| Column | Type | Description |
|--------|------|-------------|
| `TripID` | INT | Auto-increment primary key |
| `Name` | NVARCHAR(100) | Trip display name (e.g., "Sierra Nevada 2025") |
| `CreatedAt` | DATETIME2 | Creation timestamp |
| `UpdatedAt` | DATETIME2 | Last modification timestamp |

**Design note:** Trips are intentionally minimal. All expense data (amounts, categories, dates) lives on the linked `Transactions` rows. Aggregated data (expense count, total, date range, category summary) is calculated at query time in `TripRepository`.

**SQL View integration:** `vw_MonthlySummary` and `vw_SubcategorySummary` aggregate trip transactions under the trip's earliest expense date (not the individual transaction date), ensuring all trip expenses appear in the same month.

---

#### TransactionGroups

Minimal identity anchor for linking related transactions (e.g., an outing with multiple subcategory expenses). The group's description and date are derived from the transactions themselves.

```sql
CREATE TABLE TransactionGroups (
    TransactionGroupID INT IDENTITY(1,1) PRIMARY KEY,
    CreatedAt DATETIME2 DEFAULT GETUTCDATE()
);
```

| Column | Type | Description |
|--------|------|-------------|
| `TransactionGroupID` | INT | Auto-increment primary key |
| `CreatedAt` | DATETIME2 | Group creation timestamp |

**Design note:** This table is intentionally minimal. All meaningful data (description, date, amounts) lives on the individual `Transactions` rows that reference the group. This avoids data duplication and keeps the group as a pure linking mechanism.

---

#### Transactions

Records all income and expense transactions. Supports shared expense splitting and grouping.

```sql
CREATE TABLE Transactions (
    TransactionID INT IDENTITY(1,1) PRIMARY KEY,
    CategoryID INT NOT NULL FOREIGN KEY REFERENCES Categories(CategoryID),
    AmountCents INT NOT NULL,         -- Effective amount (halved if shared) in cents
    Description NVARCHAR(255) NULL,
    TransactionDate DATE NOT NULL,
    Type NVARCHAR(10) NOT NULL CHECK (Type IN ('income', 'expense')),
    SharedDivisor TINYINT DEFAULT 1 NOT NULL, -- 1=personal, 2=split-by-2, etc.
    OriginalAmountCents INT NULL,     -- Full amount before division (NULL if not shared)
    TransactionGroupID INT NULL,      -- FK to TransactionGroups (NULL if standalone)
    TripID INT NULL,                 -- FK to Trips (NULL if not a trip expense)
    RecurringExpenseID INT NULL,      -- FK to RecurringExpenses (NULL if not from recurring)
    VatPercent DECIMAL(5,2) NULL,    -- VAT percentage for fiscal module (0-100)
    DeductionPercent DECIMAL(5,2) NULL, -- Tax deduction percentage for fiscal module (0-100)
    VendorName NVARCHAR(255) NULL,   -- Vendor/supplier name for fiscal tracking
    InvoiceNumber NVARCHAR(100) NULL, -- Invoice or receipt reference number
    Status VARCHAR(15) NOT NULL DEFAULT 'paid' CHECK (Status IN ('paid', 'pending', 'cancelled')),
    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 DEFAULT GETUTCDATE(),
    CONSTRAINT FK_Transactions_TransactionGroup
        FOREIGN KEY (TransactionGroupID) REFERENCES TransactionGroups(TransactionGroupID),
    CONSTRAINT FK_Transactions_Trip
        FOREIGN KEY (TripID) REFERENCES Trips(TripID),
    CONSTRAINT FK_Transactions_RecurringExpense
        FOREIGN KEY (RecurringExpenseID) REFERENCES RecurringExpenses(RecurringExpenseID)
);
```

| Column | Type | Description |
|--------|------|-------------|
| `TransactionID` | INT | Auto-increment primary key |
| `CategoryID` | INT | Foreign key to Categories |
| `AmountCents` | INT | Effective amount in cents (41928 = 419.28). If shared, this is the split amount |
| `Description` | NVARCHAR(255) | Optional description |
| `TransactionDate` | DATE | Date of transaction |
| `Type` | NVARCHAR(10) | `'income'` or `'expense'` |
| `SharedDivisor` | TINYINT | `1` = personal (not shared), `2` = split between 2 people |
| `OriginalAmountCents` | INT NULL | Full amount before division. `NULL` when `SharedDivisor = 1` |
| `TransactionGroupID` | INT NULL | FK to `TransactionGroups`. `NULL` for standalone transactions |
| `TripID` | INT NULL | FK to `Trips`. `NULL` if not a trip expense |
| `RecurringExpenseID` | INT NULL | FK to `RecurringExpenses`. `NULL` if not generated from a recurring rule |
| `VatPercent` | DECIMAL(5,2) NULL | VAT percentage applied to this transaction (0-100). Used by fiscal module for Modelo 303 calculations |
| `DeductionPercent` | DECIMAL(5,2) NULL | Tax deduction percentage (0-100). Used by fiscal module for Modelo 130 calculations |
| `VendorName` | NVARCHAR(255) NULL | Vendor or supplier name. Used for fiscal invoice tracking |
| `InvoiceNumber` | NVARCHAR(100) NULL | Invoice or receipt reference number. Used to identify invoiced transactions in fiscal reports |
| `Status` | VARCHAR(15) | Payment status: `'paid'` (default), `'pending'`, or `'cancelled'`. Pending/cancelled transactions are excluded from summary views and fiscal reports |

**Important**: `AmountCents` stores money as integers to avoid floating point precision errors. When a transaction is shared (`SharedDivisor = 2`), `AmountCents` contains the halved amount and `OriginalAmountCents` preserves the full original.

**Shared expense example:**
- User enters 100.00 for a shared dinner
- `OriginalAmountCents = 10000` (full amount)
- `SharedDivisor = 2`
- `AmountCents = 5000` (effective half, used in all views/summaries)

---

#### RecurringExpenses

Rules defining recurring expenses (monthly rent, subscriptions, weekly groceries, etc.). Each rule generates individual occurrences that can be confirmed or skipped.

```sql
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
```

| Column | Type | Description |
|--------|------|-------------|
| `RecurringExpenseID` | INT | Auto-increment primary key |
| `CategoryID` | INT | Foreign key to Categories |
| `AmountCents` | INT | Effective amount in cents (halved if shared) |
| `Description` | NVARCHAR(255) | Optional description (e.g., "Netflix subscription") |
| `Frequency` | NVARCHAR(10) | `'weekly'`, `'monthly'`, or `'yearly'` |
| `DayOfWeek` | TINYINT NULL | 0-6 (Sun-Sat). Required when `Frequency = 'weekly'` |
| `DayOfMonth` | TINYINT NULL | 1-31. Required when `Frequency = 'monthly'` or `'yearly'` |
| `MonthOfYear` | TINYINT NULL | 1-12. Required when `Frequency = 'yearly'` |
| `StartDate` | DATE | When the recurring expense begins |
| `EndDate` | DATE NULL | When it ends. `NULL` = indefinite |
| `IsActive` | BIT | Whether this rule is currently active |
| `SharedDivisor` | TINYINT | Same semantics as Transactions (`1` = personal, `2` = split) |
| `OriginalAmountCents` | INT NULL | Full amount before division (when shared) |

**Constraint logic:**
- `weekly` frequency requires `DayOfWeek` to be set
- `monthly` frequency requires `DayOfMonth` to be set
- `yearly` frequency requires both `DayOfMonth` and `MonthOfYear` to be set

---

#### RecurringExpenseOccurrences

Tracks individual occurrence dates for recurring expenses. Each occurrence starts as `'pending'` and can be confirmed (creating a transaction) or skipped.

```sql
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
```

| Column | Type | Description |
|--------|------|-------------|
| `OccurrenceID` | INT | Auto-increment primary key |
| `RecurringExpenseID` | INT | FK to RecurringExpenses (CASCADE delete) |
| `OccurrenceDate` | DATE | The specific date for this occurrence |
| `Status` | NVARCHAR(10) | `'pending'`, `'confirmed'`, or `'skipped'` |
| `TransactionID` | INT NULL | FK to the created Transaction (SET NULL on delete). Populated when `Status = 'confirmed'` |
| `ModifiedAmountCents` | INT NULL | Override amount if different from the rule's default |
| `ProcessedAt` | DATETIME2 NULL | When the occurrence was confirmed or skipped |

**Lifecycle:**
1. Occurrences are generated as `'pending'` for upcoming dates
2. User confirms (creates a Transaction, links it via `TransactionID`) or skips
3. `ProcessedAt` is set when the status changes from `'pending'`

**Cascade behavior:**
- Deleting a `RecurringExpense` cascades to all its occurrences
- Deleting a `Transaction` sets the occurrence's `TransactionID` to NULL (preserves occurrence record)

---

### User Authentication Tables

#### Users

User accounts with authentication and preferences.

```sql
CREATE TABLE Users (
    UserID INT IDENTITY(1,1) PRIMARY KEY,
    Email NVARCHAR(255) NOT NULL UNIQUE,
    PasswordHash NVARCHAR(255) NULL,        -- NULL for OAuth users
    Name NVARCHAR(100) NULL,
    Image NVARCHAR(500) NULL,               -- Profile picture URL
    Locale NVARCHAR(5) DEFAULT 'es',        -- Language preference
    EmailVerified DATETIME2 NULL,
    IsActive BIT DEFAULT 1,
    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 DEFAULT GETUTCDATE()
);
```

| Column | Type | Description |
|--------|------|-------------|
| `UserID` | INT | Auto-increment primary key |
| `Email` | NVARCHAR(255) | Unique email address |
| `PasswordHash` | NVARCHAR(255) | Bcrypt hash (NULL for OAuth) |
| `Locale` | NVARCHAR(5) | Language: `'es'` or `'en'` |
| `EmailVerified` | DATETIME2 | Verification timestamp |

---

### NextAuth Tables

#### Accounts

OAuth provider accounts linked to users.

```sql
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
```

#### Sessions

Active user sessions.

```sql
CREATE TABLE Sessions (
    SessionID INT IDENTITY(1,1) PRIMARY KEY,
    UserID INT NOT NULL FOREIGN KEY REFERENCES Users(UserID) ON DELETE CASCADE,
    SessionToken NVARCHAR(255) NOT NULL UNIQUE,
    Expires DATETIME2 NOT NULL,
    CreatedAt DATETIME2 DEFAULT GETUTCDATE()
);
```

#### VerificationTokens

Email verification tokens.

```sql
CREATE TABLE VerificationTokens (
    Identifier NVARCHAR(255) NOT NULL,
    Token NVARCHAR(255) NOT NULL UNIQUE,
    Expires DATETIME2 NOT NULL,
    PRIMARY KEY (Identifier, Token)
);
```

---

### Companies & Invoicing Tables

#### Companies

Normalized vendor/client data for transactions and fiscal billing. Each company is scoped to a user and has a role (`'client'` or `'provider'`).

```sql
CREATE TABLE "Companies" (
    "CompanyID" SERIAL PRIMARY KEY,
    "Name" VARCHAR(150) NOT NULL,
    "TradingName" VARCHAR(150) NULL,        -- Commercial/brand name
    "TaxId" VARCHAR(30) NULL,               -- NIF/CIF/VAT number
    "Address" VARCHAR(250) NULL,
    "City" VARCHAR(100) NULL,
    "PostalCode" VARCHAR(20) NULL,
    "Country" VARCHAR(100) NULL,
    "InvoiceLanguage" VARCHAR(5) NULL DEFAULT 'es', -- Language for invoices
    "Role" VARCHAR(10) NOT NULL DEFAULT 'client',
    "UserID" INT NULL,
    "IsActive" BOOLEAN DEFAULT TRUE,
    "CreatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UQ_Company_Name_User" UNIQUE("Name", "UserID"),
    CONSTRAINT "CK_Companies_Role" CHECK ("Role" IN ('client', 'provider'))
);
```

| Column | Type | Description |
|--------|------|-------------|
| `CompanyID` | SERIAL | Auto-increment primary key |
| `Name` | VARCHAR(150) | Legal company name (unique per user) |
| `TradingName` | VARCHAR(150) NULL | Commercial or brand name |
| `TaxId` | VARCHAR(30) NULL | Tax identification number (NIF/CIF/VAT) |
| `Address` | VARCHAR(250) NULL | Street address |
| `City` | VARCHAR(100) NULL | City |
| `PostalCode` | VARCHAR(20) NULL | Postal/ZIP code |
| `Country` | VARCHAR(100) NULL | Country |
| `InvoiceLanguage` | VARCHAR(5) NULL | Language for generated invoices (`'es'`, `'en'`) |
| `Role` | VARCHAR(10) | `'client'` (invoice recipient) or `'provider'` (expense vendor) |
| `UserID` | INT NULL | FK to Users (scoped per user) |
| `IsActive` | BOOLEAN | Soft delete flag |

**Design note:** Companies are referenced by `Transactions.CompanyID`, `RecurringExpenses.CompanyID`, and `Invoices.CompanyID`. A trigger (`TR_Transactions_SyncVendorName`) syncs the company name to `VendorName` on linked rows.

---

#### UserBillingProfiles

Stores the user's billing identity (issuer data) for invoice generation. One profile per user.

```sql
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
```

| Column | Type | Description |
|--------|------|-------------|
| `BillingProfileID` | SERIAL | Auto-increment primary key |
| `UserID` | INT | FK to Users (UNIQUE -- one profile per user) |
| `FullName` | VARCHAR(150) | Full legal name of the biller |
| `Nif` | VARCHAR(30) | Tax identification number (NIF) |
| `Address` | VARCHAR(500) NULL | Biller street address |
| `Phone` | VARCHAR(30) NULL | Contact phone number |
| `PaymentMethod` | VARCHAR(20) | `'bank_transfer'`, `'paypal'`, or `'other'` |
| `BankName` | VARCHAR(150) NULL | Bank name (for bank transfer) |
| `Iban` | VARCHAR(34) NULL | IBAN number |
| `Swift` | VARCHAR(11) NULL | SWIFT/BIC code |
| `BankAddress` | VARCHAR(500) NULL | Bank branch address |
| `DefaultHourlyRateCents` | INT NULL | Default hourly rate in cents for invoice line items |

---

#### InvoicePrefixes

Invoice numbering series. Each prefix tracks its next sequential number. Can be linked to a specific company for auto-selection.

```sql
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
```

| Column | Type | Description |
|--------|------|-------------|
| `PrefixID` | SERIAL | Auto-increment primary key |
| `Prefix` | VARCHAR(10) | Series prefix string (e.g., `'FAC'`, `'INV'`). Unique per user |
| `NextNumber` | INT | Next sequential number to assign (auto-incremented on invoice creation) |
| `Description` | VARCHAR(100) NULL | Optional description of the series |
| `UserID` | INT | FK to Users |
| `CompanyID` | INT NULL | FK to Companies. If set, this prefix is auto-selected when invoicing this company |
| `IsActive` | BOOLEAN | Whether this prefix series is available for new invoices |

---

#### Invoices

Issued invoices with frozen biller and client snapshots. Status machine: `draft` → `finalized` → `paid` → `cancelled`. Also: `finalized` → `draft` (revert), `cancelled` → `draft` (revert).

```sql
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
```

| Column | Type | Description |
|--------|------|-------------|
| `InvoiceID` | SERIAL | Auto-increment primary key |
| `PrefixID` | INT | FK to InvoicePrefixes (determines numbering series) |
| `InvoiceNumber` | VARCHAR(20) | Full invoice number (e.g., `'FAC-0001'`). Unique per user |
| `InvoiceDate` | DATE | Invoice issue date |
| `CompanyID` | INT NULL | FK to Companies (the client). SET NULL on company deletion |
| `TransactionID` | INT NULL | FK to Transactions. Created when invoice is marked as paid |
| `TotalCents` | INT | Sum of all line item amounts in cents |
| `Currency` | VARCHAR(3) | Currency code (default `'EUR'`) |
| `Status` | VARCHAR(15) | `'draft'`, `'finalized'`, `'paid'`, or `'cancelled'` |
| `BillerName` | VARCHAR(150) | Snapshot of biller's full name at invoice creation |
| `BillerNif` | VARCHAR(30) | Snapshot of biller's NIF |
| `BillerAddress` | VARCHAR(500) NULL | Snapshot of biller's address |
| `BillerPhone` | VARCHAR(30) NULL | Snapshot of biller's phone |
| `BillerPaymentMethod` | VARCHAR(20) | Snapshot of biller's payment method |
| `BillerBankName` | VARCHAR(150) NULL | Snapshot of biller's bank name |
| `BillerIban` | VARCHAR(34) NULL | Snapshot of biller's IBAN |
| `BillerSwift` | VARCHAR(11) NULL | Snapshot of biller's SWIFT code |
| `BillerBankAddress` | VARCHAR(500) NULL | Snapshot of biller's bank address |
| `ClientName` | VARCHAR(150) | Snapshot of client's legal name |
| `ClientTradingName` | VARCHAR(150) NULL | Snapshot of client's trading name |
| `ClientTaxId` | VARCHAR(30) NULL | Snapshot of client's tax ID |
| `ClientAddress` | VARCHAR(250) NULL | Snapshot of client's address |
| `ClientCity` | VARCHAR(100) NULL | Snapshot of client's city |
| `ClientPostalCode` | VARCHAR(20) NULL | Snapshot of client's postal code |
| `ClientCountry` | VARCHAR(100) NULL | Snapshot of client's country |
| `Notes` | TEXT NULL | Free-form notes (shown on invoice PDF) |
| `UserID` | INT | FK to Users |

**Design note:** Biller and client data are snapshotted at invoice creation time. This ensures the invoice remains legally accurate even if the company or billing profile is later modified. Marking an invoice as `'paid'` atomically creates an income Transaction.

---

#### InvoiceLineItems

Individual line items (concepts) within an invoice. Supports hourly billing with hours and hourly rate, or fixed-amount items.

```sql
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
```

| Column | Type | Description |
|--------|------|-------------|
| `LineItemID` | SERIAL | Auto-increment primary key |
| `InvoiceID` | INT | FK to Invoices (CASCADE delete -- line items are deleted with their invoice) |
| `SortOrder` | INT | Display order within the invoice |
| `Description` | VARCHAR(500) | Description of the service or product |
| `Hours` | NUMERIC(8,2) NULL | Number of hours (for hourly billing). NULL for fixed-amount items |
| `HourlyRateCents` | INT NULL | Rate per hour in cents. NULL for fixed-amount items |
| `AmountCents` | INT | Line item total in cents. When hours and rate are set: `Math.round(Hours * HourlyRateCents)` |

---

### Fiscal Document Tables

#### FiscalDocuments

Uploaded tax filings (modelos) and received/issued invoices stored as files (via Vercel Blob).

```sql
CREATE TABLE "FiscalDocuments" (
    "DocumentID" SERIAL PRIMARY KEY,
    "UserID" INT NOT NULL REFERENCES "Users"("UserID"),
    "DocumentType" VARCHAR(20) NOT NULL
        CHECK ("DocumentType" IN ('modelo', 'factura_recibida', 'factura_emitida')),
    "ModeloType" VARCHAR(10) NULL
        CHECK ("ModeloType" IN ('303', '130', '390', '100')),
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
    -- OCR-extracted metadata (populated after extraction, stored for filtering/display)
    "DocumentDate" DATE NULL,
    "VendorName" VARCHAR(255) NULL,
    -- NOTE: DisplayName is NOT stored. It is computed at query time via SQL COALESCE
    --   in FiscalDocumentRepository.ts: Company.Name > VendorName > FileName
    -- Traceability
    "TransactionID" INT NULL REFERENCES "Transactions"("TransactionID") ON DELETE SET NULL,
    "TransactionGroupID" INT NULL,
    "CompanyID" INT NULL REFERENCES "Companies"("CompanyID") ON DELETE SET NULL,
    "Description" VARCHAR(255) NULL,
    "CreatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CK_FiscalDoc_ModeloType" CHECK (
        ("DocumentType" = 'modelo' AND "ModeloType" IS NOT NULL)
        OR ("DocumentType" IN ('factura_recibida', 'factura_emitida') AND "ModeloType" IS NULL)
    ),
    CONSTRAINT "CK_FiscalDoc_Quarter" CHECK (
        ("ModeloType" IN ('390', '100') AND "FiscalQuarter" IS NULL)
        OR ("ModeloType" IN ('303', '130') AND "FiscalQuarter" IS NOT NULL)
        OR "ModeloType" IS NULL
    )
);
```

| Column | Type | Description |
|--------|------|-------------|
| `DocumentID` | SERIAL | Auto-increment primary key |
| `UserID` | INT | FK to Users |
| `DocumentType` | VARCHAR(20) | `'modelo'` (tax form), `'factura_recibida'` (received invoice), or `'factura_emitida'` (issued invoice) |
| `ModeloType` | VARCHAR(10) NULL | `'303'`, `'130'`, `'390'`, or `'100'`. Required when `DocumentType = 'modelo'`, must be NULL otherwise |
| `FiscalYear` | INT | Tax year (e.g., `2025`) |
| `FiscalQuarter` | INT NULL | Quarter (1-4). Required for quarterly modelos (303, 130), NULL for annual modelos (390, 100) and facturas |
| `Status` | VARCHAR(20) | `'pending'`, `'filed'`, or `'postponed'` |
| `BlobUrl` | VARCHAR(500) | Vercel Blob download URL |
| `BlobPathname` | VARCHAR(300) | Vercel Blob storage path |
| `FileName` | VARCHAR(255) | Original file name |
| `FileSizeBytes` | INT | File size in bytes |
| `ContentType` | VARCHAR(100) | MIME type (e.g., `'application/pdf'`) |
| `TaxAmountCents` | INT NULL | Tax amount in cents (optional) |
| `DocumentDate` | DATE NULL | Invoice/document date extracted via OCR |
| `VendorName` | VARCHAR(255) NULL | Vendor name extracted via OCR (fallback when no linked Company) |
| `TransactionID` | INT NULL | FK to linked Transaction (SET NULL on delete) |
| `TransactionGroupID` | INT NULL | ID of linked transaction group |
| `CompanyID` | INT NULL | FK to linked Company (SET NULL on delete) |
| `Description` | VARCHAR(255) NULL | Optional description |

> **DisplayName (computed, not stored):** All SELECT queries in `FiscalDocumentRepository.ts` compute `DisplayName` at query time via a centralized `DISPLAY_NAME_SQL` constant using `COALESCE(Company.Name, VendorName, FileName)` with an optional ` - DocumentDate` suffix. It is never written to the database.

**Constraint logic:**
- `DocumentType = 'modelo'` requires `ModeloType` to be set; facturas must NOT have it
- Quarterly modelos (`303`, `130`) require `FiscalQuarter`; annual modelos (`390`, `100`) must have `FiscalQuarter = NULL`

---

#### FiscalDeadlineSettings

Per-user preferences for fiscal deadline reminders. One row per user.

```sql
CREATE TABLE "FiscalDeadlineSettings" (
    "SettingID" SERIAL PRIMARY KEY,
    "UserID" INT NOT NULL UNIQUE REFERENCES "Users"("UserID"),
    "ReminderDaysBefore" INT NOT NULL DEFAULT 7,
    "PostponementReminder" BOOLEAN NOT NULL DEFAULT TRUE,
    "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "CreatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

| Column | Type | Description |
|--------|------|-------------|
| `SettingID` | SERIAL | Auto-increment primary key |
| `UserID` | INT | FK to Users (UNIQUE -- one settings row per user) |
| `ReminderDaysBefore` | INT | Number of days before a deadline to show a reminder (default `7`) |
| `PostponementReminder` | BOOLEAN | Whether to show reminders for postponement-eligible deadlines |
| `IsActive` | BOOLEAN | Whether deadline reminders are enabled |

---

### Database Views

#### vw_MonthlySummary

Pre-calculated totals by **parent** category per month. Subcategory transactions aggregate under their parent category using `COALESCE(c.ParentCategoryID, c.CategoryID)`.

```sql
CREATE VIEW vw_MonthlySummary AS
SELECT
    FORMAT(t.TransactionDate, 'yyyy-MM') AS Month,
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
GROUP BY
    FORMAT(t.TransactionDate, 'yyyy-MM'),
    t.Type,
    COALESCE(c.ParentCategoryID, c.CategoryID),
    COALESCE(parent.Name, c.Name),
    COALESCE(parent.Icon, c.Icon),
    COALESCE(parent.Color, c.Color);
```

| Column | Description |
|--------|-------------|
| `Month` | Format: `'2025-01'` |
| `Type` | `'income'` or `'expense'` |
| `CategoryID` | Resolved to parent category ID (subcategory transactions roll up) |
| `CategoryName` | Parent category name |
| `CategoryIcon` | Parent category icon |
| `CategoryColor` | Parent category color |
| `TotalCents` | Sum of all transactions for this parent category |
| `TransactionCount` | Number of transactions |

---

#### vw_MonthlyBalance

Monthly totals for income, expenses, and balance. Derived from `vw_MonthlySummary`.

```sql
CREATE VIEW vw_MonthlyBalance AS
SELECT
    Month,
    SUM(CASE WHEN Type = 'income' THEN TotalCents ELSE 0 END) AS IncomeCents,
    SUM(CASE WHEN Type = 'expense' THEN TotalCents ELSE 0 END) AS ExpenseCents,
    SUM(CASE WHEN Type = 'income' THEN TotalCents ELSE -TotalCents END) AS BalanceCents
FROM vw_MonthlySummary
GROUP BY Month;
```

| Column | Description |
|--------|-------------|
| `IncomeCents` | Total income for month |
| `ExpenseCents` | Total expenses for month |
| `BalanceCents` | Net balance (can be negative) |

---

#### vw_SubcategorySummary

Drill-down view showing breakdown per subcategory within a parent category. Used for detailed category analysis.

```sql
CREATE VIEW vw_SubcategorySummary AS
SELECT
    FORMAT(t.TransactionDate, 'yyyy-MM') AS Month,
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
GROUP BY
    FORMAT(t.TransactionDate, 'yyyy-MM'),
    COALESCE(c.ParentCategoryID, c.CategoryID),
    t.CategoryID,
    c.Name,
    c.Icon,
    c.Color,
    c.ParentCategoryID;
```

| Column | Description |
|--------|-------------|
| `Month` | Format: `'2025-01'` |
| `ParentCategoryID` | The parent category this row belongs to |
| `SubcategoryID` | The specific subcategory (or parent if transaction is directly on parent) |
| `SubcategoryName` | Display name |
| `SubcategoryIcon` | Lucide icon name |
| `SubcategoryColor` | Hex color |
| `IsSubcategory` | `NULL` if this row represents the parent itself, non-null if a true subcategory |
| `TotalCents` | Sum of transactions for this subcategory |
| `TransactionCount` | Number of transactions |

---

#### vw_FiscalQuarterly

Quarterly fiscal aggregation for Spanish tax models (Modelo 303 and Modelo 130). Groups transactions by year and quarter, calculating VAT collected, VAT deductible, gross income, and deductible expenses.

```sql
CREATE VIEW vw_FiscalQuarterly AS
SELECT
    YEAR(t.TransactionDate) AS FiscalYear,
    DATEPART(QUARTER, t.TransactionDate) AS FiscalQuarter,
    t.Type,
    SUM(t.AmountCents) AS TotalCents,
    SUM(CASE
        WHEN t.VatPercent IS NOT NULL
        THEN CAST(t.AmountCents * t.VatPercent / 100.0 AS INT)
        ELSE 0
    END) AS VatCents,
    SUM(CASE
        WHEN t.DeductionPercent IS NOT NULL AND t.Type = 'expense'
        THEN CAST(t.AmountCents * t.DeductionPercent / 100.0 AS INT)
        ELSE 0
    END) AS DeductibleCents,
    COUNT(*) AS TransactionCount
FROM Transactions t
WHERE t.VatPercent IS NOT NULL OR t.DeductionPercent IS NOT NULL
GROUP BY
    YEAR(t.TransactionDate),
    DATEPART(QUARTER, t.TransactionDate),
    t.Type;
```

| Column | Description |
|--------|-------------|
| `FiscalYear` | Year (e.g., `2025`) |
| `FiscalQuarter` | Quarter (1-4) |
| `Type` | `'income'` or `'expense'` |
| `TotalCents` | Sum of all transaction amounts for this type and quarter |
| `VatCents` | Computed VAT amount based on each transaction's `VatPercent` |
| `DeductibleCents` | Computed deductible amount for expenses based on `DeductionPercent` |
| `TransactionCount` | Number of transactions with fiscal fields |

---

### Triggers

Auto-update `UpdatedAt` timestamps on all tables:

```sql
CREATE TRIGGER TR_Categories_UpdatedAt ON Categories AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE Categories SET UpdatedAt = GETUTCDATE()
    FROM Categories c INNER JOIN inserted i ON c.CategoryID = i.CategoryID;
END;

-- Similar triggers for: Transactions, Users, Accounts, RecurringExpenses
```

---

### Indexes

```sql
-- Categories
CREATE INDEX IX_Categories_Type ON Categories(Type);
CREATE INDEX IX_Categories_Active ON Categories(IsActive);
CREATE INDEX IX_Categories_Parent ON Categories(ParentCategoryID);

-- Transactions
CREATE INDEX IX_Transactions_Date ON Transactions(TransactionDate);
CREATE INDEX IX_Transactions_Type_Date ON Transactions(Type, TransactionDate);
CREATE INDEX IX_Transactions_Category ON Transactions(CategoryID);
CREATE INDEX IX_Transactions_YearMonth ON Transactions(TransactionDate)
    INCLUDE (Type, AmountCents, CategoryID);
CREATE INDEX IX_Transactions_Shared ON Transactions(SharedDivisor);
CREATE INDEX IX_Transactions_TransactionGroup ON Transactions(TransactionGroupID);
CREATE INDEX IX_Transactions_TripID ON Transactions(TripID);
CREATE INDEX IX_Transactions_RecurringExpense ON Transactions(RecurringExpenseID);

-- RecurringExpenses
CREATE INDEX IX_RecurringExpenses_Active ON RecurringExpenses(IsActive);
CREATE INDEX IX_RecurringExpenses_Category ON RecurringExpenses(CategoryID);

-- RecurringExpenseOccurrences
CREATE INDEX IX_Occurrences_Status ON RecurringExpenseOccurrences(Status);
CREATE INDEX IX_Occurrences_Date ON RecurringExpenseOccurrences(OccurrenceDate);

-- Users
CREATE INDEX IX_Users_Email ON Users(Email);
CREATE INDEX IX_Users_Active ON Users(IsActive);

-- Accounts
CREATE INDEX IX_Accounts_UserID ON Accounts(UserID);

-- Sessions
CREATE INDEX IX_Sessions_SessionToken ON Sessions(SessionToken);
CREATE INDEX IX_Sessions_UserID ON Sessions(UserID);
```

---

### Entity Relationship Diagram

```
Categories (self-referencing)
├── ParentCategoryID → Categories.CategoryID
│
├── Transactions
│   ├── CategoryID → Categories.CategoryID
│   ├── TransactionGroupID → TransactionGroups.TransactionGroupID
│   ├── TripID → Trips.TripID
│   └── RecurringExpenseID → RecurringExpenses.RecurringExpenseID
│
├── RecurringExpenses
│   └── CategoryID → Categories.CategoryID
│
└── RecurringExpenseOccurrences
    ├── RecurringExpenseID → RecurringExpenses.RecurringExpenseID (CASCADE)
    └── TransactionID → Transactions.TransactionID (SET NULL)

TransactionGroups ← Transactions.TransactionGroupID
Trips ← Transactions.TripID

Companies
├── Transactions.CompanyID → Companies.CompanyID (SET NULL)
├── RecurringExpenses.CompanyID → Companies.CompanyID (SET NULL)
├── Invoices.CompanyID → Companies.CompanyID (SET NULL)
├── InvoicePrefixes.CompanyID → Companies.CompanyID (SET NULL)
└── FiscalDocuments.CompanyID → Companies.CompanyID (SET NULL)

Users
├── Accounts.UserID → Users.UserID (CASCADE)
├── Sessions.UserID → Users.UserID (CASCADE)
├── UserBillingProfiles.UserID → Users.UserID (UNIQUE)
├── InvoicePrefixes.UserID → Users.UserID
├── Invoices.UserID → Users.UserID
├── FiscalDocuments.UserID → Users.UserID
└── FiscalDeadlineSettings.UserID → Users.UserID (UNIQUE)

Invoices
├── PrefixID → InvoicePrefixes.PrefixID
├── TransactionID → Transactions.TransactionID (SET NULL)
└── InvoiceLineItems.InvoiceID → Invoices.InvoiceID (CASCADE)
```

---

## TypeScript Interfaces

Located in `src/types/finance.ts`:

### Type Aliases

```typescript
// Re-exported from constants (single source of truth)
export type { TransactionType } from '@/constants/finance';      // 'income' | 'expense'
export type { RecurringFrequency } from '@/constants/finance';   // 'weekly' | 'monthly' | 'yearly'
export type { OccurrenceStatus } from '@/constants/finance';     // 'pending' | 'confirmed' | 'skipped'
export type { CompanyRole } from '@/constants/finance';          // 'client' | 'provider'
export type { InvoiceStatus } from '@/constants/finance';        // 'draft' | 'finalized' | 'paid' | 'cancelled'
export type { PaymentMethod } from '@/constants/finance';        // 'bank_transfer' | 'paypal' | 'other'
export type { FiscalDocumentType } from '@/constants/finance';   // 'modelo' | 'factura_recibida' | 'factura_emitida'
export type { ModeloType } from '@/constants/finance';           // '303' | '130' | '390' | '100'
export type { FiscalStatus } from '@/constants/finance';         // 'pending' | 'filed'
export type { FilingStatus } from '@/constants/finance';         // 'not_due' | 'upcoming' | 'due' | 'overdue' | 'filed'
```

### Category

```typescript
export interface Category {
  categoryId: number;
  name: string;
  type: TransactionType;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  parentCategoryId: number | null;   // NULL = parent category
  defaultShared: boolean;            // Auto-toggle shared checkbox
  defaultVatPercent: number | null;  // Default VAT % for fiscal module
  defaultDeductionPercent: number | null; // Default deduction % for fiscal module
  subcategories?: Category[];        // Populated client-side for tree rendering
}
```

### Transaction

```typescript
export interface Transaction {
  transactionId: number;
  categoryId: number;
  category?: Category;               // Joined from Categories table
  parentCategory?: { categoryId: number; name: string } | null; // Resolved parent
  amountCents: number;               // Effective amount (halved if shared)
  description: string | null;
  transactionDate: string;           // ISO date "2025-01-15"
  type: TransactionType;
  status: TransactionStatus;         // 'paid' | 'pending' | 'cancelled'
  sharedDivisor: number;             // 1=personal, 2=split-by-2
  originalAmountCents: number | null; // Full amount before division
  recurringExpenseId: number | null; // FK to RecurringExpenses
  transactionGroupId: number | null; // FK to TransactionGroups
  tripId: number | null;             // FK to Trips
  tripName: string | null;           // Trip name (joined from Trips table)
  vatPercent: number | null;         // VAT percentage for fiscal module
  deductionPercent: number | null;   // Tax deduction percentage for fiscal module
  vendorName: string | null;         // Vendor/supplier name for fiscal tracking
  invoiceNumber: string | null;      // Invoice or receipt reference number
  createdAt: string;                 // ISO datetime
  updatedAt: string;                 // ISO datetime
}
```

### RecurringExpense

```typescript
export interface RecurringExpense {
  recurringExpenseId: number;
  categoryId: number;
  category?: Category;
  amountCents: number;
  description: string | null;
  frequency: RecurringFrequency;      // 'weekly' | 'monthly' | 'yearly'
  dayOfWeek: number | null;           // 0-6 for weekly
  dayOfMonth: number | null;          // 1-31 for monthly/yearly
  monthOfYear: number | null;         // 1-12 for yearly
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  sharedDivisor: number;
  originalAmountCents: number | null;
  createdAt: string;
  updatedAt: string;
}
```

### RecurringExpenseInput

```typescript
export interface RecurringExpenseInput {
  categoryId: number;
  amount: number;                     // Euros (UI input, converted to cents before saving)
  description: string;
  frequency: RecurringFrequency;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  monthOfYear?: number | null;
  startDate: Date;
  endDate?: Date | null;
  isShared?: boolean;
}
```

### RecurringOccurrence

```typescript
export interface RecurringOccurrence {
  occurrenceId: number;
  recurringExpenseId: number;
  occurrenceDate: string;
  status: OccurrenceStatus;           // 'pending' | 'confirmed' | 'skipped'
  transactionId: number | null;
  modifiedAmountCents: number | null;
  processedAt: string | null;
  recurringExpense: RecurringExpense;  // Nested recurring rule
}
```

### Pending Occurrences (Grouped by Month)

```typescript
export interface PendingOccurrenceMonth {
  month: string;
  occurrences: RecurringOccurrence[];
  totalPendingCents: number;
  count: number;
}

export interface PendingOccurrencesSummary {
  months: PendingOccurrenceMonth[];
  totalCount: number;
}
```

### Transaction Groups

```typescript
// Derived grouping for UI display (not a direct DB row)
export interface TransactionGroupDisplay {
  transactionGroupId: number;
  description: string | null;
  transactionDate: string;
  parentCategoryName: string;
  parentCategoryIcon: string | null;
  parentCategoryColor: string | null;
  totalAmountCents: number;
  isShared: boolean;
  type: TransactionType;
  transactions: Transaction[];        // All transactions in this group
}

// Derived grouping of trip transactions for dashboard display
export interface TripGroupDisplay {
  tripId: number;
  tripName: string;
  startDate: string;               // min(transactionDate) of visible transactions
  totalAmountCents: number;
  type: TransactionType;
  transactions: Transaction[];      // Sorted chronologically (oldest first)
}

// Trip entity
export interface Trip {
  tripId: number;
  name: string;
  createdAt: string;
  updatedAt: string;
}

// Trip category summary (totals per category within a trip)
export interface TripCategorySummary {
  categoryId: number;
  categoryName: string;
  categoryIcon: string | null;
  categoryColor: string | null;
  totalCents: number;
  count: number;
}

// Trip with aggregated data for list view
export interface TripDisplay extends Trip {
  expenseCount: number;
  totalCents: number;
  startDate: string | null;         // Earliest expense date
  endDate: string | null;           // Latest expense date
  categorySummary: TripCategorySummary[];
}

// Trip with full expense details for detail view
export interface TripDetail extends Trip {
  expenses: Transaction[];
  categorySummary: TripCategorySummary[];
  totalCents: number;
  expenseCount: number;
}

// Input for creating a transaction group
export interface TransactionGroupInput {
  description: string;
  transactionDate: Date;
  type: TransactionType;
  isShared?: boolean;
  parentCategoryId: number;
  items: Array<{ categoryId: number; amount: number }>;
}

// Input for updating a transaction group (description and date only)
export interface TransactionGroupUpdateInput {
  description?: string;
  transactionDate?: Date;
}
```

### Fiscal Types

```typescript
// Transaction with computed fiscal fields (used in fiscal report)
export interface FiscalTransaction {
  transactionId: number;
  categoryId: number;
  categoryName: string;
  amountCents: number;
  vatPercent: number | null;
  vatAmountCents: number;           // Computed: amountCents * vatPercent / 100
  deductionPercent: number | null;
  deductibleAmountCents: number;    // Computed: amountCents * deductionPercent / 100
  vendorName: string | null;
  invoiceNumber: string | null;
  transactionDate: string;
  type: TransactionType;
}

// Modelo 303 (VAT) quarterly summary
export interface Modelo303Summary {
  vatCollected: number;             // Total VAT on income transactions (cents)
  vatDeductible: number;            // Total deductible VAT on expenses (cents)
  vatBalance: number;               // vatCollected - vatDeductible (cents)
}

// Modelo 130 (Income Tax) quarterly summary
export interface Modelo130Summary {
  grossIncome: number;              // Total income for quarter (cents)
  deductibleExpenses: number;       // Total deductible expenses (cents)
  netIncome: number;                // grossIncome - deductibleExpenses (cents)
  taxableBase: number;              // Base for tax calculation (cents)
  taxAmount: number;                // 20% of taxable base (cents)
}

// Full fiscal report for a quarter
export interface FiscalReport {
  year: number;
  quarter: number;
  modelo303: Modelo303Summary;
  modelo130: Modelo130Summary;
  expenses: FiscalTransaction[];    // Deductible expense transactions
  invoices: FiscalTransaction[];    // Transactions with invoiceNumber set
}

// Computed fiscal fields (returned by computeFiscalFields utility)
export interface FiscalComputedFields {
  vatAmountCents: number;           // amountCents * vatPercent / 100
  deductibleAmountCents: number;    // amountCents * deductionPercent / 100
  netAmountCents: number;           // amountCents - vatAmountCents
}
```

### Company

```typescript
export interface Company {
  companyId: number;
  name: string;
  tradingName: string | null;          // Commercial/brand name
  taxId: string | null;                // NIF/CIF/VAT number
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  invoiceLanguage: string | null;      // Language for invoices ('es', 'en')
  role: CompanyRole;                   // 'client' or 'provider'
  isActive: boolean;
  createdAt: string;                   // ISO datetime
  updatedAt: string;                   // ISO datetime
}
```

### BillingProfile

```typescript
export interface BillingProfile {
  billingProfileId: number;
  fullName: string;                    // Biller's legal name
  nif: string;                         // Tax identification number
  address: string | null;
  phone: string | null;
  paymentMethod: PaymentMethod;        // 'bank_transfer' | 'paypal' | 'other'
  bankName: string | null;
  iban: string | null;
  swift: string | null;
  bankAddress: string | null;
  defaultHourlyRateCents: number | null; // Default rate for invoice line items (cents)
  createdAt: string;
  updatedAt: string;
}
```

### InvoicePrefix

```typescript
export interface InvoicePrefix {
  prefixId: number;
  prefix: string;                      // Series prefix (e.g., 'FAC')
  nextNumber: number;                  // Next sequential number to assign
  description: string | null;
  companyId: number | null;            // Auto-select prefix for this company
  isActive: boolean;
  createdAt: string;
}
```

### Invoice

```typescript
export interface Invoice {
  invoiceId: number;
  prefixId: number;
  invoiceNumber: string;               // Full number (e.g., 'FAC-0001')
  invoiceDate: string;                 // ISO date
  companyId: number | null;            // FK to Companies
  transactionId: number | null;        // Created when marked as paid
  totalCents: number;                  // Sum of line items (cents)
  currency: string;                    // Currency code (default 'EUR')
  status: InvoiceStatus;               // 'draft' | 'finalized' | 'paid' | 'cancelled'
  // Biller snapshot
  billerName: string;
  billerNif: string;
  billerAddress: string | null;
  billerPhone: string | null;
  billerPaymentMethod: PaymentMethod;
  billerBankName: string | null;
  billerIban: string | null;
  billerSwift: string | null;
  billerBankAddress: string | null;
  // Client snapshot
  clientName: string;
  clientTradingName: string | null;
  clientTaxId: string | null;
  clientAddress: string | null;
  clientCity: string | null;
  clientPostalCode: string | null;
  clientCountry: string | null;
  // Metadata
  notes: string | null;
  invoiceLanguage: string | null;      // Language for PDF generation
  lineItems: InvoiceLineItem[];        // Nested line items
  createdAt: string;
  updatedAt: string;
}
```

### InvoiceLineItem

```typescript
export interface InvoiceLineItem {
  lineItemId: number;
  invoiceId: number;
  sortOrder: number;                   // Display order within invoice
  description: string;
  hours: number | null;                // For hourly billing
  hourlyRateCents: number | null;      // Rate per hour in cents
  amountCents: number;                 // Line total in cents
}
```

### InvoiceListItem

```typescript
export interface InvoiceListItem {
  invoiceId: number;
  invoiceNumber: string;
  invoiceDate: string;
  clientName: string;
  clientTradingName: string | null;
  totalCents: number;
  currency: string;
  status: InvoiceStatus;
}
```

### ExtractedInvoiceData

Data extracted from a fiscal document via OCR (all amounts in cents). This data is **transient** — used only in the UI flow, never persisted in the database.

```typescript
export interface ExtractedInvoiceData {
  totalAmountCents: number;            // Invoice total (cents, REQUIRED)
  baseAmountCents: number | null;      // Pre-tax amount
  taxAmountCents: number | null;       // Tax/VAT amount
  vatPercent: number | null;           // VAT percentage (e.g., 21)
  date: string | null;                 // Invoice date in YYYY-MM-DD format
  vendor: string | null;              // Vendor/company name
  invoiceNumber: string | null;       // Invoice or document number
  description: string | null;         // Brief description of purchase
  confidence: number;                  // OCR confidence 0.0 to 1.0
}
```

### FiscalDocument

```typescript
export interface FiscalDocument {
  documentId: number;
  documentType: FiscalDocumentType;    // 'modelo' | 'factura_recibida' | 'factura_emitida'
  modeloType: ModeloType | null;       // '303' | '130' | '390' | '100' (only for modelos)
  fiscalYear: number;
  fiscalQuarter: number | null;        // 1-4 for quarterly modelos, null otherwise
  status: FiscalStatus;                // 'pending' | 'filed'
  downloadUrl: string;                 // Vercel Blob URL (served via download proxy)
  fileName: string;                    // Original uploaded filename
  fileSizeBytes: number;
  contentType: string;                 // MIME type
  taxAmountCents: number | null;       // Confirmed amount (single source of truth, set after linking)
  documentDate: string | null;         // Invoice date extracted via OCR (stored as DATE, returned as ISO string)
  vendorName: string | null;           // Vendor name extracted via OCR (fallback when no linked Company)
  transactionId: number | null;        // Linked single transaction
  transactionGroupId: number | null;   // Linked transaction group
  companyId: number | null;            // Linked vendor company
  description: string | null;
  displayName: string;                 // Computed at query time: COALESCE(Company.Name, VendorName, FileName) with optional date suffix
  createdAt: string;
}
```

### FiscalDeadline

```typescript
export interface FiscalDeadline {
  modeloType: ModeloType;              // '303' | '130' | '390' | '100'
  fiscalYear: number;
  fiscalQuarter: number | null;        // null for annual modelos
  startDate: string;                   // Filing window start (ISO date)
  endDate: string;                     // Filing window end (ISO date)
  status: FilingStatus;                // 'not_due' | 'upcoming' | 'due' | 'overdue' | 'filed'
  isFiled: boolean;                    // Whether a document exists for this deadline
  daysRemaining: number | null;        // Days until deadline (null if not applicable)
  needsPostponement: boolean;          // Whether postponement is advisable
}
```

### FiscalDeadlineSettings

```typescript
export interface FiscalDeadlineSettings {
  reminderDaysBefore: number;          // Days before deadline to show reminder
  postponementReminder: boolean;       // Show postponement-eligible reminders
  isActive: boolean;                   // Whether reminders are enabled
}
```

### Subcategory Summary

```typescript
export interface SubcategorySummary {
  parentCategoryId: number;
  subcategoryId: number;
  subcategoryName: string;
  subcategoryIcon: string | null;
  subcategoryColor: string | null;
  isSubcategory: boolean;            // false if this is the parent itself
  totalCents: number;
  transactionCount: number;
}
```

### Summary Types

```typescript
export interface CategorySummary {
  categoryId: number;
  categoryName: string;
  categoryIcon: string | null;
  categoryColor: string | null;
  type: TransactionType;
  totalCents: number;
  transactionCount: number;
}

export interface MonthlySummary {
  month: string;                      // "2025-01"
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  byCategory: CategorySummary[];
}

export interface FormattedCategorySummary extends CategorySummary {
  total: string;                      // "419,28"
  totalValue: number;                 // 419.28
  percentage: number;                 // % of total for type
}

export interface FormattedSummary {
  month: string;
  income: string;                     // "447,70"
  incomeValue: number;                // 447.70
  expense: string;                    // "2.697,16"
  expenseValue: number;               // 2697.16
  balance: string;                    // "-2.249,46"
  balanceValue: number;               // -2249.46
  byCategory: FormattedCategorySummary[];
}
```

### Form Input Types

```typescript
export interface TransactionInput {
  categoryId: number;
  amount: number;                     // Euros with decimals (UI input)
  description: string;
  transactionDate: Date;
  type: TransactionType;
  isShared?: boolean;                 // Toggles shared expense splitting
}

export interface TransactionFilters {
  month?: string;                     // "2025-01"
  type?: TransactionType;
  categoryId?: number;
}
```

### API Response Types

```typescript
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: Record<string, string[]>;  // Validation errors
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}
```

---

## Zod Validation Schemas

### Transaction Schemas

Located in `src/schemas/transaction.ts`:

#### TransactionTypeSchema

```typescript
export const TransactionTypeSchema = z.enum([TRANSACTION_TYPE.INCOME, TRANSACTION_TYPE.EXPENSE]);
```

#### TransactionStatusSchema

```typescript
export const TransactionStatusSchema = z.enum([
  TRANSACTION_STATUS.PAID,
  TRANSACTION_STATUS.PENDING,
  TRANSACTION_STATUS.CANCELLED,
]);
```

#### CreateTransactionSchema

```typescript
export const CreateTransactionSchema = z.object({
  categoryId: z.number().int().positive('Selecciona una categoria'),
  amount: z.number().positive('El monto debe ser mayor a 0'),
  description: z.string().max(255, 'La descripcion es muy larga').optional().default(''),
  transactionDate: z.coerce.date({ message: 'Fecha invalida' }),
  type: TransactionTypeSchema,
  isShared: z.boolean().optional().default(false),
  status: TransactionStatusSchema.optional().default(TRANSACTION_STATUS.PAID),
});

export type CreateTransactionInput = z.infer<typeof CreateTransactionSchema>;
```

#### UpdateTransactionSchema

```typescript
export const UpdateTransactionSchema = CreateTransactionSchema.partial().extend({
  transactionId: z.number().int().positive(),
});

export type UpdateTransactionInput = z.infer<typeof UpdateTransactionSchema>;
```

#### TransactionFiltersSchema

```typescript
export const TransactionFiltersSchema = z.object({
  month: z.string().regex(MONTH_FORMAT_REGEX, 'Formato de mes invalido (YYYY-MM)').optional(),
  type: TransactionTypeSchema.optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  status: TransactionStatusSchema.optional(),
});

export type TransactionFiltersInput = z.infer<typeof TransactionFiltersSchema>;
```

#### UpdateTransactionStatusSchema

Lightweight schema for the PATCH status endpoint:

```typescript
export const UpdateTransactionStatusSchema = z.object({
  status: TransactionStatusSchema,
});
```

#### CreateCategorySchema

```typescript
export const CreateCategorySchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(100, 'El nombre es muy largo'),
  type: TransactionTypeSchema,
  icon: z.string().max(50).optional().nullable(),
  color: z.string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Color hex invalido')
    .optional()
    .nullable(),
  sortOrder: z.number().int().optional().default(0),
  parentCategoryId: z.number().int().positive().optional().nullable(),
  defaultShared: z.boolean().optional().default(false),
});

export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;
```

#### UpdateCategorySchema

Type and parentCategoryId are immutable post-creation.

```typescript
export const UpdateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  icon: z.string().max(50).optional().nullable(),
  color: z.string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional()
    .nullable(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  defaultShared: z.boolean().optional(),
});

export type UpdateCategoryInput = z.infer<typeof UpdateCategorySchema>;
```

#### Transaction Group Schemas

```typescript
const TransactionGroupItemSchema = z.object({
  categoryId: z.number().int().positive(),
  amount: z.number().positive(),
});

export const CreateTransactionGroupSchema = z.object({
  description: z.string().min(1).max(255),
  transactionDate: z.coerce.date({ message: 'Fecha invalida' }),
  type: TransactionTypeSchema,
  isShared: z.boolean().optional().default(false),
  parentCategoryId: z.number().int().positive(),
  items: z.array(TransactionGroupItemSchema).min(1).max(20),
});

export type CreateTransactionGroupInput = z.infer<typeof CreateTransactionGroupSchema>;

export const UpdateTransactionGroupSchema = z.object({
  description: z.string().min(1).max(255).optional(),
  transactionDate: z.coerce.date({ message: 'Fecha invalida' }).optional(),
});

export type UpdateTransactionGroupInput = z.infer<typeof UpdateTransactionGroupSchema>;
```

#### Validation Helper

```typescript
export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
): { success: true; data: T } | { success: false; errors: z.typeToFlattenedError<T>['fieldErrors'] } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, errors: result.error.flatten().fieldErrors };
}
```

**Usage in API routes:**

```typescript
export async function POST(request: Request) {
  const body = await request.json();
  const validation = validateRequest(CreateTransactionSchema, body);

  if (!validation.success) {
    return NextResponse.json(
      { success: false, errors: validation.errors },
      { status: 400 }
    );
  }

  // validation.data is typed as CreateTransactionInput
  const transaction = validation.data;
  // ...
}
```

---

### Recurring Expense Schemas

Located in `src/schemas/recurring-expense.ts`:

#### RecurringFrequencySchema

```typescript
export const RecurringFrequencySchema = z.enum([
  RECURRING_FREQUENCY.WEEKLY,
  RECURRING_FREQUENCY.MONTHLY,
  RECURRING_FREQUENCY.YEARLY,
]);
```

#### CreateRecurringExpenseSchema

Uses `.refine()` for conditional validation based on frequency:

```typescript
export const CreateRecurringExpenseSchema = z
  .object({
    categoryId: z.number().int().positive('Category is required'),
    amount: z.number().positive('Amount must be greater than 0'),
    description: z.string().max(255, 'Description is too long').optional().default(''),
    frequency: RecurringFrequencySchema,
    dayOfWeek: z.number().int().min(0).max(6).nullable().optional().default(null),
    dayOfMonth: z.number().int().min(1).max(31).nullable().optional().default(null),
    monthOfYear: z.number().int().min(1).max(12).nullable().optional().default(null),
    startDate: z.coerce.date({ message: 'Invalid date' }),
    endDate: z.coerce.date().nullable().optional().default(null),
    isShared: z.boolean().optional().default(false),
  })
  .refine(
    (data) => {
      if (data.frequency === RECURRING_FREQUENCY.WEEKLY) {
        return data.dayOfWeek !== null && data.dayOfWeek !== undefined;
      }
      return true;
    },
    { message: 'Day of week is required for weekly frequency', path: ['dayOfWeek'] },
  )
  .refine(
    (data) => {
      if (data.frequency === RECURRING_FREQUENCY.MONTHLY || data.frequency === RECURRING_FREQUENCY.YEARLY) {
        return data.dayOfMonth !== null && data.dayOfMonth !== undefined;
      }
      return true;
    },
    { message: 'Day of month is required for this frequency', path: ['dayOfMonth'] },
  )
  .refine(
    (data) => {
      if (data.frequency === RECURRING_FREQUENCY.YEARLY) {
        return data.monthOfYear !== null && data.monthOfYear !== undefined;
      }
      return true;
    },
    { message: 'Month is required for yearly frequency', path: ['monthOfYear'] },
  );

export type CreateRecurringExpenseInput = z.infer<typeof CreateRecurringExpenseSchema>;
```

#### UpdateRecurringExpenseSchema

```typescript
export const UpdateRecurringExpenseSchema = z.object({
  categoryId: z.number().int().positive().optional(),
  amount: z.number().positive().optional(),
  description: z.string().max(255).optional().nullable(),
  frequency: RecurringFrequencySchema.optional(),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  monthOfYear: z.number().int().min(1).max(12).nullable().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().nullable().optional(),
  isShared: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateRecurringExpenseInput = z.infer<typeof UpdateRecurringExpenseSchema>;
```

#### ConfirmOccurrenceSchema

```typescript
export const ConfirmOccurrenceSchema = z.object({
  modifiedAmount: z.number().positive().optional(),
});

export type ConfirmOccurrenceInput = z.infer<typeof ConfirmOccurrenceSchema>;
```

### Trip Schemas

Located in `src/schemas/trip.ts`:

#### CreateTripSchema

```typescript
export const CreateTripSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(100, 'El nombre es muy largo'),
});

export type CreateTripInput = z.infer<typeof CreateTripSchema>;
```

#### UpdateTripSchema

```typescript
export const UpdateTripSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(100, 'El nombre es muy largo').optional(),
});

export type UpdateTripInput = z.infer<typeof UpdateTripSchema>;
```

#### CreateTripExpenseSchema

```typescript
export const CreateTripExpenseSchema = z.object({
  categoryId: z.number().int().positive('Selecciona una categoria'),
  amount: z.number().positive('El monto debe ser mayor a 0'),
  description: z.string().max(255, 'La descripcion es muy larga').optional().default(''),
  transactionDate: z.coerce.date({ message: 'Fecha invalida' }),
  isShared: z.boolean().optional().default(false),
});

export type CreateTripExpenseInput = z.infer<typeof CreateTripExpenseSchema>;
```

#### UpdateTripExpenseSchema

```typescript
export const UpdateTripExpenseSchema = CreateTripExpenseSchema.partial();

export type UpdateTripExpenseInput = z.infer<typeof UpdateTripExpenseSchema>;
```

---

### Company Schemas

Located in `src/schemas/company.ts`:

#### CreateCompanySchema

```typescript
export const CreateCompanySchema = z.object({
  name: z.string().min(1, 'Name is required').max(150, 'Name is too long'),
  tradingName: z.string().max(150).nullable().optional().default(null),
  taxId: z.string().max(30).nullable().optional().default(null),
  address: z.string().max(250).nullable().optional().default(null),
  city: z.string().max(100).nullable().optional().default(null),
  postalCode: z.string().max(20).nullable().optional().default(null),
  country: z.string().max(100).nullable().optional().default(null),
  invoiceLanguage: z.string().max(5).nullable().optional().default(null),
  role: z.enum([COMPANY_ROLE.CLIENT, COMPANY_ROLE.PROVIDER]).default(COMPANY_ROLE.CLIENT),
});

export type CreateCompanyInput = z.infer<typeof CreateCompanySchema>;
```

#### UpdateCompanySchema

```typescript
export const UpdateCompanySchema = z.object({
  name: z.string().min(1).max(150).optional(),
  tradingName: z.string().max(150).nullable().optional(),
  taxId: z.string().max(30).nullable().optional(),
  address: z.string().max(250).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  postalCode: z.string().max(20).nullable().optional(),
  country: z.string().max(100).nullable().optional(),
  invoiceLanguage: z.string().max(5).nullable().optional(),
  role: z.enum([COMPANY_ROLE.CLIENT, COMPANY_ROLE.PROVIDER]).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateCompanyInput = z.infer<typeof UpdateCompanySchema>;
```

#### QuickCreateCompanySchema

For inline company creation from selectors (name only):

```typescript
export const QuickCreateCompanySchema = z.object({
  name: z.string().min(1, 'Name is required').max(150, 'Name is too long'),
});

export type QuickCreateCompanyInput = z.infer<typeof QuickCreateCompanySchema>;
```

---

### Invoice Schemas

Located in `src/schemas/invoice.ts`:

#### BillingProfileSchema

```typescript
export const BillingProfileSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').max(150),
  nif: z.string().min(1, 'NIF is required').max(30),
  address: z.string().max(500).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  paymentMethod: z.enum([PAYMENT_METHOD.BANK_TRANSFER, PAYMENT_METHOD.PAYPAL, PAYMENT_METHOD.OTHER]),
  bankName: z.string().max(150).optional().nullable(),
  iban: z.string().max(34).optional().nullable(),
  swift: z.string().max(11).optional().nullable(),
  bankAddress: z.string().max(500).optional().nullable(),
  defaultHourlyRateCents: z.number().int().positive().optional().nullable(),
});

export type BillingProfileInput = z.infer<typeof BillingProfileSchema>;
```

#### CreateInvoicePrefixSchema

```typescript
export const CreateInvoicePrefixSchema = z.object({
  prefix: z.string().min(1, 'Prefix is required').max(10)
    .transform((val) => val.toUpperCase()),
  description: z.string().max(100).optional().nullable(),
  nextNumber: z.number().int().min(1).default(1),
  companyId: z.number().int().positive().optional().nullable(),
});

export type CreateInvoicePrefixInput = z.infer<typeof CreateInvoicePrefixSchema>;
```

#### UpdateInvoicePrefixSchema

```typescript
export const UpdateInvoicePrefixSchema = z.object({
  description: z.string().max(100).optional().nullable(),
  nextNumber: z.number().int().min(1).optional(),
  companyId: z.number().int().positive().optional().nullable(),
});

export type UpdateInvoicePrefixInput = z.infer<typeof UpdateInvoicePrefixSchema>;
```

#### CreateInvoiceSchema

TotalCents is NOT included -- it is calculated server-side from line items.

```typescript
const InvoiceLineItemSchema = z.object({
  description: z.string().min(1, 'Description is required').max(500),
  hours: z.number().positive().nullable().optional(),
  hourlyRateCents: z.number().int().positive().nullable().optional(),
  amountCents: z.number().int().positive('Amount must be greater than 0'),
}).refine(
  (item) => {
    if (item.hours != null && item.hourlyRateCents != null) {
      return item.amountCents === Math.round(item.hours * item.hourlyRateCents);
    }
    return true;
  },
  { message: 'AmountCents must equal Math.round(hours * hourlyRateCents)', path: ['amountCents'] },
);

export const CreateInvoiceSchema = z.object({
  prefixId: z.number().int().positive(),
  invoiceDate: z.coerce.date({ message: 'Invalid date' }),
  companyId: z.number().int().positive(),
  lineItems: z.array(InvoiceLineItemSchema).min(1, 'At least one line item is required').max(50),
  notes: z.string().max(2000).optional().nullable(),
});

export type CreateInvoiceInput = z.infer<typeof CreateInvoiceSchema>;
```

#### UpdateInvoiceSchema

For editing a draft invoice (date, line items, notes). Prefix and company are locked after creation.

```typescript
export const UpdateInvoiceSchema = z.object({
  invoiceDate: z.coerce.date({ message: 'Invalid date' }),
  lineItems: z.array(InvoiceLineItemSchema).min(1, 'At least one line item is required').max(50),
  notes: z.string().max(2000).optional().nullable(),
});

export type UpdateInvoiceInput = z.infer<typeof UpdateInvoiceSchema>;
```

#### UpdateInvoiceStatusSchema

```typescript
export const UpdateInvoiceStatusSchema = z.object({
  status: z.enum([INVOICE_STATUS.DRAFT, INVOICE_STATUS.FINALIZED, INVOICE_STATUS.PAID, INVOICE_STATUS.CANCELLED]),
  categoryId: z.number().int().positive().optional(),
});

export type UpdateInvoiceStatusInput = z.infer<typeof UpdateInvoiceStatusSchema>;
```

---

### Fiscal Document Schemas

Located in `src/schemas/fiscal-document.ts`:

#### FiscalDocumentUploadSchema

Uses `.refine()` for conditional validation: modelos require `modeloType`, facturas must not; quarterly modelos require `fiscalQuarter`, annual must not.

```typescript
export const FiscalDocumentUploadSchema = z.object({
  documentType: z.enum(['modelo', 'factura_recibida', 'factura_emitida']),
  modeloType: z.enum(['303', '130', '390', '100']).nullable().optional(),
  fiscalYear: z.coerce.number().int().min(2019).max(2100),
  fiscalQuarter: z.coerce.number().int().min(1).max(4).nullable().optional(),
  status: z.enum(['pending', 'filed']).default('pending'),
  taxAmountCents: z.coerce.number().int().nullable().optional(),
  transactionId: z.coerce.number().int().positive().nullable().optional(),
  transactionGroupId: z.coerce.number().int().positive().nullable().optional(),
  companyId: z.coerce.number().int().positive().nullable().optional(),
  description: z.string().max(255).nullable().optional(),
}).refine(
  (data) => {
    if (data.documentType === 'modelo') return data.modeloType != null;
    return data.modeloType == null;
  },
  { message: 'Modelos require modeloType; facturas must not have it', path: ['modeloType'] },
).refine(
  (data) => {
    if (data.modeloType === '390' || data.modeloType === '100') return data.fiscalQuarter == null;
    if (data.modeloType === '303' || data.modeloType === '130') return data.fiscalQuarter != null;
    return true;
  },
  { message: 'Quarterly modelos require fiscalQuarter; annual modelos must not', path: ['fiscalQuarter'] },
);

export type FiscalDocumentUploadInput = z.infer<typeof FiscalDocumentUploadSchema>;
```

#### FiscalDocumentStatusSchema

```typescript
export const FiscalDocumentStatusSchema = z.object({
  status: z.enum(['pending', 'filed']),
});

export type FiscalDocumentStatusInput = z.infer<typeof FiscalDocumentStatusSchema>;
```

#### BulkUploadItemSchema

For bulk upload with auto-parsed filename metadata:

```typescript
export const BulkUploadItemSchema = z.object({
  documentType: z.enum(['modelo', 'factura_recibida', 'factura_emitida']),
  modeloType: z.enum(['303', '130', '390', '100']).nullable().optional(),
  fiscalYear: z.coerce.number().int().min(2019).max(2100),
  fiscalQuarter: z.coerce.number().int().min(1).max(4).nullable().optional(),
  status: z.enum(['pending', 'filed']).default('filed'),
  description: z.string().max(255).nullable().optional(),
});

export type BulkUploadItemInput = z.infer<typeof BulkUploadItemSchema>;
```

#### FiscalDeadlineSettingsSchema

```typescript
export const FiscalDeadlineSettingsSchema = z.object({
  reminderDaysBefore: z.coerce.number().int().min(1).max(90).default(7),
  postponementReminder: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

export type FiscalDeadlineSettingsInput = z.infer<typeof FiscalDeadlineSettingsSchema>;
```

#### FiscalDocumentsFiltersSchema

```typescript
export const FiscalDocumentsFiltersSchema = z.object({
  year: z.coerce.number().int().min(2019).max(2100),
  quarter: z.coerce.number().int().min(1).max(4).optional(),
  documentType: z.enum(['modelo', 'factura_recibida', 'factura_emitida']).optional(),
});

export type FiscalDocumentsFiltersInput = z.infer<typeof FiscalDocumentsFiltersSchema>;
```

#### ExtractedInvoiceRawSchema

Validates OCR output from Claude Vision. Uses `.transform()` to convert euro amounts to cents. The raw response uses `totalAmountEuros` (etc.) and the schema converts to `totalAmountCents`.

```typescript
export const ExtractedInvoiceRawSchema = z.object({
  totalAmountEuros: z.number().transform(eurosToCents),
  baseAmountEuros: z.number().nullable().optional().transform(v => v != null ? eurosToCents(v) : null),
  taxAmountEuros: z.number().nullable().optional().transform(v => v != null ? eurosToCents(v) : null),
  vatPercent: z.number().nullable().optional(),
  date: z.string().nullable().optional(),
  vendor: z.string().nullable().optional(),
  invoiceNumber: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
}).transform((data) => ({
  totalAmountCents: data.totalAmountEuros,
  baseAmountCents: data.baseAmountEuros ?? null,
  taxAmountCents: data.taxAmountEuros ?? null,
  // ... maps all fields
}));
```

#### LinkTransactionSchema

Validates the request body for `POST /api/fiscal/documents/[id]/link-transaction`. Creates a transaction and links it to the document atomically.

```typescript
export const LinkTransactionSchema = z.object({
  categoryId: z.number().int().positive(),
  amountCents: z.number().int(),
  transactionDate: z.string(),
  type: z.enum(['income', 'expense']),
  description: z.string().nullable().optional(),
  vatPercent: z.number().nullable().optional(),
  deductionPercent: z.number().nullable().optional(),
  vendorName: z.string().nullable().optional(),
  invoiceNumber: z.string().nullable().optional(),
  companyId: z.number().int().positive().nullable().optional(),
  isShared: z.boolean().optional(),
});

export type LinkTransactionInput = z.infer<typeof LinkTransactionSchema>;
```

---

## Constants

Located in `src/constants/finance.ts`:

```typescript
// Transaction Types
export const TRANSACTION_TYPE = {
  INCOME: 'income',
  EXPENSE: 'expense',
} as const;

export type TransactionType = (typeof TRANSACTION_TYPE)[keyof typeof TRANSACTION_TYPE];

// Filter Types (includes 'all' for UI filtering)
export const FILTER_TYPE = {
  ALL: 'all',
  ...TRANSACTION_TYPE,
} as const;

export type FilterType = (typeof FILTER_TYPE)[keyof typeof FILTER_TYPE];

// Transaction Status
export const TRANSACTION_STATUS = {
  PAID: 'paid',
  PENDING: 'pending',
  CANCELLED: 'cancelled',
} as const;

export type TransactionStatus = (typeof TRANSACTION_STATUS)[keyof typeof TRANSACTION_STATUS];

// Transaction Status Filter (includes 'all' for UI filtering)
export const STATUS_FILTER = {
  ALL: 'all',
  ...TRANSACTION_STATUS,
} as const;

export type StatusFilter = (typeof STATUS_FILTER)[keyof typeof STATUS_FILTER];

// Shared Expense Configuration
export const SHARED_EXPENSE = {
  DIVISOR: 2,           // Split between 2 people
  DEFAULT_DIVISOR: 1,   // Not shared (personal)
} as const;

// Balance Card Variants
export const CARD_VARIANT = {
  INCOME: 'income',
  EXPENSE: 'expense',
  BALANCE: 'balance',
} as const;

export type CardVariant = (typeof CARD_VARIANT)[keyof typeof CARD_VARIANT];

// Recurring Expense Frequencies
export const RECURRING_FREQUENCY = {
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
} as const;

export type RecurringFrequency = (typeof RECURRING_FREQUENCY)[keyof typeof RECURRING_FREQUENCY];

// Occurrence Statuses
export const OCCURRENCE_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  SKIPPED: 'skipped',
} as const;

export type OccurrenceStatus = (typeof OCCURRENCE_STATUS)[keyof typeof OCCURRENCE_STATUS];

// TanStack Query Keys
export const QUERY_KEY = {
  CATEGORIES: 'categories',
  TRANSACTIONS: 'transactions',
  SUMMARY: 'summary',
  SUBCATEGORY_SUMMARY: 'subcategory-summary',
  RECURRING_EXPENSES: 'recurring-expenses',
  PENDING_OCCURRENCES: 'pending-occurrences',
  TRANSACTION_GROUPS: 'transaction-groups',
  TRIPS: 'trips',
  TRIP_CATEGORIES: 'trip-categories',
} as const;

// Cache Times (in milliseconds)
export const CACHE_TIME = {
  ONE_MINUTE: 1 * 60 * 1000,
  TWO_MINUTES: 2 * 60 * 1000,
  FIVE_MINUTES: 5 * 60 * 1000,
  TEN_MINUTES: 10 * 60 * 1000,
  THIRTY_MINUTES: 30 * 60 * 1000,
} as const;

// API Endpoints
export const API_ENDPOINT = {
  CATEGORIES: '/api/categories',
  TRANSACTIONS: '/api/transactions',
  SUMMARY: '/api/summary',
  SUBCATEGORY_SUMMARY: '/api/summary/subcategories',
  RECURRING_EXPENSES: '/api/recurring-expenses',
  TRANSACTION_GROUPS: '/api/transaction-groups',
  TRIPS: '/api/trips',
} as const;

// Month format regex
export const MONTH_FORMAT_REGEX = /^\d{4}-\d{2}$/;

// Invoice Statuses
export const INVOICE_STATUS = {
  DRAFT: 'draft',
  FINALIZED: 'finalized',
  PAID: 'paid',
  CANCELLED: 'cancelled',
} as const;

export type InvoiceStatus = (typeof INVOICE_STATUS)[keyof typeof INVOICE_STATUS];

// Payment Methods
export const PAYMENT_METHOD = {
  BANK_TRANSFER: 'bank_transfer',
  PAYPAL: 'paypal',
  OTHER: 'other',
} as const;

export type PaymentMethod = (typeof PAYMENT_METHOD)[keyof typeof PAYMENT_METHOD];

// Company Roles
export const COMPANY_ROLE = {
  CLIENT: 'client',
  PROVIDER: 'provider',
} as const;

export type CompanyRole = (typeof COMPANY_ROLE)[keyof typeof COMPANY_ROLE];

// Fiscal Document Types
export const FISCAL_DOCUMENT_TYPE = {
  MODELO: 'modelo',
  FACTURA_RECIBIDA: 'factura_recibida',
  FACTURA_EMITIDA: 'factura_emitida',
} as const;

export type FiscalDocumentType = (typeof FISCAL_DOCUMENT_TYPE)[keyof typeof FISCAL_DOCUMENT_TYPE];

// Modelo Types
export const MODELO_TYPE = {
  M303: '303',
  M130: '130',
  M390: '390',
  M100: '100',
} as const;

export type ModeloType = (typeof MODELO_TYPE)[keyof typeof MODELO_TYPE];

// Fiscal Document Status
export const FISCAL_STATUS = {
  PENDING: 'pending',
  FILED: 'filed',
} as const;

export type FiscalStatus = (typeof FISCAL_STATUS)[keyof typeof FISCAL_STATUS];

// Filing Status (computed server-side for deadlines)
export const FILING_STATUS = {
  NOT_DUE: 'not_due',
  UPCOMING: 'upcoming',
  DUE: 'due',
  OVERDUE: 'overdue',
  FILED: 'filed',
} as const;

export type FilingStatus = (typeof FILING_STATUS)[keyof typeof FILING_STATUS];

// Extraction Status (OCR pipeline)
export const EXTRACTION_STATUS = {
  NOT_EXTRACTED: 'not_extracted',
  EXTRACTING: 'extracting',
  EXTRACTED: 'extracted',
  FAILED: 'failed',
} as const;

export type ExtractionStatus = (typeof EXTRACTION_STATUS)[keyof typeof EXTRACTION_STATUS];
```

---

## Money Utilities

Located in `src/utils/money.ts`:

```typescript
// Convert euros to cents for storage
export function eurosToCents(euros: number): number {
  return Math.round(euros * 100);
}

// Convert cents to euros for display
export function centsToEuros(cents: number): number {
  return cents / 100;
}

// Format cents as currency string
export function formatCurrency(cents: number, showSymbol = true): string {
  const euros = centsToEuros(cents);
  const formatted = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(euros));

  if (!showSymbol) {
    return euros < 0 ? `-${formatted}` : formatted;
  }

  const sign = euros < 0 ? '-' : '';
  return `${sign}${formatted} €`;
}

// Format cents as compact currency (for cards/headers)
export function formatCompactCurrency(cents: number): string {
  const euros = centsToEuros(Math.abs(cents));
  const sign = cents < 0 ? '-' : '';

  if (euros >= 1000000) {
    return `${sign}${(euros / 1000000).toFixed(1).replace('.', ',')}M €`;
  }
  if (euros >= 10000) {
    return `${sign}${(euros / 1000).toFixed(1).replace('.', ',')}k €`;
  }

  return formatCurrency(cents);
}

// Parse user input to cents
export function parseInputToCents(input: string): number | null {
  if (!input?.trim()) return null;
  const normalized = input.trim().replace(/\s/g, '').replace(',', '.');
  const cleaned = normalized.replace(/[€$]/g, '');
  const parsed = Number.parseFloat(cleaned);
  return Number.isNaN(parsed) ? null : eurosToCents(parsed);
}

// Calculate percentage
export function calculatePercentage(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((Math.abs(part) / Math.abs(total)) * 100);
}

// Sum an array of cent amounts
export function sumCents(amounts: number[]): number {
  return amounts.reduce((sum, amount) => sum + amount, 0);
}

// Validate that a cent amount is a valid integer
export function isValidCents(cents: number): boolean {
  return Number.isInteger(cents) && Number.isFinite(cents);
}
```

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| `docs/API_REFERENCE.md` | API endpoints, request/response formats |
| `docs/ARCHITECTURE.md` | System architecture, data flow |
| `docs/TESTING_STRATEGY.md` | Testing approach and guidelines |
| `database/schema.sql` | Complete database schema (executable, includes Trips) |
| `database/seed.sql` | Initial category data |
| `src/schemas/trip.ts` | Trip and trip expense Zod schemas |
| `src/schemas/company.ts` | Company Zod schemas (create, update, quick-create) |
| `src/schemas/invoice.ts` | Invoice, billing profile, and prefix Zod schemas |
| `src/schemas/fiscal-document.ts` | Fiscal document upload and settings Zod schemas |
| `src/services/database/TripRepository.ts` | Trip CRUD and trip category database operations |
| `src/services/database/FiscalRepository.ts` | Fiscal quarterly report database operations |
| `src/services/database/FiscalDocumentRepository.ts` | Fiscal document CRUD database operations |
| `src/utils/fiscal.ts` | `computeFiscalFields` utility for VAT/deduction calculations |
