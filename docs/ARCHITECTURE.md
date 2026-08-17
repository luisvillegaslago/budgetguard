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
| **Database** | PostgreSQL (Neon) | Transactions, Categories, Recurring Expenses, Groups, Trips, Skydiving |
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
│   │   │   └── [id]/
│   │   │       ├── route.ts           # GET/PUT/DELETE
│   │   │       └── status/route.ts    # PATCH (quick status change)
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
│   │   ├── fiscal/
│   │   │   ├── route.ts               # GET fiscal quarterly report
│   │   │   ├── annual/route.ts        # GET annual report (Modelo 390 + 100)
│   │   │   ├── assets/
│   │   │   │   ├── route.ts           # GET/POST fixed assets (inmovilizado)
│   │   │   │   └── [id]/route.ts      # GET (asset + schedule) / PUT / DELETE
│   │   │   ├── documents/
│   │   │   │   ├── route.ts           # GET/POST fiscal documents
│   │   │   │   ├── bulk/route.ts      # POST bulk upload
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts       # GET/PATCH/DELETE document
│   │   │   │       ├── download/route.ts  # GET download proxy
│   │   │   │       ├── extract/route.ts   # POST OCR extraction
│   │   │   │       └── link-transaction/route.ts # POST create + link
│   │   │   ├── deadlines/
│   │   │   │   ├── route.ts           # GET deadlines
│   │   │   │   └── settings/route.ts  # GET/PUT reminder settings
│   │   │   ├── profile/route.ts       # GET/PUT per-year fiscal profile
│   │   │   └── projection/route.ts    # GET IRPF provision
│   │   ├── skydiving/
│   │   │   ├── jumps/
│   │   │   │   ├── route.ts           # GET/POST jumps (paginated)
│   │   │   │   ├── [id]/route.ts      # GET/PUT/DELETE single jump
│   │   │   │   └── import/route.ts    # POST bulk import jumps
│   │   │   ├── tunnel/
│   │   │   │   ├── route.ts           # GET/POST tunnel sessions (paginated)
│   │   │   │   ├── [id]/route.ts      # PUT/DELETE single session
│   │   │   │   └── import/route.ts    # POST bulk import sessions
│   │   │   ├── stats/route.ts         # GET aggregated stats
│   │   │   └── categories/route.ts    # GET Paracaidismo subcategories
│   │   ├── vouchers/
│   │   │   ├── route.ts               # GET/POST vouchers (with live balance)
│   │   │   └── [id]/route.ts          # GET/PUT/DELETE single voucher
│   │   ├── crypto/                    # See docs/CRYPTO_MODULE.md
│   │   │   ├── credentials/           # POST/DELETE keys + GET status
│   │   │   ├── sync/                  # POST start, GET poll, POST cancel
│   │   │   ├── import/csv/route.ts    # POST exchange CSV upload
│   │   │   ├── normalize/route.ts     # POST run the normaliser
│   │   │   ├── fiscal/                # modelo100, disposals, export, recompute
│   │   │   └── ...                    # events, taxable-events, assets, pairs, klines, ticker
│   │   ├── companies/                 # GET/POST + [id] GET/PUT/DELETE
│   │   ├── invoices/                  # CRUD + finalize/pay/cancel/revert
│   │   ├── billing-profile/route.ts   # GET/PUT issuer data
│   │   ├── sync/                      # compare/execute (dev only)
│   │   ├── cron/crypto-sync/route.ts  # Weekly Vercel Cron
│   │   ├── auth/                      # NextAuth handlers
│   │   ├── summary/
│   │   │   ├── route.ts               # GET monthly balance
│   │   │   └── subcategories/route.ts # GET subcategory drill-down
│   │   └── version/route.ts           # App version info
│   ├── (auth)/                        # Authenticated routes
│   │   ├── dashboard/page.tsx         # Main dashboard
│   │   ├── categories/page.tsx        # Category management page
│   │   ├── recurring-expenses/page.tsx # Recurring expenses page
│   │   ├── trips/page.tsx             # Trips list page
│   │   ├── trips/[id]/page.tsx        # Trip detail page
│   │   ├── fiscal/page.tsx             # Fiscal report (303/130/390/100 + IRPF provision)
│   │   ├── skydiving/page.tsx         # Skydiving dashboard (jumps, tunnel, stats)
│   │   ├── crypto/page.tsx            # Crypto: sync, movements, positions, Modelo 100
│   │   ├── movements/page.tsx         # Movement browser (by category / by company)
│   │   ├── documents/page.tsx         # Fiscal document management
│   │   ├── invoices/page.tsx          # Invoice list
│   │   ├── invoices/[id]/page.tsx     # Invoice detail
│   │   ├── categories/[id]/history/page.tsx # Category transaction history
│   │   └── settings/page.tsx          # Settings (DB sync, billing, reminders)
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
│   ├── vouchers/
│   │   ├── VoucherFormModal.tsx       # Create/Edit voucher
│   │   └── VoucherDetailModal.tsx     # Balance + consumptions + reconciliation
│   ├── crypto/
│   │   ├── CryptoSyncPanel.tsx        # Credentials + sync job progress
│   │   ├── CryptoCsvUploader.tsx      # Multi-exchange CSV upload
│   │   ├── CryptoEventsTable.tsx      # Raw / taxable movements
│   │   ├── CryptoDisposalsTable.tsx   # FIFO disposals with lot breakdown
│   │   ├── CryptoModelo100Section.tsx # 1804-F/N, 0304, 0033 + needs-review
│   │   ├── CryptoPriceChart.tsx       # Candlestick chart + position panel
│   │   └── CryptoAeatGuide.tsx        # How to transcribe into Renta Web
│   ├── movements/
│   │   ├── CategoryBrowser.tsx        # Browse movements by category
│   │   ├── MovementDetail.tsx         # Movement detail panel
│   │   └── CompanyMovementDetail.tsx  # Company-scoped detail
│   ├── alerts/
│   │   └── AlertsSection.tsx          # Dashboard alerts aggregation
│   ├── invoices/                      # Invoice list, form, PDF preview, prefixes
│   ├── skydiving/                     # Jump log, tunnel log, stats, CSV import
│   ├── settings/                      # DB sync, billing profile, reminder settings
│   ├── navigation/                    # Sidebar and top navigation
│   ├── fiscal/
│   │   ├── FiscalReport.tsx           # Fiscal quarterly report display
│   │   ├── Modelo303Card.tsx          # VAT summary card
│   │   ├── Modelo130Card.tsx          # Income tax summary card
│   │   ├── FiscalDocumentUpload.tsx   # Single upload with auto-OCR
│   │   ├── FiscalDocumentList.tsx     # Document list with delete options
│   │   ├── FiscalExtractionConfirm.tsx # OCR confirmation modal
│   │   ├── FiscalBulkUpload.tsx       # Multi-file bulk uploader
│   │   ├── FiscalFilingStatus.tsx     # Filing status indicators
│   │   ├── Modelo390Card.tsx          # Annual VAT summary card
│   │   ├── Modelo100Card.tsx          # Renta economic-activities section
│   │   ├── IrpfProvisionCard.tsx      # 20% vs progressive scale + pension form
│   │   ├── FixedAssetsCard.tsx        # Inmovilizado + per-asset amortization schedule
│   │   ├── FiscalUncountedIncome.tsx  # Income no model counts (safety net)
│   │   ├── FiscalAmountRow.tsx        # Shared casilla row
│   │   ├── FiscalDeadlinePanel.tsx    # Deadline display panel
│   │   └── FiscalDeadlineBanner.tsx   # Dashboard deadline alert
│   └── ui/                            # ~25 shared primitives
│       ├── MonthPicker.tsx            # Month navigation
│       ├── CollapsibleSection.tsx     # Animated collapse
│       ├── RouteProgressBar.tsx       # Click-driven route progress
│       ├── LoadingSpinner.tsx         # Loading indicator
│       └── CategoryIcon.tsx           # Icon renderer
│
├── hooks/
│   ├── useCategories.ts               # Categories query hooks (flat + hierarchical)
│   ├── useTransactions.ts             # Transactions CRUD + useGroupedTransactions + useUpdateTransactionStatus
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
│   ├── useFiscalReport.ts            # Fiscal quarterly report query
│   ├── useFiscalDocuments.ts         # Fiscal document CRUD + OCR hooks
│   ├── useFiscalDeadlines.ts         # AEAT deadline queries
│   ├── useFiscalDefaults.ts          # Fiscal defaults per category
│   ├── useInvoices.ts                # Invoice CRUD + finalize hooks
│   ├── useCompanies.ts               # Companies list query
│   ├── useCompanyTransactions.ts     # Company-scoped transaction queries
│   ├── useCategoryHistory.ts         # Category transaction history
│   ├── useAppVersion.ts              # Build version info
│   ├── useDbSync.ts                  # Database sync hooks
│   ├── useSkydiveJumps.ts            # Jump CRUD queries/mutations
│   ├── useTunnelSessions.ts          # Tunnel session CRUD queries/mutations
│   ├── useSkydiveStats.ts            # Skydiving stats query
│   ├── useSkydiveCategories.ts       # Paracaidismo subcategories query
│   ├── useIrpfProjection.ts          # IRPF provision query
│   ├── useFiscalProfile.ts           # Per-year fiscal profile query/mutation
│   ├── useFixedAssets.ts             # Inmovilizado CRUD (invalidates the fiscal queries too)
│   ├── useVouchers.ts                # Voucher CRUD + balance
│   ├── useSkydiveVouchers.ts         # Voucher reconciliation for skydive activity
│   ├── useCryptoSync.ts              # Sync job trigger + polling
│   ├── useCryptoCredentials.ts       # Exchange key management
│   ├── useCryptoFiscal.ts            # Modelo 100 boxes, disposals, recompute
│   ├── useCryptoChart.ts             # Klines + ticker for the price chart
│   └── useTranslations.ts            # i18n hook
│
├── stores/
│   ├── useFinanceStore.ts             # UI state (Zustand)
│   ├── localeStore.ts                 # Language preference
│   └── themeStore.ts                  # Light/dark preference
│
├── services/
│   ├── database/
│   │   ├── connection.ts              # PostgreSQL (Neon) connection pool
│   │   ├── TransactionRepository.ts   # Transactions + groups DB operations
│   │   ├── CategoryRepository.ts      # Categories DB operations (hierarchical)
│   │   ├── RecurringExpenseRepository.ts # Recurring rules + occurrences DB operations
│   │   ├── TripRepository.ts          # Trip CRUD + trip categories DB operations
│   │   ├── FiscalRepository.ts        # Fiscal quarterly report DB operations
│   │   ├── FiscalDocumentRepository.ts # Fiscal document CRUD + auto-matching + linking
│   │   ├── InvoiceRepository.ts       # Invoice + prefix + billing profile CRUD
│   │   ├── CompanyRepository.ts       # Company CRUD + role filtering
│   │   ├── SkydiveRepository.ts       # Jump + tunnel CRUD, bulk import, stats, tx linking
│   │   ├── FiscalProfileRepository.ts # Per-year fiscal profile (partial upsert)
│   │   ├── FixedAssetRepository.ts    # Inmovilizado CRUD + amortization fold for the models
│   │   ├── VoucherRepository.ts       # Voucher CRUD + balance view
│   │   ├── Crypto*Repository.ts       # Raw events, positions, price cache, sync jobs, credentials
│   │   ├── TaxableEventsRepository.ts # Normalised legs + FIFO disposals
│   │   ├── CryptoFiscalRepository.ts  # Modelo 100 boxes, disposal queries
│   │   └── SyncService.ts            # Bidirectional database sync
│   ├── exchanges/                     # See docs/CRYPTO_MODULE.md
│   │   ├── shared/                    # ExchangeCsvImporter contract + registry
│   │   ├── binance/                   # Client, sync, normaliser, prices, klines, CSV
│   │   ├── kraken/                    # CSV importer + asset codes
│   │   └── coinbase/                  # CSV importer
│   ├── ocr/
│   │   ├── anthropicVision.ts         # Shared Claude Vision bridge (PDF/image → JSON)
│   │   ├── DocumentExtractor.ts       # Invoice OCR extraction
│   │   └── ModeloDetector.ts          # AEAT modelo type/period/result detection
│   └── InvoiceFinalizeService.ts      # Invoice finalize orchestration
│
├── schemas/
│   ├── transaction.ts                 # Transaction, Category, Group Zod schemas
│   ├── recurring-expense.ts           # Recurring expense Zod schemas
│   ├── trip.ts                        # Trip and trip expense Zod schemas
│   ├── fiscal.ts                      # Fiscal query validation
│   ├── fiscal-document.ts            # Fiscal document + OCR + link schemas
│   ├── fixed-asset.ts                 # Inmovilizado schemas + the tabla x ERD rate cap
│   ├── invoice.ts                     # Invoice, prefix, billing profile schemas
│   ├── company.ts                     # Company schemas
│   ├── sync.ts                        # Sync execution schemas
│   ├── voucher.ts                     # Voucher schemas
│   ├── crypto.ts                      # Crypto query/import schemas
│   ├── shared.ts                      # Reusable field validators
│   └── skydive.ts                     # Jump + tunnel session Zod schemas
│
├── types/
│   ├── finance.ts                     # Financial TypeScript interfaces
│   ├── skydive.ts                     # Skydiving TypeScript interfaces
│   ├── cryptoChart.ts                 # Chart/series types
│   ├── sync.ts                        # DB sync types
│   └── errors.ts                      # Typed error classes
│
├── constants/
│   └── finance.ts                     # Type constants, query keys, API endpoints
│
├── providers/
│   ├── QueryProvider.tsx              # TanStack Query
│   ├── TranslationProvider.tsx        # i18n context
│   ├── TooltipProvider.tsx            # Tooltip context
│   └── SessionProvider.tsx            # NextAuth
│
├── utils/
│   ├── money.ts                       # Currency conversions
│   ├── helpers.ts                     # Date/utility functions
│   ├── recurring.ts                   # Occurrence date calculation
│   ├── fiscal.ts                     # computeFiscalFields, rollVatPoolCents, gastos dificil
│   ├── irpf.ts                       # Progressive scale, minimo personal, pension reduction
│   ├── amortization.ts               # Day-based dotacion + year-by-year schedule (pure)
│   ├── fiscalDeadlines.ts            # AEAT deadline computation
│   ├── workingDays.ts                # Working-day calendar (weekends, holidays, Semana Santa)
│   ├── crypto/                       # fifo.ts, fiscalYear.ts, pairPnl.ts
│   ├── cryptoSecrets.ts              # AES-256-GCM credential encryption
│   ├── fiscalFileParser.ts           # Auto-detect doc metadata from filename
│   ├── blobFetch.ts                  # Vercel Blob download utility
│   ├── fetchApi.ts                   # Authenticated fetch wrapper (401 → redirect)
│   ├── apiHandler.ts                 # API route handler wrapper (withApiHandler)
│   ├── invoicePdf.ts                 # Invoice PDF generation
│   ├── invoiceLabels.ts             # Invoice PDF i18n labels
│   ├── csv.ts                        # Generic CSV tokenizer (quotes, CRLF, BOM)
│   ├── invoiceCsv.ts                 # Invoice line-item CSV import parser
│   ├── skydiveParsers.ts             # CSV parsing for jump/tunnel imports
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
│  - useFiscalReport(year, quarter) → fiscal quarterly data    │
│                                                              │
│  Auto-invalidation on create/update/delete                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    API ROUTES (Next.js)                      │
│  - withApiHandler() wrapper for centralized error handling   │
│  - Zod validation on all inputs                              │
│  - Converts euros → cents before storage                     │
│  - Shared expense halving (Math.ceil)                        │
│  - Balanced rounding for groups                              │
│  - Returns structured { success, data, meta?, error }        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│               REPOSITORY LAYER (PostgreSQL)                  │
│  - Connection pool (serverless-safe, Neon)                   │
│  - Parameterized queries ($1, $2 — SQL injection safe)       │
│  - Row → TypeScript transformations                          │
│  - TransactionRepository (transactions + groups)             │
│  - CategoryRepository (hierarchical categories)              │
│  - RecurringExpenseRepository (rules + occurrences)          │
│  - TripRepository (trips + trip expenses + trip categories)  │
│  - FiscalRepository (quarterly fiscal reports)               │
│  - FiscalDocumentRepository (documents + OCR matching)       │
│  - InvoiceRepository (invoices + prefixes + billing)         │
│  - CompanyRepository (companies + roles)                     │
│  - SkydiveRepository (jumps + tunnel + stats)                │
│  - SyncService (bidirectional database sync)                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  POSTGRESQL DATABASE (Neon)                  │
│  Tables:                                                     │
│  - Categories (hierarchical via ParentCategoryID)            │
│  - Transactions (SharedDivisor, OriginalAmountCents, TripID, │
│                  VatPercent, DeductionPercent, VendorName)    │
│  - TransactionGroups (identity anchor)                       │
│  - Trips (multi-day travel expense tracking)                 │
│  - RecurringExpenses (rules with frequency scheduling)       │
│  - RecurringExpenseOccurrences (pending/confirmed/skipped)   │
│  - SkydiveJumps (jump log with freefall/canopy data)         │
│  - TunnelSessions (wind tunnel sessions with duration)       │
│                                                              │
│  Views:                                                      │
│  - vw_MonthlySummary (aggregates under parent category)      │
│  - vw_MonthlyBalance (income/expense/balance totals)         │
│  - vw_SubcategorySummary (drill-down within parent)          │
│  - vw_FiscalQuarterly (fiscal transactions, cash basis)      │
│  - vw_FiscalAccrual (fiscal rows on the invoice date)        │
│  - vw_SkydivingStats, vw_JumpsByType, vw_JumpsByYear         │
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
    status: StatusFilter;             // 'all' | 'paid' | 'pending' | 'cancelled'
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
  TRIPS: 'trips',
  TRIP_CATEGORIES: 'trip-categories',
  FISCAL: 'fiscal',
  SKYDIVE_JUMPS: 'skydive-jumps',
  TUNNEL_SESSIONS: 'tunnel-sessions',
  SKYDIVE_STATS: 'skydive-stats',
  SKYDIVE_CATEGORIES: 'skydive-categories',
} as const;

