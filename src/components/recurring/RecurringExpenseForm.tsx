'use client';

/**
 * BudgetGuard Recurring Expense Form
 * Form for creating and editing recurring expense rules
 * Always expense type, with frequency-dependent conditional fields
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { Users, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type Resolver, useForm, useWatch } from 'react-hook-form';
import { CategorySelector } from '@/components/transactions/CategorySelector';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { RECURRING_FREQUENCY, SHARED_EXPENSE, TRANSACTION_TYPE } from '@/constants/finance';
import { useCreateRecurringExpense, useUpdateRecurringExpense } from '@/hooks/useRecurringExpenses';
import { useTranslate } from '@/hooks/useTranslations';
import { type CreateRecurringExpenseInput, CreateRecurringExpenseSchema } from '@/schemas/recurring-expense';
import type { RecurringExpense, RecurringFrequency } from '@/types/finance';
import { cn } from '@/utils/helpers';
import { centsToEuros, eurosToCents, formatCurrency } from '@/utils/money';

interface RecurringExpenseFormValues {
  categoryId: number;
  amount: number;
  description: string;
  frequency: RecurringFrequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  monthOfYear: number | null;
  startDate: string;
  endDate: string | null;
  isShared: boolean;
}

interface RecurringExpenseFormProps {
  onClose: () => void;
  expense?: RecurringExpense;
}

const FREQUENCY_OPTIONS: RecurringFrequency[] = [
  RECURRING_FREQUENCY.WEEKLY,
  RECURRING_FREQUENCY.MONTHLY,
  RECURRING_FREQUENCY.YEARLY,
];

const DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6] as const;

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export function RecurringExpenseForm({ onClose, expense }: RecurringExpenseFormProps) {
  const { t } = useTranslate();
  const isEditing = !!expense;
  const createMutation = useCreateRecurringExpense();
  const updateMutation = useUpdateRecurringExpense();

  const [frequency, setFrequency] = useState<RecurringFrequency>(expense?.frequency ?? RECURRING_FREQUENCY.MONTHLY);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    control,
  } = useForm<RecurringExpenseFormValues>({
    // z.coerce.date() accepts string inputs from date fields and coerces them
    resolver: zodResolver(CreateRecurringExpenseSchema) as unknown as Resolver<RecurringExpenseFormValues>,
    defaultValues: {
      frequency: expense?.frequency ?? RECURRING_FREQUENCY.MONTHLY,
      categoryId: expense?.categoryId,
      amount: expense ? centsToEuros(expense.originalAmountCents ?? expense.amountCents) : undefined,
      description: expense?.description ?? '',
      dayOfWeek: expense?.dayOfWeek ?? null,
      dayOfMonth: expense?.dayOfMonth ?? null,
      monthOfYear: expense?.monthOfYear ?? null,
      startDate: expense?.startDate ?? new Date().toISOString().split('T')[0],
      endDate: expense?.endDate ?? null,
      isShared: expense ? expense.sharedDivisor > SHARED_EXPENSE.DEFAULT_DIVISOR : false,
    },
  });

  const watchedAmount = useWatch({ control, name: 'amount' });
  const watchedIsShared = useWatch({ control, name: 'isShared' });
  const watchedDayOfWeek = useWatch({ control, name: 'dayOfWeek' });

  const showSharedHint = watchedIsShared && watchedAmount > 0;
  const sharedHintTotal = showSharedHint ? formatCurrency(eurosToCents(watchedAmount)) : '';
  const sharedHintHalf = showSharedHint
    ? formatCurrency(Math.ceil(eurosToCents(watchedAmount) / SHARED_EXPENSE.DIVISOR))
    : '';

  const handleFrequencyChange = (newFrequency: RecurringFrequency) => {
    setFrequency(newFrequency);
    setValue('frequency', newFrequency);
    // Reset conditional fields
    setValue('dayOfWeek', null);
    setValue('dayOfMonth', null);
    setValue('monthOfYear', null);
  };

  const handleCategoryChange = (categoryId: number) => {
    setValue('categoryId', categoryId, { shouldValidate: true });
  };

  const handleSharedDefaultChange = (defaultShared: boolean) => {
    setValue('isShared', defaultShared);
  };

  const onSubmit = async (formData: RecurringExpenseFormValues) => {
    try {
      // Zod resolver coerces dates from strings — safe to cast
      const data = formData as unknown as CreateRecurringExpenseInput;
      if (isEditing && expense) {
        await updateMutation.mutateAsync({
          id: expense.recurringExpenseId,
          data,
        });
      } else {
        await createMutation.mutateAsync(data);
      }
      onClose();
    } catch (_error) {
      // Error handled by mutation state
    }
  };

  // Focus trap and Escape handler
  const dialogRef = useRef<HTMLDivElement>(null);

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
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleBackdropClick = (_e: React.MouseEvent<HTMLDivElement>) => {
    // Do not close on backdrop click
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const isError = createMutation.isError || updateMutation.isError;

  return (
    <div
      className="fixed inset-0 bg-guard-dark/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-backdrop-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recurring-form-title"
      onClick={handleBackdropClick}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div ref={dialogRef} className="card w-full max-w-md animate-modal-in max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 id="recurring-form-title" className="text-xl font-bold text-foreground">
            {isEditing ? t('recurring.form.title-edit') : t('recurring.form.title-create')}
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
          {/* Hidden inputs */}
          <input type="hidden" {...register('categoryId', { valueAsNumber: true })} />
          <input type="hidden" {...register('frequency')} />

          {/* Category Selector (expense only) */}
          <CategorySelector
            type={TRANSACTION_TYPE.EXPENSE}
            onCategoryChange={handleCategoryChange}
            onSharedDefaultChange={handleSharedDefaultChange}
            error={errors.categoryId?.message}
            disabled={isSubmitting}
            initialCategoryId={expense?.categoryId}
          />

          {/* Amount */}
          <div>
            <label htmlFor="re-amount" className="block text-sm font-medium text-foreground mb-1.5">
              {t('recurring.form.fields.amount')}
            </label>
            <input
              id="re-amount"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              {...register('amount', { valueAsNumber: true })}
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

          {/* Shared Toggle */}
          <div className="flex items-start gap-3">
            <div className="flex items-center h-6 mt-0.5">
              <input
                id="re-isShared"
                type="checkbox"
                {...register('isShared')}
                className="h-4 w-4 rounded border-input text-guard-primary focus:ring-guard-primary"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="re-isShared" className="text-sm font-medium text-foreground flex items-center gap-2">
                <Users className="h-4 w-4 text-guard-primary" aria-hidden="true" />
                {t('recurring.form.fields.shared')}
              </label>
              {showSharedHint && (
                <p className="text-xs text-guard-muted mt-1 animate-fade-in">
                  {t('transactions.form.fields.shared-hint', { total: sharedHintTotal, half: sharedHintHalf })}
                </p>
              )}
            </div>
          </div>

          {/* Frequency Selector */}
          <fieldset>
            <legend className="block text-sm font-medium text-foreground mb-1.5">
              {t('recurring.form.fields.frequency')}
            </legend>
            <div className="flex gap-2">
              {FREQUENCY_OPTIONS.map((freq) => (
                <button
                  key={freq}
                  type="button"
                  onClick={() => handleFrequencyChange(freq)}
                  className={cn(
                    'flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-200 ease-out-quart',
                    frequency === freq
                      ? 'bg-guard-primary text-white'
                      : 'bg-muted text-guard-muted hover:text-foreground',
                  )}
                >
                  {t(`recurring.frequency.${freq}`)}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Conditional fields based on frequency */}
          {frequency === RECURRING_FREQUENCY.WEEKLY && (
            <fieldset>
              <legend className="block text-sm font-medium text-foreground mb-1.5">
                {t('recurring.form.fields.day-of-week')}
              </legend>
              <div className="flex gap-1.5">
                {DAYS_OF_WEEK.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setValue('dayOfWeek', day, { shouldValidate: true })}
                    className={cn(
                      'flex-1 py-2 rounded-lg text-xs font-medium transition-all duration-200 ease-out-quart',
                      watchedDayOfWeek === day
                        ? 'bg-guard-primary text-white'
                        : 'bg-muted text-guard-muted hover:text-foreground',
                    )}
                  >
                    {t(`recurring.days-of-week.${day}`)}
                  </button>
                ))}
              </div>
              {errors.dayOfWeek && (
                <p role="alert" className="mt-1 text-sm text-guard-danger">
                  {errors.dayOfWeek.message}
                </p>
              )}
            </fieldset>
          )}

          {(frequency === RECURRING_FREQUENCY.MONTHLY || frequency === RECURRING_FREQUENCY.YEARLY) && (
            <div>
              <label htmlFor="re-dayOfMonth" className="block text-sm font-medium text-foreground mb-1.5">
                {t('recurring.form.fields.day-of-month')}
              </label>
              <input
                id="re-dayOfMonth"
                type="number"
                min="1"
                max="31"
                {...register('dayOfMonth', { valueAsNumber: true })}
                className={cn(
                  'w-full px-4 py-2.5 rounded-lg border bg-background text-foreground',
                  'focus:ring-2 focus:ring-guard-primary focus:border-transparent',
                  'transition-colors duration-200 ease-out-quart',
                  errors.dayOfMonth ? 'border-guard-danger' : 'border-input',
                )}
              />
              {errors.dayOfMonth && (
                <p role="alert" className="mt-1 text-sm text-guard-danger">
                  {errors.dayOfMonth.message}
                </p>
              )}
            </div>
          )}

          {frequency === RECURRING_FREQUENCY.YEARLY && (
            <div>
              <label htmlFor="re-monthOfYear" className="block text-sm font-medium text-foreground mb-1.5">
                {t('recurring.form.fields.month-of-year')}
              </label>
              <select
                id="re-monthOfYear"
                {...register('monthOfYear', { valueAsNumber: true })}
                className={cn(
                  'w-full px-4 py-2.5 rounded-lg border bg-background text-foreground',
                  'focus:ring-2 focus:ring-guard-primary focus:border-transparent',
                  'transition-colors duration-200 ease-out-quart',
                  errors.monthOfYear ? 'border-guard-danger' : 'border-input',
                )}
              >
                <option value="">{t('recurring.form.fields.month-of-year')}</option>
                {MONTHS.map((m) => (
                  <option key={m} value={m}>
                    {t(`recurring.months.${m}`)}
                  </option>
                ))}
              </select>
              {errors.monthOfYear && (
                <p role="alert" className="mt-1 text-sm text-guard-danger">
                  {errors.monthOfYear.message}
                </p>
              )}
            </div>
          )}

          {/* Start Date */}
          <div>
            <label htmlFor="re-startDate" className="block text-sm font-medium text-foreground mb-1.5">
              {t('recurring.form.fields.start-date')}
            </label>
            <input
              id="re-startDate"
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

          {/* End Date (optional) */}
          <div>
            <label htmlFor="re-endDate" className="block text-sm font-medium text-foreground mb-1.5">
              {t('recurring.form.fields.end-date')} ({t('common.labels.optional')})
            </label>
            <input
              id="re-endDate"
              type="date"
              {...register('endDate')}
              className={cn(
                'w-full px-4 py-2.5 rounded-lg border bg-background text-foreground',
                'focus:ring-2 focus:ring-guard-primary focus:border-transparent',
                'transition-colors duration-200 ease-out-quart',
                errors.endDate ? 'border-guard-danger' : 'border-input',
              )}
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="re-description" className="block text-sm font-medium text-foreground mb-1.5">
              {t('recurring.form.fields.description')} ({t('common.labels.optional')})
            </label>
            <input
              id="re-description"
              type="text"
              autoComplete="off"
              placeholder=""
              {...register('description')}
              className={cn(
                'w-full px-4 py-2.5 rounded-lg border bg-background text-foreground',
                'focus:ring-2 focus:ring-guard-primary focus:border-transparent',
                'transition-colors duration-200 ease-out-quart',
                errors.description ? 'border-guard-danger' : 'border-input',
              )}
            />
          </div>

          {/* Error */}
          {isError && (
            <div role="alert" className="p-3 rounded-lg bg-guard-danger/10 border border-guard-danger/20">
              <p className="text-sm text-guard-danger">
                {isEditing ? t('recurring.form.errors.update') : t('recurring.form.errors.create')}
              </p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting || isPending}
            className={cn(
              'w-full py-3 rounded-lg font-semibold text-white transition-all duration-200 ease-out-quart',
              'disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
              'bg-guard-danger hover:bg-guard-danger/90',
            )}
          >
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <LoadingSpinner size="sm" className="border-white/30 border-t-white" />
                {t('recurring.form.saving')}
              </span>
            ) : isEditing ? (
              t('recurring.form.submit-edit')
            ) : (
              t('recurring.form.submit-create')
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
