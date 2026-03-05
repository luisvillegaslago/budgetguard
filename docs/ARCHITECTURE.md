# BudgetGuard Architecture

## Overview

BudgetGuard is a family expense and income tracking system built with Next.js 16 App Router. The application replaces a traditional Excel-based workflow with a modern web experience featuring hierarchical categories, shared expenses, recurring expense rules, transaction groups (outings), and trip expense tracking.

### Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | Next.js 16 + React 19 | App Router, Server Components |
| **State Management** | Zustand 5.x | UI state only (month selection, filters, panel states) |
| **Server State** | TanStack Query | Data fetching, caching, mutations |
| **Validation** | Zod | Shared schemas (frontend + backend) |
| **Database** | SQL Server | Transactions, Categories, Recurring Expenses, Groups, Trips |
| **i18n** | Custom provider | Spanish/English support |

---

## Project Structure

```
src/
├── app/                               # Next.js App Router
│   ├── api/                           # API Routes
│   │   ├── categories/
│   │   │   ├── route.ts               # GET/POST categories
│   │   │   └── [id]/route.ts          # GET/PUT/DELETE single category
│   │   ├── transactions/
│   │   │   ├── route.ts               # GET/POST
│   │   │   └── [id]/route.ts          # GET/PUT/DELETE
│   │   ├── transaction-groups/
│   │   │   ├── route.ts               # POST (atomic multi-transaction creation)
│   │   │   └── [id]/route.ts          # DELETE/PATCH (group operations)
│   │   ├── recurring-expenses/
│   │   │   ├── route.ts               # GET/POST recurring rules
│   │   │   ├── [id]/route.ts          # GET/PUT/DELETE single rule
│   │   │   ├── pending/route.ts       # GET pending occurrences
│   │   │   └── occurrences/[id]/
│   │   │       ├── confirm/route.ts   # POST confirm occurrence
│   │   │       └── skip/route.ts      # POST skip occurrence
│   │   ├── trips/
│   │   │   ├── route.ts               # GET/POST trips
│   │   │   ├── [id]/route.ts          # GET/PATCH/DELETE single trip
│   │   │   ├── [id]/expenses/
│   │   │   │   ├── route.ts           # POST trip expense
│   │   │   │   └── [expenseId]/route.ts # PUT/DELETE trip expense
│   │   │   └── categories/route.ts    # GET trip categories (Viajes subcategories)
│   │   ├── summary/
│   │   │   ├── route.ts               # GET monthly balance
│   │   │   └── subcategories/route.ts # GET subcategory drill-down
│   │   └── version/route.ts           # App version info
│   ├── (auth)/                        # Authenticated routes
│   │   ├── dashboard/page.tsx         # Main dashboard
│   │   ├── categories/page.tsx        # Category management page
│   │   ├── recurring-expenses/page.tsx # Recurring expenses page
│   │   ├── trips/page.tsx             # Trips list page
│   │   └── trips/[id]/page.tsx        # Trip detail page
│   ├── layout.tsx                     # Root layout with providers
│   ├── error.tsx                      # Error boundary
│   ├── global-error.tsx               # Global error (full HTML)
│   └── not-found.tsx                  # 404 page
│
├── components/
│   ├── dashboard/
│   │   ├── BalanceCards.tsx            # Income/Expense/Balance cards
│   │   └── CategoryBreakdown.tsx      # Category progress bars (with subcategory drill-down)
│   ├── transactions/
│   │   ├── TransactionList.tsx        # Transaction list (standalone + grouped)
│   │   ├── TransactionForm.tsx        # Create/Edit form (with shared toggle)
│   │   ├── CategorySelector.tsx       # Hierarchical parent > subcategory dropdown
│   │   ├── TransactionGroupForm.tsx   # Group creation modal (multi-item)
│   │   ├── TransactionGroupRow.tsx    # Collapsible group row with subcategory breakdown
│   │   └── TripGroupRow.tsx           # Collapsible trip row (dashboard aggregation)
│   ├── categories/
│   │   ├── CategoryTree.tsx           # Hierarchical tree view
│   │   ├── CategoryFormModal.tsx      # Create/Edit category form
│   │   ├── CategoryDeleteDialog.tsx   # Delete confirmation dialog
│   │   ├── CategoryManagementPanel.tsx # Full management panel
│   │   ├── ColorPicker.tsx            # Hex color selection
│   │   └── IconPicker.tsx             # Lucide icon selection
│   ├── recurring/
│   │   ├── RecurringExpenseForm.tsx    # Create/Edit recurring rule
│   │   ├── RecurringExpenseList.tsx    # List of recurring rules
│   │   └── RecurringPendingPanel.tsx   # Dashboard panel for pending occurrences
│   ├── trips/
│   │   ├── TripList.tsx               # List with search and tabs (upcoming/past)
│   │   ├── TripCard.tsx               # Trip card with category badges
│   │   ├── TripDetail.tsx             # Trip detail with expense list
│   │   ├── TripExpenseForm.tsx        # Trip expense create/edit modal
│   │   ├── TripExpenseRow.tsx         # Individual expense row in trip detail
│   │   └── CreateTripForm.tsx         # New trip creation form
│   └── ui/
│       ├── MonthPicker.tsx            # Month navigation
│       ├── LoadingSpinner.tsx         # Loading indicator
│       └── CategoryIcon.tsx           # Icon renderer
│
├── hooks/
│   ├── useCategories.ts               # Categories query hooks (flat + hierarchical)
│   ├── useTransactions.ts             # Transactions CRUD + useGroupedTransactions
│   ├── useTransactionGroups.ts        # Group create/update/delete mutations
│   ├── useMonthlySummary.ts           # Raw summary data (cents)
│   ├── useFormattedSummary.ts         # Formatted summary (euros)
│   ├── useSubcategorySummary.ts       # Subcategory drill-down query
│   ├── useRecurringExpenses.ts        # Recurring expense CRUD hooks
│   ├── usePendingOccurrences.ts       # Pending occurrence hooks (confirm/skip/batch)
│   ├── useTrips.ts                    # Trip CRUD queries/mutations
│   ├── useTripExpenses.ts             # Trip expense CRUD mutations
│   ├── useTripCategories.ts           # Trip-specific categories query
│   ├── useMonthPrefetch.ts            # Adjacent months prefetch
│   └── useTranslations.ts            # i18n hook
│
├── stores/
│   ├── useFinanceStore.ts             # UI state (Zustand)
│   └── localeStore.ts                 # Language preference
│
├── services/
│   └── database/
│       ├── connection.ts              # MSSQL connection pool
│       ├── TransactionRepository.ts   # Transactions + groups DB operations
│       ├── CategoryRepository.ts      # Categories DB operations (hierarchical)
│       ├── RecurringExpenseRepository.ts # Recurring rules + occurrences DB operations
│       └── TripRepository.ts          # Trip CRUD + trip categories DB operations
│
├── schemas/
│   ├── transaction.ts                 # Transaction, Category, Group Zod schemas
│   ├── recurring-expense.ts           # Recurring expense Zod schemas
│   └── trip.ts                        # Trip and trip expense Zod schemas
│
├── types/
│   └── finance.ts                     # TypeScript interfaces
│
├── constants/
│   └── finance.ts                     # Type constants, query keys, API endpoints
│
├── providers/
│   ├── QueryProvider.tsx              # TanStack Query
│   ├── TranslationProvider.tsx        # i18n context
│   └── SessionProvider.tsx            # NextAuth (future)
│
├── utils/
│   ├── money.ts                       # Currency conversions
│   ├── helpers.ts                     # Date/utility functions
│   ├── recurring.ts                   # Occurrence date calculation
│   └── staticTranslations.ts         # i18n for error boundaries
│
└── messages/
    ├── en.json                        # English translations
    └── es.json                        # Spanish translations

database/
├── schema.sql                         # Tables, views, triggers (idempotent)
└── seed.sql                           # Initial categories
```

