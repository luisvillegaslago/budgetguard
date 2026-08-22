/**
 * Integration Tests: FiscalExtractionConfirm — category defaults and error surface
 *
 * Pins three behaviours:
 *  1. Switching category rewrites BOTH deduction shares. A category with no default resets the
 *     field (IRPF -> 100, IVA -> VAT_DEDUCTION_INHERITS_IRPF), it never inherits the number the
 *     previously selected category left behind — a stale IVA share corrupts casilla 29.
 *  2. The OCR-extracted VAT rate is NOT reset by a category switch (the `!vatPercent` guard).
 *  3. The link error is rendered through the translated `errorMessage`, never the raw i18n key.
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FiscalExtractionConfirm } from '@/components/fiscal/FiscalExtractionConfirm';
import { TRANSACTION_TYPE, VAT_DEDUCTION_INHERITS_IRPF } from '@/constants/finance';
import type { Category, ExtractedInvoiceData } from '@/types/finance';

const mockMutateAsync = jest.fn();
/** Mutated per test to drive the error branch. */
let mockErrorMessage: string | null = null;

/** Rendered strings the queries target, so a raw key showing through fails the assertion. */
const VENDOR_LABEL = 'Proveedor';
const VAT_RATE_LABEL = 'IVA %';
const IRPF_LABEL = 'Deduccion IRPF %';
const VAT_DEDUCTION_LABEL = 'Deduccion IVA %';
const LINK_ERROR_KEY = 'api-error.mutation.link.fiscal-transaction';
const LINK_ERROR_TEXT = 'No se pudo enlazar la transaccion';

const mockMessages: Record<string, string> = {
  'fiscal.form.vendor-name': VENDOR_LABEL,
  'fiscal.form.vat-percent': VAT_RATE_LABEL,
  'fiscal.form.deduction-percent': IRPF_LABEL,
  'fiscal.form.vat-deduction-percent': VAT_DEDUCTION_LABEL,
  'api-error.mutation.link.fiscal-transaction': LINK_ERROR_TEXT,
};

/** Categories exposed by the mocked useCategories. Flat list plus one nested subcategory. */
const mockCategories: Category[] = [
  {
    categoryId: 10,
    name: 'Suministros',
    type: TRANSACTION_TYPE.EXPENSE,
    icon: null,
    color: null,
    sortOrder: 1,
    isActive: true,
    parentCategoryId: null,
    defaultShared: false,
    defaultVatPercent: 21,
    defaultDeductionPercent: 30,
    // art. 95 LIVA: this one deducts none of its input VAT
    defaultVatDeductionPercent: 0,
  },
  {
    categoryId: 20,
    name: 'Material de oficina',
    type: TRANSACTION_TYPE.EXPENSE,
    icon: null,
    color: null,
    sortOrder: 2,
    isActive: true,
    parentCategoryId: null,
    defaultShared: false,
    defaultVatPercent: null,
    defaultDeductionPercent: null,
    defaultVatDeductionPercent: null,
  },
  {
    categoryId: 40,
    name: 'Vehiculo',
    type: TRANSACTION_TYPE.EXPENSE,
    icon: null,
    color: null,
    sortOrder: 3,
    isActive: true,
    parentCategoryId: null,
    defaultShared: false,
    defaultVatPercent: null,
    defaultDeductionPercent: null,
    defaultVatDeductionPercent: null,
    subcategories: [
      {
        categoryId: 41,
        name: 'Combustible',
        type: TRANSACTION_TYPE.EXPENSE,
        icon: null,
        color: null,
        sortOrder: 1,
        isActive: true,
        parentCategoryId: 40,
        defaultShared: false,
        defaultVatPercent: 21,
        defaultDeductionPercent: 50,
        defaultVatDeductionPercent: 50,
      },
    ],
  },
];

jest.mock('@/hooks/useTranslations', () => ({
  useTranslate: () => ({
    t: (key: string) => mockMessages[key] ?? key,
    locale: 'es',
  }),
}));

jest.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({ data: mockCategories }),
  useCategoriesHierarchical: () => ({ data: mockCategories }),
}));

