# BudgetGuard Architecture

## Overview

BudgetGuard is a family expense and income tracking system built with Next.js 16 App Router. The application replaces a traditional Excel-based workflow with a modern web experience.

### Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | Next.js 16 + React 19 | App Router, Server Components |
| **State Management** | Zustand 5.x | UI state only (month selection, filters) |
| **Server State** | TanStack Query | Data fetching, caching, mutations |
| **Validation** | Zod | Shared schemas (frontend + backend) |
| **Database** | SQL Server | Transactions, Categories, Users |
| **i18n** | Custom provider | Spanish/English support |

---

## Project Structure

```
src/
├── app/                          # Next.js App Router
│   ├── api/                      # API Routes
│   │   ├── categories/route.ts   # GET/POST categories
│   │   ├── transactions/         # Transaction CRUD
│   │   │   ├── route.ts          # GET/POST
│   │   │   └── [id]/route.ts     # GET/PUT/DELETE
│   │   ├── summary/route.ts      # Monthly aggregations
│   │   └── version/route.ts      # App version info
│   ├── (auth)/                   # Authenticated routes
│   │   └── dashboard/page.tsx    # Main dashboard
│   ├── layout.tsx                # Root layout with providers
│   ├── error.tsx                 # Error boundary
│   ├── global-error.tsx          # Global error (full HTML)
│   └── not-found.tsx             # 404 page
│
├── components/
│   ├── dashboard/
│   │   ├── BalanceCards.tsx      # Income/Expense/Balance cards
│   │   └── CategoryBreakdown.tsx # Category progress bars
│   ├── transactions/
│   │   ├── TransactionList.tsx   # Transaction list
│   │   └── TransactionForm.tsx   # Create/Edit form
│   └── ui/
│       ├── MonthPicker.tsx       # Month navigation
│       └── LoadingSpinner.tsx    # Loading indicator
│
├── hooks/
│   ├── useCategories.ts          # Categories query hook
│   ├── useTransactions.ts        # Transactions CRUD hooks
│   ├── useMonthlySummary.ts      # Raw summary data (cents)
│   ├── useFormattedSummary.ts    # Formatted summary (euros)
│   ├── useMonthPrefetch.ts       # Adjacent months prefetch
│   └── useTranslations.ts        # i18n hook
│
├── stores/
│   ├── useFinanceStore.ts        # UI state (Zustand)
│   └── localeStore.ts            # Language preference
│
├── services/
│   └── database/
│       ├── connection.ts         # MSSQL connection pool
│       ├── TransactionRepository.ts
│       └── CategoryRepository.ts
│
├── schemas/
│   └── transaction.ts            # Zod validation schemas
│
├── types/
│   └── finance.ts                # TypeScript interfaces
│
├── constants/
│   └── finance.ts                # Type constants, query keys
│
├── providers/
│   ├── QueryProvider.tsx         # TanStack Query
│   ├── TranslationProvider.tsx   # i18n context
│   └── SessionProvider.tsx       # NextAuth (future)
│
├── utils/
│   ├── money.ts                  # Currency conversions
│   ├── helpers.ts                # Date/utility functions
│   └── staticTranslations.ts     # i18n for error boundaries
│
└── messages/
    ├── en.json                   # English translations
    └── es.json                   # Spanish translations

database/
├── schema.sql                    # Tables, views, triggers (idempotent)
└── seed.sql                      # Initial categories
```

---

## Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ZUSTAND (UI State Only)                  │
│  • selectedMonth: "2025-01"                                 │
│  • filters: { type: 'all', categoryId: null }               │
│  • NO transactions[], NO categories[] (managed by Query)    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│               TANSTACK QUERY (Server State)                 │
│  • useTransactions(month) → cached, auto-refetch            │
│  • useCategories() → cached                                 │
│  • useMonthlySummary(month) → aggregated from views         │
│  • Auto-invalidation on create/update/delete                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    API ROUTES (Next.js)                     │
│  • Zod validation on all inputs                             │
│  • Converts euros → cents before storage                    │
│  • Returns structured { success, data, error } responses    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  REPOSITORY LAYER (MSSQL)                   │
│  • Connection pool (serverless-safe)                        │
│  • Parameterized queries (SQL injection protection)         │
│  • Row → TypeScript transformations                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    SQL SERVER DATABASE                      │
│  • Transactions (AmountCents as INT)                        │
│  • Categories                                               │
│  • Pre-calculated views (vw_MonthlySummary, vw_MonthlyBalance)
│  • UpdatedAt triggers                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## State Management Strategy