---

## Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ZUSTAND (UI State Only)                   │
│  - selectedMonth: "2025-01"                                  │
│  - filters: { type: 'all', categoryId: null }                │
│  - isRecurringPanelCollapsed: boolean                        │
│  - NO transactions[], NO categories[] (managed by Query)     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│               TANSTACK QUERY (Server State)                  │
│                                                              │
│  Core:                                                       │
│  - useTransactions(month) → cached, auto-refetch             │
│  - useCategories() → flat list                               │
│  - useCategoriesHierarchical() → parent-child tree           │
│  - useMonthlySummary(month) → aggregated from views          │
│                                                              │
│  Extended:                                                   │
│  - useSubcategorySummary(month, parentId) → drill-down       │
│  - useRecurringExpenses() → active rules                     │
│  - usePendingOccurrences() → unconfirmed instances           │
│  - useGroupedTransactions(month) → client-side grouping      │
│  - useTrips() → trip list with aggregates                    │
│  - useTrip(id) → trip detail with expenses                   │
│  - useTripCategories() → Viajes subcategories                │
│                                                              │
│  Auto-invalidation on create/update/delete                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    API ROUTES (Next.js)                      │
│  - Zod validation on all inputs                              │
│  - Converts euros → cents before storage                     │
│  - Shared expense halving (Math.ceil)                        │
│  - Balanced rounding for groups                              │
│  - Returns structured { success, data, error } responses     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  REPOSITORY LAYER (MSSQL)                    │
│  - Connection pool (serverless-safe)                         │
│  - Parameterized queries (SQL injection protection)          │
│  - Row → TypeScript transformations                          │
│  - TransactionRepository (transactions + groups)             │
│  - CategoryRepository (hierarchical categories)              │
│  - RecurringExpenseRepository (rules + occurrences)          │
│  - TripRepository (trips + trip expenses + trip categories)  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    SQL SERVER DATABASE                       │
│  Tables:                                                     │
│  - Categories (hierarchical via ParentCategoryID)            │
│  - Transactions (SharedDivisor, OriginalAmountCents, TripID) │
│  - TransactionGroups (identity anchor)                       │
│  - Trips (multi-day travel expense tracking)                 │
│  - RecurringExpenses (rules with frequency scheduling)       │
│  - RecurringExpenseOccurrences (pending/confirmed/skipped)   │
│                                                              │
│  Views:                                                      │
│  - vw_MonthlySummary (aggregates under parent category)      │
│  - vw_MonthlyBalance (income/expense/balance totals)         │
│  - vw_SubcategorySummary (drill-down within parent)          │
│                                                              │
│  Triggers:                                                   │
│  - Auto-update UpdatedAt timestamps                          │
└─────────────────────────────────────────────────────────────┘
```

---

## State Management Strategy

### Zustand (UI State Only)

```typescript
// src/stores/useFinanceStore.ts
interface FinanceUIState {
  selectedMonth: string;              // "2025-01"
  filters: {
    type: FilterType;                 // 'all' | 'income' | 'expense'
    categoryId: number | null;
  };
  isRecurringPanelCollapsed: boolean; // Recurring panel toggle

