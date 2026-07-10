/**
 * BudgetGuard Invoice Amounts
 * Derives the money breakdown a Spanish invoice must show (RD 1619/2012):
 * taxable base, VAT charged, IRPF withheld, and the amount the client actually pays.
 *
 * Single source of truth: the repository persists what this returns, the form previews it,
 * and the PDF prints it. Same Math.round() everywhere = zero rounding discrepancies.
 */

import { IRPF_RETENTION_RATE, VAT_RATE } from '@/constants/finance';

export interface InvoiceAmounts {
  /** Taxable base: the sum of the line items */
  baseCents: number;
  /** The rate actually applied, after resolving an absent one */
  vatPercent: number;
  /** VAT charged to the client (IVA repercutido) */
  vatCents: number;
  /** The withholding rate actually applied */
  retentionPercent: number;
  /** IRPF the client withholds and pays to the AEAT on the freelancer's behalf */
  retentionCents: number;
  /** What the client transfers: base + VAT - retention */
  totalCents: number;
}

interface LineItemAmount {
  amountCents: number;
}

/**
 * An absent rate means zero: a service to a client established outside Spain carries no
 * Spanish VAT (art. 69.Uno.1º Ley 37/1992), and foreign clients never withhold IRPF.
 * Resolving the default here keeps create and update from drifting apart.
 *
 * @example
 * computeInvoiceAmounts([{ amountCents: 1000000 }], 21, 15)
 * // → base 1000000, vat 210000, retention 150000, total 1060000
 */
export function computeInvoiceAmounts(
  lineItems: LineItemAmount[],
  vatPercent: number = VAT_RATE.EXEMPT,
  retentionPercent: number = IRPF_RETENTION_RATE.NONE,
): InvoiceAmounts {
  const baseCents = lineItems.reduce((sum, item) => sum + item.amountCents, 0);
  const vatCents = Math.round((baseCents * vatPercent) / 100);
  const retentionCents = Math.round((baseCents * retentionPercent) / 100);

  return {
    baseCents,
    vatPercent,
    vatCents,
    retentionPercent,
    retentionCents,
    totalCents: baseCents + vatCents - retentionCents,
  };
}

/**
 * Services located outside Spain carry no Spanish VAT. The invoice must say so and cite
 * the article, so both the PDF and the on-screen preview ask this before printing it.
 */
export function isNotSubjectToVat(vatPercent: number): boolean {
  return vatPercent === VAT_RATE.EXEMPT;
}

/** What a breakdown row needs, satisfied by both an Invoice and a freshly computed preview. */
export interface TaxBreakdown {
  baseCents: number;
  vatPercent: number;
  vatCents: number;
  retentionPercent: number;
  retentionCents: number;
}

export interface TaxBreakdownLabels {
  taxableBase: string;
  vat: string;
  retention: string;
}

export interface TaxBreakdownRow {
  key: 'base' | 'vat' | 'retention';
  label: string;
  cents: number;
  /** Rendered with a leading minus: the withholding is deducted from what the client pays */
  negative: boolean;
}

/**
 * The rows that sit above the total, in order. Owned here so the PDF, the detail page and
 * the form preview cannot disagree on when a row appears or how its sign reads.
 *
 * The taxable base is shown whenever any tax touches the invoice: a withholding without a
 * visible base would leave the reader unable to check the percentage that produced it.
 */
export function getTaxBreakdownRows(breakdown: TaxBreakdown, labels: TaxBreakdownLabels): TaxBreakdownRow[] {
  const hasTax = breakdown.vatCents > 0 || breakdown.retentionCents > 0;
  if (!hasTax) return [];

  const rows: TaxBreakdownRow[] = [
    { key: 'base', label: labels.taxableBase, cents: breakdown.baseCents, negative: false },
  ];

  if (breakdown.vatCents > 0) {
    rows.push({
      key: 'vat',
      label: `${labels.vat} (${breakdown.vatPercent}%)`,
      cents: breakdown.vatCents,
      negative: false,
    });
  }

  if (breakdown.retentionCents > 0) {
    rows.push({
      key: 'retention',
      label: `${labels.retention} (-${breakdown.retentionPercent}%)`,
      cents: breakdown.retentionCents,
      negative: true,
    });
  }

  return rows;
}
