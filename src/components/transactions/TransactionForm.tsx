'use client';

/**
 * BudgetGuard Transaction Form
 * Form for creating new transactions with Zod validation
 * Supports hierarchical categories and shared expense toggle
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { Download, FileText, Users, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { CategorySelector } from '@/components/transactions/CategorySelector';
import { CompanySelector } from '@/components/ui/CompanySelector';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ModalBackdrop } from '@/components/ui/ModalBackdrop';
import { SHARED_EXPENSE, TRANSACTION_STATUS, TRANSACTION_TYPE } from '@/constants/finance';
import { useFiscalDefaults } from '@/hooks/useFiscalDefaults';
import { useCreateTransaction, useUpdateTransaction } from '@/hooks/useTransactions';
import { useTranslate } from '@/hooks/useTranslations';
import { type CreateTransactionInput, CreateTransactionSchema } from '@/schemas/transaction';
import { useSelectedMonth } from '@/stores/useFinanceStore';
import type { Transaction, TransactionStatus, TransactionType } from '@/types/finance';
import { cn } from '@/utils/helpers';
import { centsToEuros, eurosToCents, formatCurrency } from '@/utils/money';

interface TransactionFormProps {
  onClose: () => void;
  defaultType?: TransactionType;
  transaction?: Transaction;
}

export function TransactionForm({
  onClose,
  defaultType = TRANSACTION_TYPE.EXPENSE,
  transaction,
}: TransactionFormProps) {
  const { t } = useTranslate();
  const isEditing = !!transaction;
  const initialType = transaction?.type ?? defaultType;
  const [transactionType, setTransactionType] = useState<TransactionType>(initialType);
  const [showFiscal, setShowFiscal] = useState(
    () => isEditing && (transaction.vatPercent !== null || transaction.deductionPercent !== null),
  );
  const fiscalDirtyRef = useRef(isEditing);
  const selectedMonth = useSelectedMonth();
  const createTransaction = useCreateTransaction();
  const updateTransaction = useUpdateTransaction();
  const mutation = isEditing ? updateTransaction : createTransaction;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setValue,
    control,
  } = useForm<CreateTransactionInput>({
    resolver: zodResolver(CreateTransactionSchema),
    // Date strings ("YYYY-MM-DD") are used for <input type="date"> compatibility;
    // z.coerce.date() handles string→Date conversion at validation time
    defaultValues: isEditing
      ? {
          type: transaction.type,
          categoryId: transaction.categoryId,
          amount: centsToEuros(transaction.originalAmountCents ?? transaction.amountCents),
          description: transaction.description ?? '',
          transactionDate: transaction.transactionDate as unknown as Date,
          isShared: transaction.sharedDivisor > SHARED_EXPENSE.DEFAULT_DIVISOR,
          vatPercent: transaction.vatPercent,
          deductionPercent: transaction.deductionPercent,
          vendorName: transaction.vendorName,
          invoiceNumber: transaction.invoiceNumber,
          companyId: transaction.companyId,
          status: transaction.status,
        }
      : {
          type: defaultType,
          transactionDate: (selectedMonth === new Date().toISOString().slice(0, 7)
            ? new Date().toISOString().split('T')[0]
            : `${selectedMonth}-01`) as unknown as Date,
          description: '',
          isShared: false,
          vatPercent: null,
          deductionPercent: null,
          vendorName: null,
          invoiceNumber: null,
          companyId: null,
          status: TRANSACTION_STATUS.PAID,
        },
  });

  // Watch amount and isShared for reactive hint
  const watchedAmount = useWatch({ control, name: 'amount' });
  const watchedIsShared = useWatch({ control, name: 'isShared' });
  const watchedCategoryId = useWatch({ control, name: 'categoryId' });
  const watchedCompanyId = useWatch({ control, name: 'companyId' });
  const watchedStatus = useWatch({ control, name: 'status' });

  // Auto-fill fiscal defaults from category
  const fiscalDefaults = useFiscalDefaults(watchedCategoryId ?? null);

  useEffect(() => {
    if (fiscalDefaults && !fiscalDirtyRef.current) {
      setValue('vatPercent', fiscalDefaults.vatPercent);
      setValue('deductionPercent', fiscalDefaults.deductionPercent);
      setShowFiscal(true);
    } else if (!fiscalDefaults && !fiscalDirtyRef.current) {
      setShowFiscal(false);
    }
  }, [fiscalDefaults, setValue]);

  const onSubmit = async (data: CreateTransactionInput) => {
    try {
      const payload = { ...data, type: transactionType };
      if (isEditing) {
        await updateTransaction.mutateAsync({ id: transaction.transactionId, data: payload });
      } else {
        await createTransaction.mutateAsync(payload);
      }
      reset();
      onClose();
    } catch (_error) {
      // Error is handled by mutation state
    }
  };

  const handleTypeChange = (type: TransactionType) => {
    setTransactionType(type);
    reset({
      type,
      transactionDate: (selectedMonth === new Date().toISOString().slice(0, 7)
        ? new Date().toISOString().split('T')[0]
        : `${selectedMonth}-01`) as unknown as Date,
      description: '',
      isShared: false,
    });
  };

  const handleCategoryChange = (categoryId: number) => {
    setValue('categoryId', categoryId, { shouldValidate: true });
  };

  const handleSharedDefaultChange = (defaultShared: boolean) => {
    setValue('isShared', defaultShared);
  };

  // Compute shared hint display
  const showSharedHint = watchedIsShared && watchedAmount > 0;
  const sharedHintTotal = showSharedHint ? formatCurrency(eurosToCents(watchedAmount)) : '';
  const sharedHintHalf = showSharedHint
    ? formatCurrency(Math.ceil(eurosToCents(watchedAmount) / SHARED_EXPENSE.DIVISOR))
    : '';

  // Auto-focus amount input on mount
  const amountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const amountInput = amountRef.current?.querySelector<HTMLElement>('#amount');
    amountInput?.focus();
  }, []);

  return (
    <ModalBackdrop onClose={onClose} labelledBy="transaction-form-title" escapeClose={!isEditing}>
      <div ref={amountRef} className="card w-full max-w-md lg:max-w-lg animate-modal-in max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 id="transaction-form-title" className="text-xl font-bold text-foreground">
            {isEditing ? t('transactions.form.edit-title') : t('transactions.form.title')}
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
        <fieldset
          className="flex gap-2 mb-6 border-0 p-0 m-0"
          aria-label={t('transactions.form.type-group')}
          disabled={isEditing}
        >
          <button
            type="button"
            onClick={() => handleTypeChange(TRANSACTION_TYPE.EXPENSE)}
            aria-pressed={transactionType === TRANSACTION_TYPE.EXPENSE}
            className={cn(
              'flex-1 py-2.5 rounded-lg font-medium transition-all duration-200 ease-out-quart',
              isEditing && 'opacity-60 cursor-not-allowed',
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
              isEditing && 'opacity-60 cursor-not-allowed',
              transactionType === TRANSACTION_TYPE.INCOME
                ? 'bg-guard-success text-white'
                : 'bg-muted text-guard-muted hover:text-foreground',
            )}
          >
            {t('transactions.form.type.income')}
          </button>
        </fieldset>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Hidden categoryId field for form validation */}
          <input type="hidden" {...register('categoryId', { valueAsNumber: true })} />

          {/* Amount + Date (side by side on desktop) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                autoComplete="off"
                placeholder={t('transactions.form.fields.amount-placeholder')}
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
          </div>

          {/* Hierarchical Category Selector */}
          <CategorySelector
            type={transactionType}
            onCategoryChange={handleCategoryChange}
            onSharedDefaultChange={handleSharedDefaultChange}
            error={errors.categoryId?.message}
            disabled={isSubmitting}
            initialCategoryId={transaction?.categoryId}
          />

          {/* Shared Expense Toggle */}
          <div className="flex items-start gap-3">
            <div className="flex items-center h-6 mt-0.5">
              <input
                id="isShared"
                type="checkbox"
                {...register('isShared')}
                className="h-4 w-4 rounded border-input text-guard-primary focus:ring-guard-primary"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="isShared" className="text-sm font-medium text-foreground flex items-center gap-2">
                <Users className="h-4 w-4 text-guard-primary" aria-hidden="true" />
                {t('transactions.form.fields.shared')}
              </label>
              {/* Shared hint */}
              {showSharedHint && (
                <p className="text-xs text-guard-muted mt-1 animate-fade-in">
                  {t('transactions.form.fields.shared-hint', {
                    total: sharedHintTotal,
                    half: sharedHintHalf,
                  })}
                </p>
              )}
            </div>
          </div>

          {/* Status Selector */}
          <fieldset className="border-0 p-0 m-0">
            <legend className="block text-sm font-medium text-foreground mb-1.5">
              {t('transactions.form.fields.status')}
            </legend>
            <div className="flex gap-2">
              {(
                [
                  TRANSACTION_STATUS.PAID,
                  TRANSACTION_STATUS.PENDING,
                  ...(isEditing ? [TRANSACTION_STATUS.CANCELLED] : []),
                ] as TransactionStatus[]
              ).map((statusOption) => (
                <button
                  key={statusOption}
                  type="button"
                  onClick={() => setValue('status', statusOption)}
                  className={cn(
                    'flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-200 ease-out-quart',
                    watchedStatus === statusOption
                      ? statusOption === TRANSACTION_STATUS.PAID
                        ? 'bg-guard-success text-white'
                        : statusOption === TRANSACTION_STATUS.PENDING
                          ? 'bg-guard-warning text-white'
                          : 'bg-guard-muted text-white'
                      : 'bg-muted text-foreground/70 hover:text-foreground',
                  )}
                >
                  {t(`transaction-status.${statusOption}`)}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Description Input */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-foreground mb-1.5">
              {t('transactions.form.fields.description')} ({t('common.labels.optional')})
            </label>
            <input
              id="description"
              type="text"
              autoComplete="off"
              placeholder={t('transactions.form.fields.description-placeholder')}
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

          {/* Fiscal Data Toggle */}
          <div className="flex items-center gap-3">
            <div className="flex items-center h-6">
              <input
                id="showFiscal"
                type="checkbox"
                checked={showFiscal}
                onChange={(e) => setShowFiscal(e.target.checked)}
                className="h-4 w-4 rounded border-input text-guard-primary focus:ring-guard-primary"
              />
            </div>
            <label htmlFor="showFiscal" className="text-sm font-medium text-foreground flex items-center gap-2">
              <FileText className="h-4 w-4 text-guard-primary" aria-hidden="true" />
              {t('fiscal.form.section-title')}
            </label>
          </div>

          {/* Fiscal Data Fields */}
          {showFiscal && (
            <div className="space-y-3 pl-7 animate-fade-in">
              <div className="grid grid-cols-2 gap-3">
                {/* VAT % */}
                <div>
                  <label htmlFor="vatPercent" className="block text-xs font-medium text-foreground mb-1">
                    {t('fiscal.form.vat-percent')}
                  </label>
                  <input
                    id="vatPercent"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    {...register('vatPercent', { valueAsNumber: true })}
                    onChange={(e) => {
                      fiscalDirtyRef.current = true;
                      register('vatPercent', { valueAsNumber: true }).onChange(e);
                    }}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="w-full input-sm"
                  />
                </div>

                {/* Deduction % */}
                <div>
                  <label htmlFor="deductionPercent" className="block text-xs font-medium text-foreground mb-1">
                    {t('fiscal.form.deduction-percent')}
                  </label>
                  <input
                    id="deductionPercent"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    {...register('deductionPercent', { valueAsNumber: true })}
                    onChange={(e) => {
                      fiscalDirtyRef.current = true;
                      register('deductionPercent', { valueAsNumber: true }).onChange(e);
                    }}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="w-full input-sm"
                  />
                </div>
              </div>

              {/* Company/Vendor + Invoice Number (side by side on desktop) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="companyId" className="block text-xs font-medium text-foreground mb-1">
                    {t('fiscal.form.vendor-name')}
                  </label>
                  <CompanySelector
                    value={watchedCompanyId ?? null}
                    onChange={(companyId) => setValue('companyId', companyId, { shouldValidate: true })}
                    disabled={isSubmitting}
                  />
                  <input type="hidden" {...register('companyId', { valueAsNumber: true })} />
                </div>

                <div>
                  <label htmlFor="invoiceNumber" className="block text-xs font-medium text-foreground mb-1">
                    {t('fiscal.form.invoice-number')}
                  </label>
                  <input
                    id="invoiceNumber"
                    type="text"
                    autoComplete="off"
                    placeholder={t('fiscal.form.invoice-placeholder')}
                    {...register('invoiceNumber')}
                    className="w-full input-sm"
                  />
                </div>
              </div>

              {/* Modelo 100 casilla (readonly, from category) */}
              {fiscalDefaults?.modelo100CasillaCode && (
                <div>
                  <span className="block text-xs font-medium text-foreground mb-1">
                    {t('fiscal.category-defaults.modelo100-casilla')}
                  </span>
                  <div className="w-full px-3 py-2 rounded-lg border border-input bg-muted/50 text-sm text-guard-muted tabular-nums">
                    ({fiscalDefaults.modelo100CasillaCode}){' '}
                    {t(`fiscal.modelo100.casilla${fiscalDefaults.modelo100CasillaCode}`)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Linked Fiscal Document */}
          {isEditing && transaction.fiscalDocumentId != null && (
            <a
              href={`/api/fiscal/documents/${transaction.fiscalDocumentId}/download`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-lg',
                'bg-guard-success/5 border border-guard-success/20',
                'text-sm text-guard-success hover:bg-guard-success/10 transition-colors',
              )}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {t('fiscal.documents.download-linked')}
            </a>
          )}

          {/* Error Message */}
          {mutation.isError && (
            <div role="alert" className="p-3 rounded-lg bg-guard-danger/10 border border-guard-danger/20">
              <p className="text-sm text-guard-danger">
                {isEditing ? t('transactions.form.errors.update') : t('transactions.form.errors.create')}
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
              transactionType === TRANSACTION_TYPE.INCOME
                ? 'bg-guard-success hover:bg-guard-success/90'
                : 'bg-guard-danger hover:bg-guard-danger/90',
            )}
          >
            {isSubmitting || mutation.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <LoadingSpinner size="sm" className="border-white/30 border-t-white" />
                {isEditing ? t('transactions.form.updating') : t('transactions.form.saving')}
              </span>
            ) : isEditing ? (
              transactionType === TRANSACTION_TYPE.INCOME ? (
                t('transactions.form.submit.edit-income')
              ) : (
                t('transactions.form.submit.edit-expense')
              )
            ) : transactionType === TRANSACTION_TYPE.INCOME ? (
              t('transactions.form.submit.income')
            ) : (
              t('transactions.form.submit.expense')
            )}
          </button>
        </form>
      </div>
    </ModalBackdrop>
  );
}
