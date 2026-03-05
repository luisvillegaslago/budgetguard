'use client';

/**
 * BudgetGuard Month Picker Component
 * Navigation control for selecting the active month
 * Includes dropdown for direct month/year selection
 */

import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMonthPrefetch } from '@/hooks/useMonthPrefetch';
import { useTranslate } from '@/hooks/useTranslations';
import { useMonthNavigation, useSelectedMonth, useSetSelectedMonth } from '@/stores/useFinanceStore';
import { cn, formatDate, getCurrentMonth } from '@/utils/helpers';

const MONTH_INDICES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export function MonthPicker() {
  const { t } = useTranslate();
  const selectedMonth = useSelectedMonth();
  const setSelectedMonth = useSetSelectedMonth();
  const { goToPreviousMonth, goToNextMonth, goToCurrentMonth } = useMonthNavigation();
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownYear, setDropdownYear] = useState(() => Number(selectedMonth.split('-')[0]));
  const containerRef = useRef<HTMLDivElement>(null);

  // Prefetch adjacent months for instant navigation
  useMonthPrefetch(selectedMonth);

  const isCurrentMonth = selectedMonth === getCurrentMonth();
  const selectedYear = Number(selectedMonth.split('-')[0]);
  const selectedMonthNum = Number(selectedMonth.split('-')[1]);

  // Format month for display (e.g., "Enero 2025")
  const displayMonth = formatDate(`${selectedMonth}-01`, 'month');

  // Sync dropdown year when selectedMonth changes externally
  useEffect(() => {
    setDropdownYear(selectedYear);
  }, [selectedYear]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
    return undefined;
  }, [isOpen]);

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.stopPropagation();
        setIsOpen(false);
      }
    },
    [isOpen],
  );

  const handleToggle = () => {
    if (!isOpen) {
      setDropdownYear(selectedYear);
    }
    setIsOpen((prev) => !prev);
  };

  const handleMonthSelect = (monthNum: number) => {
    const month = `${dropdownYear}-${String(monthNum).padStart(2, '0')}`;
    setSelectedMonth(month);
    setIsOpen(false);
  };

  const handlePrevYear = () => setDropdownYear((y) => y - 1);
  const handleNextYear = () => setDropdownYear((y) => y + 1);

  return (
    <div
      ref={containerRef}
      role="toolbar"
      aria-label={t('navigation.month-picker')}
      className="relative flex items-center gap-1 sm:gap-2 flex-shrink-0"
      onKeyDown={handleKeyDown}
    >
      {/* Previous Month Button */}
      <button
        type="button"
        onClick={goToPreviousMonth}
        className="p-2 rounded-lg text-guard-muted hover:text-foreground hover:bg-muted transition-colors"
        aria-label={t('navigation.previous-month')}
      >
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
      </button>

      {/* Month Display — clickable to open dropdown */}
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          'flex items-center gap-2 min-w-[180px] justify-center px-3 py-1.5 rounded-lg transition-colors',
          'hover:bg-muted',
          isOpen && 'bg-muted',
        )}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <Calendar className="h-4 w-4 text-guard-primary" aria-hidden="true" />
        <span className="font-semibold text-foreground capitalize" aria-live="polite" aria-atomic="true">
          {displayMonth}
        </span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 text-guard-muted transition-transform', isOpen && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 w-64 rounded-lg border border-input bg-background shadow-lg animate-fade-in">
          {/* Year navigation */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-input">
            <button
              type="button"
              onClick={handlePrevYear}
              className="p-1 rounded text-guard-muted hover:text-foreground hover:bg-muted transition-colors"
              aria-label={t('navigation.previous-year')}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="font-semibold text-foreground">{dropdownYear}</span>
            <button
              type="button"
              onClick={handleNextYear}
              className="p-1 rounded text-guard-muted hover:text-foreground hover:bg-muted transition-colors"
              aria-label={t('navigation.next-year')}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Month grid */}
          <div className="grid grid-cols-3 gap-1 p-2">
            {MONTH_INDICES.map((m) => {
              const isCurrent = dropdownYear === selectedYear && m === selectedMonthNum;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleMonthSelect(m)}
                  className={cn(
                    'py-2 px-1 rounded-lg text-sm font-medium transition-all duration-200 ease-out-quart',
                    isCurrent ? 'bg-guard-primary text-white' : 'text-foreground hover:bg-muted',
                  )}
                >
                  {t(`common.months-short.${m}`)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Next Month Button */}
      <button
        type="button"
        onClick={goToNextMonth}
        className="p-2 rounded-lg text-guard-muted hover:text-foreground hover:bg-muted transition-colors"
        aria-label={t('navigation.next-month')}
      >
        <ChevronRight className="h-5 w-5" aria-hidden="true" />
      </button>

      {/* Today Button (always rendered to prevent layout shift) */}
      <button
        type="button"
        onClick={goToCurrentMonth}
        className={cn(
          'ml-2 px-3 py-1.5 text-sm font-medium text-guard-primary hover:bg-guard-primary/10 rounded-lg transition-colors',
          isCurrentMonth ? 'invisible' : 'visible',
        )}
        aria-hidden={isCurrentMonth}
        tabIndex={isCurrentMonth ? -1 : 0}
      >
        {t('common.today')}
      </button>
    </div>
  );
}
