# BudgetGuard Documentation

Complete documentation for the BudgetGuard family expense tracking system.

---

## Quick Reference

| Document | Purpose | Keywords |
|----------|---------|----------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture, data flow, state management | architecture, providers, Zustand, TanStack Query, data flow |
| [API_REFERENCE.md](./API_REFERENCE.md) | REST API endpoints, request/response formats | API, endpoints, routes, REST, HTTP |
| [DATA_MODELS.md](./DATA_MODELS.md) | Database schema, TypeScript types, Zod schemas | database, schema, types, interfaces, validation, Zod |

---

## Document Summaries

### ARCHITECTURE.md

Covers the overall system design:
- Tech stack overview (Next.js 16, React 19, SQL Server)
- Project structure with all directories explained
- Data flow from UI → Zustand → TanStack Query → API → Database
- State management strategy (Zustand for UI, TanStack Query for server)
- Money handling patterns (cents vs euros)
- Provider stack configuration
- i18n system (standard and static translations)
- Error handling strategy
- Performance optimizations

### API_REFERENCE.md

Complete API documentation:
- Response format standards
- All endpoints with examples:
  - `GET/POST /api/categories`
  - `GET/POST /api/transactions`
  - `GET/PUT/DELETE /api/transactions/:id`
  - `GET /api/summary`
  - `GET /api/version`
- Validation error formats
- Money handling in API requests

### DATA_MODELS.md

Database and type definitions:
- SQL Server table schemas (Categories, Transactions, Users, NextAuth tables)
- Database views (vw_MonthlySummary, vw_MonthlyBalance)
- Indexes and triggers
- TypeScript interfaces for all entities
- Zod validation schemas
- Constants and utility functions

---

## Key Concepts

### Money Storage

All monetary values are stored as **integers (cents)** to avoid floating point precision errors:

```
User Input: €419.28
Storage:    41928 (INT)
Display:    "419,28 €"
```

### State Management

| Layer | Technology | Purpose |
|-------|------------|---------|
| UI State | Zustand | Month selection, filters, modals |
| Server State | TanStack Query | Transactions, categories, summaries |

Never store server data in Zustand. Use TanStack Query hooks for all API data.

### Validation

Zod schemas are shared between frontend forms and API endpoints. Validation happens in both places for security and UX.

### Database Calculations

All aggregations (sums, counts, averages) are done in SQL views, not in JavaScript. This ensures performance and accuracy.

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

---

## Related Files

| File | Purpose |
|------|---------|
| `database/schema.sql` | Executable database schema (idempotent) |
| `database/seed.sql` | Initial category data |
| `src/types/finance.ts` | TypeScript interfaces |
| `src/schemas/transaction.ts` | Zod validation schemas |
| `src/constants/finance.ts` | Type constants, query keys |
| `src/utils/money.ts` | Currency conversion utilities |
