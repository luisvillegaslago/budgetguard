/**
 * BudgetGuard Skydive Vouchers Hook
 * Selects the vouchers ("bonos") usable to pay a jump or tunnel session:
 * those in the matching skydiving subcategory that still have balance
 * (plus the one already linked, so it stays visible while editing).
 */

import { useMemo } from 'react';
import { useVouchers } from '@/hooks/useVouchers';
import type { Voucher } from '@/types/finance';

export function useSkydiveVouchers(subcategoryName: string, currentVoucherId: number | null): Voucher[] {
  const { data: vouchers } = useVouchers();

  return useMemo(
    () =>
      (vouchers ?? []).filter(
        (v) => v.categoryName === subcategoryName && (v.remainingCents > 0 || v.voucherId === currentVoucherId),
      ),
    [vouchers, subcategoryName, currentVoucherId],
  );
}