  // Actions
  setSelectedMonth: (month: string) => void;
  goToPreviousMonth: () => void;
  goToNextMonth: () => void;
  goToCurrentMonth: () => void;
  setFilters: (filters: Partial<FinanceFilters>) => void;
  resetFilters: () => void;
  toggleRecurringPanel: () => void;
}
```

**Important**: Use `useShallow` for selectors returning objects to prevent infinite loops:

```typescript
import { useShallow } from 'zustand/react/shallow';

// Correct - prevents infinite re-renders
export const useFilters = () => useFinanceStore(useShallow((s) => s.filters));
export const useMonthNavigation = () =>
  useFinanceStore(useShallow((s) => ({
    goToPreviousMonth: s.goToPreviousMonth,
    goToNextMonth: s.goToNextMonth,
    goToCurrentMonth: s.goToCurrentMonth,
  })));
```

### TanStack Query (Server State)

Server data is managed entirely by TanStack Query with:
- 5 minute stale time (default), 1 minute for pending occurrences
- 30 minute garbage collection
- Auto-refetch on window focus
- Automatic cache invalidation on mutations

```typescript
// Query Keys (src/constants/finance.ts)
export const QUERY_KEY = {
  CATEGORIES: 'categories',
  TRANSACTIONS: 'transactions',
  SUMMARY: 'summary',
  SUBCATEGORY_SUMMARY: 'subcategory-summary',
  RECURRING_EXPENSES: 'recurring-expenses',
  PENDING_OCCURRENCES: 'pending-occurrences',
  TRANSACTION_GROUPS: 'transaction-groups',
} as const;

// API Endpoints (src/constants/finance.ts)
export const API_ENDPOINT = {
  CATEGORIES: '/api/categories',
  TRANSACTIONS: '/api/transactions',
  SUMMARY: '/api/summary',
  SUBCATEGORY_SUMMARY: '/api/summary/subcategories',
  RECURRING_EXPENSES: '/api/recurring-expenses',
  TRANSACTION_GROUPS: '/api/transaction-groups',
} as const;
```

---

## Feature Architecture

### 1. Hierarchical Categories

Categories support parent-child relationships via a self-referencing `ParentCategoryID` foreign key.

```
┌────────────────────────────────────────────┐
│  Categories Table                          │
│  ParentCategoryID NULL → Parent category   │
│  ParentCategoryID INT  → Subcategory       │
│                                            │
│  Example:                                  │
│  [1] Ocio (ParentCategoryID = NULL)        │
│    ├── [10] Restaurantes (Parent = 1)      │
│    ├── [11] Cine (Parent = 1)              │
│    └── [12] Suscripciones (Parent = 1)     │
└────────────────────────────────────────────┘
```

**Key behaviors:**
- `vw_MonthlySummary` aggregates subcategory transactions under their parent using `COALESCE(c.ParentCategoryID, c.CategoryID)`
- `vw_SubcategorySummary` provides drill-down data within a parent category
- `CategorySelector` component renders a two-level `parent > subcategory` dropdown
- Categories can be fetched flat (default) or hierarchical (`?hierarchical=true`)
- `DefaultShared` flag on a category auto-toggles the shared expense checkbox in forms

**API:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/categories` | List active categories (flat) |
| GET | `/api/categories?hierarchical=true` | List as parent-child tree |
| GET | `/api/categories?type=expense` | Filter by type |
| GET | `/api/categories?includeInactive=true` | Include deactivated |
| POST | `/api/categories` | Create category/subcategory |
| GET | `/api/categories/[id]` | Get single category |
| PUT | `/api/categories/[id]` | Update (type/parent immutable) |
| DELETE | `/api/categories/[id]` | Delete (blocked if has transactions) |

