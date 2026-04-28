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

// Recurring Expense End Conditions
export const END_CONDITION = {
  NEVER: 'never',
  AFTER_OCCURRENCES: 'after_occurrences',
  ON_DATE: 'on_date',
} as const;

export type EndCondition = (typeof END_CONDITION)[keyof typeof END_CONDITION];

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
  CRYPTO_CREDENTIALS: 'crypto-credentials',
  CRYPTO_SYNC_STATUS: 'crypto-sync-status',
  CRYPTO_EVENTS: 'crypto-events',
  CRYPTO_DISPOSALS: 'crypto-disposals',
  CRYPTO_MODELO: 'crypto-modelo',
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
  MAX_CONNECTIONS_BACKUP: 5,
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
  CRYPTO_CREDENTIALS: '/api/crypto/credentials',
  CRYPTO_CREDENTIALS_STATUS: '/api/crypto/credentials/status',
  CRYPTO_SYNC: '/api/crypto/sync',
  CRYPTO_EVENTS: '/api/crypto/events',
  CRYPTO_TAXABLE_EVENTS: '/api/crypto/taxable-events',
  CRYPTO_NORMALIZE: '/api/crypto/normalize',
  CRYPTO_FISCAL_MODELO: '/api/crypto/fiscal/modelo100',
  CRYPTO_FISCAL_RECOMPUTE: '/api/crypto/fiscal/recompute',
  CRYPTO_FISCAL_DISPOSALS: '/api/crypto/fiscal/disposals',
  CRYPTO_FISCAL_EXPORT: '/api/crypto/fiscal/export',
  CRYPTO_IMPORT_CSV: '/api/crypto/import/csv',
} as const;

// Trip Status
export const TRIP_STATUS = {
  UPCOMING: 'upcoming',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
} as const;

export type TripStatus = (typeof TRIP_STATUS)[keyof typeof TRIP_STATUS];

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

