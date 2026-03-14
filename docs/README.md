# BudgetGuard Documentation

Complete documentation for the BudgetGuard family expense tracking system.

---

## Quick Reference

| Document | Purpose | Keywords |
|----------|---------|----------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture, data flow, state management | architecture, providers, Zustand, TanStack Query, data flow |
| [API_REFERENCE.md](./API_REFERENCE.md) | REST API endpoints, request/response formats | API, endpoints, routes, REST, HTTP |
| [DATA_MODELS.md](./DATA_MODELS.md) | Database schema, TypeScript types, Zod schemas | database, schema, types, interfaces, validation, Zod |
| [TESTING_STRATEGY.md](./TESTING_STRATEGY.md) | Testing approach, test structure, guidelines | tests, jest, integration, unit, component |
| [CHANGELOG.md](../CHANGELOG.md) | Version history and release notes | changelog, releases, versions |

---

## Document Summaries

### ARCHITECTURE.md

Covers the overall system design:
- Tech stack overview (Next.js 16, React 19, PostgreSQL/Neon)
- Project structure with all directories explained
- Data flow from UI → Zustand → TanStack Query → API → Database
- State management strategy (Zustand for UI, TanStack Query for server)
- Money handling patterns (cents vs euros)
- Provider stack configuration
- i18n system (standard and static translations)
- Error handling strategy
- Performance optimizations
- API route handler wrapper (`withApiHandler`) pattern
- CI/CD pipeline (GitHub Actions)
- Feature modules: Hierarchical Categories, Shared Expenses, Recurring Expenses, Transaction Groups, Trips, Fiscal, Skydiving, Companies, Invoicing, Fiscal Documents, Fiscal Deadlines

### API_REFERENCE.md

Complete API documentation:
- Response format standards
- All endpoints with examples:
  - `GET/POST /api/categories` + `PUT/DELETE /api/categories/:id`
  - `GET/POST /api/transactions` + `GET/PUT/DELETE /api/transactions/:id`
  - `GET /api/summary` + `GET /api/summary/subcategories`
  - `GET/POST /api/recurring-expenses` + occurrences endpoints
  - `POST /api/transaction-groups` + `DELETE/PATCH /api/transaction-groups/:id`
  - `GET/POST /api/trips` + `GET/PATCH/DELETE /api/trips/:id`
  - `POST/PUT/DELETE /api/trips/:id/expenses`
  - `GET /api/trips/categories`
  - `GET /api/fiscal?year=&quarter=`
  - `GET/POST /api/companies` + `GET/PUT/DELETE /api/companies/:id`
  - `GET/POST /api/invoices` + `GET/PUT/DELETE /api/invoices/:id`
  - `POST /api/invoices/:id/finalize` + `POST /api/invoices/:id/pay` + `POST /api/invoices/:id/cancel` + `POST /api/invoices/:id/revert`
  - `GET/POST /api/fiscal/documents` + `GET/PUT/DELETE /api/fiscal/documents/:id`
  - `POST /api/fiscal/documents/bulk` + `GET /api/fiscal/documents/:id/download`
  - `GET /api/fiscal/deadlines` + `GET/PUT /api/fiscal/deadlines/settings`
  - `GET/POST /api/skydiving/jumps` + `GET/PUT/DELETE /:id` + `POST /import`
  - `GET/POST /api/skydiving/tunnel` + `PUT/DELETE /:id` + `POST /import`
  - `GET /api/skydiving/stats` + `GET /api/skydiving/categories`
  - `GET /api/version`
- Validation error formats
- Money handling in API requests (euros in, cents stored)
- Shared expense halving logic
- Transaction group balanced rounding

### DATA_MODELS.md

Database and type definitions:
- PostgreSQL table schemas:
  - Categories (with hierarchical subcategories)
  - Transactions (with shared expenses, recurring, groups, trips)
  - TransactionGroups (grouping anchor)
  - Trips (multi-day travel expense tracking)
  - RecurringExpenses + RecurringExpenseOccurrences
  - SkydiveJumps + TunnelSessions (skydiving module)
  - Users, Accounts, Sessions, VerificationTokens (NextAuth)