### 2. Shared Expenses

Transactions can be marked as shared (split by 2 for a couple).

```
┌──────────────────────────────────────────────────────────────┐
│  Shared Expense Flow                                         │
│                                                              │
│  User enters: €50.00 (isShared = true)                       │
│                                                              │
│  API calculates:                                             │
│  OriginalAmountCents = 5000                                  │
│  SharedDivisor = 2                                           │
│  AmountCents = Math.ceil(5000 / 2) = 2500                    │
│                                                              │
│  Odd amounts: €50.01 → 5001 / 2 = ceil(2500.5) = 2501       │
│  (Rounding always up to not undercount expenses)             │
└──────────────────────────────────────────────────────────────┘
```

**Database columns on Transactions:**
- `SharedDivisor` (TINYINT, default 1): `1` = personal, `2` = split-by-2
- `OriginalAmountCents` (INT, nullable): full amount before division (NULL if not shared)
- `AmountCents`: effective amount used in all views and aggregations

**Constants:**

```typescript
export const SHARED_EXPENSE = {
  DIVISOR: 2,           // Split by 2
  DEFAULT_DIVISOR: 1,   // Personal (no split)
} as const;
```

### 3. Recurring Expenses

Rules-based system for defining and tracking recurring transactions.

```
┌────────────────────────────────────────────────────────────────┐
│  Recurring Expense Lifecycle                                   │
│                                                                │
│  [Rule] RecurringExpenses                                      │
│    frequency: monthly, dayOfMonth: 15                          │
│    amountCents: 2000, categoryId: 5                            │
│         │                                                      │
│         ▼ (on page load, API generates missing occurrences)    │
│  [Instances] RecurringExpenseOccurrences                        │
│    ├── 2025-01-15: confirmed → Transaction #42                 │
│    ├── 2025-02-15: skipped                                     │
│    └── 2025-03-15: pending ← shown in dashboard panel          │
│                      │                                         │
│                      ▼ (user confirms)                         │
│              Creates real Transaction with RecurringExpenseID   │
└────────────────────────────────────────────────────────────────┘
```

**Tables:**
- `RecurringExpenses`: rules with frequency (`weekly`/`monthly`/`yearly`), scheduling fields (`DayOfWeek`, `DayOfMonth`, `MonthOfYear`), and date range (`StartDate`/`EndDate`)
- `RecurringExpenseOccurrences`: individual instances with status (`pending`/`confirmed`/`skipped`) and optional `TransactionID` FK

**Constraint validation:**
- Weekly rules require `DayOfWeek` (0-6, Sunday-Saturday)
- Monthly rules require `DayOfMonth` (1-31, clamped to actual month length)
- Yearly rules require `DayOfMonth` + `MonthOfYear` (1-12)

**Occurrence generation** (`src/utils/recurring.ts`):
- Pure functions calculate dates based on rule frequency and target month
- Day clamping handles short months (e.g., day 31 in February becomes 28/29)
- Retroactive generation fills gaps from `StartDate` to current month

**API:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/recurring-expenses` | List all active rules |
| POST | `/api/recurring-expenses` | Create rule |
| GET | `/api/recurring-expenses/[id]` | Get single rule |
| PUT | `/api/recurring-expenses/[id]` | Update rule |
| DELETE | `/api/recurring-expenses/[id]` | Delete rule |
| GET | `/api/recurring-expenses/pending` | All pending occurrences |
| POST | `/api/recurring-expenses/occurrences/[id]/confirm` | Confirm (creates transaction) |
| POST | `/api/recurring-expenses/occurrences/[id]/skip` | Skip occurrence |

**Constants:**

```typescript
export const RECURRING_FREQUENCY = {
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
} as const;

