'use client';

/**
 * BudgetGuard Balance Cards
 * Three cards showing Income, Expenses, and Net Balance
 * Clicking Income or Expense cards toggles type filter on TransactionList
 */

import { AlertCircle, ArrowDownLeft, ArrowUpRight, RefreshCw, Scale } from 'lucide-react';
import { SUMMARY_COLORS, SummaryCard, SummaryCardSkeleton } from '@/components/ui/SummaryCard';
import { FILTER_TYPE, type FilterType } from '@/constants/finance';
import { useFormattedSummary } from '@/hooks/useFormattedSummary';
import { useTranslate } from '@/hooks/useTranslations';
import { useFilters, useSelectedMonth, useSetFilters } from '@/stores/useFinanceStore';

export function BalanceCards() {
  const { t } = useTranslate();
  const selectedMonth = useSelectedMonth();
  const filters = useFilters();
  const setFilters = useSetFilters();
  const { formatted, isLoading, isError, refetch } = useFormattedSummary(selectedMonth);

  const handleFilterToggle = (type: FilterType) => {
    setFilters({ type: filters.type === type ? FILTER_TYPE.ALL : type });
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <SummaryCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="card bg-guard-danger/5 border-guard-danger/20 text-center py-8" role="alert">
        <AlertCircle className="h-12 w-12 mx-auto mb-3 text-guard-danger opacity-50" aria-hidden="true" />
        <p className="text-guard-danger">{t('errors.load-summary')}</p>
        <button type="button" onClick={() => refetch()} className="btn-ghost mt-4 inline-flex items-center gap-2">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t('common.buttons.retry')}
        </button>
      </div>
    );
  }

  const isBalancePositive = (formatted?.balanceValue ?? 0) >= 0;
  const defaultCurrency = t('dashboard.default-currency');

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <SummaryCard
        title={t('dashboard.balance-cards.income')}
        value={formatted?.income ?? defaultCurrency}
        icon={<ArrowDownLeft className="h-5 w-5" aria-hidden="true" />}
        colors={SUMMARY_COLORS.success}
        staggerClass="stagger-1"
        isActive={filters.type === FILTER_TYPE.INCOME}
        onClick={() => handleFilterToggle(FILTER_TYPE.INCOME)}
      />

      <SummaryCard
        title={t('dashboard.balance-cards.expenses')}
        value={formatted?.expense ?? defaultCurrency}
        icon={<ArrowUpRight className="h-5 w-5" aria-hidden="true" />}
        colors={SUMMARY_COLORS.danger}
        staggerClass="stagger-2"
        isActive={filters.type === FILTER_TYPE.EXPENSE}
        onClick={() => handleFilterToggle(FILTER_TYPE.EXPENSE)}
      />

      <SummaryCard
        title={t('dashboard.balance-cards.balance')}
        value={formatted?.balance ?? defaultCurrency}
        icon={<Scale className="h-5 w-5" aria-hidden="true" />}
        colors={isBalancePositive ? SUMMARY_COLORS.success : SUMMARY_COLORS.danger}
        staggerClass="stagger-3"
      />
    </div>
  );
}
