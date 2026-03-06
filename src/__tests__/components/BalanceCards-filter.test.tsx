/**
 * Component Tests: BalanceCards — Filter Toggle Feature
 * Tests that clicking Income/Expense cards toggles the transaction type filter
 * and that the Balance card remains non-interactive.
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { FILTER_TYPE, type FilterType } from '@/constants/finance';

// Mock state holders — reassigned per test to simulate different filter states
let mockFilters: { type: FilterType; categoryId: null } = { type: FILTER_TYPE.ALL, categoryId: null };
const mockSetFilters = jest.fn();

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
  useFilters: () => mockFilters,
  useSetFilters: () => mockSetFilters,
}));

jest.mock('@/utils/helpers', () => ({
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
}));

import { BalanceCards } from '@/components/dashboard/BalanceCards';

beforeEach(() => {
  mockFilters = { type: FILTER_TYPE.ALL, categoryId: null };
  mockSetFilters.mockClear();
});

describe('BalanceCards — Card Element Types', () => {
  it('renders Income and Expense cards as buttons and Balance card as a div', () => {
    render(<BalanceCards />);

    // Income and Expense cards should be buttons (interactive)
    const incomeButton = screen.getByRole('button', { name: /income/i });
    const expenseButton = screen.getByRole('button', { name: /expenses/i });
    expect(incomeButton).toBeInTheDocument();
    expect(expenseButton).toBeInTheDocument();

    // Balance card should NOT be a button — it renders as a plain div
    const balanceText = screen.getByText('Balance');
    const balanceCard = balanceText.closest('div.balance-card');
    expect(balanceCard).toBeInTheDocument();
    expect(balanceCard?.tagName).toBe('DIV');
  });
});

describe('BalanceCards — Filter Toggle via Click', () => {
  it('calls setFilters with { type: income } when clicking the Income card', () => {
    render(<BalanceCards />);

    const incomeButton = screen.getByRole('button', { name: /income/i });
    fireEvent.click(incomeButton);

    expect(mockSetFilters).toHaveBeenCalledTimes(1);
    expect(mockSetFilters).toHaveBeenCalledWith({ type: FILTER_TYPE.INCOME });
  });

  it('calls setFilters with { type: all } when clicking Income card while already active (toggle off)', () => {
    mockFilters = { type: FILTER_TYPE.INCOME, categoryId: null };

    render(<BalanceCards />);

    const incomeButton = screen.getByRole('button', { name: /income/i });
    fireEvent.click(incomeButton);

    expect(mockSetFilters).toHaveBeenCalledTimes(1);
    expect(mockSetFilters).toHaveBeenCalledWith({ type: FILTER_TYPE.ALL });
  });

  it('calls setFilters with { type: expense } when clicking the Expense card', () => {
    render(<BalanceCards />);

    const expenseButton = screen.getByRole('button', { name: /expenses/i });
    fireEvent.click(expenseButton);

    expect(mockSetFilters).toHaveBeenCalledTimes(1);
    expect(mockSetFilters).toHaveBeenCalledWith({ type: FILTER_TYPE.EXPENSE });
  });
});

describe('BalanceCards — aria-pressed State', () => {
  it('sets aria-pressed="true" on the active Income card and "false" on Expense', () => {
    mockFilters = { type: FILTER_TYPE.INCOME, categoryId: null };

    render(<BalanceCards />);

    const incomeButton = screen.getByRole('button', { name: /income/i });
    const expenseButton = screen.getByRole('button', { name: /expenses/i });

    expect(incomeButton).toHaveAttribute('aria-pressed', 'true');
    expect(expenseButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('sets aria-pressed="true" on the active Expense card and "false" on Income', () => {
    mockFilters = { type: FILTER_TYPE.EXPENSE, categoryId: null };

    render(<BalanceCards />);

    const incomeButton = screen.getByRole('button', { name: /income/i });
    const expenseButton = screen.getByRole('button', { name: /expenses/i });

    expect(incomeButton).toHaveAttribute('aria-pressed', 'false');
    expect(expenseButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('sets aria-pressed="false" on both cards when no filter is active', () => {
    mockFilters = { type: FILTER_TYPE.ALL, categoryId: null };

    render(<BalanceCards />);

    const incomeButton = screen.getByRole('button', { name: /income/i });
    const expenseButton = screen.getByRole('button', { name: /expenses/i });

    expect(incomeButton).toHaveAttribute('aria-pressed', 'false');
    expect(expenseButton).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('BalanceCards — Balance Card Non-Interactive', () => {
  it('does not render Balance card with onClick or aria-pressed', () => {
    render(<BalanceCards />);

    // Balance card should not be a button at all
    const allButtons = screen.getAllByRole('button');
    const balanceButton = allButtons.filter((btn) => btn.textContent?.includes('Balance'));
    expect(balanceButton).toHaveLength(0);

    // The Balance card text exists, but its container has no aria-pressed
    const balanceText = screen.getByText('Balance');
    const balanceCard = balanceText.closest('.balance-card');
    expect(balanceCard).not.toHaveAttribute('aria-pressed');
  });
});
