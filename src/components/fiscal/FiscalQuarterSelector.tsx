'use client';

/**
 * BudgetGuard Fiscal Quarter Selector
 * Year navigation with arrows + quarter buttons (T1-T4)
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslate } from '@/hooks/useTranslations';
import { cn } from '@/utils/helpers';

interface FiscalQuarterSelectorProps {
  year: number;
  quarter: number;
  onYearChange: (year: number) => void;
  onQuarterChange: (quarter: number) => void;
}

const QUARTERS = [1, 2, 3, 4] as const;
const QUARTER_KEYS = ['q1', 'q2', 'q3', 'q4'] as const;
const QUARTER_LONG_KEYS = ['q1-long', 'q2-long', 'q3-long', 'q4-long'] as const;

export function FiscalQuarterSelector({ year, quarter, onYearChange, onQuarterChange }: FiscalQuarterSelectorProps) {
  const { t } = useTranslate();

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      {/* Year Navigation */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onYearChange(year - 1)}
          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-guard-muted hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          aria-label={t('navigation.previous-year')}
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <span className="text-xl font-bold text-foreground tabular-nums min-w-[4ch] text-center">{year}</span>
        <button
          type="button"
          onClick={() => onYearChange(year + 1)}
          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-guard-muted hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          aria-label={t('navigation.next-year')}
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {/* Quarter Buttons */}
      <fieldset className="flex gap-2 border-0 p-0 m-0" aria-label="Fiscal quarter">
        {QUARTERS.map((q, i) => (
          <button
            key={q}
            type="button"
            aria-pressed={quarter === q}
            onClick={() => onQuarterChange(q)}
            className={cn(
              'px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 ease-out-quart',
              'min-w-[44px] min-h-[44px] flex flex-col items-center justify-center',
              quarter === q
                ? 'bg-guard-primary text-white shadow-sm'
                : 'bg-muted text-guard-muted hover:text-foreground hover:bg-muted/80',
            )}
          >
            <span>{t(`fiscal.quarter-selector.${QUARTER_KEYS[i]}`)}</span>
            <span className="text-[10px] opacity-70">{t(`fiscal.quarter-selector.${QUARTER_LONG_KEYS[i]}`)}</span>
          </button>
        ))}
      </fieldset>
    </div>
  );
}
