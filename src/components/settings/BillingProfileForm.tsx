'use client';

/**
 * BudgetGuard Billing Profile Form
 * Settings form for configuring invoice issuer data
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Select } from '@/components/ui/Select';
import { PAYMENT_METHOD } from '@/constants/finance';
import { useBillingProfile, useUpdateBillingProfile } from '@/hooks/useInvoices';
import { useTranslate } from '@/hooks/useTranslations';
import { type BillingProfileInput, BillingProfileSchema } from '@/schemas/invoice';
import { centsToEuros, eurosToCents } from '@/utils/money';

export function BillingProfileForm() {
  const { t } = useTranslate();
  const { data: profile, isLoading } = useBillingProfile();
  const updateProfile = useUpdateBillingProfile();

  // Hourly rate displayed in euros, stored in cents
  const [hourlyRateEuros, setHourlyRateEuros] = useState<string>('');

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
      defaultHourlyRateCents: null,
    },
  });

  // Track whether hourly rate has been modified (to enable save button)
  const [hourlyRateDirty, setHourlyRateDirty] = useState(false);

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
        defaultHourlyRateCents: profile.defaultHourlyRateCents,
      });
      setHourlyRateEuros(
        profile.defaultHourlyRateCents != null ? String(centsToEuros(profile.defaultHourlyRateCents)) : '',
      );
      setHourlyRateDirty(false);
    }
  }, [profile, reset]);

  const onSubmit = async (data: BillingProfileInput) => {
    const rateCents = hourlyRateEuros !== '' ? eurosToCents(Number(hourlyRateEuros)) : null;
    await updateProfile.mutateAsync({
      ...data,
      defaultHourlyRateCents: rateCents,
    });
    setHourlyRateDirty(false);
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
            <input id="fullName" type="text" {...register('fullName')} className="w-full input-sm" />
            {errors.fullName && <p className="text-xs text-guard-danger mt-1">{errors.fullName.message}</p>}
          </div>
          <div>
            <label htmlFor="nif" className="block text-sm font-medium text-foreground mb-1">
              NIF
            </label>
            <input id="nif" type="text" {...register('nif')} className="w-full input-sm" />
            {errors.nif && <p className="text-xs text-guard-danger mt-1">{errors.nif.message}</p>}
          </div>
        </div>

        {/* Address + Phone */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="address" className="block text-sm font-medium text-foreground mb-1">
              {t('settings.billing.fields.address')}
            </label>
            <input id="address" type="text" {...register('address')} className="w-full input-sm" />
          </div>
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-foreground mb-1">
              {t('settings.billing.fields.phone')}
            </label>
            <input id="phone" type="text" {...register('phone')} className="w-full input-sm" />
          </div>
        </div>

        {/* Default Hourly Rate */}
        <div>
          <label htmlFor="defaultHourlyRate" className="block text-sm font-medium text-foreground mb-1">
            {t('settings.billing.fields.default-hourly-rate')}
          </label>
          <input
            id="defaultHourlyRate"
            type="number"
            step="0.01"
            min="0"
            placeholder="-"
            value={hourlyRateEuros}
            onChange={(e) => {
              setHourlyRateEuros(e.target.value);
              setHourlyRateDirty(true);
            }}
            className="w-full max-w-xs input-sm"
          />
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
            <input id="bankName" type="text" {...register('bankName')} className="w-full input-sm" />
          </div>
          <div>
            <label htmlFor="swift" className="block text-sm font-medium text-foreground mb-1">
              SWIFT
            </label>
            <input id="swift" type="text" {...register('swift')} className="w-full input-sm" />
          </div>
        </div>

        <div>
          <label htmlFor="iban" className="block text-sm font-medium text-foreground mb-1">
            IBAN
          </label>
          <input id="iban" type="text" {...register('iban')} className="w-full input-sm" />
        </div>

        <div>
          <label htmlFor="bankAddress" className="block text-sm font-medium text-foreground mb-1">
            {t('settings.billing.fields.bank-address')}
          </label>
          <textarea id="bankAddress" {...register('bankAddress')} rows={2} className="w-full input-sm resize-none" />
        </div>

        {/* Submit */}
        {updateProfile.isError && <p className="text-sm text-guard-danger">{updateProfile.error.message}</p>}
        {updateProfile.isSuccess && <p className="text-sm text-guard-success">{t('settings.billing.saved')}</p>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={updateProfile.isPending || (!isDirty && !hourlyRateDirty)}
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