- Database views (vw_MonthlySummary, vw_MonthlyBalance, vw_SubcategorySummary)
- Indexes and triggers
- TypeScript interfaces for all entities
- Zod validation schemas
- Constants and utility functions

### TESTING_STRATEGY.md

Testing approach and guidelines:
- Hybrid methodology: contracts → implementation → integration tests
- Test distribution: Integration 60%, Unit 25%, Component 10%, E2E 5%
- Complete test folder structure with all current test files
- Feature-specific testing guidelines (shared expenses, recurring, groups)
- Anti-patterns to avoid

---

## Key Concepts

### Money Storage

All monetary values are stored as **integers (cents)** to avoid floating point precision errors:

```
User Input: €419.28
Storage:    41928 (INT)
Display:    "419,28 €"
```

### Shared Expenses (÷2)

Transactions can be split between 2 people:
- `SharedDivisor = 2` marks a shared expense
- `OriginalAmountCents` stores the full amount
- `AmountCents = Math.ceil(Original / 2)` — rounding favors the user
- Categories can have `DefaultShared = true` to auto-toggle the checkbox

### State Management

| Layer | Technology | Purpose |
|-------|------------|---------|
| UI State | Zustand | Month selection, filters, panel collapse |
| Server State | TanStack Query | Transactions, categories, summaries, recurring |

Never store server data in Zustand. Use TanStack Query hooks for all API data.

### Validation

Zod schemas are shared between frontend forms and API endpoints. Validation happens in both places for security and UX.

### Database Calculations

All aggregations (sums, counts) are done in SQL views, not in JavaScript. Subcategory transactions aggregate under their parent category.

### Hierarchical Categories

Categories support parent-child relationships via `ParentCategoryID`. A category with `ParentCategoryID = NULL` is a parent; otherwise it's a subcategory.

### Recurring Expenses

Rule-based system: define a frequency (weekly/monthly/yearly), and occurrences are generated. Users confirm or skip each occurrence from the dashboard panel.

### Transaction Groups

Multiple transactions linked to a single event (e.g., an outing with food, drinks, transport). Created atomically, displayed as collapsible rows with subcategory breakdown.

### Trips

Multi-day, multi-category travel expense tracking. Trips group transactions under a named trip entity (e.g., "Sierra Nevada 2025"). Trip expenses are regular transactions with a `TripID` foreign key. In the dashboard, trips with multiple expenses are displayed as collapsible rows. SQL views aggregate trip expenses under the trip's start date month for correct monthly summaries.

### Companies

Client/provider management with role-based separation. Companies have an `InvoiceLanguage` field for bilingual PDF generation. Companies are linked to transactions and invoices via `CompanyID`, and support soft-delete via `IsActive` flag.

### Invoicing

Full invoice lifecycle: draft→finalized→paid→cancelled. Cancelled invoices can be reverted to draft. Finalizing generates a PDF, uploads to blob storage, and creates a FiscalDocument. Marking paid creates an income transaction with today's date. Cancel/revert cleans up the associated FiscalDocument and blob storage. All destructive actions require confirm dialogs.

### Fiscal Documents

Store tax filings (modelos) and invoices as documents in Vercel Blob. Track filing status (pending/filed/postponed). Auto-detect document metadata from filenames. Supports bulk upload and private access with download proxy.

### Fiscal Deadlines

AEAT deadline computation for Spanish tax obligations. Filing status: not_due→upcoming→due→overdue→filed. Configurable reminder window for advance notifications.

---

## Feature Roadmap

