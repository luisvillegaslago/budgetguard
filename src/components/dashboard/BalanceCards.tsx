'use client';

/**
 * BudgetGuard Balance Cards
 * KPI cards: Income, Expenses, Net Balance — each with month-over-month delta —
 * plus Savings Rate and Average Daily Spend.
 * Clicking Income or Expense opens a popup with that type's transactions for the month.
 */

import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  PiggyBank,
  RefreshCw,
  Scale,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useState } from 'react';
import { SUMMARY_COLORS, SummaryCard, SummaryCardSkeleton } from '@/components/ui/SummaryCard';
import { TRANSACTION_TYPE, type TransactionType } from '@/constants/finance';
import { useFormattedSummary } from '@/hooks/useFormattedSummary';
import { useTranslate } from '@/hooks/useTranslations';
import { useSelectedMonth } from '@/stores/useFinanceStore';
import { addMonths, getMonthDateRange } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';
import { TypeTransactionsModal } from './charts/TypeTransactionsModal';

/**
 * Percentage change relative to the previous value.
 * Returns null when there is no comparable previous value (avoids divide-by-zero).
 */
function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

interface DeltaBadgeProps {
  change: number | null;
  favorableWhenUp: boolean;
  noDataLabel: string;
  suffix: string;
}

function DeltaBadge({ change, favorableWhenUp, noDataLabel, suffix }: DeltaBadgeProps) {
  if (change === null) {
    return <span className="text-xs text-guard-muted">{noDataLabel}</span>;
  }

  const isUp = change > 0;
  const isFlat = change === 0;
  const isFavorable = isFlat || (isUp ? favorableWhenUp : !favorableWhenUp);
  const Icon = isUp ? TrendingUp : TrendingDown;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${
        isFlat ? 'text-guard-muted' : isFavorable ? 'text-guard-success' : 'text-guard-danger'
      }`}
    >
      {!isFlat && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
      {isUp ? '+' : ''}
      {change}% {suffix}
    </span>
  );
}

export function BalanceCards() {
  const { t } = useTranslate();
  const selectedMonth = useSelectedMonth();
  const { formatted, isLoading, isError, refetch } = useFormattedSummary(selectedMonth);
  const { formatted: previous } = useFormattedSummary(addMonths(selectedMonth, -1));
  const [modalType, setModalType] = useState<TransactionType | null>(null);

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

  const incomeValue = formatted?.incomeValue ?? 0;
  const expenseValue = formatted?.expenseValue ?? 0;
  const balanceValue = formatted?.balanceValue ?? 0;
  const isBalancePositive = balanceValue >= 0;
  const defaultCurrency = t('dashboard.default-currency');
  const vsPrev = t('dashboard.kpi.vs-previous-month');
  const noPrev = t('dashboard.kpi.no-previous-data');

  // Savings rate: share of income kept as balance.
  const savingsRate = incomeValue > 0 ? Math.round((balanceValue / incomeValue) * 100) : null;

  // Average daily spend across the calendar days of the selected month.
  const daysInMonth = getMonthDateRange(selectedMonth).end.getDate();
  const dailyAverageCents = Math.round((expenseValue * 100) / daysInMonth);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      <SummaryCard
        title={t('dashboard.balance-cards.income')}
        value={formatted?.income ?? defaultCurrency}
        icon={<ArrowDownLeft className="h-5 w-5" aria-hidden="true" />}
        colors={SUMMARY_COLORS.success}
        staggerClass="stagger-1"
        onClick={() => setModalType(TRANSACTION_TYPE.INCOME)}
        footer={
          <DeltaBadge
            change={pctChange(incomeValue, previous?.incomeValue ?? 0)}
            favorableWhenUp
            noDataLabel={noPrev}
            suffix={vsPrev}
          />
        }
      />

      <SummaryCard
        title={t('dashboard.balance-cards.expenses')}
        value={formatted?.expense ?? defaultCurrency}
        icon={<ArrowUpRight className="h-5 w-5" aria-hidden="true" />}
        colors={SUMMARY_COLORS.danger}
        staggerClass="stagger-2"
        onClick={() => setModalType(TRANSACTION_TYPE.EXPENSE)}
        footer={
          <DeltaBadge
            change={pctChange(expenseValue, previous?.expenseValue ?? 0)}
            favorableWhenUp={false}
            noDataLabel={noPrev}
            suffix={vsPrev}
          />
        }
      />

      <SummaryCard
        title={t('dashboard.balance-cards.balance')}
        value={formatted?.balance ?? defaultCurrency}
        icon={<Scale className="h-5 w-5" aria-hidden="true" />}
        colors={isBalancePositive ? SUMMARY_COLORS.success : SUMMARY_COLORS.danger}
        staggerClass="stagger-3"
        footer={
          <DeltaBadge
            change={pctChange(balanceValue, previous?.balanceValue ?? 0)}
            favorableWhenUp
            noDataLabel={noPrev}
            suffix={vsPrev}
          />
        }
      />

      <SummaryCard
        title={t('dashboard.kpi.savings-rate')}
        value={savingsRate === null ? '—' : `${savingsRate}%`}
        icon={<PiggyBank className="h-5 w-5" aria-hidden="true" />}
        colors={SUMMARY_COLORS.violet}
        staggerClass="stagger-1"
      />

      <SummaryCard
        title={t('dashboard.kpi.daily-average')}
        value={formatCurrency(dailyAverageCents)}
        icon={<CalendarDays className="h-5 w-5" aria-hidden="true" />}
        colors={SUMMARY_COLORS.amber}
        staggerClass="stagger-2"
      />

      {modalType && <TypeTransactionsModal type={modalType} month={selectedMonth} onClose={() => setModalType(null)} />}
    </div>
  );
}
