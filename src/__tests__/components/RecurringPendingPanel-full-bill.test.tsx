/**
 * Component Tests: the modify input of a pending occurrence asks for the full bill
 *
 * The confirm endpoint reads a modified amount as the full bill and, on a shared rule, stores
 * ceil(bill / divisor) as the user's part and the bill as OriginalAmountCents, exactly as a shared
 * movement typed by hand (recurring-write-integrity.test.ts covers that side). The panel has to ask
 * for the same figure: its reference used to show the user's already split share under
 * "Importe original", which invited typing the new half and left the fiscal base at half the bill.
 *
 * Rendered with the real dictionaries and the real currency format, so what is asserted is the copy
 * the user reads. Only the data hooks, the store and the toast are faked.
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { OCCURRENCE_STATUS, RECURRING_FREQUENCY, SHARED_EXPENSE, TRANSACTION_TYPE } from '@/constants/finance';
import { TranslationContext, useTranslationContext } from '@/hooks/useTranslations';
import { DEFAULT_LOCALE, type Locale, SUPPORTED_LOCALES } from '@/libs/i18n';
import type { PendingOccurrencesSummary, RecurringOccurrence } from '@/types/finance';
import { formatCurrency } from '@/utils/money';

const mockConfirmMutate = jest.fn();
let mockData: PendingOccurrencesSummary | undefined;

jest.mock('@/hooks/usePendingOccurrences', () => ({
  usePendingOccurrences: () => ({ data: mockData, isLoading: false, isError: false, refetch: jest.fn() }),
  useConfirmOccurrence: () => ({ mutate: mockConfirmMutate, isPending: false }),
  useSkipOccurrence: () => ({ mutate: jest.fn(), isPending: false }),
  useConfirmAllOccurrences: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('@/stores/useFinanceStore', () => ({
  useIsRecurringPanelCollapsed: () => false,
  useToggleRecurringPanel: () => jest.fn(),
  useIsAlertDismissed: () => false,
  useDismissAlert: () => jest.fn(),
}));

jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}));

jest.mock('@/components/ui/CategoryIcon', () => ({
  CategoryIcon: () => <span data-testid="category-icon" />,
}));

import { RecurringPendingPanel } from '@/components/recurring/RecurringPendingPanel';

type Translate = (key: string, values?: Record<string, string | number | boolean>) => string;

/** Rule 7 of the review scenario: "Fibra + TV", shared, 84,26 EUR bill of which the user pays 42,13. */
const SHARED_SHARE_CENTS = 4213;
const SHARED_BILL_CENTS = 8426;
const PERSONAL_AMOUNT_CENTS = 9000;