| Phase | Status | Features |
|-------|--------|----------|
| Phase 1 (MVP) | ✅ Complete | Core CRUD, categories, monthly summary with SQL Views |
| Phase 1.5 | ✅ Complete | Hierarchical categories, shared expenses, category management |
| Phase 2 | ✅ Complete | Recurring expenses, transaction groups (outings) |
| Phase 2.5 | ✅ Complete | Trip tracking (multi-day, multi-category travel expenses) |
| Phase 2.7 | ✅ Complete | Fiscal module (Modelo 303/130, VAT, deductions) |
| Phase 2.8 | ✅ Complete | Skydiving module (jump log, tunnel, CSV import, stats) |
| Phase 2.9 | ✅ Complete | Settings (DB sync), CI/CD, API handler wrapper |
| Phase 3.0 | ✅ Complete | Invoicing (full lifecycle, PDF generation, companies) |
| Phase 3.1 | ✅ Complete | Fiscal Documents (Vercel Blob storage, bulk upload, filing status) |
| Phase 3.2 | ✅ Complete | Invoice Finalize (PDF→blob→FiscalDocument atomic flow) |
| Phase 4 | Planned | Charts, month-to-month comparison, Excel export |
| Phase 5 | Planned | Budgets per category, alerts |
| Phase 6 | Planned | Multi-user/family support, mobile PWA |

---

## For Claude Code

When asked about BudgetGuard, read the appropriate documentation:

| User Question | Read Document |
|--------------|---------------|
| "How does the app work?" | ARCHITECTURE.md |
| "What are the API endpoints?" | API_REFERENCE.md |
| "How is data structured?" | DATA_MODELS.md |
| "How to add a new endpoint?" | API_REFERENCE.md + DATA_MODELS.md |
| "Database schema?" | DATA_MODELS.md |
| "State management?" | ARCHITECTURE.md |
| "Form validation?" | DATA_MODELS.md (Zod schemas) |
| "How to handle money?" | ARCHITECTURE.md + DATA_MODELS.md |
| "How to write tests?" | TESTING_STRATEGY.md |
| "Shared expenses?" | API_REFERENCE.md + DATA_MODELS.md |
| "Recurring expenses?" | ARCHITECTURE.md + API_REFERENCE.md |
| "Transaction groups?" | ARCHITECTURE.md + API_REFERENCE.md |
| "Trips?" | ARCHITECTURE.md + API_REFERENCE.md |
| "Trip expenses?" | API_REFERENCE.md + DATA_MODELS.md |
| "Skydiving?" | ARCHITECTURE.md + API_REFERENCE.md |
| "Invoices?" | ARCHITECTURE.md + API_REFERENCE.md |
| "Companies?" | ARCHITECTURE.md + API_REFERENCE.md |
| "Fiscal documents?" | ARCHITECTURE.md + API_REFERENCE.md |
| "Fiscal deadlines?" | ARCHITECTURE.md + API_REFERENCE.md |
| "API handler wrapper?" | ARCHITECTURE.md (withApiHandler section) |

---

## Related Files

| File | Purpose |
|------|---------|
| `database/schema.sql` | Executable database schema (idempotent) |
| `database/seed.sql` | Initial category data |
| `src/types/finance.ts` | TypeScript interfaces |
| `src/schemas/transaction.ts` | Zod validation schemas (transactions, categories, groups) |
| `src/schemas/recurring-expense.ts` | Zod schemas for recurring expenses |
| `src/schemas/trip.ts` | Zod schemas for trips and trip expenses |
| `src/constants/finance.ts` | Type constants, query keys, API endpoints |
| `src/utils/money.ts` | Currency conversion utilities |
| `src/utils/recurring.ts` | Occurrence date generation |
| `src/schemas/company.ts` | Zod schemas for companies |
| `src/schemas/invoice.ts` | Zod schemas for invoices |
| `src/schemas/fiscal-document.ts` | Zod schemas for fiscal documents |
| `src/utils/invoicePdf.ts` | Invoice PDF generation utilities |
| `src/services/InvoiceFinalizeService.ts` | Invoice finalize orchestration (validate→PDF→blob→FiscalDocument) |
