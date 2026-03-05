'use client';

/**
 * BudgetGuard Trip Expense Form
 * Modal form for creating/editing trip expenses
 * Always expense type - uses trip-specific categories (Viajes subcategories)
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { Users, X } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ModalBackdrop } from '@/components/ui/ModalBackdrop';
import { SHARED_EXPENSE, TRIP_COLOR } from '@/constants/finance';
import { useTranslate } from '@/hooks/useTranslations';
import { useTripCategories } from '@/hooks/useTripCategories';
import { useCreateTripExpense, useUpdateTripExpense } from '@/hooks/useTripExpenses';
import { type CreateTripExpenseInput, CreateTripExpenseSchema } from '@/schemas/trip';
import type { Transaction } from '@/types/finance';
import { cn } from '@/utils/helpers';
import { centsToEuros, eurosToCents, formatCurrency } from '@/utils/money';

interface TripExpenseFormProps {
  tripId: number;
  onClose: () => void;
  transaction?: Transaction;
}

export function TripExpenseForm({ tripId, onClose, transaction }: TripExpenseFormProps) {
  const { t } = useTranslate();
  const isEditing = !!transaction;
  const { data: categories, isLoading: categoriesLoading } = useTripCategories();
  const createExpense = useCreateTripExpense(tripId);
  const updateExpense = useUpdateTripExpense(tripId);
  const mutation = isEditing ? updateExpense : createExpense;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    control,
  } = useForm<CreateTripExpenseInput>({
    resolver: zodResolver(CreateTripExpenseSchema),
    defaultValues: isEditing
      ? {
          categoryId: transaction.categoryId,
          amount: centsToEuros(transaction.originalAmountCents ?? transaction.amountCents),
          description: transaction.description ?? '',
          transactionDate: transaction.transactionDate as unknown as Date,
          isShared: transaction.sharedDivisor > SHARED_EXPENSE.DEFAULT_DIVISOR,
        }
      : {
          transactionDate: new Date().toISOString().split('T')[0] as unknown as Date,
          description: '',
          isShared: false,
        },
  });

  const watchedAmount = useWatch({ control, name: 'amount' });
  const watchedIsShared = useWatch({ control, name: 'isShared' });
  const watchedCategoryId = useWatch({ control, name: 'categoryId' });

  const onSubmit = async (data: CreateTripExpenseInput) => {
    try {
      if (isEditing) {
        await updateExpense.mutateAsync({ expenseId: transaction.transactionId, data });
      } else {
        await createExpense.mutateAsync(data);
      }
      onClose();
    } catch (_error) {
      // Error handled by mutation state
    }
  };

  // Shared hint
  const showSharedHint = watchedIsShared && watchedAmount > 0;
  const sharedHintTotal = showSharedHint ? formatCurrency(eurosToCents(watchedAmount)) : '';
  const sharedHintHalf = showSharedHint
    ? formatCurrency(Math.ceil(eurosToCents(watchedAmount) / SHARED_EXPENSE.DIVISOR))
    : '';

  return (
    <ModalBackdrop onClose={onClose} labelledBy="trip-expense-form-title">
      <div className="card w-full max-w-md animate-modal-in max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 id="trip-expense-form-title" className="text-xl font-bold text-foreground">
            {isEditing ? t('trips.expense-form.title-edit') : t('trips.expense-form.title-create')}
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
          {/* Category Selector (trip-specific categories) */}
          <div>
            <label htmlFor="trip-category" className="block text-sm font-medium text-foreground mb-1.5">
              {t('trips.expense-form.fields.category')}
            </label>
            {categoriesLoading ? (
              <div className="flex items-center justify-center py-3">
                <LoadingSpinner size="sm" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {categories?.map((cat) => {
                  const isSelected = watchedCategoryId === cat.categoryId;
                  const color = cat.color ?? TRIP_COLOR;
                  return (
                    <button
                      key={cat.categoryId}
                      type="button"
                      onClick={() => setValue('categoryId', cat.categoryId, { shouldValidate: true })}
                      className={cn(
                        'flex items-center gap-2 p-2.5 rounded-lg border transition-all duration-200 ease-out-quart text-left',
                        isSelected
                          ? 'border-guard-primary bg-guard-primary/5 ring-1 ring-guard-primary'
                          : 'border-border hover:border-guard-muted',
                      )}
                    >
                      <div className="flex-shrink-0 p-1 rounded" style={{ backgroundColor: `${color}15` }}>
                        <CategoryIcon icon={cat.icon} color={color} className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-sm text-foreground truncate">{cat.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <input type="hidden" {...register('categoryId', { valueAsNumber: true })} />
            {errors.categoryId && (
              <p role="alert" className="mt-1 text-sm text-guard-danger">
                {errors.categoryId.message}
              </p>
            )}
          </div>

          {/* Amount Input */}
          <div>
            <label htmlFor="trip-amount" className="block text-sm font-medium text-foreground mb-1.5">
              {t('trips.expense-form.fields.amount')}
            </label>
            <input
              id="trip-amount"
              type="number"
              step="0.01"
              min="0.01"
              autoComplete="off"
              placeholder={t('trips.expense-form.fields.amount-placeholder')}
              {...register('amount', { valueAsNumber: true })}
              onWheel={(e) => e.currentTarget.blur()}
              className={cn(
                'w-full px-4 py-2.5 rounded-lg border bg-background text-foreground',
                'focus:ring-2 focus:ring-guard-primary focus:border-transparent',
                'transition-colors duration-200 ease-out-quart',
                errors.amount ? 'border-guard-danger' : 'border-input',
              )}
            />
            {errors.amount && (
              <p role="alert" className="mt-1 text-sm text-guard-danger">
                {errors.amount.message}
              </p>
            )}
          </div>

          {/* Shared Expense Toggle */}
          <div className="flex items-start gap-3">
            <div className="flex items-center h-6 mt-0.5">
              <input
                id="trip-isShared"
                type="checkbox"
                {...register('isShared')}
                className="h-4 w-4 rounded border-input text-guard-primary focus:ring-guard-primary"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="trip-isShared" className="text-sm font-medium text-foreground flex items-center gap-2">
                <Users className="h-4 w-4 text-guard-primary" aria-hidden="true" />
                {t('trips.expense-form.fields.shared')}
              </label>
              {showSharedHint && (
                <p className="text-xs text-guard-muted mt-1 animate-fade-in">
                  {t('trips.expense-form.fields.shared-hint', {
                    total: sharedHintTotal,
                    half: sharedHintHalf,
                  })}
                </p>
              )}
            </div>
          </div>

          {/* Date Input */}
          <div>
            <label htmlFor="trip-date" className="block text-sm font-medium text-foreground mb-1.5">
              {t('trips.expense-form.fields.date')}
            </label>
            <input
              id="trip-date"
              type="date"
              {...register('transactionDate')}
              className={cn(
                'w-full px-4 py-2.5 rounded-lg border bg-background text-foreground',
                'focus:ring-2 focus:ring-guard-primary focus:border-transparent',
                'transition-colors duration-200 ease-out-quart',
                errors.transactionDate ? 'border-guard-danger' : 'border-input',
              )}
            />
            {errors.transactionDate && (
              <p role="alert" className="mt-1 text-sm text-guard-danger">
                {errors.transactionDate.message}
              </p>
            )}
          </div>

          {/* Description Input */}
          <div>
            <label htmlFor="trip-description" className="block text-sm font-medium text-foreground mb-1.5">
              {t('trips.expense-form.fields.description')} ({t('common.labels.optional')})
            </label>
            <input
              id="trip-description"
              type="text"
              autoComplete="off"
              placeholder={t('trips.expense-form.fields.description-placeholder')}
              {...register('description')}
              className={cn(
                'w-full px-4 py-2.5 rounded-lg border bg-background text-foreground',
                'focus:ring-2 focus:ring-guard-primary focus:border-transparent',
                'transition-colors duration-200 ease-out-quart',
                errors.description ? 'border-guard-danger' : 'border-input',
              )}
            />
            {errors.description && (
              <p role="alert" className="mt-1 text-sm text-guard-danger">
                {errors.description.message}
              </p>
            )}
          </div>

          {/* Error Message */}
          {mutation.isError && (
            <div role="alert" className="p-3 rounded-lg bg-guard-danger/10 border border-guard-danger/20">
              <p className="text-sm text-guard-danger">
                {isEditing ? t('trips.expense-form.errors.update') : t('trips.expense-form.errors.create')}
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
              'bg-guard-danger hover:bg-guard-danger/90',
            )}
          >
            {isSubmitting || mutation.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <LoadingSpinner size="sm" className="border-white/30 border-t-white" />
                {t('trips.expense-form.saving')}
              </span>
            ) : isEditing ? (
              t('trips.expense-form.submit-edit')
            ) : (
              t('trips.expense-form.submit-create')
            )}
          </button>
        </form>
      </div>
    </ModalBackdrop>
  );
}
