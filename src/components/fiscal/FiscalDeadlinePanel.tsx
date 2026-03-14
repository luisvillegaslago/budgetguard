'use client';

/**
 * Full deadline list panel for the fiscal page.
 * Shows all deadlines for a given year sorted by date, with visual status indicators.
 */

import { AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { useMemo } from 'react';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { FILING_STATUS } from '@/constants/finance';
import { useFiscalDeadlines } from '@/hooks/useFiscalDeadlines';
import { useTranslate } from '@/hooks/useTranslations';
import type { FiscalDeadline } from '@/types/finance';
import { cn } from '@/utils/helpers';

interface FiscalDeadlinePanelProps {
  year: number;
}

const STATUS_ICON = {
  [FILING_STATUS.FILED]: CheckCircle,
  [FILING_STATUS.NOT_DUE]: Clock,
  [FILING_STATUS.UPCOMING]: Clock,
  [FILING_STATUS.DUE]: AlertTriangle,
  [FILING_STATUS.OVERDUE]: AlertTriangle,
} as const;

const STATUS_STYLES = {
  [FILING_STATUS.FILED]: 'text-guard-success',
  [FILING_STATUS.NOT_DUE]: 'text-guard-muted',
  [FILING_STATUS.UPCOMING]: 'text-guard-primary',
  [FILING_STATUS.DUE]: 'text-amber-600 dark:text-amber-400',
  [FILING_STATUS.OVERDUE]: 'text-guard-danger',
} as const;

/**
 * Format YYYY-MM-DD to DD/MM/YYYY
 */
function formatDeadlineDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Whether a deadline is "active" — upcoming, due, or overdue (not filed and not far-future).
 */
function isActiveDeadline(status: string): boolean {
  return status === FILING_STATUS.UPCOMING || status === FILING_STATUS.DUE || status === FILING_STATUS.OVERDUE;
}

function DeadlineRow({ deadline }: { deadline: FiscalDeadline }) {
  const { t } = useTranslate();
  const Icon = STATUS_ICON[deadline.status];
  const label =
    deadline.fiscalQuarter != null
      ? `Modelo ${deadline.modeloType} Q${deadline.fiscalQuarter} ${deadline.fiscalYear}`
      : `Modelo ${deadline.modeloType} ${deadline.fiscalYear}`;

  const dimmed = deadline.status === FILING_STATUS.NOT_DUE;

  return (
    <div
      className={cn(
        'flex items-center justify-between py-2.5 border-b border-border last:border-0',
        dimmed && 'opacity-40',
      )}
    >
      <div className="flex items-center gap-3">
        <Icon className={cn('h-4 w-4', STATUS_STYLES[deadline.status])} aria-hidden="true" />
        <div>
          <span className="text-sm font-medium text-foreground">{label}</span>
          <p className="text-xs text-guard-muted">
            {formatDeadlineDate(deadline.startDate)} — {formatDeadlineDate(deadline.endDate)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {deadline.daysRemaining != null && deadline.daysRemaining >= 0 && deadline.status !== FILING_STATUS.FILED && (
          <span className="text-xs text-guard-muted">
            {t('fiscal.deadlines.days-remaining', { count: deadline.daysRemaining })}
          </span>
        )}
        <span
          className={cn(
            'text-xs px-2 py-0.5 rounded-full font-medium',
            deadline.status === FILING_STATUS.FILED && 'bg-guard-success/10 text-guard-success',
            deadline.status === FILING_STATUS.NOT_DUE && 'bg-muted text-guard-muted',
            deadline.status === FILING_STATUS.UPCOMING && 'bg-guard-primary/10 text-guard-primary',
            deadline.status === FILING_STATUS.DUE && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
            deadline.status === FILING_STATUS.OVERDUE && 'bg-guard-danger/10 text-guard-danger',
          )}
        >
          {t(`fiscal.deadlines.status.${deadline.status}`)}
        </span>
      </div>
    </div>
  );
}

export function FiscalDeadlinePanel({ year }: FiscalDeadlinePanelProps) {
  const { t } = useTranslate();
  const { data: deadlines, isLoading } = useFiscalDeadlines(year);

  // Sort: active (upcoming/due/overdue) first by endDate, then not_due by endDate, then filed last by endDate
  const sorted = useMemo(() => {
    if (!deadlines) return [];
    const priority = (status: string): number => {
      if (isActiveDeadline(status)) return 0;
      if (status === FILING_STATUS.NOT_DUE) return 1;
      return 2; // FILED
    };
    return [...deadlines].sort((a, b) => {
      const pa = priority(a.status);
      const pb = priority(b.status);
      if (pa !== pb) return pa - pb;
      return a.endDate.localeCompare(b.endDate);
    });
  }, [deadlines]);

  return (
    <CollapsibleSection title={t('fiscal.deadlines.panel-title-year', { year })}>
      {isLoading && (
        <div className="flex justify-center py-8">
          <LoadingSpinner size="md" label={t('common.loading')} />
        </div>
      )}

      {sorted.length > 0 && (
        <div className="divide-y divide-border">
          {sorted.map((deadline) => (
            <DeadlineRow key={`${deadline.modeloType}-${deadline.fiscalQuarter}`} deadline={deadline} />
          ))}
        </div>
      )}

      {deadlines && deadlines.length === 0 && (
        <p className="text-sm text-guard-muted text-center py-8">{t('fiscal.deadlines.empty')}</p>
      )}
    </CollapsibleSection>
  );
}
