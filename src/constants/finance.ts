/**
 * BudgetGuard Finance Constants
 * Single source of truth for transaction types, query keys, and cache times
 */

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

// Shared Expense Configuration
export const SHARED_EXPENSE = {
  DIVISOR: 2,
  DEFAULT_DIVISOR: 1,
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
  CATEGORY_HISTORY: 'category-history',
  FISCAL_REPORT: 'fiscal-report',
  FISCAL_ANNUAL: 'fiscal-annual',
  VERSION: 'version',
  SYNC_COMPARE: 'sync-compare',
  SKYDIVE_JUMPS: 'skydive-jumps',
  TUNNEL_SESSIONS: 'tunnel-sessions',
  SKYDIVE_STATS: 'skydive-stats',
  SKYDIVE_CATEGORIES: 'skydive-categories',
  COMPANIES: 'companies',
  INVOICES: 'invoices',
  INVOICE_PREFIXES: 'invoice-prefixes',
  BILLING_PROFILE: 'billing-profile',
  FISCAL_DOCUMENTS: 'fiscal-documents',
  FISCAL_DEADLINES: 'fiscal-deadlines',
  FISCAL_DEADLINE_SETTINGS: 'fiscal-deadline-settings',
} as const;

// Cache Times (in milliseconds)
export const CACHE_TIME = {
  NO_CACHE: 0,
  ONE_MINUTE: 1 * 60 * 1000,
  TWO_MINUTES: 2 * 60 * 1000,
  FIVE_MINUTES: 5 * 60 * 1000,
  TEN_MINUTES: 10 * 60 * 1000,
  THIRTY_MINUTES: 30 * 60 * 1000,
  FOREVER: Infinity,
} as const;

// Database Pool Configuration
export const DB_POOL = {
  MAX_CONNECTIONS: 10,
  MAX_CONNECTIONS_REMOTE: 5,
  IDLE_TIMEOUT_MS: 30_000,
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
  CATEGORY_HISTORY: '/api/categories',
  FISCAL: '/api/fiscal',
  FISCAL_ANNUAL: '/api/fiscal/annual',
  VERSION: '/api/version',
  SYNC_COMPARE: '/api/sync/compare',
  SYNC_EXECUTE: '/api/sync/execute',
  SKYDIVE_JUMPS: '/api/skydiving/jumps',
  TUNNEL_SESSIONS: '/api/skydiving/tunnel',
  SKYDIVE_STATS: '/api/skydiving/stats',
  SKYDIVE_CATEGORIES: '/api/skydiving/categories',
  COMPANIES: '/api/companies',
  INVOICES: '/api/invoices',
  INVOICE_PREFIXES: '/api/invoices/prefixes',
  BILLING_PROFILE: '/api/billing-profile',
  FISCAL_DOCUMENTS: '/api/fiscal/documents',
  FISCAL_DEADLINES: '/api/fiscal/deadlines',
  FISCAL_DEADLINE_SETTINGS: '/api/fiscal/deadlines/settings',
} as const;

// Well-known Category References
export const GOING_OUT_CATEGORY = {
  NAME: 'Salir',
  ICON: 'beer',
} as const;

// Trip default color (matches guard-trip in Tailwind config)
export const TRIP_COLOR = '#8B5CF6' as const;

// Well-known Skydiving Category Reference
export const SKYDIVE_CATEGORY = {
  NAME: 'Paracaidismo',
  ICON: 'cloud',
  COLOR: '#84CC16',
  SUBCATEGORY: {
    TUNNEL: 'Túnel de viento',
    JUMPS: 'Saltos',
  },
} as const;

// Date Range Presets (for category history)
export const DATE_RANGE_PRESET = {
  THREE_MONTHS: '3m',
  SIX_MONTHS: '6m',
  ONE_YEAR: '1y',
  ALL: 'all',
} as const;

export type DateRangePreset = (typeof DATE_RANGE_PRESET)[keyof typeof DATE_RANGE_PRESET];

// Spanish VAT rates
export const VAT_RATE = {
  EXEMPT: 0,
  SUPER_REDUCED: 4,
  REDUCED: 10,
  STANDARD: 21,
} as const;

export type VatRate = (typeof VAT_RATE)[keyof typeof VAT_RATE];

// Fiscal quarters
export const FISCAL_QUARTER = {
  Q1: 1,
  Q2: 2,
  Q3: 3,
  Q4: 4,
} as const;

export type FiscalQuarter = (typeof FISCAL_QUARTER)[keyof typeof FISCAL_QUARTER];

// IRPF rate for Modelo 130
export const IRPF_RATE = 20 as const;

// Professional income category — only this category counts as fiscal income in models 303/130/390/100
export const PROFESSIONAL_INCOME_CATEGORY = 'Facturas' as const;

// Gastos de difícil justificación (Estimación Directa Simplificada)
export const GASTOS_DIFICIL = {
  RATE: 5, // 5% of net income
  MAX_CENTS: 200_000, // 2,000€ annual cap
} as const;

// Sync Direction
export const SYNC_DIRECTION = {
  PUSH: 'push',
  PULL: 'pull',
} as const;

export type SyncDirection = (typeof SYNC_DIRECTION)[keyof typeof SYNC_DIRECTION];

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

// Filing Status (computed server-side)
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

// Month format regex
export const MONTH_FORMAT_REGEX = /^\d{4}-\d{2}$/;
