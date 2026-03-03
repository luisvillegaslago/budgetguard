'use client';

/**
 * BudgetGuard Transaction Form
 * Form for creating new transactions with Zod validation
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { useState } from 'react';
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

  return (
    <div className="fixed inset-0 bg-guard-dark/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-foreground">{t('transactions.form.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-guard-muted hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Type Toggle */}
        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => handleTypeChange(TRANSACTION_TYPE.EXPENSE)}
            className={cn(
              'flex-1 py-2.5 rounded-lg font-medium transition-all',
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
            className={cn(
              'flex-1 py-2.5 rounded-lg font-medium transition-all',
              transactionType === TRANSACTION_TYPE.INCOME
                ? 'bg-guard-success text-white'
                : 'bg-muted text-guard-muted hover:text-foreground',
            )}
          >
            {t('transactions.form.type.income')}
          </button>
        </div>

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
            {errors.categoryId && <p className="mt-1 text-sm text-guard-danger">{errors.categoryId.message}</p>}
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
            {errors.amount && <p className="mt-1 text-sm text-guard-danger">{errors.amount.message}</p>}
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
              <p className="mt-1 text-sm text-guard-danger">{errors.transactionDate.message}</p>
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
            {errors.description && <p className="mt-1 text-sm text-guard-danger">{errors.description.message}</p>}
          </div>

          {/* Error Message */}
          {createTransaction.isError && (
            <div className="p-3 rounded-lg bg-guard-danger/10 border border-guard-danger/20">
              <p className="text-sm text-guard-danger">{t('transactions.form.errors.create')}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || createTransaction.isPending}
            className={cn(
              'w-full py-3 rounded-lg font-semibold text-white transition-all',
              'disabled:opacity-50 disabled:cursor-not-allowed',
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
