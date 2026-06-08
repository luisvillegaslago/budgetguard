'use client';

/**
 * BudgetGuard Invoice Form
 * Modal for creating or editing an invoice with dynamic line items
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { type Control, type UseFormRegister, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { CompanySelector } from '@/components/ui/CompanySelector';
import { ModalBackdrop } from '@/components/ui/ModalBackdrop';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { INVOICE_BILLING_MODE, type InvoiceBillingMode, VALIDATION_KEY } from '@/constants/finance';
import { useBillingProfile, useCreateInvoice, useInvoicePrefixes, useUpdateInvoice } from '@/hooks/useInvoices';
import { useTranslate } from '@/hooks/useTranslations';
import type { Invoice } from '@/types/finance';
import { centsToEuros, eurosToCents, formatCurrency } from '@/utils/money';

// Form schema (user enters euros, we convert to cents on submit)
// SubItems are wrapped in objects so react-hook-form's useFieldArray can manage them
const SubItemFormSchema = z.object({ text: z.string() });

const LineItemFormSchema = z
  .object({
    title: z.string(),
    subItems: z.array(SubItemFormSchema),
    description: z.string(),
    hours: z.union([z.number().positive(), z.literal(''), z.null()]).optional(),
    hourlyRate: z.union([z.number().positive(), z.literal(''), z.null()]).optional(),
    amount: z.union([z.number().positive(), z.literal(''), z.null()]).optional(),
  })
  // Each line must resolve to a positive amount (direct or hours × rate auto-fill).
  .refine((item) => typeof item.amount === 'number' && item.amount > 0, {
    message: VALIDATION_KEY.AMOUNT_POSITIVE,
    path: ['amount'],
  });

const InvoiceFormSchema = z.object({
  prefixId: z.number().int().positive(VALIDATION_KEY.SELECT_PREFIX),
  invoiceDate: z.string().min(1, VALIDATION_KEY.DATE_REQUIRED),
  companyId: z.number().int().positive(VALIDATION_KEY.SELECT_CLIENT),
  notes: z.string().optional(),
  lineItems: z.array(LineItemFormSchema).min(1, VALIDATION_KEY.LINE_ITEMS_REQUIRED),
});

type InvoiceFormValues = z.infer<typeof InvoiceFormSchema>;

function detectBillingMode(invoice?: Invoice): InvoiceBillingMode {
  if (!invoice) return INVOICE_BILLING_MODE.HOURLY;
  const hasHourly = invoice.lineItems.some((item) => item.hours != null || item.hourlyRateCents != null);
  return hasHourly ? INVOICE_BILLING_MODE.HOURLY : INVOICE_BILLING_MODE.FLAT;
}

interface InvoiceFormProps {
  onClose: () => void;
  onCreated?: (invoiceId: number) => void;
  invoice?: Invoice;
}

function buildDefaultValues(invoice?: Invoice, defaultHourlyRateCents?: number | null): InvoiceFormValues {
  const defaultRate = defaultHourlyRateCents != null ? centsToEuros(defaultHourlyRateCents) : ('' as const);

  if (!invoice) {
    const today = new Date().toISOString().split('T')[0] ?? '';
    return {
      prefixId: 0,
      invoiceDate: today,
      companyId: 0,
      notes: '',
      lineItems: [{ title: '', subItems: [], description: '', hours: '', hourlyRate: defaultRate, amount: '' }],
    };
  }

  return {
    prefixId: invoice.prefixId,
    invoiceDate: invoice.invoiceDate,
    companyId: invoice.companyId ?? 0,
    notes: invoice.notes ?? '',
    lineItems: invoice.lineItems.map((item) => ({
      title: item.title ?? '',
      subItems: item.subItems.map((text) => ({ text })),
      description: item.description ?? '',
      hours: item.hours ?? ('' as const),
      hourlyRate: item.hourlyRateCents != null ? centsToEuros(item.hourlyRateCents) : ('' as const),
      amount: centsToEuros(item.amountCents),
    })),
  };
}

interface SubItemsEditorProps {
  control: Control<InvoiceFormValues>;
  register: UseFormRegister<InvoiceFormValues>;
  lineItemIndex: number;
}

function SubItemsEditor({ control, register, lineItemIndex }: SubItemsEditorProps) {
  const { t } = useTranslate();
  const { fields, append, remove } = useFieldArray({
    control,
    name: `lineItems.${lineItemIndex}.subItems`,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="block text-xs text-guard-muted">{t('invoices.form.fields.sub-items')}</span>
        <button
          type="button"
          onClick={() => append({ text: '' })}
          className="text-xs text-guard-primary hover:text-guard-primary/80 flex items-center gap-1"
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
          {t('invoices.form.add-sub-item')}
        </button>
      </div>
      {fields.length === 0 ? (
        <p className="text-xs text-guard-muted italic">{t('invoices.form.fields.no-sub-items')}</p>
      ) : (
        <ul className="space-y-1.5">
          {fields.map((field, subIndex) => (
            <li key={field.id} className="flex items-center gap-2">
              <span className="text-guard-muted text-xs">•</span>
              <input
                type="text"
                {...register(`lineItems.${lineItemIndex}.subItems.${subIndex}.text`)}
                placeholder={t('invoices.form.fields.sub-item-placeholder')}
                className="flex-1 input-sm"
              />
              <button
                type="button"
                onClick={() => remove(subIndex)}
                className="p-1 text-guard-muted hover:text-guard-danger transition-colors"
                aria-label={t('common.buttons.delete')}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function InvoiceForm({ onClose, onCreated, invoice }: InvoiceFormProps) {
  const { t } = useTranslate();
  const toast = useToast();
  const { data: prefixes } = useInvoicePrefixes();
  const { data: billingProfile } = useBillingProfile();
  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();

  const isEditing = !!invoice;
  const mutation = isEditing ? updateInvoice : createInvoice;

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<InvoiceFormValues>({
    resolver: zodResolver(InvoiceFormSchema),
    defaultValues: buildDefaultValues(invoice, billingProfile?.defaultHourlyRateCents),
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'lineItems' });

  const [billingMode, setBillingMode] = useState<InvoiceBillingMode>(detectBillingMode(invoice));
  const isFlat = billingMode === INVOICE_BILLING_MODE.FLAT;

  const watchedPrefixId = useWatch({ control, name: 'prefixId' });
  const watchedCompanyId = useWatch({ control, name: 'companyId' });
  const watchedLineItems = useWatch({ control, name: 'lineItems' });

  const selectedPrefix = prefixes?.find((p) => p.prefixId === Number(watchedPrefixId));
  const previewNumber = isEditing
    ? invoice.invoiceNumber
    : selectedPrefix
      ? `${selectedPrefix.prefix}-${String(selectedPrefix.nextNumber).padStart(2, '0')}`
      : null;

  // Auto-select prefix when company changes and a matching prefix exists
  const handleCompanyChange = (companyId: number | null) => {
    setValue('companyId', companyId ?? 0);
    if (!isEditing && prefixes) {
      const matchingPrefix = companyId ? prefixes.find((p) => p.companyId === companyId) : null;
      setValue('prefixId', matchingPrefix ? matchingPrefix.prefixId : 0);
    }
  };

  // If the selected company has an associated prefix, show it as read-only text
  const companyPrefix =
    !isEditing && watchedCompanyId > 0 ? (prefixes?.find((p) => p.companyId === watchedCompanyId) ?? null) : null;

  // Calculate total (guard against NaN from empty valueAsNumber inputs)
  const toNum = (v: unknown): number | null => {
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    return null;
  };

  const totalEuros = (watchedLineItems ?? []).reduce((sum, item) => {
    const hours = toNum(item.hours);
    const rate = toNum(item.hourlyRate);
    const amount = toNum(item.amount);

    if (!isFlat && hours != null && rate != null) return sum + hours * rate;
    if (amount != null) return sum + amount;
    return sum;
  }, 0);

  const buildLineItems = (values: InvoiceFormValues) =>
    values.lineItems.map((item) => {
      const hours = typeof item.hours === 'number' && item.hours > 0 ? item.hours : null;
      const hourlyRate = typeof item.hourlyRate === 'number' && item.hourlyRate > 0 ? item.hourlyRate : null;
      const directAmount = typeof item.amount === 'number' && item.amount > 0 ? item.amount : null;

      const title = item.title.trim();
      const description = item.description.trim();
      const subItems = item.subItems.map((sub) => sub.text.trim()).filter((text) => text.length > 0);

      const base = {
        title: title.length > 0 ? title : null,
        subItems,
        description: description.length > 0 ? description : null,
      };

      if (!isFlat && hours != null && hourlyRate != null) {
        const hourlyRateCents = eurosToCents(hourlyRate);
        return {
          ...base,
          hours,
          hourlyRateCents,
          amountCents: Math.round(hours * hourlyRateCents),
        };
      }

      return {
        ...base,
        hours: null,
        hourlyRateCents: null,
        amountCents: directAmount ? eurosToCents(directAmount) : 0,
      };
    });

  const onSubmit = async (values: InvoiceFormValues) => {
    const lineItems = buildLineItems(values);

    try {
      if (isEditing) {
        await updateInvoice.mutateAsync({
          invoiceId: invoice.invoiceId,
          data: {
            invoiceDate: new Date(values.invoiceDate),
            lineItems,
            notes: values.notes || null,
          },
        });
        toast.success(t('invoices.toast.updated'));
      } else {
        const created = await createInvoice.mutateAsync({
          prefixId: Number(values.prefixId),
          invoiceDate: new Date(values.invoiceDate),
          companyId: Number(values.companyId),
          lineItems,
          notes: values.notes || null,
        });
        toast.success(t('invoices.toast.created'));
        onCreated?.(created.invoiceId);
      }
      onClose();
    } catch {
      // Error handled by mutation state
    }
  };

  const handleBillingModeChange = (next: InvoiceBillingMode) => {
    if (next === billingMode) return;
    setBillingMode(next);
    if (next === INVOICE_BILLING_MODE.FLAT) {
      fields.forEach((_, idx) => {
        setValue(`lineItems.${idx}.hours`, '' as unknown as number);
        setValue(`lineItems.${idx}.hourlyRate`, '' as unknown as number);
      });
    }
  };

  // Auto-calculate amount when hours and rate change
  const handleLineItemChange = (index: number, field: 'hours' | 'hourlyRate', value: string) => {
    const numValue = value === '' ? '' : Number(value);
    setValue(`lineItems.${index}.${field}`, numValue as number);

    const currentItem = watchedLineItems?.[index];
    if (!currentItem) return;

    const hours =
      field === 'hours'
        ? typeof numValue === 'number'
          ? numValue
          : null
        : typeof currentItem.hours === 'number'
          ? currentItem.hours
          : null;
    const rate =
      field === 'hourlyRate'
        ? typeof numValue === 'number'
          ? numValue
          : null
        : typeof currentItem.hourlyRate === 'number'
          ? currentItem.hourlyRate
          : null;

    if (hours != null && rate != null && hours > 0 && rate > 0) {
      setValue(`lineItems.${index}.amount`, Number((hours * rate).toFixed(2)));
    }
  };

  return (
    <ModalBackdrop onClose={onClose} labelledBy="invoice-form-title">
      <div className="bg-card rounded-xl shadow-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto animate-modal-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 id="invoice-form-title" className="text-lg font-semibold text-foreground">
              {isEditing ? t('invoices.form.edit-title') : t('invoices.form.title')}
            </h2>
            {previewNumber && <p className="text-sm text-guard-primary font-medium mt-0.5">{previewNumber}</p>}
          </div>
          <button type="button" onClick={onClose} className="p-1 hover:bg-muted rounded-lg transition-colors">
            <X className="h-5 w-5 text-guard-muted" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5">
          {/* Client */}
          <div>
            <span className="block text-sm font-medium text-foreground mb-1">{t('invoices.form.fields.client')}</span>
            <CompanySelector value={watchedCompanyId || null} onChange={handleCompanyChange} disabled={isEditing} />
            {errors.companyId && (
              <p role="alert" className="text-xs text-guard-danger mt-1">
                {t(errors.companyId.message ?? '')}
              </p>
            )}
          </div>

          {/* Prefix + Date row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="prefixId" className="block text-sm font-medium text-foreground mb-1">
                {t('invoices.form.fields.prefix')}
              </label>
              {companyPrefix || isEditing ? (
                <div className="w-full px-3 py-2 rounded-lg border border-input bg-muted/30 text-foreground text-sm">
                  {selectedPrefix?.prefix ?? '—'}
                </div>
              ) : (
                <Select id="prefixId" {...register('prefixId', { valueAsNumber: true })}>
                  <option value={0}>{t('invoices.form.fields.select-prefix')}</option>
                  {prefixes?.map((p) => (
                    <option key={p.prefixId} value={p.prefixId}>
                      {p.prefix} ({t('invoices.form.fields.next')}: {p.nextNumber})
                    </option>
                  ))}
                </Select>
              )}
              {errors.prefixId && (
                <p role="alert" className="text-xs text-guard-danger mt-1">
                  {t(errors.prefixId.message ?? '')}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="invoiceDate" className="block text-sm font-medium text-foreground mb-1">
                {t('invoices.form.fields.date')}
              </label>
              <input id="invoiceDate" type="date" {...register('invoiceDate')} className="w-full input-sm" />
              {errors.invoiceDate && (
                <p role="alert" className="text-xs text-guard-danger mt-1">
                  {t(errors.invoiceDate.message ?? '')}
                </p>
              )}
            </div>
          </div>

          {/* Billing mode toggle */}
          <fieldset className="border-0 p-0 m-0">
            <legend className="block text-sm font-medium text-foreground mb-1">
              {t('invoices.form.billing-mode.label')}
            </legend>
            <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
              <button
                type="button"
                onClick={() => handleBillingModeChange(INVOICE_BILLING_MODE.HOURLY)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  !isFlat ? 'bg-card text-foreground shadow-sm' : 'text-guard-muted hover:text-foreground'
                }`}
              >
                {t('invoices.form.billing-mode.hourly')}
              </button>
              <button
                type="button"
                onClick={() => handleBillingModeChange(INVOICE_BILLING_MODE.FLAT)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  isFlat ? 'bg-card text-foreground shadow-sm' : 'text-guard-muted hover:text-foreground'
                }`}
              >
                {t('invoices.form.billing-mode.flat')}
              </button>
            </div>
          </fieldset>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="block text-sm font-medium text-foreground">{t('invoices.form.fields.line-items')}</span>
              <button
                type="button"
                onClick={() =>
                  append({
                    title: '',
                    subItems: [],
                    description: '',
                    hours: '',
                    hourlyRate:
                      !isFlat && billingProfile?.defaultHourlyRateCents != null
                        ? centsToEuros(billingProfile.defaultHourlyRateCents)
                        : '',
                    amount: '',
                  })
                }
                className="text-xs text-guard-primary hover:text-guard-primary/80 flex items-center gap-1"
              >
                <Plus className="h-3 w-3" aria-hidden="true" />
                {t('invoices.form.add-line')}
              </button>
            </div>

            <div className="space-y-3">
              {fields.map((field, index) => (
                <div key={field.id} className="rounded-lg border border-border p-3 space-y-3">
                  {/* Title + remove */}
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <span className="block text-xs text-guard-muted mb-0.5">{t('invoices.form.fields.title')}</span>
                      <input
                        type="text"
                        {...register(`lineItems.${index}.title`)}
                        placeholder={t('invoices.form.fields.title-placeholder')}
                        className="w-full input-sm font-medium"
                      />
                    </div>
                    {fields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        className="mt-5 p-2 text-guard-muted hover:text-guard-danger transition-colors shrink-0"
                        aria-label={t('common.buttons.delete')}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>

                  {/* Sub-items */}
                  <SubItemsEditor control={control} register={register} lineItemIndex={index} />

                  {/* Optional description */}
                  <div>
                    <span className="block text-xs text-guard-muted mb-0.5">
                      {t('invoices.form.fields.description-optional')}
                    </span>
                    <textarea
                      {...register(`lineItems.${index}.description`)}
                      rows={2}
                      className="w-full input-sm resize-none"
                    />
                  </div>

                  {/* Numeric fields row */}
                  <div className={isFlat ? 'grid grid-cols-1 gap-2' : 'grid grid-cols-3 gap-2'}>
                    {!isFlat && (
                      <>
                        <div>
                          <span className="block text-xs text-guard-muted mb-0.5">
                            {t('invoices.form.fields.hours')}
                          </span>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            placeholder="-"
                            {...register(`lineItems.${index}.hours`, { valueAsNumber: true })}
                            onChange={(e) => handleLineItemChange(index, 'hours', e.target.value)}
                            className="w-full input-sm"
                          />
                        </div>
                        <div>
                          <span className="block text-xs text-guard-muted mb-0.5">
                            {t('invoices.form.fields.hourly-rate')}
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="-"
                            {...register(`lineItems.${index}.hourlyRate`, { valueAsNumber: true })}
                            onChange={(e) => handleLineItemChange(index, 'hourlyRate', e.target.value)}
                            className="w-full input-sm"
                          />
                        </div>
                      </>
                    )}
                    <div>
                      <span className="block text-xs text-guard-muted mb-0.5">{t('invoices.form.fields.amount')}</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        {...register(`lineItems.${index}.amount`, { valueAsNumber: true })}
                        className="w-full input-sm"
                      />
                      {errors.lineItems?.[index]?.amount && (
                        <p role="alert" className="text-xs text-guard-danger mt-1">
                          {t(errors.lineItems[index]?.amount?.message ?? '')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Total */}
          <div className="flex justify-end items-center gap-3 pt-2 border-t border-border">
            <span className="text-sm font-medium text-guard-muted">{t('invoices.form.total')}:</span>
            <span className="text-lg font-bold text-foreground">{formatCurrency(eurosToCents(totalEuros))}</span>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-foreground mb-1">
              {t('invoices.form.fields.notes')}{' '}
              <span className="text-guard-muted text-xs">({t('common.labels.optional')})</span>
            </label>
            <textarea id="notes" {...register('notes')} rows={2} className="w-full input-sm resize-none" />
          </div>

          {/* Actions */}
          {mutation.errorMessage && <p className="text-sm text-guard-danger">{mutation.errorMessage}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              {t('common.buttons.cancel')}
            </button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary flex items-center gap-2">
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {isEditing ? t('common.buttons.save') : t('common.buttons.create')}
            </button>
          </div>
        </form>
      </div>
    </ModalBackdrop>
  );
}
