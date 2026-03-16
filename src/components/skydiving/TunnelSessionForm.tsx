'use client';

/**
 * Modal form for creating/editing a tunnel session
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ModalBackdrop } from '@/components/ui/ModalBackdrop';
import { useTranslate } from '@/hooks/useTranslations';
import { useCreateTunnelSession, useUpdateTunnelSession } from '@/hooks/useTunnelSessions';
import type { CreateTunnelSessionInput } from '@/schemas/skydive';
import { CreateTunnelSessionSchema } from '@/schemas/skydive';
import type { TunnelSession } from '@/types/skydive';
import { cn, toDateString } from '@/utils/helpers';
import { centsToEuros } from '@/utils/money';

interface TunnelSessionFormProps {
  session?: TunnelSession | null;
  onClose: () => void;
}

const inputClass = (hasError: boolean) =>
  cn(
    'w-full px-4 py-2.5 rounded-lg border bg-background text-foreground',
    'focus:ring-2 focus:ring-guard-primary focus:border-transparent',
    'transition-colors duration-200 ease-out-quart',
    hasError ? 'border-guard-danger' : 'border-input',
  );

export function TunnelSessionForm({ session, onClose }: TunnelSessionFormProps) {
  const { t } = useTranslate();
  const createSession = useCreateTunnelSession();
  const updateSession = useUpdateTunnelSession();
  const isEditing = !!session;
  const mutation = isEditing ? updateSession : createSession;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateTunnelSessionInput>({
    resolver: zodResolver(CreateTunnelSessionSchema),
    defaultValues: session
      ? {
          sessionDate: toDateString(new Date(session.sessionDate)) as unknown as Date,
          location: session.location,
          sessionType: session.sessionType,
          durationMin: session.durationSec / 60,
          notes: session.notes,
          price: session.priceCents != null ? centsToEuros(session.priceCents) : null,
        }
      : {
          sessionDate: toDateString(new Date()) as unknown as Date,
        },
  });

  const onSubmit = async (data: CreateTunnelSessionInput) => {
    try {
      if (isEditing && session) {
        await updateSession.mutateAsync({ sessionId: session.sessionId, data });
      } else {
        await createSession.mutateAsync(data);
      }
      onClose();
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <ModalBackdrop onClose={onClose} labelledBy="tunnel-session-form-title">
      <div className="card w-full max-w-md lg:max-w-lg animate-modal-in max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 id="tunnel-session-form-title" className="text-xl font-bold text-foreground">
            {isEditing ? t('skydiving.tunnel.form.title-edit') : t('skydiving.tunnel.form.title-create')}
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
          {/* Date + Duration */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="sessionDate" className="block text-sm font-medium text-foreground mb-1.5">
                {t('skydiving.tunnel.form.fields.date')}
              </label>
              <input
                id="sessionDate"
                type="date"
                {...register('sessionDate')}
                className={inputClass(!!errors.sessionDate)}
              />
              {errors.sessionDate && (
                <p role="alert" className="mt-1 text-sm text-guard-danger">
                  {errors.sessionDate.message}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="durationMin" className="block text-sm font-medium text-foreground mb-1.5">
                {t('skydiving.tunnel.form.fields.duration')}
              </label>
              <input
                id="durationMin"
                type="number"
                step="0.5"
                min="0"
                {...register('durationMin', { valueAsNumber: true })}
                onWheel={(e) => e.currentTarget.blur()}
                className={inputClass(!!errors.durationMin)}
              />
              {errors.durationMin && (
                <p role="alert" className="mt-1 text-sm text-guard-danger">
                  {errors.durationMin.message}
                </p>
              )}
            </div>
          </div>

          {/* Location + Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="location" className="block text-sm font-medium text-foreground mb-1.5">
                {t('skydiving.tunnel.form.fields.location')}
              </label>
              <input
                id="location"
                type="text"
                {...register('location')}
                placeholder={t('skydiving.tunnel.form.fields.location-placeholder')}
                className={inputClass(false)}
              />
            </div>
            <div>
              <label htmlFor="sessionType" className="block text-sm font-medium text-foreground mb-1.5">
                {t('skydiving.tunnel.form.fields.type')}
              </label>
              <input
                id="sessionType"
                type="text"
                {...register('sessionType')}
                placeholder={t('skydiving.tunnel.form.fields.type-placeholder')}
                className={inputClass(false)}
              />
            </div>
          </div>

          {/* Price (euros) */}
          <div>
            <label htmlFor="price" className="block text-sm font-medium text-foreground mb-1.5">
              {t('skydiving.tunnel.form.fields.price')}
            </label>
            <input
              id="price"
              type="number"
              step="0.01"
              min="0"
              {...register('price', { valueAsNumber: true })}
              onWheel={(e) => e.currentTarget.blur()}
              placeholder={t('skydiving.tunnel.form.fields.price-placeholder')}
              className={inputClass(false)}
            />
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-foreground mb-1.5">
              {t('skydiving.tunnel.form.fields.notes')}
            </label>
            <textarea id="notes" {...register('notes')} rows={2} className={cn(inputClass(false), 'resize-none')} />
          </div>

          {/* Error Message */}
          {mutation.isError && (
            <div role="alert" className="p-3 rounded-lg bg-guard-danger/10 border border-guard-danger/20">
              <p className="text-sm text-guard-danger">
                {isEditing ? t('skydiving.tunnel.form.errors.update') : t('skydiving.tunnel.form.errors.create')}
              </p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || mutation.isPending}
            className={cn(
              'w-full py-3 rounded-lg font-semibold text-white transition-all duration-200 ease-out-quart',
              'disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
              'bg-guard-primary hover:bg-guard-primary/90',
            )}
          >
            {isSubmitting || mutation.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <LoadingSpinner size="sm" className="border-white/30 border-t-white" />
                {t('skydiving.tunnel.form.saving')}
              </span>
            ) : isEditing ? (
              t('skydiving.tunnel.form.submit-edit')
            ) : (
              t('skydiving.tunnel.form.submit-create')
            )}
          </button>
        </form>
      </div>
    </ModalBackdrop>
  );
}
