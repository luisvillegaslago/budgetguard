'use client';

/**
 * BudgetGuard Category Form Modal
 * Modal for creating and editing categories with icon/color pickers
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { Users, X } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { ColorPicker } from '@/components/categories/ColorPicker';
import { IconPicker } from '@/components/categories/IconPicker';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Select } from '@/components/ui/Select';
import { MODELO_100_CASILLA, TRANSACTION_TYPE } from '@/constants/finance';
import { useCreateCategory, useUpdateCategory } from '@/hooks/useCategories';
import { useTranslate } from '@/hooks/useTranslations';
import { type CreateCategoryInput, CreateCategorySchema, type UpdateCategoryInput } from '@/schemas/transaction';
import type { Category } from '@/types/finance';
import { cn } from '@/utils/helpers';

interface CategoryFormModalProps {
  onClose: () => void;
  editCategory?: Category;
  parentCategory?: Category;
}

export function CategoryFormModal({ onClose, editCategory, parentCategory }: CategoryFormModalProps) {
  const { t } = useTranslate();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const dialogRef = useRef<HTMLDivElement>(null);

  const isEditing = !!editCategory;
  const isSubcategory = !!parentCategory;

  const title = isEditing
    ? t('category-management.form.title-edit')
    : isSubcategory
      ? t('category-management.form.title-subcategory')
      : t('category-management.form.title-create');

  // Use CreateCategorySchema for both create and edit — edit mode passes all required fields via defaults
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
  } = useForm<CreateCategoryInput>({
    resolver: zodResolver(CreateCategorySchema),
    defaultValues: isEditing
      ? {
          name: editCategory.name,
          type: editCategory.type,
          icon: editCategory.icon,
          color: editCategory.color,
          sortOrder: editCategory.sortOrder,
          defaultShared: editCategory.defaultShared,
          defaultVatPercent: editCategory.defaultVatPercent,
          defaultDeductionPercent: editCategory.defaultDeductionPercent,
          modelo100CasillaCode: editCategory.modelo100CasillaCode,
        }
      : {
          type: parentCategory?.type ?? TRANSACTION_TYPE.EXPENSE,
          sortOrder: 0,
          defaultShared: false,
          parentCategoryId: parentCategory?.categoryId ?? null,
          icon: null,
          color: null,
          defaultVatPercent: null,
          defaultDeductionPercent: null,
          modelo100CasillaCode: null,
        },
  });

  const watchedType = watch('type');
  const watchedIcon = watch('icon');
  const watchedColor = watch('color');

  const onSubmit = async (data: CreateCategoryInput) => {
    try {
      if (isEditing) {
        const updateData: UpdateCategoryInput = {
          name: data.name,
          icon: data.icon,
          color: data.color,
          sortOrder: data.sortOrder,
          defaultShared: data.defaultShared,
          defaultVatPercent: data.defaultVatPercent,
          defaultDeductionPercent: data.defaultDeductionPercent,
          modelo100CasillaCode: data.modelo100CasillaCode,
        };
        await updateCategory.mutateAsync({ id: editCategory.categoryId, data: updateData });
      } else {
        await createCategory.mutateAsync(data);
      }
      onClose();
    } catch (_error) {
      // Error is handled by mutation state
    }
  };

  // Focus trap and Escape handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    const firstInput = dialogRef.current?.querySelector<HTMLElement>('input[type="text"]');
    firstInput?.focus();

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleBackdropClick = (_e: React.MouseEvent<HTMLDivElement>) => {
    // Do not close on backdrop click
  };

  const isMutating = createCategory.isPending || updateCategory.isPending;
  const mutationError = createCategory.isError || updateCategory.isError;

  return (
    <div
      className="fixed inset-0 bg-guard-dark/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-backdrop-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="category-form-title"
      onClick={handleBackdropClick}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div ref={dialogRef} className="card w-full max-w-md animate-modal-in max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 id="category-form-title" className="text-xl font-bold text-foreground">
              {title}
            </h2>
            {isSubcategory && (
              <p className="text-sm text-guard-muted mt-1">
                {t('category-management.form.subcategory-of', { parent: parentCategory.name })}
              </p>
            )}
          </div>
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
          {/* Type Toggle — only in create parent mode */}
          {!isEditing && !isSubcategory && (
            <fieldset
              className="flex gap-2 mb-2 border-0 p-0 m-0"
              aria-label={t('category-management.form.fields.type')}
            >
              <button
                type="button"
                onClick={() => setValue('type', TRANSACTION_TYPE.EXPENSE)}
                aria-pressed={watchedType === TRANSACTION_TYPE.EXPENSE}
                className={cn(
                  'flex-1 py-2.5 rounded-lg font-medium transition-all duration-200 ease-out-quart',
                  watchedType === TRANSACTION_TYPE.EXPENSE
                    ? 'bg-guard-danger text-white'
                    : 'bg-muted text-guard-muted hover:text-foreground',
                )}
              >
                {t('transactions.form.type.expense')}
              </button>
              <button
                type="button"
                onClick={() => setValue('type', TRANSACTION_TYPE.INCOME)}
                aria-pressed={watchedType === TRANSACTION_TYPE.INCOME}
                className={cn(
                  'flex-1 py-2.5 rounded-lg font-medium transition-all duration-200 ease-out-quart',
                  watchedType === TRANSACTION_TYPE.INCOME
                    ? 'bg-guard-success text-white'
                    : 'bg-muted text-guard-muted hover:text-foreground',
                )}
              >
                {t('transactions.form.type.income')}
              </button>
            </fieldset>
          )}

          {/* Hidden fields */}
          <input type="hidden" {...register('type')} />
          {isSubcategory && <input type="hidden" {...register('parentCategoryId', { valueAsNumber: true })} />}

          {/* Name */}
          <div>
            <label htmlFor="category-name" className="block text-sm font-medium text-foreground mb-1.5">
              {t('category-management.form.fields.name')}
            </label>
            <input
              id="category-name"
              type="text"
              autoComplete="off"
              placeholder={t('category-management.form.fields.name-placeholder')}
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

          {/* Icon Picker */}
          <IconPicker value={watchedIcon ?? null} onChange={(icon) => setValue('icon', icon)} />

          {/* Color Picker */}
          <ColorPicker value={watchedColor ?? null} onChange={(color) => setValue('color', color)} />

          {/* Sort Order */}
          <div>
            <label htmlFor="sort-order" className="block text-sm font-medium text-foreground mb-1.5">
              {t('category-management.form.fields.sort-order')}
            </label>
            <input
              id="sort-order"
              type="number"
              min="0"
              placeholder={t('category-management.form.fields.sort-order-placeholder')}
              {...register('sortOrder', { valueAsNumber: true })}
              className={cn(
                'w-full px-4 py-2.5 rounded-lg border bg-background text-foreground',
                'focus:ring-2 focus:ring-guard-primary focus:border-transparent',
                'transition-colors duration-200 ease-out-quart',
                'border-input',
              )}
            />
          </div>

          {/* Default Shared */}
          <div className="flex items-center gap-3">
            <div className="flex items-center h-6">
              <input
                id="defaultShared"
                type="checkbox"
                {...register('defaultShared')}
                className="h-4 w-4 rounded border-input text-guard-primary focus:ring-guard-primary"
              />
            </div>
            <label htmlFor="defaultShared" className="text-sm font-medium text-foreground flex items-center gap-2">
              <Users className="h-4 w-4 text-guard-primary" aria-hidden="true" />
              {t('category-management.form.fields.shared')}
            </label>
          </div>

          {/* Fiscal Defaults (only for expense categories) */}
          {watchedType === TRANSACTION_TYPE.EXPENSE && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="defaultVatPercent" className="block text-sm font-medium text-foreground mb-1.5">
                  {t('fiscal.category-defaults.vat-percent')}
                </label>
                <input
                  id="defaultVatPercent"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  {...register('defaultVatPercent', { valueAsNumber: true })}
                  onWheel={(e) => e.currentTarget.blur()}
                  className={cn(
                    'w-full px-4 py-2.5 rounded-lg border bg-background text-foreground',
                    'focus:ring-2 focus:ring-guard-primary focus:border-transparent',
                    'transition-colors duration-200 ease-out-quart',
                    'border-input',
                  )}
                />
              </div>
              <div>
                <label htmlFor="defaultDeductionPercent" className="block text-sm font-medium text-foreground mb-1.5">
                  {t('fiscal.category-defaults.deduction-percent')}
                </label>
                <input
                  id="defaultDeductionPercent"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  {...register('defaultDeductionPercent', { valueAsNumber: true })}
                  onWheel={(e) => e.currentTarget.blur()}
                  className={cn(
                    'w-full px-4 py-2.5 rounded-lg border bg-background text-foreground',
                    'focus:ring-2 focus:ring-guard-primary focus:border-transparent',
                    'transition-colors duration-200 ease-out-quart',
                    'border-input',
                  )}
                />
              </div>
            </div>
          )}

          {/* Modelo 100 Casilla (only for expense subcategories) */}
          {watchedType === TRANSACTION_TYPE.EXPENSE && (
            <div>
              <label htmlFor="modelo100CasillaCode" className="block text-sm font-medium text-foreground mb-1.5">
                {t('fiscal.category-defaults.modelo100-casilla')}
              </label>
              <Select id="modelo100CasillaCode" {...register('modelo100CasillaCode')}>
                <option value="">{t('fiscal.category-defaults.modelo100-none')}</option>
                <option value={MODELO_100_CASILLA.C0186}>
                  ({MODELO_100_CASILLA.C0186}) {t('fiscal.modelo100.casilla0186')}
                </option>
                <option value={MODELO_100_CASILLA.C0194}>
                  ({MODELO_100_CASILLA.C0194}) {t('fiscal.modelo100.casilla0194')}
                </option>
                <option value={MODELO_100_CASILLA.C0196}>
                  ({MODELO_100_CASILLA.C0196}) {t('fiscal.modelo100.casilla0196')}
                </option>
                <option value={MODELO_100_CASILLA.C0202}>
                  ({MODELO_100_CASILLA.C0202}) {t('fiscal.modelo100.casilla0202')}
                </option>
                <option value={MODELO_100_CASILLA.C0217}>
                  ({MODELO_100_CASILLA.C0217}) {t('fiscal.modelo100.casilla0217')}
                </option>
              </Select>
            </div>
          )}

          {/* Error Message */}
          {mutationError && (
            <div role="alert" className="p-3 rounded-lg bg-guard-danger/10 border border-guard-danger/20">
              <p className="text-sm text-guard-danger">
                {isEditing ? t('category-management.form.errors.update') : t('category-management.form.errors.create')}
              </p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || isMutating}
            className={cn(
              'w-full py-3 rounded-lg font-semibold text-white transition-all duration-200 ease-out-quart',
              'disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
              'bg-guard-primary hover:bg-guard-primary/90',
            )}
          >
            {isSubmitting || isMutating ? (
              <span className="flex items-center justify-center gap-2">
                <LoadingSpinner size="sm" className="border-white/30 border-t-white" />
                {t('category-management.form.saving')}
              </span>
            ) : isEditing ? (
              t('category-management.form.submit-edit')
            ) : (
              t('category-management.form.submit-create')
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
