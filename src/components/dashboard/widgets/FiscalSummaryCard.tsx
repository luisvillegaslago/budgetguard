'use client';

/**
 * BudgetGuard Fiscal Summary Card
 * Quarter-at-a-glance for the self-employed: estimated IVA (303) and IRPF (130),
 * invoices pending payment, and the next filing deadline. Quarter derives from
 * the selected month.
 */

import { Calculator, Clock, FileText } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { INVOICE_STATUS } from '@/constants/finance';
import { useUpcomingDeadlines } from '@/hooks/useFiscalDeadlines';
import { useFiscalReport } from '@/hooks/useFiscalReport';
import { useInvoices } from '@/hooks/useInvoices';
import { useTranslate } from '@/hooks/useTranslations';
import { useSelectedMonth } from '@/stores/useFinanceStore';
import { formatCurrency } from '@/utils/money';

interface StatRowProps {
  label: string;
  value: string;
  tone?: 'neutral' | 'danger' | 'success';
}

function StatRow({ label, value, tone = 'neutral' }: StatRowProps) {
  const valueClass =
    tone === 'danger' ? 'text-guard-danger' : tone === 'success' ? 'text-guard-success' : 'text-foreground';
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-sm text-guard-muted">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}

export function FiscalSummaryCard() {
  const { t } = useTranslate();
  const selectedMonth = useSelectedMonth();
  const year = Number(selectedMonth.slice(0, 4));
  const month = Number(selectedMonth.slice(5, 7));
  const quarter = Math.ceil(month / 3);

  const { data: report, isPending, isError, refetch } = useFiscalReport(year, quarter);
  const { data: invoices } = useInvoices({ status: INVOICE_STATUS.FINALIZED });
  const { data: deadlines } = useUpcomingDeadlines();

  const pending = useMemo(() => {
    const list = invoices ?? [];
    return { cents: list.reduce((sum, inv) => sum + inv.totalCents, 0), count: list.length };
  }, [invoices]);

  const nextDeadline = deadlines?.[0] ?? null;

  return (
    <div className="card flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{t('dashboard.widgets.fiscal-title')}</h3>
          <p className="text-xs text-guard-muted">{t('dashboard.widgets.quarter-label', { quarter, year })}</p>
        </div>
        <div className="p-2 rounded-lg bg-guard-accent/10 text-guard-accent">
          <Calculator className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>

      {isPending ? (
        <div className="flex flex-1 items-center justify-center py-10">
          <LoadingSpinner size="md" />
        </div>
      ) : isError || !report ? (
        <ErrorState message={t('errors.load-summary')} onRetry={() => refetch()} />
      ) : (
        <div className="flex flex-1 flex-col gap-3">
          <StatRow
            label={t('dashboard.widgets.iva-303')}
            value={formatCurrency(report.modelo303.resultCents)}
            tone={report.modelo303.resultCents > 0 ? 'danger' : 'success'}
          />
          <StatRow
            label={t('dashboard.widgets.irpf-130')}
            value={formatCurrency(report.modelo130.casilla7Cents)}
            tone={report.modelo130.casilla7Cents > 0 ? 'danger' : 'success'}
          />
          <StatRow label={t('dashboard.widgets.pending-invoices')} value={formatCurrency(pending.cents)} />

          {nextDeadline && (
            <div className="mt-1 flex items-center gap-2 text-xs text-guard-muted">
              <Clock className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
              <span>
                {t('dashboard.widgets.next-model', { model: nextDeadline.modeloType })}
                {' · '}
                {nextDeadline.daysRemaining != null
                  ? t('dashboard.widgets.due-in-days', { days: nextDeadline.daysRemaining })
                  : t('dashboard.widgets.overdue')}
              </span>
            </div>
          )}

          <div className="mt-auto pt-3 border-t border-border">
            <Link
              href="/fiscal"
              className="inline-flex items-center gap-1.5 text-sm text-guard-primary hover:text-guard-primary/80 transition-colors"
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              {t('dashboard.widgets.view-fiscal')}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
