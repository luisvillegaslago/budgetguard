'use client';

/**
 * BudgetGuard SortableHeader
 * Clickable header cell content for HTML <table> headers. Render inside a <th>.
 * Shows a neutral up/down icon when inactive and a directional arrow when the
 * column drives the current sort.
 */

import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { SORT_DIRECTION } from '@/constants/finance';
import type { SortState } from '@/hooks/useSortableData';
import { cn } from '@/utils/helpers';

interface SortableHeaderProps {
  /** Already-translated column label. */
  label: string;
  sortKey: string;
  sort: SortState | null;
  onToggle: (key: string) => void;
  /** Right-align for numeric columns (e.g. amounts). */
  align?: 'left' | 'right';
  className?: string;
}

export function SortableHeader({ label, sortKey, sort, onToggle, align = 'left', className }: SortableHeaderProps) {
  const active = sort?.key === sortKey;
  const ascending = sort?.direction === SORT_DIRECTION.ASC;
  const Icon = active ? (ascending ? ArrowUp : ArrowDown) : ChevronsUpDown;

  return (
    <button
      type="button"
      onClick={() => onToggle(sortKey)}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium uppercase transition-colors hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-guard-primary focus-visible:ring-inset rounded',
        align === 'right' && 'flex-row-reverse',
        active ? 'text-guard-primary' : 'text-guard-muted',
        className,
      )}
    >
      {label}
      <Icon className={cn('h-3 w-3', !active && 'opacity-40')} aria-hidden="true" />
    </button>
  );
}
