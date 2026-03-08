'use client';

/**
 * Modal form for creating/editing a skydive jump
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ModalBackdrop } from '@/components/ui/ModalBackdrop';
import { useCreateJump, useUpdateJump } from '@/hooks/useSkydiveJumps';
import { useTranslate } from '@/hooks/useTranslations';
import type { CreateJumpInput } from '@/schemas/skydive';
import { CreateJumpSchema } from '@/schemas/skydive';
import type { SkydiveJump } from '@/types/skydive';
import { cn, toDateString } from '@/utils/helpers';

interface JumpFormProps {
  jump?: SkydiveJump | null;
  nextJumpNumber?: number;
  onClose: () => void;
}

const inputClass = (hasError: boolean) =>
  cn(
    'w-full px-4 py-2.5 rounded-lg border bg-background text-foreground',
    'focus:ring-2 focus:ring-guard-primary focus:border-transparent',
    'transition-colors duration-200 ease-out-quart',
    hasError ? 'border-guard-danger' : 'border-input',
  );

export function JumpForm({ jump, nextJumpNumber, onClose }: JumpFormProps) {
  const { t } = useTranslate();
  const createJump = useCreateJump();
  const updateJump = useUpdateJump();
  const isEditing = !!jump;
  const mutation = isEditing ? updateJump : createJump;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateJumpInput>({
    resolver: zodResolver(CreateJumpSchema),
    defaultValues: jump
      ? {
          jumpNumber: jump.jumpNumber,
          title: jump.title,
          jumpDate: toDateString(new Date(jump.jumpDate)) as unknown as Date,
          dropzone: jump.dropzone,
          canopy: jump.canopy,
          wingsuit: jump.wingsuit,
          freefallTimeSec: jump.freefallTimeSec,
          jumpType: jump.jumpType,
          aircraft: jump.aircraft,
          exitAltitudeFt: jump.exitAltitudeFt,
          landingDistanceM: jump.landingDistanceM,
          comment: jump.comment,
          priceCents: jump.priceCents,
        }
      : {
          jumpNumber: nextJumpNumber,
          jumpDate: toDateString(new Date()) as unknown as Date,
        },
  });

  const onSubmit = async (data: CreateJumpInput) => {
    try {
      if (isEditing && jump) {
        await updateJump.mutateAsync({ jumpId: jump.jumpId, data });
      } else {
        await createJump.mutateAsync(data);
      }
      onClose();
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <ModalBackdrop onClose={onClose} labelledBy="jump-form-title">
      <div className="card w-full max-w-lg animate-modal-in max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 id="jump-form-title" className="text-xl font-bold text-foreground">
            {isEditing ? t('skydiving.jumps.form.title-edit') : t('skydiving.jumps.form.title-create')}
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
          {/* Jump Number + Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="jumpNumber" className="block text-sm font-medium text-foreground mb-1.5">
                {t('skydiving.jumps.form.fields.jump-number')}
              </label>
              <input
                id="jumpNumber"
                type="number"
                {...register('jumpNumber', { valueAsNumber: true })}
                onWheel={(e) => e.currentTarget.blur()}
                className={inputClass(!!errors.jumpNumber)}
              />
              {errors.jumpNumber && (
                <p role="alert" className="mt-1 text-sm text-guard-danger">
                  {errors.jumpNumber.message}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="jumpDate" className="block text-sm font-medium text-foreground mb-1.5">
                {t('skydiving.jumps.form.fields.date')}
              </label>
              <input id="jumpDate" type="date" {...register('jumpDate')} className={inputClass(!!errors.jumpDate)} />
              {errors.jumpDate && (
                <p role="alert" className="mt-1 text-sm text-guard-danger">
                  {errors.jumpDate.message}
                </p>
              )}
            </div>
          </div>

          {/* Dropzone + Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="dropzone" className="block text-sm font-medium text-foreground mb-1.5">
                {t('skydiving.jumps.form.fields.dropzone')}
              </label>
              <input
                id="dropzone"
                type="text"
                {...register('dropzone')}
                placeholder={t('skydiving.jumps.form.fields.dropzone-placeholder')}
                className={inputClass(false)}
              />
            </div>
            <div>
              <label htmlFor="jumpType" className="block text-sm font-medium text-foreground mb-1.5">
                {t('skydiving.jumps.form.fields.jump-type')}
              </label>
              <input
                id="jumpType"
                type="text"
                {...register('jumpType')}
                placeholder={t('skydiving.jumps.form.fields.type-placeholder')}
                className={inputClass(false)}
              />
            </div>
          </div>

          {/* Freefall + Altitude */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="freefallTimeSec" className="block text-sm font-medium text-foreground mb-1.5">
                {t('skydiving.jumps.form.fields.freefall-time')}
              </label>
              <input
                id="freefallTimeSec"
                type="number"
                {...register('freefallTimeSec', { valueAsNumber: true })}
                onWheel={(e) => e.currentTarget.blur()}
                className={inputClass(false)}
              />
            </div>
            <div>
              <label htmlFor="exitAltitudeFt" className="block text-sm font-medium text-foreground mb-1.5">
                {t('skydiving.jumps.form.fields.altitude')}
              </label>
              <input
                id="exitAltitudeFt"
                type="number"
                {...register('exitAltitudeFt', { valueAsNumber: true })}
                onWheel={(e) => e.currentTarget.blur()}
                className={inputClass(false)}
              />
            </div>
          </div>

          {/* Aircraft + Canopy */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="aircraft" className="block text-sm font-medium text-foreground mb-1.5">
                {t('skydiving.jumps.form.fields.aircraft')}
              </label>
              <input
                id="aircraft"
                type="text"
                {...register('aircraft')}
                placeholder={t('skydiving.jumps.form.fields.aircraft-placeholder')}
                className={inputClass(false)}
              />
            </div>
            <div>
              <label htmlFor="canopy" className="block text-sm font-medium text-foreground mb-1.5">
                {t('skydiving.jumps.form.fields.canopy')}
              </label>
              <input
                id="canopy"
                type="text"
                {...register('canopy')}
                placeholder={t('skydiving.jumps.form.fields.canopy-placeholder')}
                className={inputClass(false)}
              />
            </div>
          </div>

          {/* Comment */}
          <div>
            <label htmlFor="comment" className="block text-sm font-medium text-foreground mb-1.5">
              {t('skydiving.jumps.form.fields.comment')}
            </label>
            <textarea id="comment" {...register('comment')} rows={2} className={cn(inputClass(false), 'resize-none')} />
          </div>

          {/* Error Message */}
          {mutation.isError && (
            <div role="alert" className="p-3 rounded-lg bg-guard-danger/10 border border-guard-danger/20">
              <p className="text-sm text-guard-danger">
                {isEditing ? t('skydiving.jumps.form.errors.update') : t('skydiving.jumps.form.errors.create')}
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
                {t('skydiving.jumps.form.saving')}
              </span>
            ) : isEditing ? (
              t('skydiving.jumps.form.submit-edit')
            ) : (
              t('skydiving.jumps.form.submit-create')
            )}
          </button>
        </form>
      </div>
    </ModalBackdrop>
  );
}
