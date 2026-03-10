'use client';

/**
 * BudgetGuard Company Form Modal
 * Modal for creating and editing companies with all 7 fields
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ModalBackdrop } from '@/components/ui/ModalBackdrop';
import { Select } from '@/components/ui/Select';
import { useCreateCompany, useUpdateCompany } from '@/hooks/useCompanies';
import { useTranslate } from '@/hooks/useTranslations';
import { type CreateCompanyInput, CreateCompanySchema } from '@/schemas/company';
import type { Company } from '@/types/finance';
import { cn } from '@/utils/helpers';

interface CompanyFormModalProps {
  onClose: () => void;
  company?: Company;
}

export function CompanyFormModal({ onClose, company }: CompanyFormModalProps) {
  const { t } = useTranslate();
  const isEditing = !!company;
  const createMutation = useCreateCompany();
  const updateMutation = useUpdateCompany();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateCompanyInput>({
    resolver: zodResolver(CreateCompanySchema),
    defaultValues: {
      name: company?.name ?? '',
      tradingName: company?.tradingName ?? null,
      taxId: company?.taxId ?? null,
      address: company?.address ?? null,
      city: company?.city ?? null,
      postalCode: company?.postalCode ?? null,
      country: company?.country ?? null,
      invoiceLanguage: company?.invoiceLanguage ?? null,
    },
  });

  const onSubmit = async (data: CreateCompanyInput) => {
    try {
      if (isEditing && company) {
        await updateMutation.mutateAsync({ id: company.companyId, data });
      } else {
        await createMutation.mutateAsync(data);
      }
      onClose();
    } catch {
      // Error handled by mutation state
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const isError = createMutation.isError || updateMutation.isError;

  const inputClass = (hasError: boolean) =>
    cn(
      'w-full px-4 py-2.5 rounded-lg border bg-background text-foreground',
      'focus:ring-2 focus:ring-guard-primary focus:border-transparent',
      'transition-colors duration-200 ease-out-quart',
      hasError ? 'border-guard-danger' : 'border-input',
    );

  return (
    <ModalBackdrop onClose={onClose} labelledBy="company-form-title">
      <div className="card w-full max-w-md animate-modal-in max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 id="company-form-title" className="text-xl font-bold text-foreground">
            {isEditing ? t('companies.form.title-edit') : t('companies.form.title-create')}
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
          {/* Name (required) */}
          <div>
            <label htmlFor="company-name" className="block text-sm font-medium text-foreground mb-1.5">
              {t('companies.form.fields.name')} *
            </label>
            <input
              id="company-name"
              type="text"
              autoComplete="off"
              placeholder={t('companies.form.fields.name-placeholder')}
              {...register('name')}
              className={inputClass(!!errors.name)}
            />
            {errors.name && (
              <p role="alert" className="mt-1 text-sm text-guard-danger">
                {errors.name.message}
              </p>
            )}
          </div>

          {/* Trading Name */}
          <div>
            <label htmlFor="company-tradingName" className="block text-sm font-medium text-foreground mb-1.5">
              {t('companies.form.fields.trading-name')} ({t('common.labels.optional')})
            </label>
            <input
              id="company-tradingName"
              type="text"
              autoComplete="off"
              {...register('tradingName')}
              className={inputClass(false)}
            />
          </div>

          {/* Tax ID */}
          <div>
            <label htmlFor="company-taxId" className="block text-sm font-medium text-foreground mb-1.5">
              {t('companies.form.fields.tax-id')} ({t('common.labels.optional')})
            </label>
            <input
              id="company-taxId"
              type="text"
              autoComplete="off"
              placeholder={t('companies.form.fields.tax-id-placeholder')}
              {...register('taxId')}
              className={inputClass(false)}
            />
          </div>

          {/* Address */}
          <div>
            <label htmlFor="company-address" className="block text-sm font-medium text-foreground mb-1.5">
              {t('companies.form.fields.address')} ({t('common.labels.optional')})
            </label>
            <input
              id="company-address"
              type="text"
              autoComplete="off"
              {...register('address')}
              className={inputClass(false)}
            />
          </div>

          {/* City + Postal Code */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="company-city" className="block text-sm font-medium text-foreground mb-1.5">
                {t('companies.form.fields.city')} ({t('common.labels.optional')})
              </label>
              <input
                id="company-city"
                type="text"
                autoComplete="off"
                {...register('city')}
                className={inputClass(false)}
              />
            </div>
            <div>
              <label htmlFor="company-postalCode" className="block text-sm font-medium text-foreground mb-1.5">
                {t('companies.form.fields.postal-code')} ({t('common.labels.optional')})
              </label>
              <input
                id="company-postalCode"
                type="text"
                autoComplete="off"
                {...register('postalCode')}
                className={inputClass(false)}
              />
            </div>
          </div>

          {/* Country + Invoice Language */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="company-country" className="block text-sm font-medium text-foreground mb-1.5">
                {t('companies.form.fields.country')} ({t('common.labels.optional')})
              </label>
              <input
                id="company-country"
                type="text"
                autoComplete="off"
                {...register('country')}
                className={inputClass(false)}
              />
            </div>
            <div>
              <label htmlFor="company-invoiceLanguage" className="block text-sm font-medium text-foreground mb-1.5">
                {t('companies.form.fields.invoice-language')} ({t('common.labels.optional')})
              </label>
              <Select id="company-invoiceLanguage" {...register('invoiceLanguage')}>
                <option value="">{t('companies.form.fields.invoice-language-default')}</option>
                <option value="es">{t('companies.form.fields.invoice-language-es')}</option>
                <option value="en">{t('companies.form.fields.invoice-language-en')}</option>
              </Select>
            </div>
          </div>

          {/* Error */}
          {isError && (
            <div role="alert" className="p-3 rounded-lg bg-guard-danger/10 border border-guard-danger/20">
              <p className="text-sm text-guard-danger">
                {isEditing ? t('companies.form.errors.update') : t('companies.form.errors.create')}
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
              'bg-guard-primary hover:bg-guard-primary/90',
            )}
          >
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <LoadingSpinner size="sm" className="border-white/30 border-t-white" />
                {t('companies.form.saving')}
              </span>
            ) : isEditing ? (
              t('companies.form.submit-edit')
            ) : (
              t('companies.form.submit-create')
            )}
          </button>
        </form>
      </div>
    </ModalBackdrop>
  );
}
