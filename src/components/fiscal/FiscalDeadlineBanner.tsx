'use client';

/**
 * Fiscal Deadline Banner
 * Shows upcoming/due/overdue AEAT deadlines as a collapsible panel.
 * Displayed on dashboard. Collapsed by default, toggleable via Zustand.
 */

import { AlertTriangle, Bell, Calendar } from 'lucide-react';
import { AlertPanel } from '@/components/ui/AlertPanel';
import { ALERT_PANEL, ALERT_TONE, FILING_STATUS } from '@/constants/finance';
import { useUpcomingDeadlines } from '@/hooks/useFiscalDeadlines';
import { useTranslate } from '@/hooks/useTranslations';
import { useIsFiscalPanelCollapsed, useToggleFiscalPanel } from '@/stores/useFinanceStore';
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
        'flex flex-wrap items-center gap-x-2 gap-y-1 text-sm',
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
      <span className="font-medium whitespace-nowrap">
        {getModeloLabel(deadline.modeloType, deadline.fiscalQuarter)} {deadline.fiscalYear}
      </span>
      <span className="text-guard-muted whitespace-nowrap">
        {t('fiscal.deadlines.due-date', { date: deadline.endDate })}
      </span>
      {deadline.daysRemaining != null && deadline.daysRemaining >= 0 && (
        <span
          className={cn(
            'text-xs px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap',
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
        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-guard-danger/10 text-guard-danger whitespace-nowrap">
          {t('fiscal.deadlines.overdue')}
        </span>
      )}
      {deadline.needsPostponement && (
        <span className="text-xs text-guard-muted whitespace-nowrap">
          {t('fiscal.deadlines.aplazamiento-available')}
        </span>
      )}
    </div>
  );
}

export function FiscalDeadlineBanner({ className }: { className?: string }) {
  const { t } = useTranslate();
  const { data: deadlines } = useUpcomingDeadlines();
  const isCollapsed = useIsFiscalPanelCollapsed();
  const togglePanel = useToggleFiscalPanel();

  if (!deadlines || deadlines.length === 0) return null;

  const hasOverdue = deadlines.some((d) => d.status === FILING_STATUS.OVERDUE);

  return (
    <AlertPanel
      id={ALERT_PANEL.FISCAL_DEADLINES}
      icon={Bell}
      title={`${t('fiscal.deadlines.banner-title')} (${deadlines.length})`}
      tone={hasOverdue ? ALERT_TONE.DANGER : ALERT_TONE.WARNING}
      isCollapsed={isCollapsed}
      onToggle={togglePanel}
      className={className}
    >
      <div className="space-y-2">
        {deadlines.map((deadline) => (
          <DeadlineItem
            key={`${deadline.modeloType}-${deadline.fiscalYear}-${deadline.fiscalQuarter}`}
            deadline={deadline}
          />
        ))}
      </div>
    </AlertPanel>
  );
}