export const OCCURRENCE_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  SKIPPED: 'skipped',
} as const;
```

### 4. Transaction Groups (Outings / Salidas)

Multiple transactions linked to a single event (e.g., a dinner outing with food + drinks + dessert from different subcategories).

```
┌──────────────────────────────────────────────────────────────┐
│  Transaction Group Flow                                      │
│                                                              │
│  POST /api/transaction-groups                                │
│  {                                                           │
│    description: "Cena cumpleanos",                           │
│    transactionDate: "2025-03-15",                            │
│    type: "expense",                                          │
│    isShared: true,                                           │
│    parentCategoryId: 1,  // Ocio                             │
│    items: [                                                  │
│      { categoryId: 10, amount: 45.00 },  // Restaurantes    │
│      { categoryId: 11, amount: 12.50 },  // Copas           │
│    ]                                                         │
│  }                                                           │
│                                                              │
│  1. Creates TransactionGroups row (identity anchor)          │
│  2. Creates N Transactions, each with TransactionGroupID FK  │
│  3. Balanced rounding: last item absorbs cent difference     │
│                                                              │
│  UI Display (collapsible):                                   │
│  ▼ Cena cumpleanos         -€28.75  (shared total)           │
│    ├── Restaurantes        -€22.50                           │
│    └── Copas               -€6.25                            │
└──────────────────────────────────────────────────────────────┘
```

**Tables:**
- `TransactionGroups`: minimal identity anchor (just `TransactionGroupID` and `CreatedAt`)
- `Transactions.TransactionGroupID`: FK linking transactions to their group

**Key behaviors:**
- Atomic creation: all transactions in a group are created in a single request
- Balanced rounding for shared groups: last item absorbs the cent difference so `sum(halved items) == halved total`
- Orphan cleanup: empty groups are auto-deleted when the last transaction is removed
- `useGroupedTransactions` hook splits transactions into standalone + grouped via `useMemo` (client-side grouping)

**API:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/transaction-groups` | Create group with N transactions atomically |
| DELETE | `/api/transaction-groups/[id]` | Delete group and all its transactions |
| PATCH | `/api/transaction-groups/[id]` | Update description/date (propagates to all) |

### 5. Trips (Travel Expense Tracking)

Multi-day, multi-category travel expenses grouped under a named trip entity.

```
┌──────────────────────────────────────────────────────────────┐
│  Trip Flow                                                    │
│                                                               │
│  Trip: "Sierra Nevada 2025"                                   │
│  ├── Expense: Gasolina €45.00 (Oct 15)                        │
│  ├── Expense: Hotel €120.00 (Oct 15)                          │
│  ├── Expense: Comida €35.50 (Oct 16)                          │
│  └── Expense: Peaje €12.00 (Oct 17)                           │
│                                                               │
│  Key design:                                                  │
│  - Trip expenses are regular Transactions with TripID FK      │
│  - Categories come from "Viajes" subcategories                │
│  - SQL views aggregate trips under start date month            │
│  - Dashboard groups trips into collapsible TripGroupRow       │
└──────────────────────────────────────────────────────────────┘
```

**Tables:**
- `Trips`: minimal entity with `Name` + timestamps
- `Transactions.TripID`: FK linking transactions to their trip

**Key behaviors:**
- Trip expenses use subcategories of the "Viajes" parent category (e.g., Gasolina, Comida, Hotel)
- SQL views (`vw_MonthlySummary`, `vw_SubcategorySummary`) aggregate trip transactions under the trip's earliest expense date, not each individual transaction date
- `useGroupedTransactions` groups trip transactions into `TripGroupDisplay` objects (client-side, similar to transaction groups)
- Trips with only 1 expense are treated as ungrouped transactions in the dashboard
- Deleting a trip cascades to all its linked transactions (uses SQL transaction)

**API:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/trips` | List all trips with summary aggregates |
| POST | `/api/trips` | Create trip (name) |
| GET | `/api/trips/[id]` | Get trip with full expenses and category summary |
| PATCH | `/api/trips/[id]` | Update trip name |
| DELETE | `/api/trips/[id]` | Delete trip + all linked transactions |
| POST | `/api/trips/[id]/expenses` | Add expense to trip |
| PUT | `/api/trips/[id]/expenses/[expenseId]` | Update trip expense |
| DELETE | `/api/trips/[id]/expenses/[expenseId]` | Delete trip expense |
| GET | `/api/trips/categories` | Get Viajes subcategories |

---

## Money Handling

**Critical**: All monetary values are stored as **integers (cents)** to avoid floating point precision errors.

| User Input | Storage | Display |
|------------|---------|---------|
| €419.28 | 41928 (INT) | "419,28 €" |

### Conversion Functions

```typescript
// src/utils/money.ts

