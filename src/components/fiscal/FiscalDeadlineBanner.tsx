'use client';

/**
 * Fiscal Deadline Banner
 * Shows upcoming/due/overdue AEAT deadlines as a horizontal banner.
 * Displayed on dashboard and fiscal page.
 * Dismissable per session via local state.
 */

import { AlertTriangle, Bell, Calendar, X } from 'lucide-react';
import { useState } from 'react';
import { FILING_STATUS } from '@/constants/finance';
import { useUpcomingDeadlines } from '@/hooks/useFiscalDeadlines';
import { useTranslate } from '@/hooks/useTranslations';
import type { FiscalDeadline } from '@/types/finance';
import { cn } from '@/utils/helpers';

function getModeloLabel(modeloType: string, quarter: number | null): string {
  const label = `Modelo ${modeloType}`;
  if (quarter != null) return `${label} Q${quarter}`;
  return label;
}

function DeadlineItem({ deadline }: { deadline: FiscalDeadline }) {
  const { t } = useTranslate();

  const isOverdue = deadline.status === FILING_STATUS.OVERDUE;
  const isDue = deadline.status === FILING_STATUS.DUE;

  return (
    <div
      className={cn(
        'flex items-center gap-2 text-sm',
        isOverdue && 'text-guard-danger',
        isDue && 'text-guard-warning',
        !isOverdue && !isDue && 'text-foreground',
      )}
    >
      {isOverdue ? (
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <Calendar className="h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span className="font-medium">
        {getModeloLabel(deadline.modeloType, deadline.fiscalQuarter)} {deadline.fiscalYear}
      </span>
      <span className="text-guard-muted">{t('fiscal.deadlines.due-date', { date: deadline.endDate })}</span>
      {deadline.daysRemaining != null && deadline.daysRemaining >= 0 && (
        <span
          className={cn(
            'text-xs px-1.5 py-0.5 rounded-full font-medium',
            isOverdue
              ? 'bg-guard-danger/10 text-guard-danger'
              : isDue
                ? 'bg-guard-warning/10 text-guard-warning'
                : 'bg-guard-primary/10 text-guard-primary',
          )}
        >
          {t('fiscal.deadlines.days-remaining', { count: deadline.daysRemaining })}
        </span>
      )}
      {isOverdue && (
        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-guard-danger/10 text-guard-danger">
          {t('fiscal.deadlines.overdue')}
        </span>
      )}
      {deadline.needsPostponement && (
        <span className="text-xs text-guard-muted">{t('fiscal.deadlines.aplazamiento-available')}</span>
      )}
    </div>
  );
}

export function FiscalDeadlineBanner() {
  const { t } = useTranslate();
  const { data: deadlines } = useUpcomingDeadlines();
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed || !deadlines || deadlines.length === 0) return null;

  const hasOverdue = deadlines.some((d) => d.status === FILING_STATUS.OVERDUE);

  return (
    <div
      className={cn(
        'rounded-lg border p-4 mb-6',
        hasOverdue ? 'bg-guard-danger/5 border-guard-danger/20' : 'bg-guard-warning/5 border-guard-warning/20',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Bell
            className={cn('h-5 w-5 mt-0.5 shrink-0', hasOverdue ? 'text-guard-danger' : 'text-guard-warning')}
            aria-hidden="true"
          />
          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground">{t('fiscal.deadlines.banner-title')}</p>
            {deadlines.map((deadline) => (
              <DeadlineItem
                key={`${deadline.modeloType}-${deadline.fiscalYear}-${deadline.fiscalQuarter}`}
                deadline={deadline}
              />
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsDismissed(true)}
          className="p-1 text-guard-muted hover:text-foreground transition-colors"
          aria-label={t('common.buttons.close')}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
