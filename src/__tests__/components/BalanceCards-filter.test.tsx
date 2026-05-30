/**
 * Component Tests: BalanceCards — Card actions
 * Clicking Income/Expense cards opens a transactions popup for that type;
 * the Balance card remains non-interactive.
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('@/components/dashboard/charts/TypeTransactionsModal', () => ({
  TypeTransactionsModal: ({ type }: { type: string }) => <div data-testid="type-modal">{type}</div>,
}));

jest.mock('@/hooks/useFormattedSummary', () => ({
  useFormattedSummary: () => ({
    formatted: {
      month: '2025-01',
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
      };
      return translations[key] ?? key;
    },
    locale: 'en',
    setLocale: jest.fn(),
  }),
}));

jest.mock('@/stores/useFinanceStore', () => ({
  useSelectedMonth: () => '2025-01',
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
