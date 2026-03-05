'use client';

/**
 * Summary stat cards for category history
 * Shows total, monthly average, and transaction count
 */

import { useTranslate } from '@/hooks/useTranslations';
import type { CategoryHistorySummary } from '@/types/finance';
import { formatCurrency } from '@/utils/money';

interface CategoryHistoryStatsProps {
  summary: CategoryHistorySummary;
}

export function CategoryHistoryStats({ summary }: CategoryHistoryStatsProps) {
  const { t } = useTranslate();

  const stats = [
    {
      label: t('category-history.stats.total'),
      value: formatCurrency(summary.totalCents),
      accent: 'text-guard-danger',
    },
    {
      label: t('category-history.stats.average'),
      value: formatCurrency(summary.averagePerMonthCents),
      accent: 'text-guard-muted',
    },
    {
      label: t('category-history.stats.transactions'),
      value: String(summary.transactionCount),
      accent: 'text-foreground',
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {stats.map((stat) => (
        <div key={stat.label} className="card text-center py-4 px-3">
          <p className="text-xs font-medium text-guard-muted mb-1">{stat.label}</p>
          <p className={`text-lg font-bold ${stat.accent}`}>{stat.value}</p>
        </div>
      ))}
    </div>
  );
}
