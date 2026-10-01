'use client';

/**
 * BudgetGuard VAT Pool Opening Form
 * Where the user copies, once a year, the casilla 110 that AEAT prefills in the first 303.
 *
 * The app rolls the IVA a compensar pool forward from this figure for the whole year, so it is
 * typed in rather than computed: a refund is paid against AEAT's number, and the year a refund is
 * asked for in the 4T any estimate of the app would be off by the whole balance.
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useFiscalProfile, useUpsertFiscalProfile } from '@/hooks/useFiscalProfile';
import { useTranslate } from '@/hooks/useTranslations';
import { type VatPoolOpeningInput, VatPoolOpeningSchema } from '@/schemas/fiscal';
import { cn } from '@/utils/helpers';
import { centsToEuros, eurosToCents } from '@/utils/money';

const FIELD_ID = 'vatPoolOpening';
const ERROR_ID = `${FIELD_ID}-error`;

const SUBMIT_CLASSES = cn(
  'shrink-0 px-4 py-2 rounded-lg font-semibold text-white',
  'bg-guard-primary hover:bg-guard-primary/90',
  'transition-all duration-200 ease-out-quart active:scale-[0.98]',
  'disabled:opacity-50 disabled:cursor-not-allowed',
);

export function VatPoolOpeningForm({ year }: { year: number }) {
  const { t } = useTranslate();
  const { data: profile } = useFiscalProfile(year);
  const saveMutation = useUpsertFiscalProfile();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<VatPoolOpeningInput>({
    resolver: zodResolver(VatPoolOpeningSchema),
    defaultValues: { vatPoolOpening: 0 },
  });

  // Seed the field once the stored profile lands (and again after a save refetches it)
  useEffect(() => {
    if (profile) reset({ vatPoolOpening: centsToEuros(profile.vatPoolOpeningCents) });
  }, [profile, reset]);

  const onSubmit = ({ vatPoolOpening }: VatPoolOpeningInput) =>
    saveMutation.mutate({ fiscalYear: year, vatPoolOpeningCents: eurosToCents(vatPoolOpening) });

  const errorKey = errors.vatPoolOpening?.message;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-4 pt-4 border-t border-border space-y-3">
      <div className="space-y-1">
        <h4 className="text-sm font-semibold text-foreground">{t('fiscal.modelo303.opening.title', { year })}</h4>
        <p className="text-xs text-guard-muted">{t('fiscal.modelo303.opening.when')}</p>
        <p className="text-xs text-guard-muted">{t('fiscal.modelo303.opening.why')}</p>
        <p className="text-xs text-guard-muted">{t('fiscal.modelo303.opening.refund')}</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={FIELD_ID} className="block text-sm font-medium text-foreground">
          {t('fiscal.modelo303.opening.label')}
        </label>
        <div className="flex items-center gap-3">
          <input
            id={FIELD_ID}
            type="number"
            step="0.01"
            min="0"
            {...register('vatPoolOpening', { valueAsNumber: true })}
            onWheel={(e) => e.currentTarget.blur()}
            aria-invalid={!!errorKey}
            aria-describedby={errorKey ? ERROR_ID : undefined}
            className={cn(
              'w-full px-4 py-2 rounded-lg border bg-background text-foreground tabular-nums',
              'transition-colors duration-200 ease-out-quart',
              errorKey ? 'border-guard-danger' : 'border-input',
            )}
          />
          <button type="submit" disabled={saveMutation.isPending} className={SUBMIT_CLASSES}>
            {saveMutation.isPending ? t('common.loading') : t('fiscal.modelo303.opening.save')}
          </button>
        </div>
        {errorKey && (
          <p id={ERROR_ID} role="alert" className="text-sm text-guard-danger">
            {t(errorKey)}
          </p>
        )}
      </div>

      {saveMutation.isSuccess && !isDirty && (
        <output className="block text-sm text-guard-success animate-fade-in">
          {t('fiscal.modelo303.opening.saved')}
        </output>
      )}
      {saveMutation.errorMessage && (
        <p role="alert" className="text-sm text-guard-danger">
          {saveMutation.errorMessage}
        </p>
      )}
    </form>
  );
}
