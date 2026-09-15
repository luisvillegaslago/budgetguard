/**
 * Pure helpers for paying skydiving activities (jumps, tunnel sessions) from a
 * prepaid voucher ("bono"). Shared by the repository and the assignment UI.
 */

import type { Voucher } from '@/types/finance';
import { formatCurrency } from '@/utils/money';

/**
 * A jump or tunnel session as seen by a voucher assignment.
 * `units` is what it draws from a unit voucher: 1 per jump, minutes per session.
 */
export interface VoucherAssignItem {
  id: number;
  units: number;
  priceCents: number | null;
  voucherId: number | null;
}

/**
 * How far a selection exceeds a voucher's balance. `remaining` and `needed` are
 * units for unit vouchers and cents for monetary ones.
 */
export interface VoucherShortfall {
  unitBased: boolean;
  remaining: number;
  needed: number;
}

export function isUnitVoucher(voucher: Voucher): boolean {
  return voucher.totalUnits != null && voucher.totalUnits > 0;
}

/**
 * Returns the shortfall when assigning `items` would overdraw the voucher, or
 * null when the balance covers them. Items already paid from this voucher are
 * part of its consumed balance, so they do not count again.
 */
export function getVoucherShortfall(voucher: Voucher, items: VoucherAssignItem[]): VoucherShortfall | null {
  const pending = items.filter((item) => item.voucherId !== voucher.voucherId);

  if (isUnitVoucher(voucher)) {
    const remaining = Math.max(0, (voucher.totalUnits ?? 0) - voucher.consumedUnits);
    const needed = pending.reduce((sum, item) => sum + item.units, 0);
    return needed > remaining ? { unitBased: true, remaining, needed } : null;
  }

  const remaining = Math.max(0, voucher.remainingCents);
  const needed = pending.reduce((sum, item) => sum + (item.priceCents ?? 0), 0);
  return needed > remaining ? { unitBased: false, remaining, needed } : null;
}

/**
 * Display name of a voucher: its description, else its category, else `untitledLabel`.
 */
export function getVoucherName(voucher: Voucher, untitledLabel: string): string {
  return voucher.description || voucher.categoryName || untitledLabel;
}

/**
 * Option label for a voucher selector: its name plus the remaining balance.
 */
export function formatVoucherOptionLabel(voucher: Voucher, untitledLabel: string): string {
  return `${getVoucherName(voucher, untitledLabel)} · ${formatCurrency(Math.max(0, voucher.remainingCents))}`;
}
