'use client';

/**
 * Confirmation for cancelling an AEAT deferral — and it is a confirmation, not a warning.
 *
 * WHY NOT ConfirmDialog. That component takes `message: string` and renders it as one paragraph,
 * which is right for "stop the sync?" and wrong here: what the user has to approve is a LIST — which
 * instalments stop being owed, which ones stay because they were really paid, and what each half is
 * worth. Flattening two tables into a sentence would be asking for a decision while hiding its
 * subject. Everything else is borrowed from it deliberately — ModalBackdrop, the icon plate, the
 * ghost/solid button pair, the spinner inside the confirm button — so this reads as the same dialog
 * with a richer body, not as a second dialect.
 *
 * BOTH HALVES, ALWAYS, EVEN EMPTY. A deferral is cut in the middle of its calendar. "Se conserva lo
 * ya pagado" with nothing under it is information, not noise: it tells the user nothing has been
 * paid yet, which is exactly what makes the decision easy. The empty lines are their own copy.
 *
 * A fracción whose recargo was already paid by hand appears in BOTH halves, each carrying only its
 * own amounts — the three parts are three independent movements and the preview folds each subset
 * separately. Showing it whole on either side would overstate the figure being approved.
 *
 * The preview is read when the dialog opens, never from the page's cache, and it is a snapshot and
 * not a lock: an instalment marked paid while this is on screen is simply not cancelled, because the
 * write matches only rows still pending. The result reports what actually happened, not what was
 * previewed, which is why the success state is rendered from the response and not from the preview.
 *
 * The confirm button is NOT danger-red. Nothing is destroyed: the pending movements take
 * TRANSACTION_STATUS.CANCELLED, which every summary and every fiscal view already filters out, and
 * they stay in the history with that status. Red would promise a deletion that does not happen.
 */

import { AlertTriangle, CalendarClock, CheckCircle2, X } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ModalBackdrop } from '@/components/ui/ModalBackdrop';
import { useCancelDeferral, useDeferralCancellationPreview } from '@/hooks/useDeferrals';
import { useTranslate } from '@/hooks/useTranslations';
import type { DeferralCancellationResult, DeferralFraccionMovements, DeferralTotals } from '@/types/finance';
import { cn, formatDate } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

interface DeferralCancelDialogProps {
  deferralId: number;
  expedienteNumber: string;
  onClose: () => void;
}

const DIALOG_TITLE_ID = 'deferral-cancel-title';

const CONFIRM_BUTTON = cn(
  'px-4 py-2 rounded-lg font-medium text-white transition-all duration-200 ease-out-quart',
  'bg-guard-primary hover:bg-guard-primary/90',
  'active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed',
);

/**
 * One half of the split: the fracciones and what they are worth.
 *
 * `tone` is the only difference between the two, and it is not a severity: amber marks what stops
 * being owed, neutral marks what stays booked. Each half prints its own heading either way, so the
 * colour is never the thing carrying the meaning.
 */
