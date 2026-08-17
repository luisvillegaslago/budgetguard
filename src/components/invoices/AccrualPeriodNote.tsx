'use client';

/**
 * BudgetGuard Accrual Period Note
 *
 * Shown while an invoice is being marked as paid, when the collection date lands in a different
 * fiscal period from the invoice date.
 *
 * This warns a human, it does not correct the app. Marking the invoice paid is right, and
 * "vw_FiscalAccrual" already books it on its "InvoiceDate" — the models come out correct either
 * way. What breaks is the person: they file from bank movements ("cobré en abril, luego va en el
 * 2T") while the law settles on the fecha de devengo. That reasoning is what forced the
 * rectificativa of the 2T 2026 Modelo 303 (see docs/FISCAL_DOMAIN.md § Devengo vs. caja), so the
 * note states the declaring quarter at the exact moment the wrong mental model is formed.
 *
 * It never blocks, confirms or asks for acknowledgement: nothing here is an error to fix.
 */

import { AlertTriangle, ArrowRight, Info } from 'lucide-react';
import { useTranslate } from '@/hooks/useTranslations';
import type { FiscalPeriod } from '@/types/finance';
import { getFiscalPeriod, isSameFiscalPeriod } from '@/utils/fiscal';
import { cn } from '@/utils/helpers';

interface AccrualPeriodNoteProps {
  /** Fecha de devengo — the date the invoice is declared on, whatever day the money arrives */
  invoiceDate: string;
  /** The day the payment transaction will be booked with */
  collectionDate: Date | string;
  className?: string;
}

export function AccrualPeriodNote({ invoiceDate, collectionDate, className }: AccrualPeriodNoteProps) {
  const { t } = useTranslate();

  const invoicePeriod = getFiscalPeriod(invoiceDate);
  const collectionPeriod = getFiscalPeriod(collectionDate);

  // Nothing to say when both dates settle in the same quarter — the bank and the models agree.
  // An unreadable date gets no note either: a guess about a fiscal period is worse than silence.
  if (!invoicePeriod || !collectionPeriod || isSameFiscalPeriod(invoicePeriod, collectionPeriod)) return null;

  // Crossing a year is the heavier case: the two periods belong to two different Rentas, so the
  // note is raised from informational to a warning tone and spells both periods out.
  const crossesFiscalYear = invoicePeriod.year !== collectionPeriod.year;
  const Icon = crossesFiscalYear ? AlertTriangle : Info;

  const quarterLabel = (period: FiscalPeriod) =>
    t('fiscal.cross-quarter.quarter-label', { quarter: period.quarter, year: period.year });

  return (
    <div
      role="note"
      className={cn(
        'flex gap-2.5 rounded-[var(--radius)] border p-3',
        crossesFiscalYear ? 'border-guard-warning/30 bg-guard-warning/5' : 'border-border bg-muted/40',
        className,
      )}
    >
      <Icon
        className={cn('h-4 w-4 shrink-0 mt-0.5', crossesFiscalYear ? 'text-guard-warning' : 'text-guard-muted')}
        aria-hidden="true"
      />
      <div className="min-w-0 space-y-2">
        <p className="text-xs leading-relaxed text-foreground/90">
          {t('fiscal.cross-quarter.pay-warning', {
            invoiceQuarter: invoicePeriod.quarter,
            invoiceYear: invoicePeriod.year,
          })}
        </p>
        {/* The two periods side by side, so a year jump is legible at a glance and not just
            inferable from the sentence above. Labelled by the same column headings the fiscal
            table uses, which keeps the vocabulary consistent across both screens. */}
        {crossesFiscalYear && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-guard-muted">
            <span>
              {t('fiscal.cross-quarter.columns.issue-date')}:{' '}
              <span className="font-medium text-foreground">{quarterLabel(invoicePeriod)}</span>
            </span>
            <ArrowRight className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>
              {t('fiscal.cross-quarter.columns.collection-date')}:{' '}
              <span className="font-medium text-foreground">{quarterLabel(collectionPeriod)}</span>
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
