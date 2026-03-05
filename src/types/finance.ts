/**
 * BudgetGuard Finance Types
 * All monetary amounts use cents (integers) internally to avoid floating point errors
 */

import type { OccurrenceStatus, RecurringFrequency, TransactionType } from '@/constants/finance';

// Re-export from constants (single source of truth)
export type { OccurrenceStatus, RecurringFrequency, TransactionType } from '@/constants/finance';

/**
 * Category for organizing transactions
 */
export interface Category {
  categoryId: number;
  name: string;
  type: TransactionType;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  parentCategoryId: number | null;
  defaultShared: boolean;
  subcategories?: Category[];
}

/**
 * Transaction record (income or expense)
 * AmountCents is stored in cents: 41928 = 419.28
 */
export interface Transaction {
  transactionId: number;
  categoryId: number;
  category?: Category;
  parentCategory?: { categoryId: number; name: string } | null;
  amountCents: number;
  description: string | null;
  transactionDate: string; // ISO date "2025-01-15"
  type: TransactionType;
  sharedDivisor: number;
  originalAmountCents: number | null;
  recurringExpenseId: number | null;
  transactionGroupId: number | null;
  tripId: number | null;
  tripName: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Recurring expense rule
 */
export interface RecurringExpense {
  recurringExpenseId: number;
  categoryId: number;
  category?: Category;
  amountCents: number;
  description: string | null;
  frequency: RecurringFrequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  monthOfYear: number | null;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  sharedDivisor: number;
  originalAmountCents: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Input for creating/updating a recurring expense (user enters euros)
 */
export interface RecurringExpenseInput {
  categoryId: number;
  amount: number;
  description: string;
  frequency: RecurringFrequency;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  monthOfYear?: number | null;
  startDate: Date;
  endDate?: Date | null;
  isShared?: boolean;
}

/**
 * Individual occurrence of a recurring expense
 */
export interface RecurringOccurrence {
  occurrenceId: number;
  recurringExpenseId: number;
  occurrenceDate: string;
  status: OccurrenceStatus;
  transactionId: number | null;
  modifiedAmountCents: number | null;
  processedAt: string | null;
  recurringExpense: RecurringExpense;
}

/**
 * Pending occurrences grouped by month
 */
export interface PendingOccurrenceMonth {
  month: string;
  occurrences: RecurringOccurrence[];
  totalPendingCents: number;
  count: number;
}

/**
 * Summary of all pending occurrences
 */
export interface PendingOccurrencesSummary {
  months: PendingOccurrenceMonth[];
  totalCount: number;
}

/**
 * Derived grouping of transactions sharing the same TransactionGroupID
 * Used for displaying grouped transactions (e.g., outings) in the UI
 */
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
  transactions: Transaction[];
}

/**
 * Derived grouping of trip transactions for display in TransactionList
 * Groups all transactions sharing the same TripID into a collapsible row
 */
export interface TripGroupDisplay {
  tripId: number;
  tripName: string;
  startDate: string; // min(transactionDate) of visible transactions
  totalAmountCents: number;
  type: TransactionType;
  transactions: Transaction[];
}

/**
 * Input for creating a transaction group
 */
export interface TransactionGroupInput {
  description: string;
  transactionDate: Date;
  type: TransactionType;
  isShared?: boolean;
  parentCategoryId: number;
  items: Array<{ categoryId: number; amount: number }>;
}

/**
 * Input for updating a transaction group (description and date only)
 */
export interface TransactionGroupUpdateInput {
  description?: string;
  transactionDate?: Date;
}

/**
 * Category summary for monthly reports
 */
export interface CategorySummary {
  categoryId: number;
  categoryName: string;
  categoryIcon: string | null;
  categoryColor: string | null;
  type: TransactionType;
  totalCents: number;
  transactionCount: number;
}

/**
 * Raw monthly summary data (cents - for internal use)
 */
export interface MonthlySummary {
  month: string; // "2025-01"
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  byCategory: CategorySummary[];
}

/**
 * Formatted category summary for UI display
 */
export interface FormattedCategorySummary extends CategorySummary {
  total: string; // Formatted: "419,28"
  totalValue: number; // Euros: 419.28
  percentage: number; // Percentage of total for that type
}

/**
 * Formatted monthly summary for UI display
 */
export interface FormattedSummary {
  month: string;
  income: string; // Formatted: "447,70"
  incomeValue: number; // Euros: 447.70
  expense: string; // Formatted: "2.697,16"
  expenseValue: number; // Euros: 2697.16
  balance: string; // Formatted: "-2.249,46"
  balanceValue: number; // Euros: -2249.46
  byCategory: FormattedCategorySummary[];
}

/**
 * Transaction input from forms (user enters euros, not cents)
 */
export interface TransactionInput {
  categoryId: number;
  amount: number; // Euros with decimals (UI input)
  description: string;
  transactionDate: Date;
  type: TransactionType;
  isShared?: boolean;
}

/**
 * Subcategory summary for drill-down within a parent category
 */
export interface SubcategorySummary {
  parentCategoryId: number;
  subcategoryId: number;
  subcategoryName: string;
  subcategoryIcon: string | null;
  subcategoryColor: string | null;
  isSubcategory: boolean;
  totalCents: number;
  transactionCount: number;
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: Record<string, string[]>;
}

/**
 * Pagination params for list endpoints
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
}

/**
 * Transaction filters
 */
export interface TransactionFilters {
  month?: string; // "2025-01"
  type?: TransactionType;
  categoryId?: number;
}

/**
 * Trip for multi-day, multi-category travel expense tracking
 */
export interface Trip {
  tripId: number;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Category summary within a trip (totals per category)
 */
export interface TripCategorySummary {
  categoryId: number;
  categoryName: string;
  categoryIcon: string | null;
  categoryColor: string | null;
  totalCents: number;
  count: number;
}

/**
 * Trip with aggregated display data for list view
 */
export interface TripDisplay extends Trip {
  expenseCount: number;
  totalCents: number;
  startDate: string | null;
  endDate: string | null;
  categorySummary: TripCategorySummary[];
}

/**
 * Trip with full expense details for detail view
 */
export interface TripDetail extends Trip {
  expenses: Transaction[];
  categorySummary: TripCategorySummary[];
  totalCents: number;
  expenseCount: number;
}
