/**
 * BudgetGuard Formatted Summary Hook
 * Middleware wrapper that transforms cents to formatted currency strings.
 * Takes a period, so the same widgets render either lens (a month or a year):
 * both hooks are always called, one of them disabled, and the payload shape is
 * identical either way.
 */

import { useMemo } from 'react';
import { SUMMARY_GRANULARITY, TRANSACTION_TYPE } from '@/constants/finance';
import type { FormattedCategorySummary, FormattedSummary, SummaryPeriod } from '@/types/finance';
import { calculatePercentage, centsToEuros, formatCurrency } from '@/utils/money';
import { useMonthlySummary } from './useMonthlySummary';
import { useYearlySummary } from './useYearlySummary';

/**
 * Hook that provides formatted summary data ready for UI display
 * Transforms cents to euros and adds formatted currency strings
 */
export function useFormattedSummary(period: SummaryPeriod) {
  const isYear = period.granularity === SUMMARY_GRANULARITY.YEAR;

  // The disabled branch still registers a key, so it gets an empty one rather than a
  // value of the wrong shape sitting in the other lens's namespace.
  const monthly = useMonthlySummary(isYear ? '' : period.value, { enabled: !isYear });
  const yearly = useYearlySummary(isYear ? period.value : '', { enabled: isYear });
  const query = isYear ? yearly : monthly;

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
      period: period.value,
      income: formatCurrency(incomeCents),
      incomeValue: centsToEuros(incomeCents),
      expense: formatCurrency(expenseCents),
      expenseValue: centsToEuros(expenseCents),
      balance: formatCurrency(balanceCents),
      balanceValue: centsToEuros(balanceCents),
      byCategory: formattedCategories,
    };
  }, [query.data, period.value]);

  return {
    ...query,
    formatted,
  };
}

/**
 * Get only expense categories from formatted summary
 */
export function useExpenseSummary(period: SummaryPeriod) {
  const { formatted, ...query } = useFormattedSummary(period);

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
export function useIncomeSummary(period: SummaryPeriod) {
  const { formatted, ...query } = useFormattedSummary(period);

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
