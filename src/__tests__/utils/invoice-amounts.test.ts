/**
 * Unit Tests: invoice money breakdown
 * A Spanish invoice must show base, VAT and IRPF withholding, and the client pays
 * base + VAT - retention. Everything in cents, rounded once.
 */

import { IRPF_RETENTION_RATE, VAT_RATE } from '@/constants/finance';
import { computeInvoiceAmounts, getTaxBreakdownRows, isNotSubjectToVat } from '@/utils/invoiceAmounts';

const LABELS = { taxableBase: 'Base imponible', vat: 'IVA', retention: 'Retención IRPF' };

describe('computeInvoiceAmounts', () => {
  it('sums the line items into the taxable base', () => {
    const amounts = computeInvoiceAmounts([{ amountCents: 250000 }, { amountCents: 100000 }], VAT_RATE.EXEMPT, 0);

    expect(amounts.baseCents).toBe(350000);
  });

  it('charges VAT and withholds IRPF for a Spanish business client', () => {
    // 10.000,00 € base → 2.100,00 € IVA, 1.500,00 € retenido, 10.600,00 € a cobrar
    const amounts = computeInvoiceAmounts([{ amountCents: 1000000 }], VAT_RATE.STANDARD, IRPF_RETENTION_RATE.GENERAL);

    expect(amounts).toEqual({
      baseCents: 1000000,
      vatPercent: 21,
      vatCents: 210000,
      retentionPercent: 15,
      retentionCents: 150000,
      totalCents: 1060000,
    });
  });

  it('applies the reduced 7% withholding of the first three years', () => {
    const amounts = computeInvoiceAmounts([{ amountCents: 1000000 }], VAT_RATE.STANDARD, IRPF_RETENTION_RATE.REDUCED);

    expect(amounts.retentionCents).toBe(70000);
    expect(amounts.totalCents).toBe(1140000);
  });

  it('leaves a non-subject invoice to a foreign client untouched', () => {
    // Real case: RMCI Alerts Pty Ltd, 8.328,00 €. No VAT, no withholding.
    const amounts = computeInvoiceAmounts([{ amountCents: 832800 }], VAT_RATE.EXEMPT, IRPF_RETENTION_RATE.NONE);

    expect(amounts).toEqual({
      baseCents: 832800,
      vatPercent: 0,
      vatCents: 0,
      retentionPercent: 0,
      retentionCents: 0,
      totalCents: 832800,
    });
  });

  it('rounds each tax to the nearest cent independently', () => {
    // 333,33 € base: 21% = 69,9993 → 70,00 €; 15% = 49,9995 → 50,00 €
    const amounts = computeInvoiceAmounts([{ amountCents: 33333 }], VAT_RATE.STANDARD, IRPF_RETENTION_RATE.GENERAL);

    expect(amounts.vatCents).toBe(7000);
    expect(amounts.retentionCents).toBe(5000);
    expect(amounts.totalCents).toBe(35333);
  });

  it('handles the reduced and super-reduced rates', () => {
    expect(computeInvoiceAmounts([{ amountCents: 100000 }], VAT_RATE.REDUCED, 0).vatCents).toBe(10000);
    expect(computeInvoiceAmounts([{ amountCents: 100000 }], VAT_RATE.SUPER_REDUCED, 0).vatCents).toBe(4000);
  });

  it('returns zeroes for an invoice with no lines', () => {
    const amounts = computeInvoiceAmounts([], VAT_RATE.STANDARD, IRPF_RETENTION_RATE.GENERAL);

    expect(amounts).toEqual({
      baseCents: 0,
      vatPercent: 21,
      vatCents: 0,
      retentionPercent: 15,
      retentionCents: 0,
      totalCents: 0,
    });
  });

  it('can leave the client owing less than the base when the withholding exceeds the VAT', () => {
    // No VAT but 15% withheld: the client pays less than the base.
    const amounts = computeInvoiceAmounts([{ amountCents: 100000 }], VAT_RATE.EXEMPT, IRPF_RETENTION_RATE.GENERAL);

    expect(amounts.totalCents).toBe(85000);
  });

  it('resolves absent rates to zero and reports the rates it applied', () => {
    const amounts = computeInvoiceAmounts([{ amountCents: 100000 }]);

    expect(amounts.vatPercent).toBe(VAT_RATE.EXEMPT);
    expect(amounts.retentionPercent).toBe(IRPF_RETENTION_RATE.NONE);
    expect(amounts.totalCents).toBe(100000);
  });
});

describe('getTaxBreakdownRows', () => {
  it('shows nothing for an invoice with no tax at all', () => {
    const amounts = computeInvoiceAmounts([{ amountCents: 832800 }]);

    expect(getTaxBreakdownRows(amounts, LABELS)).toEqual([]);
  });

  it('always shows the taxable base whenever any tax applies', () => {
    // A withholding with no visible base would leave the reader unable to check the 15%.
    const amounts = computeInvoiceAmounts([{ amountCents: 100000 }], VAT_RATE.EXEMPT, IRPF_RETENTION_RATE.GENERAL);
    const rows = getTaxBreakdownRows(amounts, LABELS);

    expect(rows.map((row) => row.key)).toEqual(['base', 'retention']);
    expect(rows[0]).toEqual({ key: 'base', label: 'Base imponible', cents: 100000, negative: false });
  });

  it('labels each tax row with its rate and marks the withholding as a deduction', () => {
    const amounts = computeInvoiceAmounts([{ amountCents: 1000000 }], VAT_RATE.STANDARD, IRPF_RETENTION_RATE.GENERAL);
    const rows = getTaxBreakdownRows(amounts, LABELS);

    expect(rows).toEqual([
      { key: 'base', label: 'Base imponible', cents: 1000000, negative: false },
      { key: 'vat', label: 'IVA (21%)', cents: 210000, negative: false },
      { key: 'retention', label: 'Retención IRPF (-15%)', cents: 150000, negative: true },
    ]);
  });

  it('omits the VAT row for a non-subject invoice that is otherwise taxed', () => {
    const amounts = computeInvoiceAmounts([{ amountCents: 100000 }], VAT_RATE.EXEMPT, IRPF_RETENTION_RATE.REDUCED);

    expect(getTaxBreakdownRows(amounts, LABELS).some((row) => row.key === 'vat')).toBe(false);
  });
});

describe('isNotSubjectToVat', () => {
  it('flags a zero-rate invoice so the PDF can print the legal mention', () => {
    expect(isNotSubjectToVat(VAT_RATE.EXEMPT)).toBe(true);
    expect(isNotSubjectToVat(VAT_RATE.STANDARD)).toBe(false);
  });
});
