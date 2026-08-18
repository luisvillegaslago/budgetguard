'use client';

/**
 * The AEAT deferral resolutions stored for a year, and the one action they need.
 *
 * Until now a letter could be imported but never seen again: the wizard read it, booked its
 * instalments as pending movements and that was the last the app said about it. So the instalments
 * of a deferral that was paid off early or revoked would sit in Movimientos for ever, dragging a
 * debt that no longer exists — and there was nowhere to say so. This list is that "somewhere", and
 * cancelling is deliberately the only thing it offers.
 *
 * IT DOES NOT SHOW A STATUS PER ROW, and that is a decision rather than an omission. DEFERRAL_STATUS
 * is derived from the fracción movements and never stored, so a badge here would cost one query per
 * resolution to render a word. The status is computed once, inside the confirmation, next to the
 * fracciones it was derived from — where it can be checked instead of trusted.
 *
 * The three parts keep the colour language of DeferralFraccionesTable, and the word beside each
 * figure keeps carrying the meaning: only the intereses are deductible, and the row says so with
 * the same labels the import used.
 */

import { Ban, CalendarClock } from 'lucide-react';
import { useState } from 'react';
import { DeferralCancelDialog } from '@/components/fiscal/DeferralCancelDialog';
import { DEFERRAL_PART_STYLE } from '@/components/fiscal/deferralPartStyles';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { DEFERRAL_PART } from '@/constants/finance';
import { useDeferrals } from '@/hooks/useDeferrals';
import { useTranslate } from '@/hooks/useTranslations';
import type { Deferral } from '@/types/finance';
import { cn } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

interface DeferralListProps {
  year: number;
}

/** The resolution being cancelled — its expediente travels so the dialog can name it before loading. */
interface CancelTarget {
  deferralId: number;
  expedienteNumber: string;
}

function DeferralRow({ deferral, onCancel }: { deferral: Deferral; onCancel: (target: CancelTarget) => void }) {
  const { t } = useTranslate();

  const totalCents = deferral.principalCents + deferral.surchargeCents + deferral.interestCents;

  const period =
    deferral.fiscalQuarter === null
      ? t('fiscal.deferrals.list.modelo-annual', { modelo: deferral.modeloType, year: deferral.fiscalYear })
      : t('fiscal.deferrals.list.modelo-quarter', {
          modelo: deferral.modeloType,
          quarter: deferral.fiscalQuarter,
          year: deferral.fiscalYear,
        });

  return (
    <li className="space-y-2 rounded-lg border border-border bg-card px-3 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="min-w-0">
          <span className="font-medium text-foreground">{deferral.expedienteNumber}</span>
          <span className="ml-2 text-sm text-guard-muted">{period}</span>
        </span>
        <span className="shrink-0 font-semibold tabular-nums text-foreground">{formatCurrency(totalCents)}</span>
      </div>

      {/* Same three columns, same colours and same words as the ANEXO I table of the import */}
      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <div className="inline-flex items-baseline gap-1.5">
          <dt className="text-guard-muted">{t('fiscal.deferrals.columns.principal')}</dt>
          <dd className={cn('tabular-nums font-medium', DEFERRAL_PART_STYLE[DEFERRAL_PART.PRINCIPAL].text)}>
            {formatCurrency(deferral.principalCents)}
          </dd>
        </div>
        <div className="inline-flex items-baseline gap-1.5">
          <dt className="text-guard-muted">{t('fiscal.deferrals.columns.surcharge')}</dt>
          <dd className={cn('tabular-nums font-medium', DEFERRAL_PART_STYLE[DEFERRAL_PART.SURCHARGE].text)}>
            {formatCurrency(deferral.surchargeCents)}
          </dd>
        </div>
        <div className="inline-flex items-baseline gap-1.5">
          <dt className="text-guard-muted">{t('fiscal.deferrals.columns.interest')}</dt>
          <dd className={cn('tabular-nums font-medium', DEFERRAL_PART_STYLE[DEFERRAL_PART.INTEREST].text)}>
            {formatCurrency(deferral.interestCents)}
          </dd>
        </div>
        <div className="inline-flex items-baseline gap-1.5">
          <dt className="text-guard-muted">{t('fiscal.deferrals.fields.interest-rate')}</dt>
          <dd className="tabular-nums text-foreground/80">{deferral.interestRatePercent} %</dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={() => onCancel({ deferralId: deferral.deferralId, expedienteNumber: deferral.expedienteNumber })}
        title={t('fiscal.deferrals.cancel.action-hint')}
        className={cn(
          'inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium',
          'text-foreground transition-all duration-200 ease-out-quart hover:bg-muted active:scale-[0.98]',
        )}
      >
        <Ban className="h-3.5 w-3.5 shrink-0 text-guard-muted" aria-hidden="true" />
        {t('fiscal.deferrals.cancel.action')}
      </button>
    </li>
  );
}

export function DeferralList({ year }: DeferralListProps) {
  const { t } = useTranslate();
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);
  const { data: deferrals, isLoading, isError } = useDeferrals({ year });

  return (
    <div className="card">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-5 w-5 shrink-0 text-guard-primary" aria-hidden="true" />
        <h3 className="text-lg font-bold text-foreground">{t('fiscal.deferrals.title')}</h3>
      </div>
      <p className="mt-1 text-xs text-guard-muted">{t('fiscal.deferrals.subtitle')}</p>

      {isLoading && (
        <div className="flex items-center justify-center py-10">
          <LoadingSpinner size="md" label={t('common.loading')} />
        </div>
      )}

      {isError && <p className="py-4 text-sm text-guard-danger">{t('api-error.load.deferrals')}</p>}

      {deferrals && deferrals.length === 0 && (
        <div className="py-6 text-center">
          <p className="text-sm text-guard-muted">{t('fiscal.deferrals.empty')}</p>
          <p className="mt-1 text-xs text-guard-muted">{t('fiscal.deferrals.empty-hint')}</p>
        </div>
      )}

      {deferrals && deferrals.length > 0 && (
        <ul className="mt-4 space-y-2">
          {deferrals.map((deferral) => (
            <DeferralRow key={deferral.deferralId} deferral={deferral} onCancel={setCancelTarget} />
          ))}
        </ul>
      )}

      {/* Keyed by resolution so reopening on a different one never shows the previous preview */}
      {cancelTarget && (
        <DeferralCancelDialog
          key={cancelTarget.deferralId}
          deferralId={cancelTarget.deferralId}
          expedienteNumber={cancelTarget.expedienteNumber}
          onClose={() => setCancelTarget(null)}
        />
      )}
    </div>
  );
}
