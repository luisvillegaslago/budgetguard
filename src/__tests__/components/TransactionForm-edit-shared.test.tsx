/**
 * Flow Tests: editing a transaction keeps its stored shared split
 *
 * The category's `defaultShared` is a suggestion for a new movement. On an existing one, the stored
 * `sharedDivisor` is the truth: the PUT recomputes AmountCents from `amount` + `isShared`, so a form
 * that silently swaps the stored flag for the category default doubles a shared row (200 € -> 400 €
 * of household spend) or halves a personal one, on a save that only touched the description.
 *
 * Each test opens the real form in edit mode, saves, and replays the captured body through the real
 * PUT handler to pin the cents that would reach the repository.
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SHARED_EXPENSE, TRANSACTION_STATUS, TRANSACTION_TYPE } from '@/constants/finance';
import type { Category, Transaction } from '@/types/finance';

// jsdom does not implement scrollIntoView (used by the category combobox)
Element.prototype.scrollIntoView = jest.fn();

const mockUpdate = jest.fn(async (_input: { id: number; data: Record<string, unknown> }) => ({ transactionId: 1 }));

jest.mock('@/stores/useFinanceStore', () => ({
  useSelectedMonth: () => '2026-08',
}));

jest.mock('@/hooks/useTranslations', () => ({
  useTranslate: () => ({ t: (key: string) => key, locale: 'es', setLocale: jest.fn() }),
}));

jest.mock('@/hooks/useTransactions', () => ({
  useCreateTransaction: () => ({ mutateAsync: jest.fn(), isPending: false, isError: false, errorMessage: null }),
  useUpdateTransaction: () => ({ mutateAsync: mockUpdate, isPending: false, isError: false, errorMessage: null }),
}));

jest.mock('@/hooks/useVouchers', () => ({
  useVouchers: () => ({ data: [] }),
}));

// The fiscal section renders the company selector, which queries on mount.
jest.mock('@/hooks/useCompanies', () => ({
  useCompanies: () => ({ data: [] }),
  useQuickCreateCompany: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

const TRAVEL_ID = 1;
const HOUSING_ID = 2;
const INTERNET_ID = 20;

function makeCategory(categoryId: number, name: string, defaultShared: boolean, subcategories: Category[] = []) {
  return {
    categoryId,
    name,
    type: TRANSACTION_TYPE.EXPENSE,
    icon: null,
    color: null,
    sortOrder: categoryId,
    isActive: true,
    parentCategoryId: null,
    defaultShared,
    defaultVatPercent: null,
    defaultDeductionPercent: null,
    subcategories,
  } as unknown as Category;
}

const expenseCategories: Category[] = [
  makeCategory(TRAVEL_ID, 'Viajes', false),
  makeCategory(HOUSING_ID, 'Vivienda', true, [makeCategory(INTERNET_ID, 'Internet', true)]),
];

jest.mock('@/hooks/useCategories', () => ({
  useCategoriesHierarchical: () => ({ data: categoriesGetter(), isLoading: false }),
  useCategories: () => ({ data: categoriesGetter() }),
}));

const categoriesGetter = () => expenseCategories;

jest.mock('@/components/ui/ModalBackdrop', () => ({
  ModalBackdrop: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// The PUT handler runs for real; only its persistence edge is replaced, to capture what it would write.
let storedTransaction: Transaction;
let capturedUpdateData: Record<string, unknown> | null = null;

jest.mock('@/services/database/TransactionRepository', () => ({
  getTransactionById: jest.fn(async () => storedTransactionGetter()),
  updateTransaction: jest.fn(async (_id: number, data: Record<string, unknown>) => {
    capturedUpdateData = data;
    return { ...storedTransactionGetter(), ...data };
  }),
  deleteTransaction: jest.fn(async () => true),
  cleanupOrphanedGroup: jest.fn(async () => undefined),
}));

const storedTransactionGetter = () => storedTransaction;

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, options?: { status?: number }) => ({
      status: options?.status ?? 200,
      json: async () => data,
    }),
  },
}));

import { PUT } from '@/app/api/transactions/[id]/route';
import { TransactionForm } from '@/components/transactions/TransactionForm';

function makeTransaction(overrides: Partial<Transaction>): Transaction {
  return {
    transactionId: 4685,
    categoryId: TRAVEL_ID,
    amountCents: 20000,
    description: 'Airbnb Apartamento Carmen',
    transactionDate: '2026-08-10',
    type: TRANSACTION_TYPE.EXPENSE,
    status: TRANSACTION_STATUS.PAID,
    sharedDivisor: SHARED_EXPENSE.DIVISOR,
    originalAmountCents: 40000,
    recurringExpenseId: null,
    transactionGroupId: null,
    tripId: null,
    tripName: null,
    vatPercent: null,
    deductionPercent: null,
    vatDeductionPercent: null,
    vendorName: null,
    invoiceNumber: null,
    companyId: null,
    fiscalDocumentId: null,
    voucherId: null,
    voucherUnits: null,
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
    ...overrides,
  };
}

/** Opens the edit form and waits until the category combobox has restored the stored category. */
async function openForEdit(transaction: Transaction, parentName: string) {
  storedTransaction = transaction;
  render(<TransactionForm onClose={jest.fn()} transaction={transaction} />);
  await waitFor(() => expect(screen.getByLabelText('transactions.form.fields.category')).toHaveValue(parentName));
}