jest.mock('@/hooks/useCompanies', () => ({
  useCompanies: () => ({ data: [] }),
  useQuickCreateCompany: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('@/hooks/useFiscalDocuments', () => ({
  useLinkTransaction: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
    isError: mockErrorMessage != null,
    // The raw Error carries the i18n KEY; only `errorMessage` is translated.
    error: mockErrorMessage != null ? new Error('api-error.mutation.link.fiscal-transaction') : null,
    errorMessage: mockErrorMessage,
  }),
}));

// The real selector is a combobox of its own; the modal's logic under test is what it does with
// the picked id, so the mock just exposes one button per category.
jest.mock('@/components/transactions/CategorySelector', () => ({
  CategorySelector: ({ onCategoryChange }: { onCategoryChange: (id: number) => void }) => (
    <div>
      {[10, 20, 41].map((id) => (
        <button key={id} type="button" onClick={() => onCategoryChange(id)}>
          {`pick-${id}`}
        </button>
      ))}
    </div>
  ),
}));

const EXTRACTED: ExtractedInvoiceData = {
  totalAmountCents: 12100,
  baseAmountCents: 10000,
  taxAmountCents: 2100,
  vatPercent: null,
  date: '2026-03-15',
  vendor: null,
  invoiceNumber: 'A-1',
  description: 'Factura',
  confidence: 0.9,
};

function renderModal() {
  return render(
    <FiscalExtractionConfirm documentId={7} extractedData={EXTRACTED} onClose={jest.fn()} onSuccess={jest.fn()} />,
  );
}

function pickCategory(id: number) {
  fireEvent.click(screen.getByRole('button', { name: `pick-${id}` }));
}

function irpfField(): HTMLInputElement {
  return screen.getByLabelText(IRPF_LABEL) as HTMLInputElement;
}

function vatDeductionField(): HTMLInputElement {
  return screen.getByLabelText(VAT_DEDUCTION_LABEL) as HTMLInputElement;
}

function vatRateField(): HTMLInputElement {
  return screen.getByLabelText(VAT_RATE_LABEL) as HTMLInputElement;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockErrorMessage = null;
  mockMutateAsync.mockResolvedValue({ transactionId: 1, documentId: 7 });
});

describe('FiscalExtractionConfirm — switching category rewrites both deduction shares', () => {
  it('does not keep the previous category IVA share of 0 % when the new one inherits', async () => {
    renderModal();

    pickCategory(10);
    expect(irpfField().value).toBe('30');
    expect(vatDeductionField().value).toBe('0');

    pickCategory(20);
    // Both fields must be back to the useFiscalDefaults resolution of a missing default
    expect(irpfField().value).toBe('100');
    expect(vatDeductionField().value).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'fiscal.extraction.create-transaction' }));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
    expect(mockMutateAsync).toHaveBeenCalledWith({
      documentId: 7,
      data: expect.objectContaining({
        categoryId: 20,
        amountCents: 12100,
        deductionPercent: 100,
        // 121,00 € at 21 % has to reach casilla 29 as 21,00 €, not as 0,00 €
        vatDeductionPercent: VAT_DEDUCTION_INHERITS_IRPF,
      }),
    });
  });

  it('does not keep a previous 50 % IVA share when the new category inherits', async () => {
    renderModal();

    pickCategory(41);
    expect(irpfField().value).toBe('50');
    expect(vatDeductionField().value).toBe('50');

    pickCategory(20);

    fireEvent.click(screen.getByRole('button', { name: 'fiscal.extraction.create-transaction' }));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
    expect(mockMutateAsync).toHaveBeenCalledWith({
      documentId: 7,
      data: expect.objectContaining({
        deductionPercent: 100,
        // 10,50 € would reach casilla 29 with the stale 50 %; the inherited share gives 21,00 €
        vatDeductionPercent: VAT_DEDUCTION_INHERITS_IRPF,
      }),
    });
  });

  it('keeps the VAT rate already on screen when the new category has no default', () => {
    renderModal();

    pickCategory(10);
    expect(vatRateField().value).toBe('21');

    pickCategory(20);
    // The `!vatPercent` guard protects the extracted rate: resetting both shares must not touch it
    expect(vatRateField().value).toBe('21');
  });
});

describe('FiscalExtractionConfirm — link error', () => {
  it('renders the translated message, not the raw i18n key', () => {
    mockErrorMessage = LINK_ERROR_TEXT;
    renderModal();

    expect(screen.getByRole('alert')).toHaveTextContent(LINK_ERROR_TEXT);
    expect(screen.queryByText(LINK_ERROR_KEY)).not.toBeInTheDocument();
  });
});

describe('FiscalExtractionConfirm — vendor field', () => {
  it('gives the company combobox an accessible name', () => {
    renderModal();

    expect(screen.getByRole('combobox', { name: VENDOR_LABEL })).toBeInTheDocument();
  });
});
