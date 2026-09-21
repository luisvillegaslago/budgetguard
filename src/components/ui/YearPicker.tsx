'use client';

/**
 * BudgetGuard Year Picker Component
 * Navigation control for the yearly lens: previous/next year, a dropdown grid of
 * years, and a shortcut back to the current one. Mirrors MonthPicker's structure
 * so both lenses feel like the same control.
 */

import { CalendarRange, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslate } from '@/hooks/useTranslations';
import { useSelectedYear, useSetSelectedYear, useYearNavigation } from '@/stores/useFinanceStore';
import { cn } from '@/utils/helpers';
import { getCurrentYear } from '@/utils/summaryPeriod';

// Years shown per dropdown page, as a 3x4 grid like the month picker's.
const YEARS_PER_PAGE = 12;

/** First year of the page a given year falls in, so paging is stable. */
function pageStartFor(year: number): number {
  return year - (year % YEARS_PER_PAGE);
}

export function YearPicker() {
  const { t } = useTranslate();
  const selectedYear = useSelectedYear();
  const setSelectedYear = useSetSelectedYear();
  const { goToPreviousYear, goToNextYear, goToCurrentYear } = useYearNavigation();
  const [isOpen, setIsOpen] = useState(false);
  const [pageStart, setPageStart] = useState(() => pageStartFor(Number(selectedYear)));
  const containerRef = useRef<HTMLDivElement>(null);

  const isCurrentYear = selectedYear === getCurrentYear();

  // Sync the dropdown page when the year changes externally (URL, arrows)
  useEffect(() => {
    setPageStart(pageStartFor(Number(selectedYear)));
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
      setPageStart(pageStartFor(Number(selectedYear)));
    }
    setIsOpen((prev) => !prev);
  };

  const handleYearSelect = (year: number) => {
    setSelectedYear(String(year));
    setIsOpen(false);
  };

  const years = Array.from({ length: YEARS_PER_PAGE }, (_, i) => pageStart + i);

  return (
    <div
      ref={containerRef}
      role="toolbar"
      aria-label={t('navigation.year-picker')}
      className="relative flex flex-wrap justify-center items-center gap-1 sm:gap-2 sm:flex-nowrap flex-shrink-0 min-w-0"
      onKeyDown={handleKeyDown}
    >
      {/* Previous Year Button */}
      <button
        type="button"
        onClick={goToPreviousYear}
        className="p-2 rounded-lg text-guard-muted hover:text-foreground hover:bg-muted transition-colors"
        aria-label={t('navigation.previous-year')}
      >
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
      </button>

      {/* Year Display — clickable to open dropdown */}
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          'flex items-center gap-2 min-w-0 sm:min-w-[180px] justify-center px-3 py-1.5 rounded-lg transition-colors',
          'hover:bg-muted',
          isOpen && 'bg-muted',
        )}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <CalendarRange className="h-4 w-4 text-guard-primary" aria-hidden="true" />
        <span className="font-semibold text-foreground" aria-live="polite" aria-atomic="true">
          {selectedYear}
        </span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 text-guard-muted transition-transform', isOpen && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 w-64 rounded-lg border border-input bg-background shadow-lg animate-fade-in">
          {/* Page navigation */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-input">
            <button
              type="button"
              onClick={() => setPageStart((y) => y - YEARS_PER_PAGE)}
              className="p-1 rounded text-guard-muted hover:text-foreground hover:bg-muted transition-colors"
              aria-label={t('navigation.previous-years')}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="font-semibold text-foreground">
              {pageStart} – {pageStart + YEARS_PER_PAGE - 1}
            </span>
            <button
              type="button"
              onClick={() => setPageStart((y) => y + YEARS_PER_PAGE)}
              className="p-1 rounded text-guard-muted hover:text-foreground hover:bg-muted transition-colors"
              aria-label={t('navigation.next-years')}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Year grid */}
          <div className="grid grid-cols-3 gap-1 p-2">
            {years.map((year) => (
              <button
                key={year}
                type="button"
                onClick={() => handleYearSelect(year)}
                className={cn(
                  'py-2 px-1 rounded-lg text-sm font-medium transition-all duration-200 ease-out-quart',
                  String(year) === selectedYear ? 'bg-guard-primary text-white' : 'text-foreground hover:bg-muted',
                )}
              >
                {year}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Next Year Button */}
      <button
        type="button"
        onClick={goToNextYear}
        className="p-2 rounded-lg text-guard-muted hover:text-foreground hover:bg-muted transition-colors"
        aria-label={t('navigation.next-year')}
      >
        <ChevronRight className="h-5 w-5" aria-hidden="true" />
      </button>

      {/* Current year shortcut (always rendered to prevent layout shift) */}
      <button
        type="button"
        onClick={goToCurrentYear}
        className={cn(
          'hidden sm:inline-block px-3 py-1.5 text-sm font-medium text-guard-primary hover:bg-guard-primary/10 rounded-lg transition-colors sm:ml-2',
          isCurrentYear ? 'sm:invisible' : '',
        )}
        aria-hidden={isCurrentYear}
        tabIndex={isCurrentYear ? -1 : 0}
      >
        {t('common.current-year')}
      </button>
    </div>
  );
}
