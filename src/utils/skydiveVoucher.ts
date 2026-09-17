/**
 * Pure helpers for paying skydiving activities (jumps, tunnel sessions) from a
 * prepaid voucher ("bono"). Shared by the repository and the assignment UI.
 */

import type { Transaction, Voucher } from '@/types/finance';
import type { SkydiveJump } from '@/types/skydive';
import { centsToEuros, formatCurrency } from '@/utils/money';

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

// Transaction Description prefixes for jump/session expenses. Also used to
// recover the Dropzone/Location from a consumption that has no activity yet.
export const JUMP_DESCRIPTION_PREFIX = 'Salto – ';
export const TUNNEL_DESCRIPTION_PREFIX = 'Túnel – ';

/**
 * Recover the free-text label (Dropzone/Location) embedded in a consumption's
 * Description, e.g. "Salto – Empuriabrava" -> "Empuriabrava". Returns null when
 * the description does not match the expected prefix.
 */
export function parseActivityLabel(description: string | null, prefix: string): string | null {
  if (!description || !description.startsWith(prefix)) return null;
  const label = description.slice(prefix.length).trim();
  return label.length > 0 ? label : null;
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

/**
 * Initial values for a tunnel session created from a voucher consumption that has
 * none yet: its date, the minutes it consumed, the location recovered from its
 * description and its voucher. `transactionId` makes the session adopt that
 * consumption instead of drawing from the voucher again.
 */
export interface TunnelSessionPrefill {
  transactionId: number;
  sessionDate: string;
  durationMin: number | null;
  location: string | null;
  price: number | null;
  voucherId: number | null;
}

export function buildTunnelSessionPrefill(consumption: Transaction): TunnelSessionPrefill {
  return {
    transactionId: consumption.transactionId,
    sessionDate: consumption.transactionDate.slice(0, 10),
    durationMin: consumption.voucherUnits != null && consumption.voucherUnits > 0 ? consumption.voucherUnits : null,
    location: parseActivityLabel(consumption.description, TUNNEL_DESCRIPTION_PREFIX),
    price: centsToEuros(consumption.amountCents),
    voucherId: consumption.voucherId,
  };
}

/**
 * Initial values for a jump created from a voucher consumption that has none yet:
 * its date, the dropzone recovered from its description and its voucher.
 * `transactionId` makes the jump adopt that consumption instead of drawing from
 * the voucher again.
 */
export interface JumpPrefill {
  transactionId: number;
  jumpDate: string;
  dropzone: string | null;
  priceCents: number | null;
  voucherId: number | null;
}

export function buildJumpPrefill(consumption: Transaction): JumpPrefill {
  return {
    transactionId: consumption.transactionId,
    jumpDate: consumption.transactionDate.slice(0, 10),
    dropzone: parseActivityLabel(consumption.description, JUMP_DESCRIPTION_PREFIX),
    priceCents: consumption.amountCents,
    voucherId: consumption.voucherId,
  };
}

/**
 * The number the next logged jump takes: one past the highest, or 1 for the first.
 */
export function getNextJumpNumber(jumps: SkydiveJump[] | undefined): number {
  return jumps && jumps.length > 0 ? Math.max(...jumps.map((j) => j.jumpNumber)) + 1 : 1;
}