// User input → Database
eurosToCents(419.28) // → 41928

// Database → Display
centsToEuros(41928)  // → 419.28

// Formatted for UI
formatCurrency(41928) // → "419,28 €"
```

### API Flow

1. **Input**: User enters `419.28` (euros)
2. **API receives**: `{ amount: 419.28 }` (euros)
3. **API converts**: `eurosToCents(419.28)` → `41928`
4. **Shared halving** (if applicable): `Math.ceil(41928 / 2)` → `20964`
5. **Database stores**: `AmountCents = 20964`, `OriginalAmountCents = 41928`, `SharedDivisor = 2`
6. **API returns**: `{ amountCents: 20964, originalAmountCents: 41928, sharedDivisor: 2 }`
7. **UI displays**: `formatCurrency(20964)` → "209,64 €"

---

## Database Architecture

### Tables

| Table | Purpose |
|-------|---------|
| `Categories` | Hierarchical categories (parent-child via `ParentCategoryID`) |
| `Transactions` | Income/expense records with shared expense support |
| `TransactionGroups` | Identity anchor for linked transaction groups |
| `Trips` | Multi-day travel expense tracking (name + timestamps) |
| `RecurringExpenses` | Recurring expense rules with frequency scheduling |
| `RecurringExpenseOccurrences` | Individual occurrence instances (pending/confirmed/skipped) |
| `Users` | User accounts with locale preference |
| `Accounts` | OAuth provider accounts (NextAuth) |
| `Sessions` | User sessions (NextAuth) |
| `VerificationTokens` | Email verification (NextAuth) |

### Entity Relationships

```
Categories
  ├── ParentCategoryID → Categories (self-ref, subcategories)
  ├── ← Transactions.CategoryID
  └── ← RecurringExpenses.CategoryID

TransactionGroups
  └── ← Transactions.TransactionGroupID

Trips
  └── ← Transactions.TripID

RecurringExpenses
  ├── ← RecurringExpenseOccurrences.RecurringExpenseID (CASCADE)
  └── ← Transactions.RecurringExpenseID

RecurringExpenseOccurrences
  └── TransactionID → Transactions (SET NULL on delete)
```

### Pre-calculated Views

SQL Views handle aggregation -- calculations happen in database, not JavaScript:

```sql
-- vw_MonthlySummary: Totals by PARENT category per month
-- Subcategory transactions aggregate under their parent via COALESCE
SELECT
    FORMAT(t.TransactionDate, 'yyyy-MM') AS Month,
    COALESCE(c.ParentCategoryID, c.CategoryID) AS CategoryID,
    COALESCE(parent.Name, c.Name) AS CategoryName,
    SUM(t.AmountCents) AS TotalCents,
    COUNT(*) AS TransactionCount
FROM Transactions t
INNER JOIN Categories c ON t.CategoryID = c.CategoryID
LEFT JOIN Categories parent ON c.ParentCategoryID = parent.CategoryID
GROUP BY ...

-- vw_MonthlyBalance: Income/Expense/Balance per month
SELECT Month, IncomeCents, ExpenseCents, BalanceCents

-- vw_SubcategorySummary: Drill-down within a parent category
-- Shows individual subcategory totals for a given parent + month
SELECT ParentCategoryID, SubcategoryID, SubcategoryName, TotalCents
```

### Idempotent Schema

The `schema.sql` file drops all objects before creating them, ensuring safe re-execution:

```sql
-- Order matters for FK dependencies
IF OBJECT_ID('TR_Accounts_UpdatedAt', 'TR') IS NOT NULL DROP TRIGGER ...
IF OBJECT_ID('vw_MonthlyBalance', 'V') IS NOT NULL DROP VIEW ...
DROP TABLE IF EXISTS Sessions;
DROP TABLE IF EXISTS Accounts;
DROP TABLE IF EXISTS Transactions;
DROP TABLE IF EXISTS Categories;
-- Then CREATE all objects...
```

---

## Constants (Single Source of Truth)

All type literals and configuration values are centralized in `src/constants/finance.ts`:

```typescript
// Transaction types
TRANSACTION_TYPE = { INCOME: 'income', EXPENSE: 'expense' }

// UI filter (includes 'all')
FILTER_TYPE = { ALL: 'all', INCOME: 'income', EXPENSE: 'expense' }

// Shared expense configuration
SHARED_EXPENSE = { DIVISOR: 2, DEFAULT_DIVISOR: 1 }

