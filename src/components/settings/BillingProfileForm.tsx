'use client';

/**
 * BudgetGuard Billing Profile Form
 * Settings form for configuring invoice issuer data
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Save } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Select } from '@/components/ui/Select';
import { PAYMENT_METHOD } from '@/constants/finance';
import { useBillingProfile, useUpdateBillingProfile } from '@/hooks/useInvoices';
import { useTranslate } from '@/hooks/useTranslations';
import { type BillingProfileInput, BillingProfileSchema } from '@/schemas/invoice';

export function BillingProfileForm() {
  const { t } = useTranslate();
  const { data: profile, isLoading } = useBillingProfile();
  const updateProfile = useUpdateBillingProfile();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<BillingProfileInput>({
    resolver: zodResolver(BillingProfileSchema),
    defaultValues: {
      fullName: '',
      nif: '',
      address: '',
      phone: '',
      paymentMethod: PAYMENT_METHOD.BANK_TRANSFER,
      bankName: '',
      iban: '',
      swift: '',
      bankAddress: '',
    },
  });

  // Populate form with existing profile
  useEffect(() => {
    if (profile) {
      reset({
        fullName: profile.fullName,
        nif: profile.nif,
        address: profile.address ?? '',
        phone: profile.phone ?? '',
        paymentMethod: profile.paymentMethod,
        bankName: profile.bankName ?? '',
        iban: profile.iban ?? '',
        swift: profile.swift ?? '',
        bankAddress: profile.bankAddress ?? '',
      });
    }
  }, [profile, reset]);

  const onSubmit = async (data: BillingProfileInput) => {
    await updateProfile.mutateAsync(data);
  };

  if (isLoading) {
    return <div className="h-48 bg-muted/50 rounded-lg animate-pulse" />;
  }

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <h3 className="text-base font-semibold text-foreground mb-4">{t('settings.billing.profile-title')}</h3>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Name + NIF */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-foreground mb-1">
              {t('settings.billing.fields.full-name')}
            </label>
            <input
              id="fullName"
              type="text"
              {...register('fullName')}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:ring-2 focus:ring-guard-primary"
            />
            {errors.fullName && <p className="text-xs text-guard-danger mt-1">{errors.fullName.message}</p>}
          </div>
          <div>
            <label htmlFor="nif" className="block text-sm font-medium text-foreground mb-1">
              NIF
            </label>
            <input
              id="nif"
              type="text"
              {...register('nif')}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:ring-2 focus:ring-guard-primary"
            />
            {errors.nif && <p className="text-xs text-guard-danger mt-1">{errors.nif.message}</p>}
          </div>
        </div>

        {/* Address + Phone */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="address" className="block text-sm font-medium text-foreground mb-1">
              {t('settings.billing.fields.address')}
            </label>
            <input
              id="address"
              type="text"
              {...register('address')}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:ring-2 focus:ring-guard-primary"
            />
          </div>
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-foreground mb-1">
              {t('settings.billing.fields.phone')}
            </label>
            <input
              id="phone"
              type="text"
              {...register('phone')}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:ring-2 focus:ring-guard-primary"
            />
          </div>
        </div>

        {/* Payment Method */}
        <div>
          <label htmlFor="paymentMethod" className="block text-sm font-medium text-foreground mb-1">
            {t('settings.billing.fields.payment-method')}
          </label>
          <Select id="paymentMethod" {...register('paymentMethod')}>
            <option value={PAYMENT_METHOD.BANK_TRANSFER}>{t('settings.billing.payment-methods.bank-transfer')}</option>
            <option value={PAYMENT_METHOD.PAYPAL}>PayPal</option>
            <option value={PAYMENT_METHOD.OTHER}>{t('settings.billing.payment-methods.other')}</option>
          </Select>
        </div>

        {/* Bank details */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="bankName" className="block text-sm font-medium text-foreground mb-1">
              {t('settings.billing.fields.bank-name')}
            </label>
            <input
              id="bankName"
              type="text"
              {...register('bankName')}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:ring-2 focus:ring-guard-primary"
            />
          </div>
          <div>
            <label htmlFor="swift" className="block text-sm font-medium text-foreground mb-1">
              SWIFT
            </label>
            <input
              id="swift"
              type="text"
              {...register('swift')}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:ring-2 focus:ring-guard-primary"
            />
          </div>
        </div>

        <div>
          <label htmlFor="iban" className="block text-sm font-medium text-foreground mb-1">
            IBAN
          </label>
          <input
            id="iban"
            type="text"
            {...register('iban')}
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:ring-2 focus:ring-guard-primary"
          />
        </div>

        <div>
          <label htmlFor="bankAddress" className="block text-sm font-medium text-foreground mb-1">
            {t('settings.billing.fields.bank-address')}
          </label>
          <textarea
            id="bankAddress"
            {...register('bankAddress')}
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:ring-2 focus:ring-guard-primary resize-none"
          />
        </div>

        {/* Submit */}
        {updateProfile.isError && <p className="text-sm text-guard-danger">{updateProfile.error.message}</p>}
        {updateProfile.isSuccess && <p className="text-sm text-guard-success">{t('settings.billing.saved')}</p>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={updateProfile.isPending || !isDirty}
            className="btn-primary flex items-center gap-2"
          >
            {updateProfile.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            {t('common.buttons.save')}
          </button>
        </div>
      </form>
    </div>
  );
}