// API Endpoints (src/constants/finance.ts)
export const API_ENDPOINT = {
  CATEGORIES: '/api/categories',
  TRANSACTIONS: '/api/transactions',
  SUMMARY: '/api/summary',
  SUBCATEGORY_SUMMARY: '/api/summary/subcategories',
  RECURRING_EXPENSES: '/api/recurring-expenses',
  TRANSACTION_GROUPS: '/api/transaction-groups',
  TRIPS: '/api/trips',
  FISCAL: '/api/fiscal',
  SKYDIVE_JUMPS: '/api/skydiving/jumps',
  TUNNEL_SESSIONS: '/api/skydiving/tunnel',
  SKYDIVE_STATS: '/api/skydiving/stats',
  SKYDIVE_CATEGORIES: '/api/skydiving/categories',
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

### 6. Fiscal Module (Spanish Tax Models)

Fiscal reporting for Spanish tax obligations: Modelo 303 (IVA) and Modelo 130 (IRPF pago fraccionado) quarterly, Modelo 390 and the economic-activities section of Modelo 100 annually, plus an IRPF provision that projects the gap between the two IRPF regimes. Adds fiscal-specific fields to transactions and categories, with a dedicated repository and pure utilities for computing derived values.

It also owns the **inmovilizado**: assets whose cost is spread over their useful life instead of being deducted in full in the year of purchase. Their yearly dotación is a deductible expense that no transaction can carry, because no money moves when an asset amortizes — it is the second source of deductible expense in the module, and the only one that does not come from a view row.

> **The tax rules themselves — devengo vs. caja, the casillas, the IVA compensation pool, the pension limits, the deadline rules — live in [FISCAL_DOMAIN.md](FISCAL_DOMAIN.md), together with the invariants that must not be broken. Read it before changing anything in this module.**

```
┌──────────────────────────────────────────────────────────────┐
│  Fiscal Module Architecture                                   │
│                                                               │
│  Category (defaults)              Transaction (per-record)    │
│  ├── DefaultVatPercent            ├── VatPercent              │
│  └── DefaultDeductionPercent      ├── DeductionPercent        │
│                                   ├── VendorName              │
│                                   └── InvoiceNumber           │
│                                                               │
│  FiscalProfiles (per year, what no transaction can carry)     │
│  ├── PensionIndividualCents / PensionEmploymentCents          │
│  └── VatPoolOpeningCents                                      │
│                                                               │
│  FixedAssets (inmovilizado — a cost, not a movement)          │
│  ├── BaseCents + InServiceDate + CoefficientPercent           │
│  └── Modelo100CasillaCode: 0208 material | 0227 intangible    │
│                                                               │
│  computeFiscalFields(full, vat%, deduction%)                  │
│  ├── baseCents            ├── baseDeducibleCents              │
│  └── ivaCents             └── ivaDeducibleCents               │
│                                                               │
│  amortizationCentsBetween(asset, from, to)  ← pure, by days   │
│  └── computeAmortizationSchedule(asset)  Σ cents === base     │
│                                                               │
│  FiscalRepository — all reads go through loadFiscalRows()     │
│  ├── vw_FiscalAccrual (never vw_FiscalQuarterly)              │
│  │   ├── getModelo303Summary / getModelo130Summary            │
│  │   ├── getModelo390Summary / getModelo100Summary            │
│  │   ├── getIrpfProjection                                    │
│  │   └── getUncountedIncome                                   │
│  └── getAmortizationCentsForPeriod()  ← FixedAssetRepository  │
│      └── into 130 casilla 02, 100 casillas 0208/0227          │
│                                                               │
│  getCrossQuarterInvoices()  ← InvoiceRepository               │
│  └── devengo vs. cobro — warns, feeds no casilla              │
└──────────────────────────────────────────────────────────────┘
```

**Key files:**
- `src/services/database/FiscalRepository.ts`: Queries `vw_FiscalAccrual` through `loadFiscalRows()`. Never reads `vw_FiscalQuarterly` directly — that view books invoice income on the collection date
- `src/services/database/FiscalProfileRepository.ts`: Per-year fiscal profile. Partial upsert (`COALESCE` per column) so two cards can edit the same row
- `src/services/database/FixedAssetRepository.ts`: Inmovilizado CRUD, plus `getAmortizationCentsForPeriod()` — the fold over a date range that `FiscalRepository` consumes. It takes an explicit `userId` and never calls `getUserIdOrThrow()`, like the other repository functions the fiscal models call internally
- `src/utils/fiscal.ts`: `computeFiscalFields()`, `rollVatPoolCents()`, `calcGastosDificilCents()` — pure
- `src/utils/amortization.ts`: `amortizationCentsBetween()`, `computeAmortizationSchedule()` — pure, day-based, UTC. The schedule always sums to the base because each year is the difference of two capped accruals
- `src/utils/irpf.ts`: Progressive scale, mínimo personal, pension reduction, run-rate projection — pure
- `src/utils/fiscalDeadlines.ts` + `src/utils/workingDays.ts`: AEAT calendar, working-day extension, domiciliación
- `src/schemas/fixed-asset.ts`: Asset validation, including the tabla × art. 103 LIS rate cap (`coefficientFitsGroup()`, exported so the PUT route can re-run it against the merged row)
- `src/hooks/useFiscalReport.ts`, `useIrpfProjection.ts`, `useFiscalProfile.ts`, `useFiscalDeadlines.ts`, `useFixedAssets.ts`
- `src/services/database/InvoiceRepository.ts`: `getCrossQuarterInvoices(year, quarter)` — the one fiscal read that does not go through `FiscalRepository`, because it is about invoices rather than about figures. Purely informational
- `src/components/fiscal/`: Modelo303Card, Modelo130Card, Modelo390Card, Modelo100Card, IrpfProvisionCard, FixedAssetsCard, FiscalUncountedIncome, FiscalCrossQuarterInvoices, FiscalDeadlinePanel
- `src/app/(auth)/fiscal/page.tsx`: Fiscal report page with year/quarter selector. `FixedAssetsCard` is mounted once outside both view branches and keyed by year — the dotación belongs to the year, not to the quarter or the selected view

**The dotación is not a transaction, and not a run rate.** Two consequences worth keeping in mind
before touching this: it is never written to `Transactions` (that would deduct the purchase twice
and falsify every balance and cash-flow chart), and `getIrpfProjection()` subtracts it *outside*
`projectAnnualCents()` (extrapolating a calendar figure in January would inflate December's
roughly thirtyfold). The purchase transaction must be set to `DeductionPercent = 0` by hand;
nothing enforces it. See [FISCAL_DOMAIN.md](FISCAL_DOMAIN.md) § Amortización del inmovilizado.

**The cross-quarter alert warns the user, it does not adjust anything.** `crossQuarterInvoices` on
the quarterly report lists the issued invoices whose devengo and whose cobro disagree about the
quarter on screen — rendered by `FiscalCrossQuarterInvoices`, and again by `AccrualPeriodNote` in
the invoice pay flow. It feeds no casilla and no computation: the models are already right, and the
alert exists because the human reading a bank statement is the one who gets it wrong. See
[FISCAL_DOMAIN.md](FISCAL_DOMAIN.md) § Devengo vs. caja.

**SharedDivisor vs DeductionPercent:**
These two fields serve distinct purposes and are independent:
- `SharedDivisor` splits a transaction amount between people (e.g., couple splitting a bill). It affects `AmountCents` -- the stored amount is already halved.
- `DeductionPercent` indicates what percentage of the transaction is tax-deductible. It does NOT affect `AmountCents` -- it is used only for fiscal report calculations.
- Both can apply simultaneously: a shared expense can also be partially deductible. The deduction is calculated on the effective `AmountCents` (already halved), not the original amount.

**API:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/fiscal?year=2025&quarter=1` | Quarterly report (Modelo 303, Modelo 130, expenses, invoices, uncounted income, cross-quarter invoices) |
| GET | `/api/fiscal/annual?year=2025` | Annual report (Modelo 390, Modelo 100 section) |
| GET | `/api/fiscal/projection?year=2025` | IRPF provision: the 20% vs. progressive-scale gap |
| GET / PUT | `/api/fiscal/profile?year=2025` | Per-year fiscal profile (pension contributions, VAT pool opening) |
| GET / POST | `/api/fiscal/assets?year=2026` | Fixed assets with a dotación that year / register one |
| GET | `/api/fiscal/assets/:id` | The asset plus its full year-by-year amortization schedule |
| PUT / DELETE | `/api/fiscal/assets/:id` | Update / delete (the purchase transaction is left untouched) |

**Constants:**

```typescript
export const QUERY_KEY = {
  // ... existing keys
  FISCAL: 'fiscal',
  FIXED_ASSETS: 'fixed-assets',
} as const;

export const API_ENDPOINT = {
  // ... existing endpoints
  FISCAL: '/api/fiscal',
  FIXED_ASSETS: '/api/fiscal/assets',
} as const;

// The tabla de amortización simplificada, keyed by the grupo number the AEAT uses,
// plus the ×2 of art. 103 LIS (empresas de reducida dimensión)
export const AMORTIZATION_GROUP = { 1: { group: 1, coefficientPercent: 3, maxYears: 68 }, /* ... */ } as const;
export const AMORTIZATION = { ERD_MULTIPLIER: 2 } as const;
export const AMORTIZATION_CASILLA_OPTIONS = ['0208', '0227'] as const;
```

### 7. Skydiving Module (Jump Log & Tunnel Sessions)

Tracks skydiving jump logs and wind tunnel training sessions, with CSV bulk import, aggregated statistics, and automatic transaction linking when a price is provided.

```
┌──────────────────────────────────────────────────────────────┐
│  Skydiving Module Architecture                                │
│                                                               │
│  SkydiveJumps (jump log)           TunnelSessions             │
│  ├── JumpNumber (unique per user)  ├── SessionDate + Location │
│  ├── JumpDate, Dropzone            ├── DurationSec            │
│  ├── FreefallTimeSec, Aircraft     ├── PriceCents → linked tx │
│  ├── ExitAltitudeFt, Canopy        └── SessionType            │
│  └── PriceCents → linked tx                                   │
│                                                               │
│  SQL Views:                                                   │
│  ├── vw_SkydivingStats (totals, cost, freefall time)          │
│  ├── vw_JumpsByType (count + freefall per jump type)          │
│  └── vw_JumpsByYear (count + freefall per year)               │
│                                                               │
│  Transaction Linking (when PriceCents > 0):                   │
│  ├── Single create: atomic BEGIN/COMMIT (insert + tx + link)  │
│  └── Bulk import: post-insert linking for rows without tx     │
│                                                               │
│  Bulk Import:                                                 │
│  ├── Jumps: ON CONFLICT (JumpNumber, UserID) DO NOTHING       │
│  └── Tunnel: ON CONFLICT (SessionDate, Location, ...) upsert  │
└──────────────────────────────────────────────────────────────┘
```

**API:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/skydiving/jumps?page=&limit=&year=&dropzone=` | List jumps (paginated) |
| POST | `/api/skydiving/jumps` | Create jump |
| GET | `/api/skydiving/jumps/[id]` | Get single jump |
| PUT | `/api/skydiving/jumps/[id]` | Update jump |
| DELETE | `/api/skydiving/jumps/[id]` | Delete jump |
| POST | `/api/skydiving/jumps/import` | Bulk import jumps (CSV) |
| GET | `/api/skydiving/tunnel?page=&limit=&year=&location=` | List tunnel sessions (paginated) |
| POST | `/api/skydiving/tunnel` | Create tunnel session |
| PUT | `/api/skydiving/tunnel/[id]` | Update tunnel session |
| DELETE | `/api/skydiving/tunnel/[id]` | Delete tunnel session |
| POST | `/api/skydiving/tunnel/import` | Bulk import tunnel sessions (CSV) |
| GET | `/api/skydiving/stats` | Aggregated statistics |
| GET | `/api/skydiving/categories` | Paracaidismo subcategories |

### 8. Companies Module (Client & Provider Management)

Role-based company management separating clients from providers. Companies are linked to transactions and invoices via `CompanyID`.

```
┌──────────────────────────────────────────────────────────────┐
│  Companies Module Architecture                                │
│                                                               │
│  Companies                                                    │
│  ├── Role: 'client' | 'provider'                              │
│  ├── InvoiceLanguage: 'es' | 'en' (for bilingual PDF)         │
│  ├── TaxID, Address, Email, Phone                             │
│  ├── IsActive (soft-delete flag)                              │
│  └── CompanyID → Transactions, Invoices                       │
│                                                               │
│  Key behaviors:                                               │
│  - Role-based separation: clients receive invoices,           │
│    providers issue invoices to you                            │
│  - InvoiceLanguage drives PDF generation language             │
│  - Soft-delete via IsActive flag preserves referential        │
│    integrity with existing transactions/invoices              │
└──────────────────────────────────────────────────────────────┘
```

### 9. Invoice Module (Full Lifecycle Management)

Complete invoicing system with state machine (draft→finalized→paid→cancelled).

```
┌──────────────────────────────────────────────────────────────┐
│  Invoice Module Architecture                                  │
│                                                               │
│  State Machine:                                               │
│  draft → finalized → paid → cancelled                         │
│         ↑ revert ←──┘              ↓ revert                   │
│         └──────────────────────────┘                           │
│                                                               │
│  Finalize Flow (InvoiceFinalizeService):                      │
│  1. Validate invoice data                                     │
│  2. prepareInvoicePdf() → generate PDF (single DRY method)    │
│  3. Upload PDF to Vercel Blob                                 │
│  4. Create FiscalDocument record                              │
│  5. Update invoice status to 'finalized' (atomic)             │
│                                                               │
│  Mark Paid:                                                   │
│  - Creates income Transaction with payment date (today),      │
│    NOT invoice date                                           │
│                                                               │
│  Cancel / Revert:                                             │
│  - Cleans up FiscalDocument + blob storage                    │
│                                                               │
│  Key design:                                                  │
│  - Transactional creation with prefix locking                 │
│  - Biller/client data snapshot at creation time               │
│  - prepareInvoicePdf() is the single DRY method for all       │
│    PDF generation (preview, finalize, re-download)            │
│  - All destructive actions require confirm dialogs            │
│                                                               │
│  Tables:                                                      │
│  - UserBillingProfiles (biller defaults)                      │
│  - InvoicePrefixes (numbering sequences with locking)         │
│  - Invoices (header + status + snapshot data)                 │
│  - InvoiceLineItems (individual line items)                   │
└──────────────────────────────────────────────────────────────┘
```

**Key files:**
- `src/services/InvoiceFinalizeService.ts`: Orchestrates validate → PDF → blob → FiscalDocument + status update (atomic)
- `src/utils/invoicePdf.ts`: `prepareInvoicePdf()` — single DRY method for all PDF generation
- `src/services/database/InvoiceRepository.ts`: Invoice CRUD with ConflictError class
- `src/schemas/invoice.ts`: Zod validation schemas for invoices
- `src/utils/invoiceCsv.ts`: `parseInvoiceCsv()` — line-item CSV import, parsed in the browser and appended to the form (no endpoint, no DB change). Shares `INVOICE_LINE_ITEM_LIMIT` with the Zod schema so both agree on every limit.

### 10. Fiscal Documents Module (Tax Filing Management + OCR)

Document management for tax filings and invoices stored in Vercel Blob with private access. Includes OCR-powered automatic data extraction via Claude Vision.

```
┌──────────────────────────────────────────────────────────────┐
│  Fiscal Documents Module Architecture                         │
│                                                               │
│  FiscalDocuments                                              │
│  ├── DocumentType: modelo | factura_recibida | factura_emitida│
│  ├── ModeloType: 303 | 130 | 390 | 100                       │
│  ├── FilingStatus: pending | filed                            │
│  ├── BlobUrl (Vercel Blob, private access)                    │
│  ├── TaxAmountCents (single source of truth for amount)       │
│  ├── TransactionID / TransactionGroupID (linked transaction)  │
│  ├── CompanyID (linked vendor)                                │
│  └── Auto-detect metadata from filenames                      │
│                                                               │
│  OCR Extraction Flow:                                         │
│  Upload → Claude Vision OCR → Auto-match transaction          │
│       → Confirmation modal → Link transaction (atomic)        │
│                                                               │
│  Features:                                                    │
│  - OCR extraction via Claude Vision (PDF + images)            │
│  - Auto-matching to existing transactions (±7 days single,    │
│    ±3 days group)                                             │
│  - Atomic transaction creation + document linking             │
│  - Vercel Blob storage with private access                    │
│  - Download proxy via API route (no direct blob URLs)         │
│  - Bulk upload support                                        │
│  - Auto-detection of document metadata from filenames         │
│  - Filing status tracking (pending/filed)                     │
│  - Delete with optional linked transaction cleanup            │
│  - DocumentDate + VendorName stored after OCR extraction      │
│  - DisplayName computed at query time via SQL COALESCE in     │
│    FiscalDocumentRepository.ts (Company.Name > VendorName >  │
│    FileName), never persisted to the database                 │
│                                                               │
│  Key design: Extracted data is TRANSIENT (not persisted).     │
│  TaxAmountCents is the single source of truth after linking.  │
└──────────────────────────────────────────────────────────────┘
```

**Key files:**
- `src/services/ocr/anthropicVision.ts`: Shared Claude Vision bridge (base64 PDF/image → parsed JSON), used by both OCR services
- `src/services/ocr/DocumentExtractor.ts`: Invoice OCR extraction service
- `src/services/ocr/ModeloDetector.ts`: Detects which AEAT modelo a file is, before it is uploaded
- `src/services/database/FiscalDocumentRepository.ts`: CRUD + auto-matching + linking
- `src/schemas/fiscal-document.ts`: Zod validation schemas (upload, link, extraction, modelo detection)
- `src/utils/fiscalFileParser.ts`: Filename-based metadata auto-detection (first step of the modelo detection cascade, before falling back to the AI)
- DisplayName is computed in SQL, via the centralized `DISPLAY_NAME_SQL` constant in `FiscalDocumentRepository.ts`: `COALESCE(Company.Name, VendorName, FileName)`. The former `fiscalDisplayName.ts` helper no longer exists
- `src/utils/blobFetch.ts`: Vercel Blob download utility
- `src/app/api/fiscal/documents/`: API routes for CRUD, bulk upload, download proxy
- `src/app/api/fiscal/documents/detect-modelo/`: Modelo detection endpoint (read-only, runs before upload)
- `src/app/api/fiscal/documents/[id]/extract/`: OCR extraction endpoint
- `src/app/api/fiscal/documents/[id]/link-transaction/`: Atomic transaction creation + linking
- `src/components/fiscal/FiscalDocumentUpload.tsx`: Upload with auto-OCR flow
- `src/components/fiscal/FiscalExtractionConfirm.tsx`: OCR confirmation modal
- `src/components/fiscal/FiscalDocumentList.tsx`: Document list with delete options

### 11. Fiscal Deadlines Module (AEAT Tax Deadline Computation)

AEAT (Spanish tax agency) deadline computation for quarterly and annual tax obligations.

```
┌──────────────────────────────────────────────────────────────┐
│  Fiscal Deadlines Module Architecture                         │
│                                                               │
│  Filing Status State Machine:                                 │
│  NOT_DUE → UPCOMING → DUE → OVERDUE → FILED                  │
│                                                               │
│  AEAT Deadlines:                                              │
│  ├── Modelo 303 (quarterly VAT)                               │
│  ├── Modelo 130 (quarterly income tax)                        │
│  ├── Modelo 390 (annual VAT summary)                          │
│  └── Other modelos as configured                              │
│                                                               │
│  Features:                                                    │
│  - Configurable reminder window (days before due)             │
│  - Automatic status computation based on current date         │
│  - Links to FiscalDocuments for filed status detection        │
│  - Deadline banner component for dashboard alerts             │
└──────────────────────────────────────────────────────────────┘
```

**Key files:**
- `src/utils/fiscalDeadlines.ts`: AEAT deadline computation logic
- `src/utils/workingDays.ts`: Working-day calendar — weekends, national holidays, Semana Santa
- `src/hooks/useFiscalDeadlines.ts`: TanStack Query hook for deadline data
- `src/components/fiscal/FiscalDeadlineBanner.tsx`: Dashboard deadline alert banner
- `src/components/fiscal/FiscalDeadlinePanel.tsx`: Detailed deadline panel
- `src/components/settings/FiscalReminderSettings.tsx`: Reminder window configuration

A deadline landing on a día inhábil runs to the next working day, and each quarterly deadline also
carries the earlier **domiciliación** cut-off. The Renta window is table-driven per campaign and
flagged as unconfirmed for years whose Orden is unpublished — the rules and their reasoning are in
[FISCAL_DOMAIN.md](FISCAL_DOMAIN.md) § Deadlines.

### 12. Vouchers Module (Prepaid Passes / "Bonos")

A prepaid balance bought up front and consumed over time — a block of skydive jumps, a tunnel pass.

**Buying a voucher creates no transaction.** Consumption does: ordinary expense transactions that
reference `VoucherID` (and optionally `VoucherUnits`). The alternative — booking the whole purchase
as one expense — would put the entire cost in the month of purchase and show nothing in the months
it was actually used.

The remaining balance is never stored. `vw_VoucherBalance` computes it live as
`TotalAmountCents − SUM(paid linked consumptions)`, so editing or deleting a consumption frees the
balance automatically. The FK is `ON DELETE SET NULL`: deleting a voucher unlinks its consumptions
rather than destroying the expense history.

**Key files:**
- `src/services/database/VoucherRepository.ts`
- `src/hooks/useVouchers.ts`, `src/hooks/useSkydiveVouchers.ts`
- `src/components/vouchers/VoucherFormModal.tsx`, `VoucherDetailModal.tsx`
- Selector inside `TransactionForm`; balance widget on the dashboard

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET / POST | `/api/vouchers` | List with live balance / create |
| GET | `/api/vouchers/:id` | Voucher + its consumptions + unlinked skydive candidates |
| PUT / DELETE | `/api/vouchers/:id` | Update / delete (consumptions are unlinked, not removed) |

`GET /api/vouchers/:id` also returns `unlinkedConsumptions` — skydive activity that looks like it
belongs to this voucher but carries no `VoucherID` — so the UI can offer to reconcile it.

### 13. Crypto Module (Exchange Ingestion → FIFO → Modelo 100)

Ingests exchange history (Binance API, plus Binance/Kraken/Coinbase CSV), normalises it into
taxable events, resolves EUR values, and runs a FIFO matcher to produce the cost basis and
gain/loss behind the Modelo 100 crypto boxes.

```
Exchange API / CSV → CryptoRawEvents → TaxableEvents → CryptoDisposals → Modelo 100
                     (verbatim)        (normalised,     (FIFO cost      (1804-F/N,
                                        EUR-priced)      basis)          0304, 0033)
```

Each stage is idempotent, so any of them can be re-run without duplicating data — which is the
point: raw payloads are kept verbatim precisely so the derived stages can be rebuilt when the
rules change.

> **The full pipeline, the FIFO rules, the price cascade, the security model and the invariants are
> documented in [CRYPTO_MODULE.md](CRYPTO_MODULE.md).** Read it before changing anything under
> `src/services/exchanges/` or `src/utils/crypto/`.

**Key files:** `src/services/exchanges/` (per-exchange clients and CSV importers behind a shared
registry), `src/utils/crypto/{fifo,fiscalYear,pairPnl}.ts`, `src/utils/cryptoSecrets.ts` (AES-256-GCM),
`src/services/database/Crypto*Repository.ts`, `src/components/crypto/`, `/api/crypto/*`,
`/api/cron/crypto-sync` (weekly Vercel Cron).

### 14. API Route Handler Wrapper

All API routes use `withApiHandler()` (`src/utils/apiHandler.ts`) to eliminate boilerplate:

```typescript
// Centralizes: try/catch, AuthError → 401, error logging, response shape
export const GET = withApiHandler(async (request, { params }) => {
  const { id } = await params;
  const categoryId = parseIdParam(id);
  if (typeof categoryId !== 'number') return categoryId; // 400 response

  const category = await getCategoryById(categoryId);
  if (!category) return notFound('Categoria no encontrada');

  return { data: category }; // Wrapped as { success: true, data }
}, 'GET /api/categories/[id]');
```

**Helpers:**
- `parseIdParam(id)` → `number | NextResponse` (validates route param IDs)
- `notFound(message)` → 404 response
- `validationError(errors)` → 400 response
- `conflict(error, extra?)` → 409 response

---

### 15. Route Progress Bar

`RouteProgressBar` (`src/components/ui/RouteProgressBar.tsx`) is mounted once in the
authenticated layout. Clicking a sidebar item swaps its icon for a spinner (via Next's
`useLinkStatus()`), and a slim bar sweeps the top of the viewport until the route commits.

**The bar latches on a captured link click and releases on a location change.** Those two
signals come from different browser APIs, and every bug this component has had came from
that asymmetry. Three guards keep it honest:

- Completion compares the full `path?query`, not just `usePathname()`. A click that only
  changes the query string is a real navigation the pathname never observes — for example
  `CategoryBreakdown` renders `/movements?category=N` links inside `/movements` itself.
- Both sides build their comparison key through `URLSearchParams` (`locationKey()`), because
  `window.location.search` encodes a space as `%20` while `toString()` emits `+`.
- A watchdog force-completes after 8s. The start signal is finer than the stop signal, so the
  set of clicks that start the bar without committing a route is open-ended; a bar frozen near
  90% reads as "the app hung", which is worse than showing no bar.

`isInternalLinkClick()` and `locationKey()` are exported solely so
`src/__tests__/components/route-progress-bar.test.ts` can pin these rules.

**Programmatic navigations get no bar and no spinner, by choice.** Both mechanisms are
click-driven, so `router.push()` is invisible to them. Every push in this codebase is a
post-mutation redirect — invoice created, trip created, invoice deleted — whose action already
gave feedback through a submit button or a toast, and whose Neon-backed destination is fast.
Nobody is left staring at a dead click.

Wiring an imperative `startRouteProgress()` would buy nothing here and install an unenforced
invariant ("remember to call it before every push") that nothing can hold you to. It would also
be an attractive nuisance: the obvious next call site is `useUrlParams`, where the bar would
flash on every filter keystroke. Revisit only if a push ever lands on a slow page, or on a
navigation the user initiates directly. Our sibling project practice-hub made the opposite call
for a concrete reason — its notification dropdown pushes to slow, externally-backed pages from a
click that gives no other feedback.

---

## CI/CD Pipeline

GitHub Actions workflow (`.github/workflows/ci.yml`) runs on PRs and pushes to `main`:

```
PR → type-check → lint → test → build
```

Locally, pre-push hooks also run type-check and lint before pushing.

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
| `SkydiveJumps` | Jump log with freefall time, canopy, aircraft, exit altitude |
| `TunnelSessions` | Wind tunnel sessions with duration and optional price |
| `Vouchers` | Prepaid balances ("bonos"); remaining balance lives in `vw_VoucherBalance` |
| `Companies` | Clients and providers |
| `UserBillingProfiles`, `InvoicePrefixes`, `Invoices`, `InvoiceLineItems` | Invoicing |
| `FiscalDocuments` | Filed modelos and received/issued invoices, with OCR extraction |
| `FiscalDeadlineSettings` | Reminder preferences |
| `FiscalProfiles` | Per-year fiscal facts: pension contributions, IVA pool opening |
| `FixedAssets` | Inmovilizado: base, in-service date and rate. The yearly dotación is derived, never stored |
| `ExchangeCredentials`, `ExchangeApiCallLog`, `CryptoSyncJobs` | Crypto: keys, call audit, sync jobs |
| `CryptoRawEvents`, `CryptoPriceCache`, `TaxableEvents`, `CryptoDisposals` | Crypto: ingestion → FIFO pipeline |
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

SkydiveJumps
  └── TransactionID → Transactions (SET NULL on delete)

TunnelSessions
  └── TransactionID → Transactions (SET NULL on delete)
```

### Pre-calculated Views

SQL Views handle aggregation -- calculations happen in database, not JavaScript.
The fiscal views are the exception: they shape and filter rows, but the sums and
rounding run in TypeScript so backend and frontend never disagree by a cent.

```sql
-- vw_FiscalQuarterly: fiscal transactions tagged by year and quarter (cash basis)
-- One row per transaction with a fiscal field; sums happen in TypeScript

-- vw_FiscalAccrual: what the fiscal models read. Same rows, minus the payment
-- transactions of issued invoices, plus those invoices on their own InvoiceDate
SELECT EXTRACT(YEAR FROM "TransactionDate"), EXTRACT(QUARTER FROM ...), ...

-- vw_MonthlySummary: Totals by PARENT category per month
-- Subcategory transactions aggregate under their parent via COALESCE
SELECT
    TO_CHAR(t."TransactionDate", 'YYYY-MM') AS "Month",
    COALESCE(c."ParentCategoryID", c."CategoryID") AS "CategoryID",
    COALESCE(parent."Name", c."Name") AS "CategoryName",
    SUM(t."AmountCents") AS "TotalCents",
    COUNT(*) AS "TransactionCount"
FROM "Transactions" t
INNER JOIN "Categories" c ON t."CategoryID" = c."CategoryID"
LEFT JOIN "Categories" parent ON c."ParentCategoryID" = parent."CategoryID"
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
DROP TRIGGER IF EXISTS ... ON "Accounts";
DROP VIEW IF EXISTS "vw_MonthlyBalance";
DROP TABLE IF EXISTS "Sessions";
DROP TABLE IF EXISTS "Accounts";
DROP TABLE IF EXISTS "Transactions";
DROP TABLE IF EXISTS "Categories";
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

// Invoice statuses
INVOICE_STATUS = { DRAFT: 'draft', FINALIZED: 'finalized', PAID: 'paid', CANCELLED: 'cancelled' }

// Payment methods
PAYMENT_METHOD = { BANK_TRANSFER: 'bank_transfer', PAYPAL: 'paypal', OTHER: 'other' }

// Company roles
COMPANY_ROLE = { CLIENT: 'client', PROVIDER: 'provider' }

// Fiscal document types
FISCAL_DOCUMENT_TYPE = { MODELO: 'modelo', FACTURA_RECIBIDA: 'factura_recibida', FACTURA_EMITIDA: 'factura_emitida' }

// Fiscal status
FISCAL_STATUS = { PENDING: 'pending', FILED: 'filed' }

// Filing status (deadline computation)
FILING_STATUS = { NOT_DUE: 'not_due', UPCOMING: 'upcoming', DUE: 'due', OVERDUE: 'overdue', FILED: 'filed' }

// Modelo types
MODELO_TYPE = { M303: '303', M130: '130', M390: '390', M100: '100' }

// Extraction status (OCR pipeline)
EXTRACTION_STATUS = { NOT_EXTRACTED: 'not_extracted', EXTRACTING: 'extracting', EXTRACTED: 'extracted', FAILED: 'failed' }

// Well-known category references (used to find subcategory IDs for transaction linking)
SKYDIVE_CATEGORY = { NAME: 'Paracaidismo', ICON: 'cloud', COLOR: '#84CC16', SUBCATEGORY: { TUNNEL: 'Túnel de viento', JUMPS: 'Saltos' } }

// TanStack Query keys
QUERY_KEY = {
  CATEGORIES, TRANSACTIONS, SUMMARY,
  SUBCATEGORY_SUMMARY, RECURRING_EXPENSES,
  PENDING_OCCURRENCES, TRANSACTION_GROUPS,
  TRIPS, TRIP_CATEGORIES, CATEGORY_HISTORY,
  FISCAL_REPORT, FISCAL_ANNUAL, VERSION,
  SYNC_COMPARE, SKYDIVE_JUMPS, TUNNEL_SESSIONS,
  SKYDIVE_STATS, SKYDIVE_CATEGORIES, COMPANIES,
  INVOICES, INVOICE_PREFIXES, BILLING_PROFILE,
  FISCAL_DOCUMENTS, FISCAL_DEADLINES, FISCAL_DEADLINE_SETTINGS,
}

// API endpoints
API_ENDPOINT = {
  CATEGORIES, TRANSACTIONS, SUMMARY,
  SUBCATEGORY_SUMMARY, RECURRING_EXPENSES,
  TRANSACTION_GROUPS, TRIPS, CATEGORY_HISTORY,
  FISCAL, FISCAL_ANNUAL, VERSION,
  SYNC_COMPARE, SYNC_EXECUTE, SKYDIVE_JUMPS,
  TUNNEL_SESSIONS, SKYDIVE_STATS, SKYDIVE_CATEGORIES,
  COMPANIES, INVOICES, INVOICE_PREFIXES,
  BILLING_PROFILE, FISCAL_DOCUMENTS,
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

// src/schemas/fiscal.ts
FiscalQuerySchema             // Year + quarter validation

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

### API Error Responses & i18n

Backend returns **i18n keys** (not human-readable messages). The frontend translates them via `t()`.

```typescript
// Success
{ success: true, data: { ... } }

// Validation Error (400)
{ success: false, errors: { fieldName: ['validation.category-required'] } }

// Not Found (404)
{ success: false, error: 'api-error.not-found.transaction' }

// Server Error (500)
{ success: false, error: 'api-error.internal' }
```

**Constants**: `API_ERROR` (backend error codes) and `VALIDATION_KEY` (Zod schema messages) in `src/constants/finance.ts`.

**Frontend**: `useApiMutation` wrapper auto-translates `error.message` → exposes `errorMessage` (already translated). Request functions use `extractApiErrorKey()` from `src/utils/apiErrorHandler.ts` for fallbacks.

**Integrity**: `src/__tests__/utils/error-keys-integrity.test.ts` validates all keys exist in both `en.json` and `es.json`.

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

Uses `@neondatabase/serverless` for serverless-safe PostgreSQL connections:

```typescript
import { neon } from '@neondatabase/serverless';
// Neon serverless driver — no persistent pool needed
```

---

## Security Considerations

1. **Parameterized Queries**: All SQL uses `$1, $2, ...` placeholders to prevent injection
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
├── api/                                    # Integration tests (13 files)
│   ├── version.test.ts                    # Version endpoint
│   ├── auth-protection.test.ts            # Auth middleware tests
│   ├── categories-crud.test.ts            # Category CRUD operations
│   ├── categories-hierarchical.test.ts    # Hierarchical category queries
│   ├── transactions-shared.test.ts        # Shared expense API logic
│   ├── subcategory-summary.test.ts        # Subcategory drill-down API
│   ├── recurring-expenses-crud.test.ts    # Recurring expense CRUD
│   ├── recurring-occurrences.test.ts      # Occurrence confirm/skip API
│   ├── fiscal-report.test.ts             # Fiscal quarterly report API
│   ├── trips-crud.test.ts                # Trip CRUD + categories API
│   ├── trip-expenses.test.ts             # Trip expense API
│   ├── skydive-jumps-crud.test.ts        # Skydive jump CRUD + import API
│   └── skydive-tunnel-crud.test.ts       # Tunnel session CRUD + import API
├── components/                             # Component tests (11 files)
│   ├── ErrorPage.test.tsx
│   ├── GlobalError.test.tsx
│   ├── NotFoundPage.test.tsx
│   ├── LoginPage.test.tsx
│   ├── BalanceCards-filter.test.tsx        # Filter type interactions
│   ├── CategorySelector.test.tsx          # Hierarchical dropdown
│   ├── CategoryTree.test.tsx              # Tree view interactions
│   ├── RecurringExpenseForm.test.tsx       # Recurring form validation
│   ├── RecurringPendingPanel.test.tsx      # Pending panel interactions
│   ├── TransactionList-shared.test.tsx    # Shared expense display
│   └── TripGroupRow.test.tsx             # Trip group collapsible row
├── providers/
│   └── SessionProvider.test.tsx
└── utils/                                  # Unit tests (13 files)
    ├── auth.test.ts                       # Auth utilities
    ├── staticTranslations.test.ts
    ├── category-tree.test.ts              # Tree building utilities
    ├── shared-expense-logic.test.ts       # Halving/rounding logic
    ├── update-category-schema.test.ts     # Category schema validation
    ├── recurring-expense-schema.test.ts   # Recurring schema validation
    ├── recurring-occurrences.test.ts      # Date calculation utilities
    ├── fiscal.test.ts                     # Fiscal computation utilities
    ├── trip-schema.test.ts               # Trip Zod schemas
    ├── skydive-schema.test.ts            # Skydive Zod schemas
    ├── skydive-csv-parsers.test.ts       # CSV parser utilities
    ├── toDateString.test.ts              # Date string utility
    └── middleware-config.test.ts          # Middleware configuration
```

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| `docs/API_REFERENCE.md` | API endpoints, request/response formats |
| `docs/DATA_MODELS.md` | Database schema, TypeScript types, Zod schemas |
| `docs/FISCAL_DOMAIN.md` | The Spanish tax rules encoded, and the fiscal invariants |
| `docs/CRYPTO_MODULE.md` | Crypto ingestion → FIFO → Modelo 100 pipeline |
| `docs/TESTING_STRATEGY.md` | Hybrid testing approach guidelines |
| `database/schema.sql` | Complete database schema (includes Trips table) |
| `database/seed.sql` | Initial category data |
| `database/migrations/` | Database migration scripts |
