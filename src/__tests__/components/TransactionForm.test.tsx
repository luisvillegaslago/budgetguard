/**
 * Component Tests: TransactionForm
 *
 * The hidden categoryId/voucherId inputs are driven by setValue, so their DOM value is
 * always ''. Registered with valueAsNumber, react-hook-form turned that into NaN, and
 * `voucherId: z.number().int().positive().nullable()` rejects NaN. voucherId renders no
 * error message anywhere, so pressing "Crear ingreso" did nothing at all: no request,
 * no error, no closed modal.
 *
 * These tests pin the submitted payload for both transaction types.
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TRANSACTION_TYPE } from '@/constants/finance';
import type { Category } from '@/types/finance';

// jsdom does not implement scrollIntoView (used by the category combobox)
Element.prototype.scrollIntoView = jest.fn();

const mockCreate = jest.fn(async (_input: unknown) => ({ transactionId: 1 }));

let selectedMonth = '2026-07';

jest.mock('@/stores/useFinanceStore', () => ({
  useSelectedMonth: () => selectedMonthGetter(),
}));

const selectedMonthGetter = () => selectedMonth;

jest.mock('@/hooks/useTranslations', () => ({
  useTranslate: () => ({ t: (key: string) => key, locale: 'es', setLocale: jest.fn() }),
}));

jest.mock('@/hooks/useTransactions', () => ({
  useCreateTransaction: () => ({ mutateAsync: mockCreate, isPending: false, isError: false, errorMessage: null }),
  useUpdateTransaction: () => ({ mutateAsync: jest.fn(), isPending: false, isError: false, errorMessage: null }),
}));

jest.mock('@/hooks/useVouchers', () => ({
  useVouchers: () => ({ data: [] }),
}));

function makeCategory(
  categoryId: number,
  name: string,
  type: (typeof TRANSACTION_TYPE)[keyof typeof TRANSACTION_TYPE],
) {
  return {
    categoryId,
    name,
    type,
    icon: null,
    color: null,
    sortOrder: 1,
    isActive: true,
    parentCategoryId: null,
    defaultShared: false,
    defaultVatPercent: null,
    defaultDeductionPercent: null,
    subcategories: [],
  } as unknown as Category;
}

const categoriesByType = {
  [TRANSACTION_TYPE.INCOME]: [makeCategory(50, 'Seguridad Social', TRANSACTION_TYPE.INCOME)],
  [TRANSACTION_TYPE.EXPENSE]: [makeCategory(60, 'Vivienda', TRANSACTION_TYPE.EXPENSE)],
};

jest.mock('@/hooks/useCategories', () => ({
  useCategoriesHierarchical: (type: 'income' | 'expense') => ({ data: categoriesGetter(type), isLoading: false }),
  useCategories: () => ({ data: [...categoriesGetter('income'), ...categoriesGetter('expense')] }),
}));

const categoriesGetter = (type: 'income' | 'expense') => categoriesByType[type];

jest.mock('@/components/ui/ModalBackdrop', () => ({
  ModalBackdrop: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { TransactionForm } from '@/components/transactions/TransactionForm';

async function fillForm(categoryName: string) {
  fireEvent.change(screen.getByLabelText('transactions.form.fields.amount'), { target: { value: '199.1' } });

  fireEvent.focus(screen.getByLabelText('transactions.form.fields.category'));
  fireEvent.click(await screen.findByText(categoryName));

  fireEvent.change(screen.getByLabelText(/description/), { target: { value: 'Pensión de paternidad' } });
}

describe('TransactionForm', () => {
  beforeEach(() => {
    mockCreate.mockClear();
    selectedMonth = new Date().toISOString().slice(0, 7);
  });

  it('creates an income after switching the type toggle', async () => {
    render(<TransactionForm onClose={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'transactions.form.type.income' }));
    await fillForm('Seguridad Social');
    fireEvent.click(screen.getByRole('button', { name: 'transactions.form.submit.income' }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0]?.[0]).toMatchObject({
      type: TRANSACTION_TYPE.INCOME,
      categoryId: 50,
      amount: 199.1,
      voucherId: null,
    });
  });

  it('creates an expense with the default type', async () => {
    render(<TransactionForm onClose={jest.fn()} />);

    await fillForm('Vivienda');
    fireEvent.click(screen.getByRole('button', { name: 'transactions.form.submit.expense' }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0]?.[0]).toMatchObject({
      type: TRANSACTION_TYPE.EXPENSE,
      categoryId: 60,
      amount: 199.1,
    });
  });

  it('creates an income dated in a past month', async () => {
    selectedMonth = '2026-03';
    render(<TransactionForm onClose={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'transactions.form.type.income' }));
    await fillForm('Seguridad Social');
    fireEvent.click(screen.getByRole('button', { name: 'transactions.form.submit.income' }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0]?.[0]).toMatchObject({ transactionDate: new Date('2026-03-01T00:00:00.000Z') });
  });
});
