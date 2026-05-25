'use client';

/**
 * BudgetGuard Amount Sum Popover
 * Small Σ helper next to an amount input: add individual values one by one,
 * see the running list and total, then apply the total back to the field.
 * Values live only in local state (never persisted to the DB).
 * Uses fixed positioning to escape overflow containers (e.g. modals).
 */

import { Calculator, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslate } from '@/hooks/useTranslations';
import { cn } from '@/utils/helpers';
import { centsToEuros, formatCurrency, parseInputToCents, sumCents } from '@/utils/money';

interface PopoverPosition {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
}

interface SumValue {
  id: number;
  cents: number;
}

interface AmountSumPopoverProps {
  // Called with the computed total (in euros) when the user applies the sum
  onApply: (totalEuros: number) => void;
  disabled?: boolean;
}

const POPOVER_WIDTH = 240;
const POPOVER_HEIGHT = 300;

export function AmountSumPopover({ onApply, disabled }: AmountSumPopoverProps) {
  const { t } = useTranslate();
  const [isOpen, setIsOpen] = useState(false);
  const [values, setValues] = useState<SumValue[]>([]);
  const [draft, setDraft] = useState('');
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idRef = useRef(0);

  const totalCents = sumCents(values.map((v) => v.cents));

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleToggle = () => {
    if (disabled) return;
    const willOpen = !isOpen;
    if (willOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < POPOVER_HEIGHT && rect.top > spaceBelow;
      // Anchor the popover's right edge to the trigger (it lives near the modal edge)
      const left = Math.max(8, rect.right - POPOVER_WIDTH);
      setPosition(
        openUp
          ? { bottom: window.innerHeight - rect.top + 4, left, width: POPOVER_WIDTH }
          : { top: rect.bottom + 4, left, width: POPOVER_WIDTH },
      );
    }
    setIsOpen(willOpen);
    if (willOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handleAdd = () => {
    const cents = parseInputToCents(draft);
    if (cents === null || cents <= 0) return;
    setValues((prev) => [...prev, { id: idRef.current++, cents }]);
    setDraft('');
    inputRef.current?.focus();
  };

  const handleRemove = (id: number) => {
    setValues((prev) => prev.filter((v) => v.id !== id));
  };

  const handleClear = () => {
    setValues([]);
    setDraft('');
    inputRef.current?.focus();
  };

  const handleApply = () => {
    if (totalCents <= 0) return;
    onApply(centsToEuros(totalCents));
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      {/* Trigger */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        aria-label={t('common.amount-sum.open')}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className={cn(
          'flex items-center justify-center h-[34px] w-9 rounded-lg border transition-colors duration-200 ease-out-quart',
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-guard-primary/50 hover:text-guard-primary',
          isOpen
            ? 'border-guard-primary text-guard-primary ring-2 ring-guard-primary'
            : 'border-input text-guard-muted',
        )}
      >
        <Calculator className="h-4 w-4" aria-hidden="true" />
      </button>

      {/* Popover — fixed positioning to escape overflow containers */}
      {isOpen && position && (
        <div
          role="dialog"
          aria-label={t('common.amount-sum.title')}
          className="fixed z-[100] rounded-lg border border-border bg-background shadow-md animate-fade-in p-3"
          style={{
            top: position.top != null ? `${position.top}px` : undefined,
            bottom: position.bottom != null ? `${position.bottom}px` : undefined,
            left: `${position.left}px`,
            width: `${position.width}px`,
          }}
        >
          <p className="text-sm font-medium text-foreground mb-2">{t('common.amount-sum.title')}</p>

          {/* Add row */}
          <div className="flex items-center gap-2 mb-2">
            <input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="0,00"
              autoComplete="off"
              className="w-full min-w-0 px-3 py-1.5 text-sm text-right rounded-md border border-input bg-background text-foreground focus:ring-2 focus:ring-guard-primary focus:border-transparent"
            />
            <button
              type="button"
              onClick={handleAdd}
              aria-label={t('common.amount-sum.add')}
              className="flex items-center justify-center shrink-0 h-[34px] w-9 rounded-md bg-guard-primary text-white hover:bg-guard-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Values list */}
          {values.length > 0 ? (
            <ul className="max-h-40 overflow-y-auto space-y-1 mb-2">
              {values.map((value) => (
                <li
                  key={value.id}
                  className="flex items-center justify-between gap-2 px-2 py-1 rounded-md bg-muted/50 text-sm"
                >
                  <span className="tabular-nums text-foreground">{formatCurrency(value.cents)}</span>
                  <button
                    type="button"
                    onClick={() => handleRemove(value.id)}
                    aria-label={t('common.amount-sum.remove')}
                    className="p-0.5 rounded hover:bg-muted text-guard-muted hover:text-guard-danger transition-colors"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-guard-muted text-center py-2 mb-1">{t('common.amount-sum.empty')}</p>
          )}

          {/* Total */}
          <div className="flex items-center justify-between border-t border-border pt-2 mb-3">
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {t('common.total', { amount: formatCurrency(totalCents) })}
            </span>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClear}
              disabled={values.length === 0}
              className="flex-1 py-1.5 rounded-md border border-input text-sm text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t('common.buttons.clear')}
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={totalCents <= 0}
              className="flex-1 py-1.5 rounded-md bg-guard-primary text-white text-sm font-medium hover:bg-guard-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t('common.amount-sum.apply')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
