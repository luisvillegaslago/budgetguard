'use client';

/**
 * BudgetGuard SortControl
 * Compact "sort by" control for lists/popups that have no column headers
 * (e.g. expense popups, the movements list). Renders one pill per sortable
 * field; the active field shows an arrow indicating direction. Clicking the
 * active field flips the direction, clicking another switches to it (ascending).
 */

import { ArrowDown, ArrowUp } from 'lucide-react';
import { SORT_DIRECTION } from '@/constants/finance';
import type { SortState } from '@/hooks/useSortableData';
import { useTranslate } from '@/hooks/useTranslations';
import { cn } from '@/utils/helpers';

export interface SortControlOption {
  key: string;
  /** Already-translated label shown on the pill. */
  label: string;
}

interface SortControlProps {
  options: readonly SortControlOption[];
  sort: SortState | null;
  onToggle: (key: string) => void;
  className?: string;
}

export function SortControl({ options, sort, onToggle, className }: SortControlProps) {
  const { t } = useTranslate();

  return (
    <div className={cn('flex items-center gap-1.5 flex-wrap', className)}>
      <span className="text-xs text-guard-muted">{t('sort.order-by')}</span>
      {options.map((opt) => {
        const active = sort?.key === opt.key;
        const ascending = sort?.direction === SORT_DIRECTION.ASC;
        const directionLabel = active ? t(ascending ? 'sort.ascending' : 'sort.descending') : '';
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onToggle(opt.key)}
            aria-pressed={active}
            aria-label={active ? `${opt.label} (${directionLabel})` : opt.label}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap',
              active ? 'bg-guard-primary text-white' : 'bg-muted text-guard-muted hover:text-foreground',
            )}
          >
            {opt.label}
            {active &&
              (ascending ? (
                <ArrowUp className="h-3 w-3" aria-hidden="true" />
              ) : (
                <ArrowDown className="h-3 w-3" aria-hidden="true" />
              ))}
          </button>
        );
      })}
    </div>
  );
}
