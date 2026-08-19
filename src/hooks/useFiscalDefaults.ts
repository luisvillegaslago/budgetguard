/**
 * BudgetGuard Fiscal Defaults Hook
 * Returns fiscal defaults (VAT%, IRPF deduction%, IVA deduction%) from the selected category
 * Used in TransactionForm to auto-fill fiscal fields when a category is selected
 */

import { useMemo } from 'react';
import { VAT_DEDUCTION_INHERITS_IRPF } from '@/constants/finance';
import { useCategories } from '@/hooks/useCategories';

interface FiscalDefaults {
  vatPercent: number;
  /** IRPF deduction share (art. 30.2.5.ª b LIRPF). */
  deductionPercent: number;
  /**
   * IVA deduction share (art. 95 LIVA). Kept nullable on purpose: null is
   * VAT_DEDUCTION_INHERITS_IRPF — the IVA share follows the IRPF one — and defaulting it to a
   * number here would freeze a copy of a value that has to keep tracking.
   */
  vatDeductionPercent: number | null;
  modelo100CasillaCode: string | null;
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

    // A category whose only fiscal datum is "this deducts no input VAT" still has fiscal defaults —
    // the same fourth coding signal vw_FiscalQuarterly reads to let such an expense into a model
    if (
      category.defaultVatPercent === null &&
      category.defaultDeductionPercent === null &&
      category.defaultVatDeductionPercent == null
    ) {
      return null;
    }

    return {
      vatPercent: category.defaultVatPercent ?? 0,
      deductionPercent: category.defaultDeductionPercent ?? 100,
      vatDeductionPercent: category.defaultVatDeductionPercent ?? VAT_DEDUCTION_INHERITS_IRPF,
      modelo100CasillaCode: category.modelo100CasillaCode ?? null,
    };
  }, [categoryId, categories]);
}
