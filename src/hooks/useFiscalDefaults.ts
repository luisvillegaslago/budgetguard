/**
 * BudgetGuard Fiscal Defaults Hook
 * Returns fiscal defaults (VAT%, Deduction%) from the selected category
 * Used in TransactionForm to auto-fill fiscal fields when a category is selected
 */

import { useMemo } from 'react';
import { useCategories } from '@/hooks/useCategories';

interface FiscalDefaults {
  vatPercent: number;
  deductionPercent: number;
}

/**
 * Returns fiscal defaults for a category, or null if the category has no fiscal defaults
 */
export function useFiscalDefaults(categoryId: number | null): FiscalDefaults | null {
  const { data: categories } = useCategories();

  return useMemo(() => {
    if (!categoryId || !categories) return null;

    const category = categories.find((c) => c.categoryId === categoryId);
    if (!category) return null;

    if (category.defaultVatPercent === null && category.defaultDeductionPercent === null) {
      return null;
    }

    return {
      vatPercent: category.defaultVatPercent ?? 0,
      deductionPercent: category.defaultDeductionPercent ?? 100,
    };
  }, [categoryId, categories]);
}