// Recurring expense frequencies
RECURRING_FREQUENCY = { WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' }

// Occurrence statuses
OCCURRENCE_STATUS = { PENDING: 'pending', CONFIRMED: 'confirmed', SKIPPED: 'skipped' }

// Balance card variants
CARD_VARIANT = { INCOME: 'income', EXPENSE: 'expense', BALANCE: 'balance' }

// TanStack Query keys
QUERY_KEY = {
  CATEGORIES, TRANSACTIONS, SUMMARY,
  SUBCATEGORY_SUMMARY, RECURRING_EXPENSES,
  PENDING_OCCURRENCES, TRANSACTION_GROUPS,
  TRIPS, TRIP_CATEGORIES,
}

// API endpoints
API_ENDPOINT = {
  CATEGORIES, TRANSACTIONS, SUMMARY,
  SUBCATEGORY_SUMMARY, RECURRING_EXPENSES,
  TRANSACTION_GROUPS, TRIPS,
}

// Cache times
CACHE_TIME = { ONE_MINUTE, TWO_MINUTES, FIVE_MINUTES, TEN_MINUTES, THIRTY_MINUTES }

// Validation
MONTH_FORMAT_REGEX = /^\d{4}-\d{2}$/
```

---

## Provider Stack

Providers are nested in `layout.tsx`:

```tsx
<html>
  <body>
    <QueryProvider>           {/* TanStack Query */}
      <TranslationProvider>   {/* i18n */}
        <SessionProvider>     {/* NextAuth (future) */}
          {children}
        </SessionProvider>
      </TranslationProvider>
    </QueryProvider>
  </body>
</html>
```

---

## Validation Architecture

Zod schemas are shared between frontend forms and API endpoints:

```typescript
// src/schemas/transaction.ts
CreateTransactionSchema       // Single transaction with isShared flag
UpdateTransactionSchema       // Partial update
CreateCategorySchema          // Category with parentCategoryId, defaultShared
UpdateCategorySchema          // Partial (type/parent immutable)
CreateTransactionGroupSchema  // Group with items array (1-20)
UpdateTransactionGroupSchema  // Description/date propagation

// src/schemas/recurring-expense.ts
CreateRecurringExpenseSchema  // With frequency-conditional validation
UpdateRecurringExpenseSchema  // Partial update
ConfirmOccurrenceSchema       // Optional modified amount

// src/schemas/trip.ts
CreateTripSchema              // Trip name validation
UpdateTripSchema              // Partial trip update
CreateTripExpenseSchema       // Trip expense (always expense type)
UpdateTripExpenseSchema       // Partial trip expense update

// Shared validation helper
validateRequest(schema, data)
// → { success: true, data: T }
// → { success: false, errors: { fieldName: ['message'] } }
```

Frequency-conditional validation example:

```typescript
CreateRecurringExpenseSchema
  .refine(data => {
    if (data.frequency === 'weekly') return data.dayOfWeek !== null;
    return true;
  }, { path: ['dayOfWeek'] })
  .refine(data => {
    if (data.frequency === 'monthly' || data.frequency === 'yearly')
      return data.dayOfMonth !== null;
    return true;
  }, { path: ['dayOfMonth'] })
```

---

## i18n System

### Standard Components

Use the `useTranslations` hook within React context:

```typescript
const t = useTranslations();
return <h1>{t('dashboard.title')}</h1>;
```

### Error Boundaries

Global error page cannot access React context. Uses static translations:

```typescript
// src/utils/staticTranslations.ts
import Cookies from 'js-cookie';

export function detectLocale(): 'en' | 'es' {
  // 1. Check localStorage
  // 2. Check cookie (via js-cookie)
  // 3. Fallback to 'es'
}

export function getErrorTranslations(locale: 'en' | 'es') {
  return locale === 'en' ? en.errors : es.errors;
}
```

---

## Error Handling

### Page-Level Error (`error.tsx`)

- Has access to React context
- Uses `useTranslations()` hook
- Styled with Tailwind CSS

### Global Error (`global-error.tsx`)

- Catches unhandled errors in root layout
- Renders full HTML document
- Uses inline styles (no CSS dependencies)
- Uses `staticTranslations` for i18n

### API Error Responses

```typescript
// Success
{ success: true, data: { ... } }

// Validation Error (400)
{ success: false, errors: { fieldName: ['Error message'] } }

// Server Error (500)
{ success: false, error: 'Human-readable message' }
```

---

## Performance Optimizations

### Month Prefetching

Adjacent months are prefetched when navigating:

```typescript
// src/hooks/useMonthPrefetch.ts
const prefetchAdjacentMonths = (month: string) => {
  queryClient.prefetchQuery({
    queryKey: [QUERY_KEY.SUMMARY, prevMonth],
    staleTime: CACHE_TIME.FIVE_MINUTES,
  });
  queryClient.prefetchQuery({
    queryKey: [QUERY_KEY.SUMMARY, nextMonth],
    staleTime: CACHE_TIME.FIVE_MINUTES,
  });
};
```

### Client-Side Transaction Grouping

`useGroupedTransactions` splits monthly transactions into standalone, grouped (outings), and trip-grouped using `useMemo`. This avoids extra API calls since monthly transaction volumes are typically 50-200 records:

```typescript
// src/hooks/useTransactions.ts
export function useGroupedTransactions(month, filters) {
  const query = useTransactions(month, filters);
  const grouped = useMemo(() => {
    // 1. Split transactions by TransactionGroupID → TransactionGroupDisplay[]
    // 2. Split remaining by TripID → TripGroupDisplay[]
    // 3. Single-item groups/trips treated as ungrouped
    // Returns { ungrouped, groups, tripGroups }
  }, [query.data]);
  return { ...query, grouped };
}
```

### Lazy Subcategory Loading

`useSubcategorySummary` is only enabled when a parent category is expanded (`enabled: parentCategoryId !== null`), preventing unnecessary queries.

### Database View Aggregations

All calculations (sums, counts) are done in SQL views, not JavaScript:

```sql
-- Database does the heavy lifting
SELECT SUM(AmountCents) AS TotalCents FROM Transactions
```

### Connection Pool

Serverless-safe configuration prevents connection leaks:

```typescript
pool: {
  max: 10,              // Maximum connections
  min: 0,               // Zero minimum for serverless
  idleTimeoutMillis: 30000,
}
```

---

## Security Considerations

1. **Parameterized Queries**: All SQL uses `request.input()` to prevent injection
2. **Zod Validation**: All API inputs validated before processing
3. **NextAuth Integration**: User authentication (planned)
4. **Cookie Security**: Uses `js-cookie` library for proper handling
5. **Cascade Constraints**: `RecurringExpenseOccurrences` cascade on rule deletion; `TransactionID` set to NULL on transaction deletion
6. **Referential Integrity**: Categories cannot be deleted if they have associated transactions

---

## Testing Strategy

Tests use Jest + Testing Library following the Hybrid Testing Approach:
- **Integration Tests (60%)**: API endpoint contracts, database interactions
- **Unit Tests (25%)**: Pure utilities, schema validation, occurrence calculations
- **Component Tests (10%)**: Interactive UI components
- **E2E Tests (5%)**: Critical user flows

```
src/__tests__/
├── api/
│   ├── version.test.ts                   # Version endpoint
│   ├── categories-crud.test.ts           # Category CRUD operations
│   ├── categories-hierarchical.test.ts   # Hierarchical category queries
│   ├── transactions-shared.test.ts       # Shared expense API logic
│   ├── subcategory-summary.test.ts       # Subcategory drill-down API
│   ├── recurring-expenses-crud.test.ts   # Recurring expense CRUD
│   └── recurring-occurrences.test.ts     # Occurrence confirm/skip API
├── components/
│   ├── ErrorPage.test.tsx
│   ├── GlobalError.test.tsx
│   ├── NotFoundPage.test.tsx
│   ├── CategorySelector.test.tsx         # Hierarchical dropdown
│   ├── CategoryTree.test.tsx             # Tree view interactions
│   ├── RecurringExpenseForm.test.tsx      # Recurring form validation
│   ├── RecurringPendingPanel.test.tsx     # Pending panel interactions
│   └── TransactionList-shared.test.tsx   # Shared expense display
├── providers/
│   └── SessionProvider.test.tsx
└── utils/
    ├── staticTranslations.test.ts
    ├── category-tree.test.ts             # Tree building utilities
    ├── shared-expense-logic.test.ts      # Halving/rounding logic
    ├── update-category-schema.test.ts    # Category schema validation
    ├── recurring-expense-schema.test.ts  # Recurring schema validation
    └── recurring-occurrences.test.ts     # Date calculation utilities
```

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| `docs/API_REFERENCE.md` | API endpoints, request/response formats |
| `docs/DATA_MODELS.md` | Database schema, TypeScript types, Zod schemas |
| `docs/TESTING_STRATEGY.md` | Hybrid testing approach guidelines |
| `database/schema.sql` | Complete database schema (includes Trips table) |
| `database/seed.sql` | Initial category data |
| `database/migrations/` | Database migration scripts |
