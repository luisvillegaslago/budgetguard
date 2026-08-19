/**
 * Component Tests: FiscalExpenseTable — the two deduction shares on screen
 *
 * The table shows one "Deduc%" column (the IRPF share) and marks only the rows where the IVA share
 * disagrees with it. These tests pin both halves of that decision, because both are easy to undo by
 * accident: dropping the marker hides the reason a 7,5 % IRPF rate sits next to an IVA deducible of
 * 0,00 €, and promoting it to a permanent second column prints the same number twice down a table
 * where equal is the normal case.
 *
 * The null-means-same rule is checked at the display end too: an absent `vatDeductionPercent` is
 * VAT_DEDUCTION_INHERITS_IRPF, so such a row follows the IRPF share and is never a split row. A
 * reading that coerced the absent value to 0 would mark every ordinary expense as divergent.
 *
 * The translator is the real es.json dictionary rather than a stub map, so the assertions read
 * against the shipped Spanish copy and a renamed key breaks the test.
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { TRANSACTION_TYPE } from '@/constants/finance';
import { createTranslator } from '@/libs/i18n';
import es from '@/messages/es.json';
import type { FiscalTransaction } from '@/types/finance';

const translate = createTranslator(es as unknown as Record<string, unknown>);

jest.mock('@/hooks/useTranslations', () => ({
  useTranslate: () => ({
    t: (key: string, values?: Record<string, string | number | boolean>) => translate(key, values),
    locale: 'es',
    setLocale: jest.fn(),
  }),
}));

import { FiscalExpenseTable } from '@/components/fiscal/FiscalExpenseTable';

const BADGE_LABEL = translate('fiscal.expenses.deduction-split-badge');
const SPLIT_NOTE = translate('fiscal.expenses.deduction-split-note');

/** Desktop table and mobile cards both live in the DOM (CSS decides which one is visible). */
const LAYOUTS = 2;

function makeExpense(overrides: Partial<FiscalTransaction> = {}): FiscalTransaction {
  return {
    transactionId: 1,
    transactionDate: '2026-03-14',
    categoryName: 'Material de oficina',
    parentCategoryName: 'Gastos',
    vendorName: 'Proveedor SL',
    invoiceNumber: 'A-1',
    companyTaxId: 'B12345678',
    description: 'Compra',
    type: TRANSACTION_TYPE.EXPENSE,
    fullAmountCents: 12_100,
    vatPercent: 21,
    deductionPercent: 100,
    vatDeductionPercent: 100,
    baseCents: 10_000,
    ivaCents: 2_100,
    baseDeducibleCents: 10_000,
    baseVatDeducibleCents: 10_000,
    ivaDeducibleCents: 2_100,
    ...overrides,
  };
}

/** The case that forced the split: home-office supplies, 7,5 % in IRPF and 0 % in IVA. */
function makeSuppliesExpense(overrides: Partial<FiscalTransaction> = {}): FiscalTransaction {
  return makeExpense({
    transactionId: 2,
    categoryName: 'Luz',
    vendorName: 'Comercializadora SA',
    deductionPercent: 7.5,
    vatDeductionPercent: 0,
    baseDeducibleCents: 750,
    // 0 % de IVA: la casilla 28 no declara base cuya cuota no se deduce
    baseVatDeducibleCents: 0,
    ivaDeducibleCents: 0,
    ...overrides,
  });
}

describe('FiscalExpenseTable — deduction split marker', () => {
  it('marks the row where the IRPF and IVA shares disagree', () => {
    render(<FiscalExpenseTable expenses={[makeSuppliesExpense()]} />);

    expect(screen.getAllByText(BADGE_LABEL)).toHaveLength(LAYOUTS);
  });

  it('carries the rationale as the accessible name, so the 0,00 € of IVA is explainable', () => {
    render(<FiscalExpenseTable expenses={[makeSuppliesExpense()]} />);

    const markers = screen.getAllByRole('button', { name: SPLIT_NOTE });

    expect(markers).toHaveLength(LAYOUTS);
    // The note has to state the two articles: that is what stops the figures being "corrected"
    expect(SPLIT_NOTE).toContain('30.2.5');
    expect(SPLIT_NOTE).toContain('95 LIVA');
  });

  it('shows no marker when the two shares agree', () => {
    render(<FiscalExpenseTable expenses={[makeExpense()]} />);

    expect(screen.queryByText(BADGE_LABEL)).not.toBeInTheDocument();
  });

  it('renders a single percentage on an agreeing row, not a second one', () => {
    render(<FiscalExpenseTable expenses={[makeExpense({ vatPercent: 21, deductionPercent: 50 })]} />);

    // The deduction share appears once — in the desktop "Deduc%" cell. A second column would print
    // it again on every row of the table to say nothing new.
    expect(screen.getAllByText('50%')).toHaveLength(1);
  });

  it('treats an absent VAT share as inheriting the IRPF one, not as 0 %', () => {
    render(<FiscalExpenseTable expenses={[makeExpense({ deductionPercent: 100, vatDeductionPercent: undefined })]} />);

    // VAT_DEDUCTION_INHERITS_IRPF: the shares agree, so this is not a split row
    expect(screen.queryByText(BADGE_LABEL)).not.toBeInTheDocument();
  });

  it('marks only the diverging row when both kinds are listed together', () => {
    render(<FiscalExpenseTable expenses={[makeExpense(), makeSuppliesExpense()]} />);

    expect(screen.getAllByText(BADGE_LABEL)).toHaveLength(LAYOUTS);
  });
});
