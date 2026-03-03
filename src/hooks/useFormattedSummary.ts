/**
 * BudgetGuard Formatted Summary Hook
 * Middleware wrapper that transforms cents to formatted currency strings
 */

import { useMemo } from 'react';
import { TRANSACTION_TYPE } from '@/constants/finance';
import type { FormattedCategorySummary, FormattedSummary } from '@/types/finance';
import { calculatePercentage, centsToEuros, formatCurrency } from '@/utils/money';
import { useMonthlySummary } from './useMonthlySummary';

/**
 * Hook that provides formatted summary data ready for UI display
 * Transforms cents to euros and adds formatted currency strings
 */
export function useFormattedSummary(month: string) {
  const query = useMonthlySummary(month);

  const formatted = useMemo((): FormattedSummary | null => {
    if (!query.data) return null;

    const { incomeCents, expenseCents, balanceCents, byCategory } = query.data;

    const formattedCategories: FormattedCategorySummary[] = byCategory.map((cat) => {
      const totalForType = cat.type === TRANSACTION_TYPE.INCOME ? incomeCents : expenseCents;

      return {
        ...cat,
        total: formatCurrency(cat.totalCents),
        totalValue: centsToEuros(cat.totalCents),
        percentage: calculatePercentage(cat.totalCents, totalForType),
      };
    });

    return {
      month,
      income: formatCurrency(incomeCents),
      incomeValue: centsToEuros(incomeCents),
      expense: formatCurrency(expenseCents),
      expenseValue: centsToEuros(expenseCents),
      balance: formatCurrency(balanceCents),
      balanceValue: centsToEuros(balanceCents),
      byCategory: formattedCategories,
    };
  }, [query.data, month]);

  return {
    ...query,
    formatted,
  };
}

/**
 * Get only expense categories from formatted summary
 */
export function useExpenseSummary(month: string) {
  const { formatted, ...query } = useFormattedSummary(month);

  const expenseCategories = useMemo(() => {
    if (!formatted) return [];
    return formatted.byCategory
      .filter((c) => c.type === TRANSACTION_TYPE.EXPENSE)
      .sort((a, b) => b.totalCents - a.totalCents);
  }, [formatted]);

  return {
    ...query,
    expenseCategories,
    totalExpense: formatted?.expense ?? '0,00 €',
    totalExpenseValue: formatted?.expenseValue ?? 0,
  };
}

/**
 * Get only income categories from formatted summary
 */
export function useIncomeSummary(month: string) {
  const { formatted, ...query } = useFormattedSummary(month);

  const incomeCategories = useMemo(() => {
    if (!formatted) return [];
    return formatted.byCategory
      .filter((c) => c.type === TRANSACTION_TYPE.INCOME)
      .sort((a, b) => b.totalCents - a.totalCents);
  }, [formatted]);

  return {
    ...query,
    incomeCategories,
    totalIncome: formatted?.income ?? '0,00 €',
    totalIncomeValue: formatted?.incomeValue ?? 0,
  };
}
