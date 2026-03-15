'use client';

/**
 * BudgetGuard Invoice Form
 * Modal for creating or editing an invoice with dynamic line items
 */

import { Loader2, Plus, Trash2, X } from 'lucide-react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { CompanySelector } from '@/components/ui/CompanySelector';
import { ModalBackdrop } from '@/components/ui/ModalBackdrop';
import { Select } from '@/components/ui/Select';
import { VALIDATION_KEY } from '@/constants/finance';
import { useBillingProfile, useCreateInvoice, useInvoicePrefixes, useUpdateInvoice } from '@/hooks/useInvoices';
import { useTranslate } from '@/hooks/useTranslations';
import type { Invoice } from '@/types/finance';
import { centsToEuros, eurosToCents } from '@/utils/money';

// Form schema (user enters euros, we convert to cents on submit)
const LineItemFormSchema = z.object({
  description: z.string().min(1, VALIDATION_KEY.DESCRIPTION_REQUIRED),
  hours: z.union([z.number().positive(), z.literal(''), z.null()]).optional(),
  hourlyRate: z.union([z.number().positive(), z.literal(''), z.null()]).optional(),
  amount: z.union([z.number().positive(), z.literal(''), z.null()]).optional(),
});

const InvoiceFormSchema = z.object({
  prefixId: z.number().int().positive(VALIDATION_KEY.SELECT_PREFIX),
  invoiceDate: z.string().min(1, VALIDATION_KEY.DATE_REQUIRED),
  companyId: z.number().int().positive(VALIDATION_KEY.SELECT_CLIENT),
  notes: z.string().optional(),
  lineItems: z.array(LineItemFormSchema).min(1),
});

type InvoiceFormValues = z.infer<typeof InvoiceFormSchema>;

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
      lineItems: [{ description: '', hours: '', hourlyRate: defaultRate, amount: '' }],
    };
  }

  return {
    prefixId: invoice.prefixId,
    invoiceDate: invoice.invoiceDate,
    companyId: invoice.companyId ?? 0,
    notes: invoice.notes ?? '',
    lineItems: invoice.lineItems.map((item) => ({
      description: item.description,
      hours: item.hours ?? ('' as const),
      hourlyRate: item.hourlyRateCents != null ? centsToEuros(item.hourlyRateCents) : ('' as const),
      amount: centsToEuros(item.amountCents),
    })),
  };
}

export function InvoiceForm({ onClose, onCreated, invoice }: InvoiceFormProps) {
  const { t } = useTranslate();
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
    defaultValues: buildDefaultValues(invoice, billingProfile?.defaultHourlyRateCents),
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'lineItems' });

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

    if (hours != null && rate != null) return sum + hours * rate;
    if (amount != null) return sum + amount;
    return sum;
  }, 0);

  const buildLineItems = (values: InvoiceFormValues) =>
    values.lineItems.map((item) => {
      const hours = typeof item.hours === 'number' && item.hours > 0 ? item.hours : null;
      const hourlyRate = typeof item.hourlyRate === 'number' && item.hourlyRate > 0 ? item.hourlyRate : null;
      const directAmount = typeof item.amount === 'number' && item.amount > 0 ? item.amount : null;

      if (hours != null && hourlyRate != null) {
        const hourlyRateCents = eurosToCents(hourlyRate);
        return {
          description: item.description,
          hours,
          hourlyRateCents,
          amountCents: Math.round(hours * hourlyRateCents),
        };
      }

      return {
        description: item.description,
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
      } else {
        const created = await createInvoice.mutateAsync({
          prefixId: Number(values.prefixId),
          invoiceDate: new Date(values.invoiceDate),
          companyId: Number(values.companyId),
          lineItems,
          notes: values.notes || null,
        });
        onCreated?.(created.invoiceId);
      }
      onClose();
    } catch {
      // Error handled by mutation state
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
            {errors.companyId && <p className="text-xs text-guard-danger mt-1">{errors.companyId.message}</p>}
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
              {errors.prefixId && <p className="text-xs text-guard-danger mt-1">{errors.prefixId.message}</p>}
            </div>

            <div>
              <label htmlFor="invoiceDate" className="block text-sm font-medium text-foreground mb-1">
                {t('invoices.form.fields.date')}
              </label>
              <input id="invoiceDate" type="date" {...register('invoiceDate')} className="w-full input-sm" />
              {errors.invoiceDate && <p className="text-xs text-guard-danger mt-1">{errors.invoiceDate.message}</p>}
            </div>
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="block text-sm font-medium text-foreground">{t('invoices.form.fields.line-items')}</span>
              <button
                type="button"
                onClick={() =>
                  append({
                    description: '',
                    hours: '',
                    hourlyRate:
                      billingProfile?.defaultHourlyRateCents != null
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
                <div key={field.id} className="rounded-lg border border-border p-3 space-y-2">
                  {/* Description row */}
                  <div className="flex items-start gap-2">
                    <textarea
                      {...register(`lineItems.${index}.description`)}
                      placeholder={t('invoices.form.fields.description')}
                      rows={3}
                      className="w-full input-sm resize-none"
                    />
                    {fields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        className="p-2 text-guard-muted hover:text-guard-danger transition-colors shrink-0"
                        aria-label={t('common.buttons.delete')}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  {/* Numeric fields row */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <span className="block text-xs text-guard-muted mb-0.5">{t('invoices.form.fields.hours')}</span>
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
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Total */}
          <div className="flex justify-end items-center gap-3 pt-2 border-t border-border">
            <span className="text-sm font-medium text-guard-muted">{t('invoices.form.total')}:</span>
            <span className="text-lg font-bold text-foreground">
              {new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
                totalEuros,
              )}{' '}
              €
            </span>
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
