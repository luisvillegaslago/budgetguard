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
  CATEGORY_HISTORY: '/api/categories',
} as const;

// Well-known Category References
export const GOING_OUT_CATEGORY = {
  NAME: 'Salir',
  ICON: 'beer',
} as const;

// Trip default color (matches guard-trip in Tailwind config)
export const TRIP_COLOR = '#8B5CF6' as const;

// Date Range Presets (for category history)
export const DATE_RANGE_PRESET = {
  THREE_MONTHS: '3m',
  SIX_MONTHS: '6m',
  ONE_YEAR: '1y',
  ALL: 'all',
} as const;

export type DateRangePreset = (typeof DATE_RANGE_PRESET)[keyof typeof DATE_RANGE_PRESET];

// Month format regex
export const MONTH_FORMAT_REGEX = /^\d{4}-\d{2}$/;
