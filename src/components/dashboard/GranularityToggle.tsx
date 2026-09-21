'use client';

/**
 * BudgetGuard Summary Granularity Toggle
 * Segmented control choosing the lens of the dashboard summary section: a single
 * month or a whole year. The focus ring comes from the global rule in global.css.
 */

import { SUMMARY_GRANULARITY, type SummaryGranularity } from '@/constants/finance';
import { useTranslate } from '@/hooks/useTranslations';
import { useSetSummaryGranularity, useSummaryGranularity } from '@/stores/useFinanceStore';
import { cn } from '@/utils/helpers';

const OPTIONS: SummaryGranularity[] = [SUMMARY_GRANULARITY.MONTH, SUMMARY_GRANULARITY.YEAR];

export function GranularityToggle() {
  const { t } = useTranslate();
  const granularity = useSummaryGranularity();
  const setGranularity = useSetSummaryGranularity();

  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setGranularity(option)}
          aria-pressed={granularity === option}
          className={cn(
            'px-3 py-2.5 sm:py-1 text-xs font-medium rounded-md transition-colors',
            granularity === option ? 'bg-guard-primary text-white' : 'text-foreground/70 hover:text-foreground',
          )}
        >
          {t(`dashboard.granularity.${option}`)}
        </button>
      ))}
    </div>
  );
}
