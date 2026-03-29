'use client';

/**
 * BudgetGuard Recurring Pending Panel
 * Shows all pending recurring expense occurrences grouped by month
 * Appears in the dashboard between BalanceCards and the grid
 */

import { Check, ChevronDown, ChevronUp, Pencil, Repeat, X } from 'lucide-react';
import { useState } from 'react';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Tooltip } from '@/components/ui/Tooltip';
import {
  useConfirmAllOccurrences,
  useConfirmOccurrence,
  usePendingOccurrences,
  useSkipOccurrence,
} from '@/hooks/usePendingOccurrences';
import { useTranslate } from '@/hooks/useTranslations';
import { useIsRecurringPanelCollapsed, useToggleRecurringPanel } from '@/stores/useFinanceStore';
import type { PendingOccurrenceMonth, RecurringOccurrence } from '@/types/finance';
import { cn, formatDate } from '@/utils/helpers';
import { centsToEuros, formatCurrency } from '@/utils/money';

interface OccurrenceItemProps {
  occurrence: RecurringOccurrence;
}

function OccurrenceItem({ occurrence }: OccurrenceItemProps) {
  const { t } = useTranslate();
  const [isModifying, setIsModifying] = useState(false);
  const [modifiedAmount, setModifiedAmount] = useState<string>('');
  const confirmMutation = useConfirmOccurrence();
  const skipMutation = useSkipOccurrence();

  const isProcessing = confirmMutation.isPending || skipMutation.isPending;
  const iconColor = occurrence.recurringExpense.category?.color ?? '#EF4444';

  const handleConfirm = () => {
    const params: { occurrenceId: number; modifiedAmount?: number } = {
      occurrenceId: occurrence.occurrenceId,
    };

    if (isModifying && modifiedAmount) {
      params.modifiedAmount = Number.parseFloat(modifiedAmount);
    }

    confirmMutation.mutate(params, {
      onSuccess: () => {
        setIsModifying(false);
        setModifiedAmount('');
      },
    });
  };

  const handleSkip = () => {
    skipMutation.mutate(occurrence.occurrenceId);
  };

  return (
    <div className="py-2.5 px-3 rounded-lg hover:bg-guard-warning/5 transition-colors">
      {/* Desktop: single row. Mobile: two rows */}
      <div className="flex items-center gap-3">
        {/* Category Icon */}
        <div className="flex-shrink-0 p-1.5 rounded-md" style={{ backgroundColor: `${iconColor}15` }}>
          <CategoryIcon icon={occurrence.recurringExpense.category?.icon} color={iconColor} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{occurrence.recurringExpense.category?.name}</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-guard-muted">{formatDate(occurrence.occurrenceDate)}</span>
            {occurrence.recurringExpense.description && (
              <span className="text-xs text-guard-muted truncate">{occurrence.recurringExpense.description}</span>
            )}
          </div>
        </div>

        {/* Amount (always visible in row) */}
        {!isModifying && (
          <span className="text-sm font-semibold text-guard-danger flex-shrink-0">
            {formatCurrency(occurrence.recurringExpense.amountCents)}
          </span>
        )}

        {/* Desktop actions */}
        {isModifying ? (
          <div className="hidden sm:flex items-center gap-1.5">
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={modifiedAmount}
              onChange={(e) => setModifiedAmount(e.target.value)}
              placeholder={String(centsToEuros(occurrence.recurringExpense.amountCents))}
              className="w-20 px-2 py-1 text-sm rounded border border-input bg-background text-foreground focus:ring-2 focus:ring-guard-primary focus:border-transparent"
              aria-label={t('recurring.pending.modified-amount')}
            />
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isProcessing}
              className="p-1 rounded text-guard-success hover:bg-guard-success/10"
              aria-label={t('recurring.pending.confirm')}
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setIsModifying(false);
                setModifiedAmount('');
              }}
              className="p-1 rounded text-guard-muted hover:bg-muted"
              aria-label={t('common.buttons.cancel')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
            <Tooltip content={t('recurring.pending.modify')}>
              <button
                type="button"
                onClick={() => setIsModifying(true)}
                disabled={isProcessing}
                className="p-1.5 rounded-md text-guard-muted hover:text-foreground hover:bg-muted transition-colors"
                aria-label={t('recurring.pending.modify')}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isProcessing}
              className="px-2.5 py-1 rounded-md text-xs font-medium bg-guard-success/10 text-guard-success hover:bg-guard-success/20 transition-colors"
              aria-label={t('recurring.pending.confirm')}
            >
              {confirmMutation.isPending ? <LoadingSpinner size="sm" /> : t('recurring.pending.confirm')}
            </button>
            <button
              type="button"
              onClick={handleSkip}
              disabled={isProcessing}
              className="px-2.5 py-1 rounded-md text-xs font-medium bg-muted text-guard-muted hover:text-foreground transition-colors"
              aria-label={t('recurring.pending.skip')}
            >
              {skipMutation.isPending ? <LoadingSpinner size="sm" /> : t('recurring.pending.skip')}
            </button>
          </div>
        )}
      </div>

      {/* Mobile actions row */}
      <div className="flex sm:hidden items-center justify-end gap-1.5 mt-2 pl-10">
        {isModifying ? (
          <>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={modifiedAmount}
              onChange={(e) => setModifiedAmount(e.target.value)}
              placeholder={String(centsToEuros(occurrence.recurringExpense.amountCents))}
              className="w-20 px-2 py-1 text-sm rounded border border-input bg-background text-foreground focus:ring-2 focus:ring-guard-primary focus:border-transparent"
              aria-label={t('recurring.pending.modified-amount')}
            />
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isProcessing}
              className="p-1 rounded text-guard-success hover:bg-guard-success/10"
              aria-label={t('recurring.pending.confirm')}
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setIsModifying(false);
                setModifiedAmount('');
              }}
              className="p-1 rounded text-guard-muted hover:bg-muted"
              aria-label={t('common.buttons.cancel')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <Tooltip content={t('recurring.pending.modify')}>
              <button
                type="button"
                onClick={() => setIsModifying(true)}
                disabled={isProcessing}
                className="p-1.5 rounded-md text-guard-muted hover:text-foreground hover:bg-muted transition-colors"
                aria-label={t('recurring.pending.modify')}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isProcessing}
              className="px-2.5 py-1 rounded-md text-xs font-medium bg-guard-success/10 text-guard-success hover:bg-guard-success/20 transition-colors"
              aria-label={t('recurring.pending.confirm')}
            >
              {confirmMutation.isPending ? <LoadingSpinner size="sm" /> : t('recurring.pending.confirm')}
            </button>
            <button
              type="button"
              onClick={handleSkip}
              disabled={isProcessing}
              className="px-2.5 py-1 rounded-md text-xs font-medium bg-muted text-guard-muted hover:text-foreground transition-colors"
              aria-label={t('recurring.pending.skip')}
            >
              {skipMutation.isPending ? <LoadingSpinner size="sm" /> : t('recurring.pending.skip')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

interface MonthSectionProps {
  monthData: PendingOccurrenceMonth;
}

function MonthSection({ monthData }: MonthSectionProps) {
  const { t } = useTranslate();
  const confirmAllMutation = useConfirmAllOccurrences();

  const [year, month] = monthData.month.split('-');
  const monthName = t(`recurring.months.${Number(month)}`);
  const monthLabel = `${monthName} ${year}`;

  const occurrenceIds = monthData.occurrences.map((o) => o.occurrenceId);

  const handleConfirmAll = () => {
    confirmAllMutation.mutate(occurrenceIds);
  };

  return (
    <div className="space-y-1">
      {/* Month header */}
      <div className="flex items-center justify-between px-3 py-1.5">
        <h4 className="text-xs font-semibold text-guard-muted uppercase tracking-wider">
          {monthLabel} ({monthData.count})
        </h4>
        <button
          type="button"
          onClick={handleConfirmAll}
          disabled={confirmAllMutation.isPending}
          className="text-xs font-medium text-guard-primary hover:text-guard-primary/80 transition-colors"
        >
          {confirmAllMutation.isPending
            ? t('recurring.pending.processing')
            : t('recurring.pending.confirm-all-month', { month: monthName })}
        </button>
      </div>

      {/* Occurrences */}
      {monthData.occurrences.map((occurrence) => (
        <OccurrenceItem key={occurrence.occurrenceId} occurrence={occurrence} />
      ))}
    </div>
  );
}

export function RecurringPendingPanel() {
  const { t } = useTranslate();
  const { data, isLoading, isError, refetch } = usePendingOccurrences();
  const isCollapsed = useIsRecurringPanelCollapsed();
  const togglePanel = useToggleRecurringPanel();
  const confirmAllMutation = useConfirmAllOccurrences();

  // Don't render if loading or no pending occurrences
  if (isLoading || (!data && !isError) || (data && data.totalCount === 0)) {
    return null;
  }

  if (isError) {
    return (
      <div className="rounded-[var(--radius)] border border-guard-danger/20 bg-guard-danger/5 px-5 py-4" role="alert">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-guard-danger/10">
              <Repeat className="h-4 w-4 text-guard-danger" aria-hidden="true" />
            </div>
            <p className="text-sm text-guard-danger">{t('recurring.pending.error')}</p>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-xs font-medium text-guard-primary hover:text-guard-primary/80 transition-colors"
          >
            {t('common.buttons.retry')}
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const allOccurrenceIds = data.months.flatMap((m) => m.occurrences.map((o) => o.occurrenceId));

  const handleConfirmAll = () => {
    confirmAllMutation.mutate(allOccurrenceIds);
  };

  return (
    <div
      className={cn(
        'rounded-[var(--radius)] border transition-colors duration-200',
        'bg-guard-warning/5',
        'border-guard-warning/20',
      )}
    >
      {/* Header */}
      <button
        type="button"
        onClick={togglePanel}
        className="w-full flex items-center justify-between px-4 py-3 sm:px-5 sm:py-4 text-left"
        aria-expanded={!isCollapsed}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-guard-warning/10">
            <Repeat className="h-4 w-4 text-guard-warning" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {t('recurring.pending.title')} {t('recurring.pending.count', { count: data.totalCount })}
            </h3>
          </div>
        </div>
        {isCollapsed ? (
          <ChevronDown className="h-4 w-4 text-guard-muted" />
        ) : (
          <ChevronUp className="h-4 w-4 text-guard-muted" />
        )}
      </button>

      {/* Content */}
      <div
        className={cn('grid', isCollapsed ? 'animate-collapse-close' : 'animate-collapse-open')}
        style={{ gridTemplateRows: isCollapsed ? '0fr' : '1fr' }}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4 space-y-3">
            {data.months.map((monthData) => (
              <MonthSection key={monthData.month} monthData={monthData} />
            ))}

            {/* Global confirm all */}
            {data.months.length > 1 && (
              <div className="pt-2 border-t border-guard-warning/20">
                <button
                  type="button"
                  onClick={handleConfirmAll}
                  disabled={confirmAllMutation.isPending}
                  className={cn(
                    'w-full py-2.5 rounded-lg text-sm font-semibold transition-all duration-200',
                    'bg-guard-success/10 text-guard-success hover:bg-guard-success/20',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                >
                  {confirmAllMutation.isPending
                    ? t('recurring.pending.processing')
                    : t('recurring.pending.confirm-all', { count: data.totalCount })}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
