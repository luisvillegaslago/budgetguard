# BudgetGuard Data Models

This document describes all data models used in BudgetGuard: database schema, TypeScript interfaces, and Zod validation schemas.

---

## Database Schema (SQL Server)

### Core Tables

#### Categories

Organizes transactions into income and expense categories.

```sql
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

---

#### Transactions

Records all income and expense transactions.

```sql
CREATE TABLE Transactions (
    TransactionID INT IDENTITY(1,1) PRIMARY KEY,
    CategoryID INT NOT NULL FOREIGN KEY REFERENCES Categories(CategoryID),
    AmountCents INT NOT NULL,         -- €419.28 = 41928
    Description NVARCHAR(255) NULL,
    TransactionDate DATE NOT NULL,
    Type NVARCHAR(10) NOT NULL CHECK (Type IN ('income', 'expense')),
    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 DEFAULT GETUTCDATE()
);
```

| Column | Type | Description |
|--------|------|-------------|
| `TransactionID` | INT | Auto-increment primary key |
| `CategoryID` | INT | Foreign key to Categories |
| `AmountCents` | INT | Amount in cents (41928 = €419.28) |
| `Description` | NVARCHAR(255) | Optional description |
| `TransactionDate` | DATE | Date of transaction |
| `Type` | NVARCHAR(10) | `'income'` or `'expense'` |

**Important**: `AmountCents` stores money as integers to avoid floating point precision errors.

---

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

### Database Views

#### vw_MonthlySummary

Pre-calculated totals by category per month.

```sql
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
```

| Column | Description |
|--------|-------------|
| `Month` | Format: `'2025-01'` |
| `Type` | `'income'` or `'expense'` |
| `TotalCents` | Sum of all transactions for category |
| `TransactionCount` | Number of transactions |

---

#### vw_MonthlyBalance

Monthly totals for income, expenses, and balance.

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

### Triggers

Auto-update `UpdatedAt` timestamps on all tables:

```sql
CREATE TRIGGER TR_Categories_UpdatedAt ON Categories AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE Categories SET UpdatedAt = GETUTCDATE()
    FROM Categories c INNER JOIN inserted i ON c.CategoryID = i.CategoryID;
END;

-- Similar triggers for: Transactions, Users, Accounts
```

---

### Indexes

```sql
-- Categories
CREATE INDEX IX_Categories_Type ON Categories(Type);
CREATE INDEX IX_Categories_Active ON Categories(IsActive);

-- Transactions
CREATE INDEX IX_Transactions_Date ON Transactions(TransactionDate);
CREATE INDEX IX_Transactions_Type_Date ON Transactions(Type, TransactionDate);
CREATE INDEX IX_Transactions_Category ON Transactions(CategoryID);
CREATE INDEX IX_Transactions_YearMonth ON Transactions(TransactionDate)
    INCLUDE (Type, AmountCents, CategoryID);

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

## TypeScript Interfaces

Located in `src/types/finance.ts`:

### Transaction Types

```typescript
// Transaction type literal
export type TransactionType = 'income' | 'expense';

// Filter type (includes 'all' for UI)
export type FilterType = 'all' | 'income' | 'expense';
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
}
```

### Transaction

```typescript
export interface Transaction {
  transactionId: number;
  categoryId: number;
  category?: Category;          // Joined from Categories table
  amountCents: number;          // 41928 = €419.28
  description: string | null;
  transactionDate: string;      // ISO date "2025-01-15"
  type: TransactionType;
  createdAt: string;            // ISO datetime
  updatedAt: string;            // ISO datetime
}
```

### Summary Types