// Well-known Bank Fee Subcategory (under "Trabajo")
// Used when marking an invoice as paid with a bank transfer fee — auto-creates
// a 100% deductible expense for fiscal reporting (Modelo 130 / Modelo 100).
export const BANK_FEE_CATEGORY = {
  PARENT_NAME: 'Trabajo',
  SUBCATEGORY_NAME: 'Comisiones bancarias',
  ICON: 'landmark',
  COLOR: '#F59E0B',
  SORT_ORDER: 6,
  DEDUCTION_PERCENT: 100,
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

// Modelo 100 — AEAT casilla codes for expense breakdown
export const MODELO_100_CASILLA = {
  C0186: '0186', // Seguridad Social del titular
  C0194: '0194', // Suministros (electricidad, agua, gas, telefonía, internet)
  C0196: '0196', // Regularización cuotas RETA (a ingresar)
  C0202: '0202', // Otros servicios exteriores (fallback)
  C0217: '0217', // Otros conceptos fiscalmente deducibles
} as const;

export const MODELO_100_DEFAULT_CASILLA = MODELO_100_CASILLA.C0202;

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

// Invoice Billing Modes (UI-only: drives form render + PDF layout)
export const INVOICE_BILLING_MODE = {
  HOURLY: 'hourly',
  FLAT: 'flat',
} as const;

export type InvoiceBillingMode = (typeof INVOICE_BILLING_MODE)[keyof typeof INVOICE_BILLING_MODE];

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

// ============================================================
// CRYPTO MODULE
// ============================================================

// Supported exchanges
export const CRYPTO_EXCHANGE = {
  BINANCE: 'binance',
} as const;

export type CryptoExchange = (typeof CRYPTO_EXCHANGE)[keyof typeof CRYPTO_EXCHANGE];

// Raw event types ingested from exchanges (one per Binance endpoint family)
export const CRYPTO_EVENT_TYPE = {
  SPOT_TRADE: 'spot_trade',
  CONVERT: 'convert',
  EARN_FLEX: 'earn_flex',
  EARN_LOCKED: 'earn_locked',
  ETH_STAKING: 'eth_staking',
  STAKING_INTEREST: 'staking_interest',
  DIVIDEND: 'dividend',
  DEPOSIT: 'deposit',
  WITHDRAW: 'withdraw',
  FIAT_ORDER: 'fiat_order',
  FIAT_PAYMENT: 'fiat_payment',
  DUST: 'dust',
  C2C: 'c2c',
  CSV_IMPORT: 'csv_import',
} as const;

export type CryptoEventType = (typeof CRYPTO_EVENT_TYPE)[keyof typeof CRYPTO_EVENT_TYPE];

// Normalised taxable event kinds (output of the EventNormalizer)
export const CRYPTO_TAXABLE_KIND = {
  DISPOSAL: 'disposal',
  ACQUISITION: 'acquisition',
  AIRDROP: 'airdrop',
  STAKING_REWARD: 'staking_reward',
  TRANSFER_IN: 'transfer_in',
  TRANSFER_OUT: 'transfer_out',
} as const;

export type CryptoTaxableKind = (typeof CRYPTO_TAXABLE_KIND)[keyof typeof CRYPTO_TAXABLE_KIND];

// Contraprestación type for Modelo 100 casilla 1804 (F = fiat, N = non-fiat / crypto-to-crypto)
export const CRYPTO_CONTRAPRESTACION = {
  FIAT: 'F',
  NON_FIAT: 'N',
} as const;

export type CryptoContraprestacion = (typeof CRYPTO_CONTRAPRESTACION)[keyof typeof CRYPTO_CONTRAPRESTACION];

// Sync job status
export const CRYPTO_SYNC_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export type CryptoSyncStatus = (typeof CRYPTO_SYNC_STATUS)[keyof typeof CRYPTO_SYNC_STATUS];

// Modelo 100 crypto casillas
export const MODELO_100_CRYPTO_CASILLA = {
  C1804: '1804', // Ganancias/pérdidas patrimoniales por transmisión de cripto
  C0304: '0304', // Otras ganancias patrimoniales (airdrops)
  C0033: '0033', // Rendimientos del capital mobiliario (staking/Earn)
} as const;

// Sync mode: full = backfill desde scopeFrom; incremental = desde LastSyncCompletedAt
export const CRYPTO_SYNC_MODE = {
  FULL: 'full',
  INCREMENTAL: 'incremental',
} as const;

export type CryptoSyncMode = (typeof CRYPTO_SYNC_MODE)[keyof typeof CRYPTO_SYNC_MODE];

// Maximum window size (days) per Binance endpoint family.
// Documented limits — going beyond these returns empty arrays or 400.
export const BINANCE_WINDOW_DAYS = {
  SPOT_TRADE: 1, // myTrades requires startTime/endTime within 24h
  CONVERT: 30,
  EARN_REWARDS: 30, // simple-earn flexible+locked: 30 days max (-6021 otherwise)
  ETH_STAKING: 90,
  STAKING_INTEREST: 90,
  DIVIDEND: 180, // assetDividend: 6 months
  DEPOSIT: 90,
  WITHDRAW: 90,
  FIAT_ORDER: 90,
  FIAT_PAYMENT: 90,
  DUST: 30, // dribblet has tighter practical window than docs claim
  C2C: 30, // C2C only returns last 6 months total in any case
} as const;

// Per-IP REST weight budget (Binance: 6000 weight/min). We self-throttle
// at 80% to leave headroom for retries.
export const BINANCE_WEIGHT_LIMIT = 6000;
export const BINANCE_WEIGHT_THRESHOLD = 4800;
export const BINANCE_RETRY_BASE_MS = 2000;
export const BINANCE_RETRY_MAX_MS = 60_000;
export const BINANCE_RETRY_MAX_ATTEMPTS = 5;
export const BINANCE_SYNC_CONCURRENCY = 3;

// Earliest plausible Binance account creation. Used as fallback when we can
// neither probe the first trade nor read account.createTime.
export const BINANCE_GENESIS_DATE = '2017-07-14T00:00:00Z';

// Month format regex
export const MONTH_FORMAT_REGEX = /^\d{4}-\d{2}$/;

// ============================================================
// API ERROR CODES (i18n keys — backend returns these, frontend translates)
// ============================================================

export const API_ERROR = {
  UNAUTHORIZED: 'api-error.unauthorized',
  INTERNAL: 'api-error.internal',
  INVALID_ID: 'api-error.invalid-id',
  NOT_FOUND: {
    TRANSACTION: 'api-error.not-found.transaction',
    CATEGORY: 'api-error.not-found.category',
    INVOICE: 'api-error.not-found.invoice',
    COMPANY: 'api-error.not-found.company',
    TRIP: 'api-error.not-found.trip',
    EXPENSE: 'api-error.not-found.expense',
    RECURRING_EXPENSE: 'api-error.not-found.recurring-expense',
    OCCURRENCE: 'api-error.not-found.occurrence',
    GROUP: 'api-error.not-found.group',
    JUMP: 'api-error.not-found.jump',
    TUNNEL_SESSION: 'api-error.not-found.tunnel-session',
    PREFIX: 'api-error.not-found.prefix',
    DOCUMENT: 'api-error.not-found.document',
    DOCUMENT_BLOB: 'api-error.not-found.document-blob',
    BILLING_PROFILE: 'api-error.not-found.billing-profile',
    CRYPTO_CREDENTIALS: 'api-error.not-found.crypto-credentials',
    CRYPTO_SYNC_JOB: 'api-error.not-found.crypto-sync-job',
  },
  CONFLICT: {
    HAS_TRANSACTIONS: 'api-error.conflict.has-transactions',
    HAS_SUBCATEGORIES: 'api-error.conflict.has-subcategories',
    PREFIX_IN_USE: 'api-error.conflict.prefix-in-use',
    FUTURE_OCCURRENCE: 'api-error.conflict.future-occurrence',
  },
  INVOICE: {
    CATEGORY_REQUIRED_FOR_PAID: 'api-error.invoice.category-required-for-paid',
    CANNOT_FINALIZE: 'api-error.invoice.cannot-finalize',
    ONLY_DRAFT_EDITABLE: 'api-error.invoice.only-draft-editable',
    ONLY_DRAFT_DELETABLE: 'api-error.invoice.only-draft-deletable',
    INVALID_STATUS_TRANSITION: 'api-error.invoice.invalid-status-transition',
    BANK_FEE_CATEGORY_NOT_FOUND: 'api-error.invoice.bank-fee-category-not-found',
  },
  FISCAL: {
    FILE_REQUIRED: 'api-error.fiscal.file-required',
    METADATA_REQUIRED: 'api-error.fiscal.metadata-required',
    EXTRACTION_FAILED: 'api-error.fiscal.extraction-failed',
    DOWNLOAD_FAILED: 'api-error.fiscal.download-failed',
  },
  CRYPTO: {
    UNSAFE_PERMISSIONS: 'api-error.crypto.unsafe-permissions',
    INVALID_SIGNATURE: 'api-error.crypto.invalid-signature',
    RATE_LIMITED: 'api-error.crypto.rate-limited',
    EXCHANGE_UNAVAILABLE: 'api-error.crypto.exchange-unavailable',
    PRICE_NOT_FOUND: 'api-error.crypto.price-not-found',
    DECRYPT_FAILED: 'api-error.crypto.decrypt-failed',
    MASTER_KEY_MISSING: 'api-error.crypto.master-key-missing',
    SYNC_ALREADY_RUNNING: 'api-error.crypto.sync-already-running',
    SYNC_FAILED: 'api-error.crypto.sync-failed',
    UNAUTHORISED_CRON: 'api-error.crypto.unauthorised-cron',
  },
  VALIDATION: {
    INVALID_MONTH: 'api-error.validation.invalid-month',
    CATEGORY_ID_REQUIRED: 'api-error.validation.category-id-required',
    NAME_REQUIRED: 'api-error.validation.name-required',
    NOT_AVAILABLE_IN_PROD: 'api-error.validation.not-available-in-prod',
  },
  MUTATION: {
    CREATE: {
      TRANSACTION: 'api-error.mutation.create.transaction',
      CATEGORY: 'api-error.mutation.create.category',
      INVOICE: 'api-error.mutation.create.invoice',
      COMPANY: 'api-error.mutation.create.company',
      PREFIX: 'api-error.mutation.create.prefix',
      RECURRING_EXPENSE: 'api-error.mutation.create.recurring-expense',
      TRIP: 'api-error.mutation.create.trip',
      TRIP_EXPENSE: 'api-error.mutation.create.trip-expense',
      JUMP: 'api-error.mutation.create.jump',
      TUNNEL_SESSION: 'api-error.mutation.create.tunnel-session',
      GROUP: 'api-error.mutation.create.group',
      CRYPTO_CREDENTIALS: 'api-error.mutation.create.crypto-credentials',
    },
    UPDATE: {
      TRANSACTION: 'api-error.mutation.update.transaction',
      CATEGORY: 'api-error.mutation.update.category',
      INVOICE: 'api-error.mutation.update.invoice',
      COMPANY: 'api-error.mutation.update.company',
      PREFIX: 'api-error.mutation.update.prefix',
      BILLING_PROFILE: 'api-error.mutation.update.billing-profile',
      RECURRING_EXPENSE: 'api-error.mutation.update.recurring-expense',
      TRIP: 'api-error.mutation.update.trip',
      TRIP_EXPENSE: 'api-error.mutation.update.trip-expense',
      JUMP: 'api-error.mutation.update.jump',
      TUNNEL_SESSION: 'api-error.mutation.update.tunnel-session',
      FISCAL_STATUS: 'api-error.mutation.update.fiscal-status',
      FISCAL_SETTINGS: 'api-error.mutation.update.fiscal-settings',
    },
    DELETE: {
      TRANSACTION: 'api-error.mutation.delete.transaction',
      CATEGORY: 'api-error.mutation.delete.category',
      INVOICE: 'api-error.mutation.delete.invoice',
      COMPANY: 'api-error.mutation.delete.company',
      PREFIX: 'api-error.mutation.delete.prefix',
      RECURRING_EXPENSE: 'api-error.mutation.delete.recurring-expense',
      TRIP: 'api-error.mutation.delete.trip',
      TRIP_EXPENSE: 'api-error.mutation.delete.trip-expense',
      JUMP: 'api-error.mutation.delete.jump',
      TUNNEL_SESSION: 'api-error.mutation.delete.tunnel-session',
      FISCAL_DOCUMENT: 'api-error.mutation.delete.fiscal-document',
      CRYPTO_CREDENTIALS: 'api-error.mutation.delete.crypto-credentials',
    },
    IMPORT: {
      JUMPS: 'api-error.mutation.import.jumps',
      TUNNEL_SESSIONS: 'api-error.mutation.import.tunnel-sessions',
    },
    UPLOAD: {
      FISCAL_DOCUMENT: 'api-error.mutation.upload.fiscal-document',
      FISCAL_BULK: 'api-error.mutation.upload.fiscal-bulk',
    },
    FINALIZE: {
      INVOICE: 'api-error.mutation.finalize.invoice',
    },
    LINK: {
      FISCAL_TRANSACTION: 'api-error.mutation.link.fiscal-transaction',
    },
    SYNC: {
      CRYPTO: 'api-error.mutation.sync.crypto',
    },
  },
} as const;

// ============================================================
// VALIDATION KEY CONSTANTS (i18n keys for Zod schema messages)
// ============================================================

export const VALIDATION_KEY = {
  CATEGORY_REQUIRED: 'validation.category-required',
  AMOUNT_POSITIVE: 'validation.amount-positive',
  DESCRIPTION_TOO_LONG: 'validation.description-too-long',
  DESCRIPTION_REQUIRED: 'validation.description-required',
  INVALID_DATE: 'validation.invalid-date',
  NAME_REQUIRED: 'validation.name-required',
  NAME_TOO_LONG: 'validation.name-too-long',
  FULL_NAME_REQUIRED: 'validation.full-name-required',
  NIF_REQUIRED: 'validation.nif-required',
  PREFIX_REQUIRED: 'validation.prefix-required',
  INVALID_COLOR: 'validation.invalid-color',
  LINE_ITEMS_REQUIRED: 'validation.line-items-required',
  SELECT_PREFIX: 'validation.select-prefix',
  SELECT_CLIENT: 'validation.select-client',
  DATE_REQUIRED: 'validation.date-required',
  DAY_OF_WEEK_REQUIRED: 'validation.day-of-week-required',
  DAY_OF_MONTH_REQUIRED: 'validation.day-of-month-required',
  MONTH_REQUIRED: 'validation.month-required',
  AMOUNT_MISMATCH: 'validation.amount-mismatch',
  JUMP_NUMBER_POSITIVE: 'validation.jump-number-positive',
  DURATION_POSITIVE: 'validation.duration-positive',
  MODELO_TYPE_MISMATCH: 'validation.modelo-type-mismatch',
  QUARTERLY_MISMATCH: 'validation.quarterly-mismatch',
  INVALID_MONTH_FORMAT: 'validation.invalid-month-format',
  END_DATE_BEFORE_START: 'validation.end-date-before-start',
} as const;
