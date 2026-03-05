'use client';

/**
 * Date range selector pills for category history
 * Displays preset range options (3M, 6M, 1Y, All)
 */

import type { DateRangePreset } from '@/constants/finance';
import { DATE_RANGE_PRESET } from '@/constants/finance';
import { useTranslate } from '@/hooks/useTranslations';
import { cn } from '@/utils/helpers';

interface DateRangeSelectorProps {
  value: DateRangePreset;
  onChange: (range: DateRangePreset) => void;
}

const RANGE_OPTIONS: DateRangePreset[] = [
  DATE_RANGE_PRESET.THREE_MONTHS,
  DATE_RANGE_PRESET.SIX_MONTHS,
  DATE_RANGE_PRESET.ONE_YEAR,
  DATE_RANGE_PRESET.ALL,
];

export function DateRangeSelector({ value, onChange }: DateRangeSelectorProps) {
  const { t } = useTranslate();

  return (
    <div className="flex gap-1 rounded-lg bg-muted/50 p-1" role="tablist" aria-label={t('category-history.title')}>
      {RANGE_OPTIONS.map((range) => (
        <button
          key={range}
          type="button"
          role="tab"
          aria-selected={value === range}
          onClick={() => onChange(range)}
          className={cn(
            'px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200',
            value === range
              ? 'bg-guard-primary text-white shadow-sm'
              : 'text-guard-muted hover:text-foreground hover:bg-muted',
          )}
        >
          {t(`category-history.range.${range}`)}
        </button>
      ))}
    </div>
  );
}
