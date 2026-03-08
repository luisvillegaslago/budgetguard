'use client';

/**
 * Reusable pagination component with first/prev/input/next/last controls
 */

import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslate } from '@/hooks/useTranslations';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ currentPage, totalPages, totalItems, pageSize, onPageChange }: PaginationProps) {
  const { t } = useTranslate();

  if (totalPages <= 1) return null;

  const from = currentPage * pageSize + 1;
  const to = Math.min((currentPage + 1) * pageSize, totalItems);
  const isFirst = currentPage === 0;
  const isLast = currentPage >= totalPages - 1;

  const btnClass =
    'p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-guard-muted hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:opacity-30 disabled:pointer-events-none';

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border">
      <span className="text-xs text-guard-muted">
        {t('skydiving.pagination.showing', { from, to, total: totalItems })}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(0)}
          disabled={isFirst}
          className={btnClass}
          aria-label={t('skydiving.pagination.first')}
        >
          <ChevronFirst className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={isFirst}
          className={btnClass}
          aria-label={t('skydiving.pagination.previous')}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="flex items-center gap-1 text-xs text-foreground px-1">
          <input
            type="number"
            min={1}
            max={totalPages}
            value={currentPage + 1}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (val >= 1 && val <= totalPages) onPageChange(val - 1);
            }}
            onWheel={(e) => e.currentTarget.blur()}
            className="w-12 text-center text-xs py-1 rounded border border-input bg-background text-foreground focus:ring-1 focus:ring-guard-primary focus:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            aria-label={t('skydiving.pagination.page-input')}
          />
          <span>/ {totalPages}</span>
        </div>
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={isLast}
          className={btnClass}
          aria-label={t('skydiving.pagination.next')}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onPageChange(totalPages - 1)}
          disabled={isLast}
          className={btnClass}
          aria-label={t('skydiving.pagination.last')}
        >
          <ChevronLast className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
