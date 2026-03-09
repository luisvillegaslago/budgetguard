'use client';

/**
 * BudgetGuard Category History Page
 * Multi-month view of transactions for a specific category
 */

import { AlertCircle, History, RefreshCw } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { CategoryHistoryMonths } from '@/components/category-history/CategoryHistoryMonths';
import { CategoryHistoryStats } from '@/components/category-history/CategoryHistoryStats';
import { DateRangeSelector } from '@/components/category-history/DateRangeSelector';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { DateRangePreset } from '@/constants/finance';
import { DATE_RANGE_PRESET } from '@/constants/finance';
import { useCategoryHistory } from '@/hooks/useCategoryHistory';
import { useTranslate } from '@/hooks/useTranslations';

export default function CategoryHistoryPage() {
  const { t } = useTranslate();
  const params = useParams();
  const categoryId = Number.parseInt(params.id as string, 10);

  const [range, setRange] = useState<DateRangePreset>(DATE_RANGE_PRESET.ONE_YEAR);
  const { data, isLoading, isError, refetch } = useCategoryHistory(categoryId, range);

  if (Number.isNaN(categoryId)) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-guard-danger">{t('category-history.errors.not-found')}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12" role="alert">
          <AlertCircle className="h-12 w-12 mx-auto mb-3 text-guard-danger opacity-50" aria-hidden="true" />
          <p className="text-guard-danger">{t('category-history.errors.load')}</p>
          <button type="button" onClick={() => refetch()} className="btn-ghost mt-4 inline-flex items-center gap-2">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {t('common.buttons.retry')}
          </button>
        </div>
      </div>
    );
  }

  const { category, summary, months } = data;
  const categoryColor = category.color ?? '#6366F1';

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Category header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="p-3 rounded-xl" style={{ backgroundColor: `${categoryColor}15` }}>
          <CategoryIcon icon={category.icon} color={categoryColor} className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">{category.name}</h1>
      </div>

      {/* Range selector */}
      <div className="mb-6">
        <DateRangeSelector value={range} onChange={setRange} />
      </div>

      {/* Stats cards */}
      <div className="mb-6">
        <CategoryHistoryStats summary={summary} />
      </div>

      {/* Monthly transaction sections */}
      {months.length > 0 ? (
        <CategoryHistoryMonths months={months} />
      ) : (
        <div className="card">
          <EmptyState
            icon={History}
            title={t('category-history.empty.title')}
            subtitle={t('category-history.empty.subtitle')}
          />
        </div>
      )}
    </div>
  );
}
