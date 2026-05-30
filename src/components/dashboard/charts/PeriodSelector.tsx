'use client';

/**
 * BudgetGuard Period Selector
 * Segmented control for the dashboard trend charts (1Y / 5Y / 10Y / All).
 * Bound to shared store state so every chart stays in sync.
 */

import { TREND_PERIOD, type TrendPeriod } from '@/constants/finance';
import { useTranslate } from '@/hooks/useTranslations';
import { useSetTrendPeriod, useTrendPeriod } from '@/stores/useFinanceStore';
import { cn } from '@/utils/helpers';

const OPTIONS: TrendPeriod[] = [
  TREND_PERIOD.ONE_YEAR,
  TREND_PERIOD.FIVE_YEARS,
  TREND_PERIOD.TEN_YEARS,
  TREND_PERIOD.ALL,
];

export function PeriodSelector() {
  const { t } = useTranslate();
  const period = useTrendPeriod();
  const setPeriod = useSetTrendPeriod();

  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setPeriod(option)}
          aria-pressed={period === option}
          className={cn(
            'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
            period === option ? 'bg-guard-primary text-white' : 'text-guard-muted hover:text-foreground',
          )}
        >
          {t(`dashboard.charts.period.${option}`)}
        </button>
      ))}
    </div>
  );
}