```typescript
// Category summary for reports
export interface CategorySummary {
  categoryId: number;
  categoryName: string;
  categoryIcon: string | null;
  categoryColor: string | null;
  type: TransactionType;
  totalCents: number;
  transactionCount: number;
}

// Raw monthly summary (cents - internal use)
export interface MonthlySummary {
  month: string;                // "2025-01"
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  byCategory: CategorySummary[];
}

// Formatted for UI display (euros)
export interface FormattedCategorySummary extends CategorySummary {
  total: string;                // "419,28"
  totalValue: number;           // 419.28
  percentage: number;           // % of total for type
}

export interface FormattedSummary {
  month: string;
  income: string;               // "447,70"
  incomeValue: number;          // 447.70
  expense: string;              // "2.697,16"
  expenseValue: number;         // 2697.16
  balance: string;              // "-2.249,46"
  balanceValue: number;         // -2249.46
  byCategory: FormattedCategorySummary[];
}
```

### Form Input Types

```typescript
// Transaction input from forms (euros, not cents)
export interface TransactionInput {
  categoryId: number;
  amount: number;               // Euros with decimals (UI input)
  description: string;
  transactionDate: Date;
  type: TransactionType;
}

// Transaction filters
export interface TransactionFilters {
  month?: string;               // "2025-01"
  type?: TransactionType;
  categoryId?: number;
}
```

### API Response Types

```typescript
// Standard API response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: Record<string, string[]>;  // Validation errors
}

// Pagination params (future use)
export interface PaginationParams {
  page?: number;
  limit?: number;
}
```

---

## Zod Validation Schemas

Located in `src/schemas/transaction.ts`:

### Transaction Type Schema

```typescript
import { z } from 'zod';

export const TransactionTypeSchema = z.enum(['income', 'expense']);
```

### Create Transaction Schema

```typescript
export const CreateTransactionSchema = z.object({
  categoryId: z.number().int().positive('Selecciona una categoria'),
  amount: z.number().positive('El monto debe ser mayor a 0'),
  description: z.string().max(255, 'La descripcion es muy larga').optional().default(''),
  transactionDate: z.coerce.date({ message: 'Fecha invalida' }),
  type: TransactionTypeSchema,
});

export type CreateTransactionInput = z.infer<typeof CreateTransactionSchema>;
```

### Update Transaction Schema

```typescript
export const UpdateTransactionSchema = CreateTransactionSchema.partial().extend({
  transactionId: z.number().int().positive(),
});

export type UpdateTransactionInput = z.infer<typeof UpdateTransactionSchema>;
```

### Transaction Filters Schema

```typescript
export const TransactionFiltersSchema = z.object({
  month: z.string()
    .regex(/^\d{4}-\d{2}$/, 'Formato de mes invalido (YYYY-MM)')
    .optional(),
  type: TransactionTypeSchema.optional(),
  categoryId: z.coerce.number().int().positive().optional(),
});

export type TransactionFiltersInput = z.infer<typeof TransactionFiltersSchema>;
```

### Create Category Schema

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
});

export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;
```

### Validation Helper

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

## Constants

Located in `src/constants/finance.ts`:

```typescript
// Transaction Types
export const TRANSACTION_TYPE = {
  INCOME: 'income',
  EXPENSE: 'expense',
} as const;

export type TransactionType = (typeof TRANSACTION_TYPE)[keyof typeof TRANSACTION_TYPE];

// Filter Types (includes 'all' for UI)
export const FILTER_TYPE = {
  ALL: 'all',
  ...TRANSACTION_TYPE,
} as const;

export type FilterType = (typeof FILTER_TYPE)[keyof typeof FILTER_TYPE];

// Balance Card Variants
export const CARD_VARIANT = {
  INCOME: 'income',
  EXPENSE: 'expense',
  BALANCE: 'balance',
} as const;

// TanStack Query Keys
export const QUERY_KEY = {
  CATEGORIES: 'categories',
  TRANSACTIONS: 'transactions',
  SUMMARY: 'summary',
} as const;

// Cache Times (milliseconds)
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
} as const;

// Month format regex
export const MONTH_FORMAT_REGEX = /^\d{4}-\d{2}$/;
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
```

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| `docs/API_REFERENCE.md` | API endpoints, request/response formats |
| `docs/ARCHITECTURE.md` | System architecture, data flow |
| `database/schema.sql` | Complete database schema (executable) |
| `database/seed.sql` | Initial category data |
