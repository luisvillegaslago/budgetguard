'use client';

/**
 * BudgetGuard Trip Edit Form
 * Modal form for editing an existing trip's name and date range
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { type DefaultValues, useForm, useWatch } from 'react-hook-form';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ModalBackdrop } from '@/components/ui/ModalBackdrop';
import { useToast } from '@/components/ui/Toast';
import { useTranslate } from '@/hooks/useTranslations';
import { useUpdateTrip } from '@/hooks/useTrips';
import { type UpdateTripInput, UpdateTripSchema } from '@/schemas/trip';
import type { Trip } from '@/types/finance';
import { cn } from '@/utils/helpers';

interface TripEditFormProps {
  trip: Trip;
  onClose: () => void;
}

export function TripEditForm({ trip, onClose }: TripEditFormProps) {
  const { t } = useTranslate();
  const toast = useToast();
  const updateTrip = useUpdateTrip();
  const formRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<UpdateTripInput>({
    resolver: zodResolver(UpdateTripSchema),
    // Date inputs hold strings; the schema coerces them to Date on submit
    defaultValues: {
      name: trip.name,
      startDate: trip.startDate ?? '',
      endDate: trip.endDate ?? '',
    } as unknown as DefaultValues<UpdateTripInput>,
  });

  const startDate = useWatch({ control, name: 'startDate' });

  const onSubmit = async (data: UpdateTripInput) => {
    try {
      await updateTrip.mutateAsync({ tripId: trip.tripId, data });
      toast.success(t('trips.toast.updated'));
      onClose();
    } catch (_error) {
      // Error surfaced via updateTrip.errorMessage in the alert block
    }
  };

  useEffect(() => {
    const firstInput = formRef.current?.querySelector<HTMLElement>('input');
    firstInput?.focus();
  }, []);

  return (
    <ModalBackdrop onClose={onClose} labelledBy="trip-edit-title">
      <div ref={formRef} className="card w-full max-w-sm animate-modal-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 id="trip-edit-title" className="text-xl font-bold text-foreground">
            {t('trips.edit-form.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-guard-muted hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            aria-label={t('common.buttons.close')}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Name Input */}
          <div>
            <label htmlFor="trip-edit-name" className="block text-sm font-medium text-foreground mb-1.5">
              {t('trips.create-form.fields.name')}
            </label>
            <input
              id="trip-edit-name"
              type="text"
              autoComplete="off"
              placeholder={t('trips.create-form.fields.name-placeholder')}
              {...register('name')}
              className={cn(
                'w-full px-4 py-2.5 rounded-lg border bg-background text-foreground',
                'focus:ring-2 focus:ring-guard-primary focus:border-transparent',
                'transition-colors duration-200 ease-out-quart',
                errors.name ? 'border-guard-danger' : 'border-input',
              )}
            />
            {errors.name && (
              <p role="alert" className="mt-1 text-sm text-guard-danger">
                {t(errors.name.message ?? '')}
              </p>
            )}
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="trip-edit-start-date" className="block text-sm font-medium text-foreground mb-1.5">
                {t('trips.create-form.fields.start-date')}
              </label>
              <input
                id="trip-edit-start-date"
                type="date"
                {...register('startDate')}
                className={cn(
                  'w-full px-4 py-2.5 rounded-lg border bg-background text-foreground',
                  'focus:ring-2 focus:ring-guard-primary focus:border-transparent',
                  'transition-colors duration-200 ease-out-quart',
                  errors.startDate ? 'border-guard-danger' : 'border-input',
                )}
              />
              {errors.startDate && (
                <p role="alert" className="mt-1 text-sm text-guard-danger">
                  {t(errors.startDate.message ?? '')}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="trip-edit-end-date" className="block text-sm font-medium text-foreground mb-1.5">
                {t('trips.create-form.fields.end-date')}
              </label>
              <input
                id="trip-edit-end-date"
                type="date"
                min={startDate ? String(startDate) : undefined}
                {...register('endDate')}
                className={cn(
                  'w-full px-4 py-2.5 rounded-lg border bg-background text-foreground',
                  'focus:ring-2 focus:ring-guard-primary focus:border-transparent',
                  'transition-colors duration-200 ease-out-quart',
                  errors.endDate ? 'border-guard-danger' : 'border-input',
                )}
              />
              {errors.endDate && (
                <p role="alert" className="mt-1 text-sm text-guard-danger">
                  {t(errors.endDate.message ?? '')}
                </p>
              )}
            </div>
          </div>

          {/* Error Message — surfaces the specific translated cause (conflict, validation) */}
          {updateTrip.isError && (
            <div role="alert" className="p-3 rounded-lg bg-guard-danger/10 border border-guard-danger/20">
              <p className="text-sm text-guard-danger">{updateTrip.errorMessage ?? t('trips.errors.update')}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || updateTrip.isPending}
            className={cn(
              'w-full py-3 rounded-lg font-semibold text-white transition-all duration-200 ease-out-quart',
              'disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
              'bg-guard-primary hover:bg-guard-primary/90',
            )}
          >
            {isSubmitting || updateTrip.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <LoadingSpinner size="sm" className="border-white/30 border-t-white" />
                {t('trips.edit-form.saving')}
              </span>
            ) : (
              t('trips.edit-form.submit')
            )}
          </button>
        </form>
      </div>
    </ModalBackdrop>
  );
}
