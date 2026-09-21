/**
 * Component Tests: BalanceCards — Card actions
 * Through the monthly lens, clicking Income/Expense opens a transactions popup for
 * that type; the Balance card remains non-interactive. Through the yearly lens there
 * is no popup (the modal is month-bound), so those cards become links to the
 * movements page and the deltas compare against the previous year.
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('@/components/dashboard/charts/TypeTransactionsModal', () => ({
  TypeTransactionsModal: ({ type }: { type: string }) => <div data-testid="type-modal">{type}</div>,
}));

jest.mock('@/hooks/useFormattedSummary', () => ({
  useFormattedSummary: () => ({
    formatted: {
      period: '2025-01',
      income: '2.975,00 €',
      incomeValue: 2975,
      expense: '1.523,75 €',
      expenseValue: 1523.75,
      balance: '1.451,25 €',
      balanceValue: 1451.25,
      byCategory: [],
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));

jest.mock('@/hooks/useTranslations', () => ({
  useTranslate: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'dashboard.balance-cards.income': 'Income',
        'dashboard.balance-cards.expenses': 'Expenses',
        'dashboard.balance-cards.balance': 'Balance',
        'dashboard.default-currency': '0,00 €',
        'dashboard.kpi.vs-previous-month': 'vs last month',
        'dashboard.kpi.vs-previous-year': 'vs last year',
      };
      return translations[key] ?? key;
    },
    locale: 'en',
    setLocale: jest.fn(),
  }),
}));

const mockPeriod = { granularity: 'month', value: '2025-01' };

jest.mock('@/stores/useFinanceStore', () => ({
  useSummaryPeriod: () => mockPeriod,
  useSetFilters: () => jest.fn(),
}));

jest.mock('@/utils/helpers', () => {
  const actual = jest.requireActual('@/utils/helpers');
  return {
    ...actual,
    cn: (...args: unknown[]) => {
      const result: string[] = [];
      args.forEach((item) => {
        if (typeof item === 'string') {
          result.push(item);
        }
        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
          Object.entries(item as Record<string, boolean>).forEach(([key, val]) => {
            if (val) result.push(key);
          });
        }
      });
      return result.join(' ');
    },
  };
});

import { BalanceCards } from '@/components/dashboard/BalanceCards';
import { SUMMARY_GRANULARITY } from '@/constants/finance';

/** Switch the lens the mocked store reports for the next render. */
function setLens(granularity: string, value: string) {
  mockPeriod.granularity = granularity;
  mockPeriod.value = value;
}

beforeEach(() => {
  setLens(SUMMARY_GRANULARITY.MONTH, '2025-01');
});

describe('BalanceCards — Card Element Types', () => {
  it('renders Income and Expense cards as buttons and Balance card as a div', () => {
    render(<BalanceCards />);

    expect(screen.getByRole('button', { name: /income/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /expenses/i })).toBeInTheDocument();

    const balanceText = screen.getByText('Balance');
    const balanceCard = balanceText.closest('div.balance-card');
    expect(balanceCard).toBeInTheDocument();
    expect(balanceCard?.tagName).toBe('DIV');
  });
});

describe('BalanceCards — Opens transactions popup', () => {
  it('does not render the popup until a card is clicked', () => {
    render(<BalanceCards />);
    expect(screen.queryByTestId('type-modal')).not.toBeInTheDocument();
  });

  it('opens the income popup when clicking the Income card', () => {
    render(<BalanceCards />);

    fireEvent.click(screen.getByRole('button', { name: /income/i }));

    const modal = screen.getByTestId('type-modal');
    expect(modal).toBeInTheDocument();
    expect(modal).toHaveTextContent('income');
  });

  it('opens the expense popup when clicking the Expense card', () => {
    render(<BalanceCards />);

    fireEvent.click(screen.getByRole('button', { name: /expenses/i }));

    const modal = screen.getByTestId('type-modal');
    expect(modal).toBeInTheDocument();
    expect(modal).toHaveTextContent('expense');
  });
});

describe('BalanceCards — Balance Card Non-Interactive', () => {
  it('does not render the Balance card as a button', () => {
    render(<BalanceCards />);

    const allButtons = screen.getAllByRole('button');
    const balanceButton = allButtons.filter((btn) => btn.textContent?.includes('Balance'));
    expect(balanceButton).toHaveLength(0);
  });
});

describe('BalanceCards — Yearly lens', () => {
  beforeEach(() => {
    setLens(SUMMARY_GRANULARITY.YEAR, '2025');
  });

  it('renders Income and Expense as links to the movements page', () => {
    render(<BalanceCards />);

    const income = screen.getByRole('link', { name: /income/i });
    const expenses = screen.getByRole('link', { name: /expenses/i });

    expect(income).toHaveAttribute('href', '/movements');
    expect(expenses).toHaveAttribute('href', '/movements');
  });

  it('does not open the month-bound transactions popup', () => {
    render(<BalanceCards />);

    fireEvent.click(screen.getByRole('link', { name: /income/i }));

    expect(screen.queryByTestId('type-modal')).not.toBeInTheDocument();
  });

  it('never leaves the month-bound popup open across a lens switch', () => {
    setLens(SUMMARY_GRANULARITY.MONTH, '2025-01');
    const { rerender } = render(<BalanceCards />);

    fireEvent.click(screen.getByRole('button', { name: /income/i }));
    expect(screen.getByTestId('type-modal')).toBeInTheDocument();

    // Back/forward or the toggle itself can flip the lens while the popup is open.
    setLens(SUMMARY_GRANULARITY.YEAR, '2025');
    rerender(<BalanceCards />);

    expect(screen.queryByTestId('type-modal')).not.toBeInTheDocument();
  });

  it('compares the deltas against the previous year', () => {
    render(<BalanceCards />);

    expect(screen.getAllByText(/vs last year/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/vs last month/i)).not.toBeInTheDocument();
  });
});