### Zustand (UI State Only)

```typescript
// src/stores/useFinanceStore.ts
interface FinanceUIState {
  selectedMonth: string;      // "2025-01"
  filters: {
    type: FilterType;         // 'all' | 'income' | 'expense'
    categoryId: number | null;
  };
  // Actions
  setSelectedMonth: (month: string) => void;
  goToPreviousMonth: () => void;
  goToNextMonth: () => void;
  setFilters: (filters: Partial<FinanceFilters>) => void;
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
  })));
```

### TanStack Query (Server State)

Server data is managed entirely by TanStack Query with:
- 5 minute stale time
- 30 minute garbage collection
- Auto-refetch on window focus
- Automatic cache invalidation on mutations

```typescript
// Query Keys (src/constants/finance.ts)
export const QUERY_KEY = {
  CATEGORIES: 'categories',
  TRANSACTIONS: 'transactions',
  SUMMARY: 'summary',
} as const;

// Usage
useQuery({ queryKey: [QUERY_KEY.TRANSACTIONS, month] });
```

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
4. **Database stores**: `AmountCents = 41928` (integer)
5. **API returns**: `{ amountCents: 41928 }`
6. **UI displays**: `formatCurrency(41928)` → "419,28 €"

---

## Database Architecture

### Tables

| Table | Purpose |
|-------|---------|
| `Categories` | Transaction categories (income/expense) |
| `Transactions` | Income and expense records |
| `Users` | User accounts with locale preference |
| `Accounts` | OAuth provider accounts (NextAuth) |
| `Sessions` | User sessions (NextAuth) |
| `VerificationTokens` | Email verification (NextAuth) |

### Pre-calculated Views

SQL Views handle aggregation - calculations happen in database, not JavaScript:

```sql
-- vw_MonthlySummary: Totals by category per month
SELECT Month, Type, CategoryID, CategoryName, SUM(AmountCents) AS TotalCents

-- vw_MonthlyBalance: Income/Expense/Balance per month
SELECT Month, IncomeCents, ExpenseCents, BalanceCents
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

## Validation Architecture

Zod schemas are shared between frontend forms and API endpoints:

```typescript
// src/schemas/transaction.ts
export const CreateTransactionSchema = z.object({
  categoryId: z.number().int().positive('Selecciona una categoria'),
  amount: z.number().positive('El monto debe ser mayor a 0'),
  description: z.string().max(255).optional(),
  transactionDate: z.coerce.date(),
  type: z.enum(['income', 'expense']),
});

// API validation helper
export function validateRequest<T>(schema: ZodSchema<T>, data: unknown) {
  const result = schema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return { success: false, errors: result.error.flatten().fieldErrors };
}
```

---

## Performance Optimizations

### Month Prefetching

Adjacent months are prefetched when navigating:

```typescript
// src/hooks/useMonthPrefetch.ts
const prefetchAdjacentMonths = (month: string) => {
  queryClient.prefetchQuery({
    queryKey: ['summary', prevMonth],
    staleTime: 5 * 60 * 1000,
  });
  queryClient.prefetchQuery({
    queryKey: ['summary', nextMonth],
    staleTime: 5 * 60 * 1000,
  });
};
```

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

---

## Testing Strategy

Tests use Jest + Testing Library:

```
src/__tests__/
├── api/
│   └── version.test.ts
├── components/
│   ├── ErrorPage.test.tsx
│   ├── GlobalError.test.tsx
│   └── NotFoundPage.test.tsx
├── providers/
│   └── SessionProvider.test.tsx
└── utils/
    └── staticTranslations.test.ts
```

### Test Patterns

```typescript
// Import jest-dom matchers
import '@testing-library/jest-dom';

// Mock external dependencies
jest.mock('next-auth/react', () => ({
  SessionProvider: ({ children }) => children,
}));

// Suppress expected warnings
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation((...args) => {
    if (String(args[0]).includes('expected warning')) return;
  });
});
```

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| `docs/API_REFERENCE.md` | API endpoints, request/response formats |
| `docs/DATA_MODELS.md` | Database schema, TypeScript types, Zod schemas |
| `database/schema.sql` | Complete database schema |
| `database/seed.sql` | Initial category data |
