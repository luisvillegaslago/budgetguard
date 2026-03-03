'use client';

/**
 * BudgetGuard Month Picker Component
 * Navigation control for selecting the active month
 */

import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMonthPrefetch } from '@/hooks/useMonthPrefetch';
import { useTranslate } from '@/hooks/useTranslations';
import { useMonthNavigation, useSelectedMonth } from '@/stores/useFinanceStore';
import { formatDate, getCurrentMonth } from '@/utils/helpers';

export function MonthPicker() {
  const { t } = useTranslate();
  const selectedMonth = useSelectedMonth();
  const { goToPreviousMonth, goToNextMonth, goToCurrentMonth } = useMonthNavigation();

  // Prefetch adjacent months for instant navigation
  useMonthPrefetch(selectedMonth);

  const isCurrentMonth = selectedMonth === getCurrentMonth();

  // Format month for display (e.g., "Enero 2025")
  const displayMonth = formatDate(`${selectedMonth}-01`, 'month');

  return (
    <div className="flex items-center gap-2">
      {/* Previous Month Button */}
      <button
        type="button"
        onClick={goToPreviousMonth}
        className="p-2 rounded-lg text-guard-muted hover:text-foreground hover:bg-muted transition-colors"
        aria-label={t('navigation.previous-month')}
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      {/* Month Display */}
      <div className="flex items-center gap-2 min-w-[180px] justify-center">
        <Calendar className="h-4 w-4 text-guard-primary" />
        <span className="font-semibold text-foreground capitalize">{displayMonth}</span>
      </div>

      {/* Next Month Button */}
      <button
        type="button"
        onClick={goToNextMonth}
        className="p-2 rounded-lg text-guard-muted hover:text-foreground hover:bg-muted transition-colors"
        aria-label={t('navigation.next-month')}
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      {/* Today Button (only show if not on current month) */}
      {!isCurrentMonth && (
        <button
          type="button"
          onClick={goToCurrentMonth}
          className="ml-2 px-3 py-1.5 text-sm font-medium text-guard-primary hover:bg-guard-primary/10 rounded-lg transition-colors"
        >
          {t('common.today')}
        </button>
      )}
    </div>
  );
}
