'use client';

/**
 * BudgetGuard Transaction Form
 * Form for creating new transactions with Zod validation
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { TRANSACTION_TYPE } from '@/constants/finance';
import { useCategories } from '@/hooks/useCategories';
import { useCreateTransaction } from '@/hooks/useTransactions';
import { useTranslate } from '@/hooks/useTranslations';
import { type CreateTransactionInput, CreateTransactionSchema } from '@/schemas/transaction';
import type { TransactionType } from '@/types/finance';
import { cn } from '@/utils/helpers';

interface TransactionFormProps {
  onClose: () => void;
  defaultType?: TransactionType;
}

export function TransactionForm({ onClose, defaultType = TRANSACTION_TYPE.EXPENSE }: TransactionFormProps) {
  const { t } = useTranslate();
  const [transactionType, setTransactionType] = useState<TransactionType>(defaultType);
  const { data: categories, isLoading: categoriesLoading } = useCategories(transactionType);
  const createTransaction = useCreateTransaction();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<CreateTransactionInput>({
    resolver: zodResolver(CreateTransactionSchema),
    defaultValues: {
      type: defaultType,
      transactionDate: new Date(),
      description: '',
    },
  });

  const onSubmit = async (data: CreateTransactionInput) => {
    try {
      await createTransaction.mutateAsync({
        ...data,
        type: transactionType,
      });
      reset();
      onClose();
    } catch (_error) {
      // Error is handled by mutation state
    }
  };

  const handleTypeChange = (type: TransactionType) => {
    setTransactionType(type);
    reset({ type, transactionDate: new Date(), description: '' });
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
    // Focus the dialog on mount
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>('button, [href], input, select, textarea');
    firstFocusable?.focus();

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-guard-dark/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-backdrop-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="transaction-form-title"
      onClick={handleBackdropClick}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div ref={dialogRef} className="card w-full max-w-md animate-modal-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 id="transaction-form-title" className="text-xl font-bold text-foreground">
            {t('transactions.form.title')}
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

        {/* Type Toggle */}
        <fieldset className="flex gap-2 mb-6 border-0 p-0 m-0" aria-label={t('transactions.form.type-group')}>
          <button
            type="button"
            onClick={() => handleTypeChange(TRANSACTION_TYPE.EXPENSE)}
            aria-pressed={transactionType === TRANSACTION_TYPE.EXPENSE}
            className={cn(
              'flex-1 py-2.5 rounded-lg font-medium transition-all duration-200 ease-out-quart',
              transactionType === TRANSACTION_TYPE.EXPENSE
                ? 'bg-guard-danger text-white'
                : 'bg-muted text-guard-muted hover:text-foreground',
            )}
          >
            {t('transactions.form.type.expense')}
          </button>
          <button
            type="button"
            onClick={() => handleTypeChange(TRANSACTION_TYPE.INCOME)}
            aria-pressed={transactionType === TRANSACTION_TYPE.INCOME}
            className={cn(
              'flex-1 py-2.5 rounded-lg font-medium transition-all duration-200 ease-out-quart',
              transactionType === TRANSACTION_TYPE.INCOME
                ? 'bg-guard-success text-white'
                : 'bg-muted text-guard-muted hover:text-foreground',
            )}
          >
            {t('transactions.form.type.income')}
          </button>
        </fieldset>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Category Select */}
          <div>
            <label htmlFor="categoryId" className="block text-sm font-medium text-foreground mb-1.5">
              {t('transactions.form.fields.category')}
            </label>
            <select
              id="categoryId"
              {...register('categoryId', { valueAsNumber: true })}
              disabled={categoriesLoading}
              className={cn(
                'w-full px-4 py-2.5 rounded-lg border bg-background text-foreground',
                'focus:ring-2 focus:ring-guard-primary focus:border-transparent',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                errors.categoryId ? 'border-guard-danger' : 'border-input',
              )}
            >
              <option value="">{t('transactions.form.fields.category-placeholder')}</option>
              {categories?.map((cat) => (
                <option key={cat.categoryId} value={cat.categoryId}>
                  {cat.name}
                </option>
              ))}
            </select>
            {errors.categoryId && (
              <p role="alert" className="mt-1 text-sm text-guard-danger">
                {errors.categoryId.message}
              </p>
            )}
          </div>

          {/* Amount Input */}
          <div>
            <label htmlFor="amount" className="block text-sm font-medium text-foreground mb-1.5">
              {t('transactions.form.fields.amount')}
            </label>
            <input
              id="amount"
              type="number"
              step="0.01"
              min="0.01"
              placeholder={t('transactions.form.fields.amount-placeholder')}
              {...register('amount', { valueAsNumber: true })}
              className={cn(
                'w-full px-4 py-2.5 rounded-lg border bg-background text-foreground',
                'focus:ring-2 focus:ring-guard-primary focus:border-transparent',
                errors.amount ? 'border-guard-danger' : 'border-input',
              )}
            />
            {errors.amount && (
              <p role="alert" className="mt-1 text-sm text-guard-danger">
                {errors.amount.message}
              </p>
            )}
          </div>

          {/* Date Input */}
          <div>
            <label htmlFor="transactionDate" className="block text-sm font-medium text-foreground mb-1.5">
              {t('transactions.form.fields.date')}
            </label>
            <input
              id="transactionDate"
              type="date"
              {...register('transactionDate')}
              className={cn(
                'w-full px-4 py-2.5 rounded-lg border bg-background text-foreground',
                'focus:ring-2 focus:ring-guard-primary focus:border-transparent',
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
            <label htmlFor="description" className="block text-sm font-medium text-foreground mb-1.5">
              {t('transactions.form.fields.description')} ({t('common.labels.optional')})
            </label>
            <input
              id="description"
              type="text"
              placeholder={t('transactions.form.fields.description-placeholder')}
              {...register('description')}
              className={cn(
                'w-full px-4 py-2.5 rounded-lg border bg-background text-foreground',
                'focus:ring-2 focus:ring-guard-primary focus:border-transparent',
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
          {createTransaction.isError && (
            <div role="alert" className="p-3 rounded-lg bg-guard-danger/10 border border-guard-danger/20">
              <p className="text-sm text-guard-danger">{t('transactions.form.errors.create')}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || createTransaction.isPending}
            className={cn(
              'w-full py-3 rounded-lg font-semibold text-white transition-all duration-200 ease-out-quart',
              'disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
              transactionType === TRANSACTION_TYPE.INCOME
                ? 'bg-guard-success hover:bg-guard-success/90'
                : 'bg-guard-danger hover:bg-guard-danger/90',
            )}
          >
            {isSubmitting || createTransaction.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <LoadingSpinner size="sm" className="border-white/30 border-t-white" />
                {t('transactions.form.saving')}
              </span>
            ) : transactionType === TRANSACTION_TYPE.INCOME ? (
              t('transactions.form.submit.income')
            ) : (
              t('transactions.form.submit.expense')
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
