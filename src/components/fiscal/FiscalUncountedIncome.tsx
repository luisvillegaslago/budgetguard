'use client';

/**
 * BudgetGuard Uncounted Income Notice
 *
 * Income that no fiscal model counts, because only the professional category feeds them.
 * Deliberately quiet — this is almost always correct (a benefit payment, a private sale), so
 * it is stated, not alarmed about. What it prevents is the silent case: an invoice filed under
 * the wrong category vanishing from every model with nothing on screen to notice it by.
 */

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useTranslate } from '@/hooks/useTranslations';
import type { FiscalTransaction } from '@/types/finance';
import { cn, formatDate } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

interface FiscalUncountedIncomeProps {
  income: FiscalTransaction[];
}

export function FiscalUncountedIncome({ income }: FiscalUncountedIncomeProps) {
  const { t, locale } = useTranslate();
  const [isOpen, setIsOpen] = useState(false);

  if (income.length === 0) return null;

  const totalCents = income.reduce((sum, row) => sum + row.baseCents, 0);

  return (
    <div className="rounded-lg border border-border bg-muted/40">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left"
      >
        <span className="text-sm text-guard-muted">
          {t('fiscal.uncounted-income.summary', { count: income.length, total: formatCurrency(totalCents) })}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-guard-muted transition-transform duration-200', !isOpen && '-rotate-90')}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div className="border-t border-border px-4 py-3 space-y-2">
          <p className="text-xs text-guard-muted">{t('fiscal.uncounted-income.hint')}</p>
          <ul className="space-y-1">
            {income.map((row) => (
              <li key={row.transactionId} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-foreground/80">
                  {row.description ?? row.vendorName ?? row.categoryName}
                  <span className="ml-2 text-xs text-guard-muted">{row.categoryName}</span>
                </span>
                <span className="flex shrink-0 items-baseline gap-3">
                  <span className="text-xs text-guard-muted">{formatDate(row.transactionDate, 'short', locale)}</span>
                  <span className="tabular-nums font-medium">{formatCurrency(row.baseCents)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
