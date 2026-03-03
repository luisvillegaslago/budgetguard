/**
 * BudgetGuard Finance Types
 * All monetary amounts use cents (integers) internally to avoid floating point errors
 */

import type { TransactionType } from '@/constants/finance';

// Re-export TransactionType from constants (single source of truth)
export type { TransactionType } from '@/constants/finance';

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
}

/**
 * Transaction record (income or expense)
 * AmountCents is stored in cents: 41928 = 419.28
 */
export interface Transaction {
  transactionId: number;
  categoryId: number;
  category?: Category;
  amountCents: number;
  description: string | null;
  transactionDate: string; // ISO date "2025-01-15"
  type: TransactionType;
  createdAt: string;
  updatedAt: string;
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