async function saveAndReplayThroughPut() {
  fireEvent.click(screen.getByRole('button', { name: 'transactions.form.submit.edit-expense' }));
  await waitFor(() => expect(mockUpdate).toHaveBeenCalled());

  const sent = mockUpdate.mock.calls[0]?.[0];
  if (!sent) throw new Error('the form did not submit');

  // The hook sends the payload as a JSON body; replay exactly that through the route.
  const body: unknown = JSON.parse(JSON.stringify(sent.data));
  const request = { url: `http://localhost/api/transactions/${sent.id}`, json: async () => body };
  const response = await PUT(request as unknown as Parameters<typeof PUT>[0], {
    params: Promise.resolve({ id: String(sent.id) }),
  });
  expect(response.status).toBe(200);

  return sent.data;
}

describe('TransactionForm — editing keeps the stored shared split', () => {
  beforeEach(() => {
    mockUpdate.mockClear();
    capturedUpdateData = null;
  });

  it('keeps a shared row shared in a category that is personal by default', async () => {
    await openForEdit(makeTransaction({}), 'Viajes');

    expect(screen.getByLabelText('transactions.form.fields.shared')).toBeChecked();

    const sent = await saveAndReplayThroughPut();

    expect(sent).toMatchObject({ amount: 400, isShared: true });
    expect(capturedUpdateData).toMatchObject({
      amountCents: 20000,
      originalAmountCents: 40000,
      sharedDivisor: SHARED_EXPENSE.DIVISOR,
    });
  });

  it('keeps a personal row personal in a subcategory that is shared by default', async () => {
    await openForEdit(
      makeTransaction({
        transactionId: 3001,
        categoryId: INTERNET_ID,
        amountCents: 5000,
        originalAmountCents: null,
        sharedDivisor: SHARED_EXPENSE.DEFAULT_DIVISOR,
      }),
      'Vivienda',
    );

    expect(screen.getByLabelText('transactions.form.fields.shared')).not.toBeChecked();

    const sent = await saveAndReplayThroughPut();

    expect(sent).toMatchObject({ amount: 50, isShared: false });
    expect(capturedUpdateData).toMatchObject({
      amountCents: 5000,
      originalAmountCents: null,
      sharedDivisor: SHARED_EXPENSE.DEFAULT_DIVISOR,
    });
  });

  it('still applies the default when the user picks another category', async () => {
    await openForEdit(
      makeTransaction({
        transactionId: 3002,
        amountCents: 8000,
        originalAmountCents: null,
        sharedDivisor: SHARED_EXPENSE.DEFAULT_DIVISOR,
      }),
      'Viajes',
    );

    fireEvent.focus(screen.getByLabelText('transactions.form.fields.category'));
    fireEvent.click(await screen.findByText('Vivienda'));

    expect(screen.getByLabelText('transactions.form.fields.shared')).toBeChecked();

    const sent = await saveAndReplayThroughPut();

    expect(sent).toMatchObject({ categoryId: HOUSING_ID, amount: 80, isShared: true });
    expect(capturedUpdateData).toMatchObject({
      amountCents: 4000,
      originalAmountCents: 8000,
      sharedDivisor: SHARED_EXPENSE.DIVISOR,
    });
  });
});

describe('TransactionForm — unticking the fiscal section', () => {
  beforeEach(() => {
    mockUpdate.mockClear();
    capturedUpdateData = null;
  });

  it('stops the row from counting as deductible instead of only hiding its percentages', async () => {
    // A household purchase left at 21 % VAT and 10 % deductible: unticked in the form, it kept
    // feeding casillas 28/29 of the 303 and the gastos of the 130 because the hidden fields still submitted.
    await openForEdit(
      makeTransaction({ transactionId: 3003, vatPercent: 21, deductionPercent: 10, vatDeductionPercent: 10 }),
      'Viajes',
    );

    fireEvent.click(screen.getByLabelText('fiscal.form.section-title'));
    const sent = await saveAndReplayThroughPut();

    expect(sent).toMatchObject({ vatPercent: null, deductionPercent: null, vatDeductionPercent: null });
    expect(capturedUpdateData).toMatchObject({ vatPercent: null, deductionPercent: null, vatDeductionPercent: null });
  });

  it('brings back the figures of the row when the untick was a mistake', async () => {
    await openForEdit(
      makeTransaction({ transactionId: 3004, vatPercent: 21, deductionPercent: 50, vatDeductionPercent: 50 }),
      'Viajes',
    );

    fireEvent.click(screen.getByLabelText('fiscal.form.section-title'));
    fireEvent.click(screen.getByLabelText('fiscal.form.section-title'));
    const sent = await saveAndReplayThroughPut();

    expect(sent).toMatchObject({ vatPercent: 21, deductionPercent: 50, vatDeductionPercent: 50 });
  });
});