function buildOccurrence(
  occurrenceId: number,
  amounts: { amountCents: number; originalAmountCents: number | null; sharedDivisor: number },
): RecurringOccurrence {
  return {
    occurrenceId,
    recurringExpenseId: occurrenceId,
    occurrenceDate: '2026-09-01',
    status: OCCURRENCE_STATUS.PENDING,
    transactionId: null,
    modifiedAmountCents: null,
    processedAt: null,
    recurringExpense: {
      recurringExpenseId: occurrenceId,
      categoryId: 1,
      category: {
        categoryId: 1,
        name: 'Suministros',
        type: TRANSACTION_TYPE.EXPENSE,
        icon: 'wifi',
        color: '#EF4444',
        sortOrder: 0,
        isActive: true,
        parentCategoryId: null,
        defaultShared: false,
        defaultVatPercent: null,
        defaultDeductionPercent: null,
      },
      ...amounts,
      description: 'Fibra + TV',
      frequency: RECURRING_FREQUENCY.MONTHLY,
      dayOfWeek: null,
      dayOfMonth: 1,
      monthOfYear: null,
      startDate: '2026-01-01',
      endDate: null,
      isActive: true,
      vatPercent: null,
      deductionPercent: null,
      vendorName: null,
      companyId: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  };
}

const sharedOccurrence = buildOccurrence(31, {
  amountCents: SHARED_SHARE_CENTS,
  originalAmountCents: SHARED_BILL_CENTS,
  sharedDivisor: SHARED_EXPENSE.DIVISOR,
});

const personalOccurrence = buildOccurrence(32, {
  amountCents: PERSONAL_AMOUNT_CENTS,
  originalAmountCents: null,
  sharedDivisor: SHARED_EXPENSE.DEFAULT_DIVISOR,
});

function summaryOf(occurrence: RecurringOccurrence): PendingOccurrencesSummary {
  return {
    months: [{ month: '2026-09', occurrences: [occurrence], totalPendingCents: 0, count: 1 }],
    totalCount: 1,
  };
}

/** The real translation context for one locale; hands its translator back so labels are looked up, not copied. */
function Translations({
  locale,
  onTranslate,
  children,
}: {
  locale: Locale;
  onTranslate: (t: Translate) => void;
  children: ReactNode;
}) {
  const value = useTranslationContext(locale);
  onTranslate(value.t);
  return <TranslationContext.Provider value={value}>{children}</TranslationContext.Provider>;
}

function renderPanel(locale: Locale = DEFAULT_LOCALE) {
  let translate: Translate = (key) => key;
  const result = render(
    <Translations
      locale={locale}
      onTranslate={(t) => {
        translate = t;
      }}
    >
      <RecurringPendingPanel />
    </Translations>,
  );
  const t: Translate = (key, values) => translate(key, values);
  const [modifyButton] = screen.getAllByLabelText(t('recurring.pending.modify'));
  return { ...result, t, openModify: () => fireEvent.click(modifyButton!) };
}

describe('RecurringPendingPanel: modifying the amount of an occurrence', () => {
  beforeEach(() => {
    mockConfirmMutate.mockClear();
    mockData = summaryOf(sharedOccurrence);
  });

  it('keeps showing the user share in the row of a shared rule', () => {
    const { container } = renderPanel();

    expect(container.textContent).toContain(`-${formatCurrency(SHARED_SHARE_CENTS)}`);
  });

  it('shows the full bill, not the share, as the reference of a shared rule', () => {
    const { container, openModify } = renderPanel();
    openModify();

    // Desktop and mobile rows both render; CSS hides one of them.
    expect(screen.getAllByText(`Importe completo: ${formatCurrency(SHARED_BILL_CENTS)}`)).toHaveLength(2);
    expect(container.textContent).not.toContain(formatCurrency(SHARED_SHARE_CENTS));
  });

  it('names the input as the full amount, since the reference is hidden from screen readers', () => {
    const { openModify } = renderPanel();
    openModify();

    expect(screen.getAllByLabelText('Nuevo importe completo (€)')).toHaveLength(2);
  });

  it('sends the typed full bill unchanged, for the server to split by the rule divisor', () => {
    const { t, openModify } = renderPanel();
    openModify();

    const [input] = screen.getAllByLabelText(t('recurring.pending.modified-amount'));
    fireEvent.change(input!, { target: { value: '90' } });
    const [confirmButton] = screen.getAllByLabelText(t('recurring.pending.confirm'));
    fireEvent.click(confirmButton!);

    expect(mockConfirmMutate).toHaveBeenCalledWith(
      { occurrenceId: sharedOccurrence.occurrenceId, modifiedAmount: 90 },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('rebuilds the full bill of an older shared rule that never stored it', () => {
    mockData = summaryOf(
      buildOccurrence(33, {
        amountCents: SHARED_SHARE_CENTS,
        originalAmountCents: null,
        sharedDivisor: SHARED_EXPENSE.DIVISOR,
      }),
    );
    const { openModify } = renderPanel();
    openModify();

    const rebuilt = formatCurrency(SHARED_SHARE_CENTS * SHARED_EXPENSE.DIVISOR);
    expect(screen.getAllByText(`Importe completo: ${rebuilt}`)).toHaveLength(2);
  });

  it('shows the rule amount as the full bill of a personal rule', () => {
    mockData = summaryOf(personalOccurrence);
    const { openModify } = renderPanel();
    openModify();

    expect(screen.getAllByText(`Importe completo: ${formatCurrency(PERSONAL_AMOUNT_CENTS)}`)).toHaveLength(2);
  });

  it.each(SUPPORTED_LOCALES)('references the full bill of a shared rule in %s', (locale) => {
    const { container, t, openModify } = renderPanel(locale);
    openModify();

    const reference = t('recurring.pending.original-amount', { amount: formatCurrency(SHARED_BILL_CENTS) });
    expect(screen.getAllByText(reference)).toHaveLength(2);
    expect(container.textContent).not.toContain(formatCurrency(SHARED_SHARE_CENTS));
  });
});
