'use client';

/**
 * BudgetGuard Trip Create Form
 * Modal form for creating a new trip with name and date range
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ModalBackdrop } from '@/components/ui/ModalBackdrop';
import { useTranslate } from '@/hooks/useTranslations';
import { useCreateTrip } from '@/hooks/useTrips';
import { type CreateTripInput, CreateTripSchema } from '@/schemas/trip';
import { cn } from '@/utils/helpers';

interface TripCreateFormProps {
  onClose: () => void;
  onCreated: (tripId: number) => void;
}

export function TripCreateForm({ onClose, onCreated }: TripCreateFormProps) {
  const { t } = useTranslate();
  const createTrip = useCreateTrip();
  const formRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateTripInput>({
    resolver: zodResolver(CreateTripSchema),
  });

  const startDate = useWatch({ control, name: 'startDate' });

  useEffect(() => {
    if (startDate) {
      setValue('endDate', startDate);
    }
  }, [startDate, setValue]);

  const onSubmit = async (data: CreateTripInput) => {
    try {
      const trip = await createTrip.mutateAsync(data);
      onCreated(trip.tripId);
    } catch (_error) {
      // Error handled by mutation state
    }
  };

  useEffect(() => {
    const firstInput = formRef.current?.querySelector<HTMLElement>('input');
    firstInput?.focus();
  }, []);

  return (
    <ModalBackdrop onClose={onClose} labelledBy="trip-create-title">
      <div ref={formRef} className="card w-full max-w-sm animate-modal-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 id="trip-create-title" className="text-xl font-bold text-foreground">
            {t('trips.create-form.title')}
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
            <label htmlFor="trip-name" className="block text-sm font-medium text-foreground mb-1.5">
              {t('trips.create-form.fields.name')}
            </label>
            <input
              id="trip-name"
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
                {errors.name.message}
              </p>
            )}
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="trip-start-date" className="block text-sm font-medium text-foreground mb-1.5">
                {t('trips.create-form.fields.start-date')}
              </label>
              <input
                id="trip-start-date"
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
                  {errors.startDate.message}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="trip-end-date" className="block text-sm font-medium text-foreground mb-1.5">
                {t('trips.create-form.fields.end-date')}
              </label>
              <input
                id="trip-end-date"
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
                  {errors.endDate.message}
                </p>
              )}
            </div>
          </div>

          {/* Error Message */}
          {createTrip.isError && (
            <div role="alert" className="p-3 rounded-lg bg-guard-danger/10 border border-guard-danger/20">
              <p className="text-sm text-guard-danger">{t('trips.errors.create')}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || createTrip.isPending}
            className={cn(
              'w-full py-3 rounded-lg font-semibold text-white transition-all duration-200 ease-out-quart',
              'disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
              'bg-guard-primary hover:bg-guard-primary/90',
            )}
          >
            {isSubmitting || createTrip.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <LoadingSpinner size="sm" className="border-white/30 border-t-white" />
                {t('trips.create-form.saving')}
              </span>
            ) : (
              t('trips.create-form.submit')
            )}
          </button>
        </form>
      </div>
    </ModalBackdrop>
  );
}
