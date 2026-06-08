'use client';

/**
 * Summary stat cards for category history
 * Shows total, monthly average, and transaction count.
 * Money is colored by transaction type (income = success, expense = danger)
 * and prefixed with a non-color sign cue (+/−) per DESIGN.md.
 */

import { TRANSACTION_TYPE } from '@/constants/finance';
import { useTranslate } from '@/hooks/useTranslations';
import type { CategoryHistorySummary, TransactionType } from '@/types/finance';
import { cn } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

interface CategoryHistoryStatsProps {
  summary: CategoryHistorySummary;
  categoryType: TransactionType;
}

export function CategoryHistoryStats({ summary, categoryType }: CategoryHistoryStatsProps) {
  const { t } = useTranslate();

  const isIncome = categoryType === TRANSACTION_TYPE.INCOME;
  const amountAccent = isIncome ? 'text-guard-success' : 'text-guard-danger';
  const sign = isIncome ? '+' : '−';

  const stats = [
    {
      label: t('category-history.stats.total'),
      value: `${sign}${formatCurrency(summary.totalCents)}`,
      accent: amountAccent,
    },
    {
      label: t('category-history.stats.average'),
      value: `${sign}${formatCurrency(summary.averagePerMonthCents)}`,
      accent: 'text-foreground',
    },
    {
      label: t('category-history.stats.transactions'),
      value: String(summary.transactionCount),
      accent: 'text-foreground',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {stats.map((stat) => (
        <div key={stat.label} className="card text-center py-4 px-3">
          <p className="text-xs font-medium text-guard-muted mb-1">{stat.label}</p>
          <p className={cn('text-lg font-bold tabular-nums truncate', stat.accent)}>{stat.value}</p>
        </div>
      ))}
    </div>
  );
}