function FraccionGroup({
  fracciones,
  totals,
  title,
  countLabel,
  hint,
  emptyLabel,
  totalsLabel,
  tone,
}: {
  fracciones: DeferralFraccionMovements[];
  totals: DeferralTotals;
  title: string;
  countLabel: string;
  hint: string;
  emptyLabel: string;
  totalsLabel: string;
  tone: 'cancel' | 'keep';
}) {
  const { t, locale } = useTranslate();
  const isEmpty = fracciones.length === 0;

  return (
    <section
      className={cn(
        'rounded-lg border px-3 py-3 space-y-2',
        tone === 'cancel' ? 'border-guard-warning/30 bg-guard-warning/5' : 'border-border bg-muted/20',
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3
          className={cn(
            'text-xs font-semibold uppercase tracking-wider',
            tone === 'cancel' ? 'text-guard-warning' : 'text-guard-muted',
          )}
        >
          {title}
        </h3>
        {!isEmpty && <span className="text-xs tabular-nums text-guard-muted">{countLabel}</span>}
      </div>

      {isEmpty ? (
        <p className="text-xs text-guard-muted">{emptyLabel}</p>
      ) : (
        <>
          <ul className="divide-y divide-border/50">
            {fracciones.map((fraccion) => (
              <li key={fraccion.fraccionNumber} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                <span className="min-w-0 truncate text-foreground/80">
                  {t('fiscal.deferrals.cancel.fraccion-label', {
                    number: fraccion.fraccionNumber,
                    date: formatDate(fraccion.dueDate, 'short', locale),
                  })}
                </span>
                <span className="flex shrink-0 items-baseline gap-3">
                  <span className="text-xs text-guard-muted">
                    {t('fiscal.deferrals.cancel.movements-count', { count: fraccion.movementIds.length })}
                  </span>
                  <span className="font-medium tabular-nums text-foreground">
                    {formatCurrency(fraccion.totals.totalCents)}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2 text-sm">
            <span className="font-medium text-foreground">{totalsLabel}</span>
            <span
              className={cn('font-semibold tabular-nums', tone === 'cancel' ? 'text-guard-warning' : 'text-foreground')}
            >
              {formatCurrency(totals.totalCents)}
            </span>
          </div>

          <p className="text-xs text-guard-muted">{hint}</p>
        </>
      )}
    </section>
  );
}

/** What actually happened, read from the response rather than from the preview it was decided on. */
function CancellationSummary({ result }: { result: DeferralCancellationResult }) {
  const { t } = useTranslate();

  const values = {
    movements: result.cancelledMovementCount,
    fracciones: result.cancelledFraccionNumbers.length,
    total: formatCurrency(result.cancelledTotals.totalCents),
    kept: result.keptMovementCount,
  };

  return (
    <div className="flex items-start gap-2 rounded-lg border border-guard-success/20 bg-guard-success/10 px-3 py-2.5">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-guard-success" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-guard-success">{t('fiscal.deferrals.cancel.success.title')}</p>
        <p className="text-sm text-foreground/80">
          {result.keptMovementCount === 0
            ? t('fiscal.deferrals.cancel.success.description-nothing-kept', values)
            : t('fiscal.deferrals.cancel.success.description', values)}
        </p>
      </div>
    </div>
  );
}

export function DeferralCancelDialog({ deferralId, expedienteNumber, onClose }: DeferralCancelDialogProps) {
  const { t } = useTranslate();
  const { data: preview, isLoading, error } = useDeferralCancellationPreview(deferralId);
  const cancelMutation = useCancelDeferral();

  const result = cancelMutation.data ?? null;
  // Nothing pending means nothing to cancel — the endpoint answers 409, so the button must not offer it
  const hasSomethingToCancel = (preview?.toCancel.length ?? 0) > 0;

  return (
    <ModalBackdrop onClose={onClose} labelledBy={DIALOG_TITLE_ID}>
      <div className="card w-full max-w-2xl animate-modal-in">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-guard-warning/10 p-2 text-guard-warning">
              <CalendarClock className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 id={DIALOG_TITLE_ID} className="text-lg font-bold text-foreground">
              {t('fiscal.deferrals.cancel.title', { expediente: expedienteNumber })}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={cancelMutation.isPending}
            className="rounded-lg p-2 text-guard-muted transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            aria-label={t('common.buttons.close')}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-10">
            <LoadingSpinner size="md" label={t('common.loading')} />
          </div>
        )}

        {/* The thrown message is an i18n key, so a resolution that no longer exists says exactly
            that instead of the generic "could not work out what would be cancelled" */}
        {error && (
          <p role="alert" className="py-4 text-sm text-guard-danger">
            {t(error.message)}
          </p>
        )}

        {preview && (
          <div className="space-y-3">
            {/* Once it has run, the two halves come down. They describe a decision that is no longer
                pending, and leaving them under a success message would read as "these are still
                about to be cancelled". What happened is the summary, and it comes from the write. */}
            {result ? (
              <CancellationSummary result={result} />
            ) : (
              <>
                <p className="text-sm text-guard-muted">{t('fiscal.deferrals.cancel.description')}</p>

                <FraccionGroup
                  fracciones={preview.toCancel}
                  totals={preview.toCancelTotals}
                  title={t('fiscal.deferrals.cancel.to-cancel-title')}
                  countLabel={t('fiscal.deferrals.cancel.to-cancel-count', { count: preview.toCancel.length })}
                  hint={t('fiscal.deferrals.cancel.to-cancel-hint')}
                  emptyLabel={t('fiscal.deferrals.cancel.to-cancel-empty')}
                  totalsLabel={t('fiscal.deferrals.cancel.totals-to-cancel')}
                  tone="cancel"
                />

                <FraccionGroup
                  fracciones={preview.toKeep}
                  totals={preview.toKeepTotals}
                  title={t('fiscal.deferrals.cancel.to-keep-title')}
                  countLabel={t('fiscal.deferrals.cancel.to-keep-count', { count: preview.toKeep.length })}
                  hint={t('fiscal.deferrals.cancel.to-keep-hint')}
                  emptyLabel={t('fiscal.deferrals.cancel.to-keep-empty')}
                  totalsLabel={t('fiscal.deferrals.cancel.totals-to-keep')}
                  tone="keep"
                />
              </>
            )}

            {/* The two things the screen cannot show: what happens to the cancelled rows, and what
                does NOT happen at the AEAT. Both stay visible after the write, because that is when
                the second one starts mattering. */}
            <p className="text-xs text-guard-muted">{t('fiscal.deferrals.cancel.history-note')}</p>
            <div className="flex items-start gap-2 rounded-lg border border-guard-warning/20 bg-guard-warning/10 px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-guard-warning" aria-hidden="true" />
              <p className="text-sm text-guard-warning">{t('fiscal.deferrals.cancel.aeat-note')}</p>
            </div>

            {cancelMutation.errorMessage && (
              <p role="alert" className="text-sm text-guard-danger">
                {cancelMutation.errorMessage}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={onClose} disabled={cancelMutation.isPending} className="btn-ghost">
                {result ? t('fiscal.deferrals.cancel.success.close') : t('fiscal.deferrals.cancel.back')}
              </button>

              {/* Gone once it has run: a second press would be a 409, and offering it invites one */}
              {!result && (
                <button
                  type="button"
                  onClick={() => cancelMutation.mutate(deferralId)}
                  disabled={cancelMutation.isPending || !hasSomethingToCancel}
                  className={CONFIRM_BUTTON}
                >
                  {cancelMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <LoadingSpinner size="sm" className="border-white/30 border-t-white" />
                      {t('fiscal.deferrals.cancel.cancelling')}
                    </span>
                  ) : (
                    t('fiscal.deferrals.cancel.confirm')
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </ModalBackdrop>
  );
}
