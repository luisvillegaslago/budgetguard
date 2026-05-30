'use client';

/**
 * BudgetGuard Voucher ("bono") Form
 * Create / edit a prepaid voucher. Buying a voucher does NOT create a transaction;
 * consumption is recorded later as expense transactions linked to this voucher.
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { Ticket, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { CategorySelector } from '@/components/transactions/CategorySelector';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ModalBackdrop } from '@/components/ui/ModalBackdrop';
import { TRANSACTION_TYPE } from '@/constants/finance';
import { useTranslate } from '@/hooks/useTranslations';
import { useCreateVoucher, useUpdateVoucher } from '@/hooks/useVouchers';
import { type CreateVoucherInput, CreateVoucherSchema } from '@/schemas/voucher';
import type { Voucher } from '@/types/finance';
import { cn } from '@/utils/helpers';
import { centsToEuros } from '@/utils/money';

interface VoucherFormModalProps {
  onClose: () => void;
  voucher?: Voucher;
}

const today = (): string => new Date().toISOString().split('T')[0] as string;

export function VoucherFormModal({ onClose, voucher }: VoucherFormModalProps) {
  const { t } = useTranslate();
  const isEditing = !!voucher;
  const createVoucher = useCreateVoucher();
  const updateVoucher = useUpdateVoucher();
  const mutation = isEditing ? updateVoucher : createVoucher;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
  } = useForm<CreateVoucherInput>({
    resolver: zodResolver(CreateVoucherSchema),
    defaultValues: isEditing
      ? {
          categoryId: voucher.categoryId,
          description: voucher.description ?? '',
          totalAmount: centsToEuros(voucher.totalAmountCents),
          totalUnits: voucher.totalUnits,
          unitLabel: voucher.unitLabel,
          purchaseDate: voucher.purchaseDate as unknown as Date,
          expiryDate: (voucher.expiryDate ?? null) as unknown as Date | null,
        }
      : {
          description: '',
          purchaseDate: today() as unknown as Date,
          totalUnits: null,
          unitLabel: null,
          expiryDate: null,
        },
  });

  const handleCategoryChange = (categoryId: number) => {
    setValue('categoryId', categoryId, { shouldValidate: true });
  };

  const onSubmit = async (data: CreateVoucherInput) => {
    try {
      if (isEditing) {
        await updateVoucher.mutateAsync({ id: voucher.voucherId, data });
      } else {
        await createVoucher.mutateAsync(data);
      }
      onClose();
    } catch (_error) {
      // Error surfaced via mutation state
    }
  };

  const inputClasses = (hasError: boolean) =>
    cn(
      'w-full px-4 py-2.5 rounded-lg border bg-background text-foreground',
      'focus:ring-2 focus:ring-guard-primary focus:border-transparent',
      'transition-colors duration-200 ease-out-quart',
      hasError ? 'border-guard-danger' : 'border-input',
    );

  return (
    <ModalBackdrop onClose={onClose} labelledBy="voucher-form-title">
      <div className="card w-full max-w-md lg:max-w-lg animate-modal-in max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 id="voucher-form-title" className="text-xl font-bold text-foreground flex items-center gap-2">
            <Ticket className="h-5 w-5 text-guard-primary" aria-hidden="true" />
            {isEditing ? t('vouchers.form.edit-title') : t('vouchers.form.title')}
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
          <input type="hidden" {...register('categoryId', { valueAsNumber: true })} />

          {/* Category */}
          <CategorySelector
            type={TRANSACTION_TYPE.EXPENSE}
            onCategoryChange={handleCategoryChange}
            onSharedDefaultChange={() => {}}
            error={errors.categoryId?.message}
            disabled={isSubmitting}
            initialCategoryId={voucher?.categoryId}
          />

          {/* Description */}
          <div>
            <label htmlFor="voucher-description" className="block text-sm font-medium text-foreground mb-1.5">
              {t('vouchers.form.fields.description')} ({t('common.labels.optional')})
            </label>
            <input
              id="voucher-description"
              type="text"
              autoComplete="off"
              placeholder={t('vouchers.form.fields.description-placeholder')}
              {...register('description')}
              className={inputClasses(!!errors.description)}
            />
          </div>

          {/* Total amount + Purchase date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="voucher-amount" className="block text-sm font-medium text-foreground mb-1.5">
                {t('vouchers.form.fields.total-amount')}
              </label>
              <input
                id="voucher-amount"
                type="number"
                step="0.01"
                min="0.01"
                autoComplete="off"
                placeholder={t('vouchers.form.fields.total-amount-placeholder')}
                {...register('totalAmount', { valueAsNumber: true })}
                onWheel={(e) => e.currentTarget.blur()}
                className={inputClasses(!!errors.totalAmount)}
              />
              {errors.totalAmount && (
                <p role="alert" className="mt-1 text-sm text-guard-danger">
                  {errors.totalAmount.message}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="voucher-purchase-date" className="block text-sm font-medium text-foreground mb-1.5">
                {t('vouchers.form.fields.purchase-date')}
              </label>
              <input
                id="voucher-purchase-date"
                type="date"
                {...register('purchaseDate')}
                className={inputClasses(!!errors.purchaseDate)}
              />
            </div>
          </div>

          {/* Total units + Unit label */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="voucher-units" className="block text-sm font-medium text-foreground mb-1.5">
                {t('vouchers.form.fields.total-units')} ({t('common.labels.optional')})
              </label>
              <input
                id="voucher-units"
                type="number"
                step="0.01"
                min="0"
                autoComplete="off"
                placeholder={t('vouchers.form.fields.total-units-placeholder')}
                {...register('totalUnits', {
                  setValueAs: (v) => (v === '' || v == null ? null : Number(v)),
                })}
                onWheel={(e) => e.currentTarget.blur()}
                className={inputClasses(!!errors.totalUnits)}
              />
            </div>

            <div>
              <label htmlFor="voucher-unit-label" className="block text-sm font-medium text-foreground mb-1.5">
                {t('vouchers.form.fields.unit-label')} ({t('common.labels.optional')})
              </label>
              <input
                id="voucher-unit-label"
                type="text"
                autoComplete="off"
                placeholder={t('vouchers.form.fields.unit-label-placeholder')}
                {...register('unitLabel', {
                  setValueAs: (v) => (v === '' || v == null ? null : String(v)),
                })}
                className={inputClasses(!!errors.unitLabel)}
              />
            </div>
          </div>

          {/* Expiry date */}
          <div>
            <label htmlFor="voucher-expiry-date" className="block text-sm font-medium text-foreground mb-1.5">
              {t('vouchers.form.fields.expiry-date')} ({t('common.labels.optional')})
            </label>
            <input
              id="voucher-expiry-date"
              type="date"
              {...register('expiryDate', {
                setValueAs: (v) => (v === '' || v == null ? null : v),
              })}
              className={inputClasses(!!errors.expiryDate)}
            />
          </div>

          {/* Error */}
          {mutation.isError && (
            <div role="alert" className="p-3 rounded-lg bg-guard-danger/10 border border-guard-danger/20">
              <p className="text-sm text-guard-danger">
                {isEditing ? t('vouchers.form.errors.update') : t('vouchers.form.errors.create')}
              </p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting || mutation.isPending}
            className={cn(
              'w-full py-3 rounded-lg font-semibold text-white transition-all duration-200 ease-out-quart',
              'bg-guard-primary hover:bg-guard-primary/90',
              'disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
            )}
          >
            {isSubmitting || mutation.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <LoadingSpinner size="sm" className="border-white/30 border-t-white" />
                {t('vouchers.form.saving')}
              </span>
            ) : isEditing ? (
              t('vouchers.form.submit.edit')
            ) : (
              t('vouchers.form.submit.create')
            )}
          </button>
        </form>
      </div>
    </ModalBackdrop>
  );
}
