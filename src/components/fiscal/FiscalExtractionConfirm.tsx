'use client';

/**
 * OCR Extraction Confirmation Modal
 * Shows extracted invoice data with editable fields for review before creating a transaction.
 * Reuses CategorySelector for consistent category selection behavior.
 */

import { AlertTriangle, FileText, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CategorySelector } from '@/components/transactions/CategorySelector';
import { CompanySelector } from '@/components/ui/CompanySelector';
import { ModalBackdrop } from '@/components/ui/ModalBackdrop';
import type { TransactionType } from '@/constants/finance';
import { COMPANY_ROLE, TRANSACTION_TYPE } from '@/constants/finance';
import { useCategories } from '@/hooks/useCategories';
import { useCompanies, useQuickCreateCompany } from '@/hooks/useCompanies';
import { useLinkTransaction } from '@/hooks/useFiscalDocuments';
import { useTranslate } from '@/hooks/useTranslations';
import type { ExtractedInvoiceData } from '@/types/finance';
import { cn } from '@/utils/helpers';
import { centsToEuros, eurosToCents } from '@/utils/money';

interface FiscalExtractionConfirmProps {
  documentId: number;
  extractedData: ExtractedInvoiceData;
  onClose: () => void;
  onSuccess: () => void;
}

const INPUT_CLASSES = cn(
  'w-full px-4 py-2.5 rounded-lg border border-input bg-background text-foreground',
  'focus:ring-2 focus:ring-guard-primary focus:border-transparent',
  'transition-colors duration-200 ease-out-quart',
);

const LOW_CONFIDENCE_THRESHOLD = 0.75;

export function FiscalExtractionConfirm({
  documentId,
  extractedData,
  onClose,
  onSuccess,
}: FiscalExtractionConfirmProps) {
  const { t } = useTranslate();
  const linkMutation = useLinkTransaction();

  // Editable form state (amounts in euros for display)
  const [amount, setAmount] = useState(centsToEuros(extractedData.totalAmountCents).toString());
  const [date, setDate] = useState(extractedData.date ?? '');
  const [description, setDescription] = useState(extractedData.description ?? '');
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState(extractedData.invoiceNumber ?? '');
  const [vatPercent, setVatPercent] = useState<string>(
    extractedData.vatPercent != null ? String(extractedData.vatPercent) : '',
  );
  const [deductionPercent, setDeductionPercent] = useState('100');
  const [type, setType] = useState<TransactionType>(TRANSACTION_TYPE.EXPENSE);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [isShared, setIsShared] = useState(false);
  const [categoryError, setCategoryError] = useState('');

  const { data: categories } = useCategories(type);
  const { data: companies } = useCompanies();
  const quickCreate = useQuickCreateCompany();

  // Auto-match detected vendor with existing companies
  const detectedVendor = extractedData.vendor;
  const autoMatchedCompany = useMemo(() => {
    if (!detectedVendor || !companies?.length) return null;
    const vendorLower = detectedVendor.toLowerCase();
    return (
      companies.find((c) => c.name.toLowerCase().includes(vendorLower) || vendorLower.includes(c.name.toLowerCase())) ??
      null
    );
  }, [detectedVendor, companies]);

  // Pre-select matched company on first load
  useEffect(() => {
    if (autoMatchedCompany && companyId === null) {
      setCompanyId(autoMatchedCompany.companyId);
    }
  }, [autoMatchedCompany, companyId]);

  const lowConfidence = extractedData.confidence < LOW_CONFIDENCE_THRESHOLD;

  const handleCategoryChange = useCallback(
    (id: number) => {
      setCategoryId(id);
      setCategoryError('');

      // Apply category defaults for VAT and deduction
      const flatCategories = categories ?? [];
      let found = flatCategories.find((c) => c.categoryId === id);
      if (!found) {
        flatCategories.forEach((parent) => {
          const sub = parent.subcategories?.find((s) => s.categoryId === id);
          if (sub) found = sub;
        });
      }
      if (found) {
        if (found.defaultVatPercent != null && !vatPercent) {
          setVatPercent(String(found.defaultVatPercent));
        }
        if (found.defaultDeductionPercent != null) {
          setDeductionPercent(String(found.defaultDeductionPercent));
        }
      }
    },
    [categories, vatPercent],
  );

  const handleSharedDefaultChange = useCallback((defaultShared: boolean) => {
    setIsShared(defaultShared);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!categoryId) {
      setCategoryError(t('fiscal.extraction.errors.category-required'));
      return;
    }

    if (!date) return;

    const amountCents = eurosToCents(Number.parseFloat(amount));

    await linkMutation.mutateAsync({
      documentId,
      data: {
        categoryId,
        amountCents,
        transactionDate: date,
        type,
        description: description || null,
        vatPercent: vatPercent ? Number(vatPercent) : null,
        deductionPercent: deductionPercent ? Number(deductionPercent) : null,
        invoiceNumber: invoiceNumber || null,
        companyId: companyId ?? null,
        isShared,
      },
    });

    onSuccess();
  };

  return (
    <ModalBackdrop onClose={onClose} labelledBy="extraction-confirm-title">
      <div className="card w-full max-w-md lg:max-w-lg animate-modal-in max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-guard-primary" aria-hidden="true" />
            <h2 id="extraction-confirm-title" className="text-xl font-bold text-foreground">
              {t('fiscal.extraction.confirm-title')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-guard-muted hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Low confidence warning */}
        {lowConfidence && (
          <div className="flex items-start gap-2 px-3 py-2.5 mb-4 rounded-lg bg-guard-warning/10 border border-guard-warning/20">
            <AlertTriangle className="h-4 w-4 text-guard-warning mt-0.5 shrink-0" aria-hidden="true" />
            <p className="text-sm text-guard-warning">{t('fiscal.extraction.low-confidence')}</p>
          </div>
        )}

        {/* Confidence badge */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-guard-muted">{t('fiscal.extraction.confidence')}</span>
          <span
            className={cn(
              'text-xs font-medium px-2 py-0.5 rounded-full',
              extractedData.confidence >= 0.9
                ? 'bg-guard-success/10 text-guard-success'
                : extractedData.confidence >= LOW_CONFIDENCE_THRESHOLD
                  ? 'bg-guard-primary/10 text-guard-primary'
                  : 'bg-guard-warning/10 text-guard-warning',
            )}
          >
            {Math.round(extractedData.confidence * 100)}%
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Transaction Type */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setType(TRANSACTION_TYPE.EXPENSE)}
              className={cn(
                'flex-1 py-2 rounded-lg text-sm font-medium transition-colors',
                type === TRANSACTION_TYPE.EXPENSE
                  ? 'bg-guard-danger/10 text-guard-danger border border-guard-danger/30'
                  : 'bg-muted text-guard-muted border border-transparent',
              )}
            >
              {t('transactions.form.type.expense')}
            </button>
            <button
              type="button"
              onClick={() => setType(TRANSACTION_TYPE.INCOME)}
              className={cn(
                'flex-1 py-2 rounded-lg text-sm font-medium transition-colors',
                type === TRANSACTION_TYPE.INCOME
                  ? 'bg-guard-success/10 text-guard-success border border-guard-success/30'
                  : 'bg-muted text-guard-muted border border-transparent',
              )}
            >
              {t('transactions.form.type.income')}
            </button>
          </div>

          {/* Category Selector */}
          <CategorySelector
            type={type}
            onCategoryChange={handleCategoryChange}
            onSharedDefaultChange={handleSharedDefaultChange}
            error={categoryError}
          />

          {/* Amount + Date (side by side on desktop) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="ext-amount" className="block text-sm font-medium text-foreground mb-1.5">
                {t('transactions.form.fields.amount')}
              </label>
              <input
                id="ext-amount"
                type="number"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={cn(INPUT_CLASSES, lowConfidence && 'border-guard-warning/50')}
              />
            </div>
            <div>
              <label htmlFor="ext-date" className="block text-sm font-medium text-foreground mb-1.5">
                {t('transactions.form.fields.date')}
              </label>
              <input
                id="ext-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={INPUT_CLASSES}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label htmlFor="ext-description" className="block text-sm font-medium text-foreground mb-1.5">
              {t('transactions.form.fields.description')}
            </label>
            <input
              id="ext-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={INPUT_CLASSES}
            />
          </div>

          {/* Vendor + Invoice Number (side by side on desktop) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="ext-vendor" className="block text-sm font-medium text-foreground mb-1.5">
                {t('fiscal.form.vendor-name')}
              </label>
              {detectedVendor && !autoMatchedCompany && (
                <div className="flex items-center gap-2 mb-1.5">
                  <p className="text-xs text-guard-warning">
                    {t('fiscal.extraction.detected-vendor')}: {detectedVendor}
                  </p>
                  <button
                    type="button"
                    disabled={quickCreate.isPending}
                    onClick={async () => {
                      const company = await quickCreate.mutateAsync({
                        name: detectedVendor,
                        role: COMPANY_ROLE.PROVIDER,
                      });
                      setCompanyId(company.companyId);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-guard-primary hover:text-guard-primary/80 transition-colors disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('fiscal.extraction.add-vendor')}
                  </button>
                </div>
              )}
              {detectedVendor && autoMatchedCompany && (
                <p className="text-xs text-guard-success mb-1.5">
                  {t('fiscal.extraction.matched-vendor')}: {detectedVendor}
                </p>
              )}
              <CompanySelector value={companyId} onChange={(id) => setCompanyId(id)} />
            </div>
            <div>
              <label htmlFor="ext-invoice-number" className="block text-sm font-medium text-foreground mb-1.5">
                {t('fiscal.form.invoice-number')}
              </label>
              <input
                id="ext-invoice-number"
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className={INPUT_CLASSES}
              />
            </div>
          </div>

          {/* VAT + Deduction row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ext-vat" className="block text-sm font-medium text-foreground mb-1.5">
                {t('fiscal.form.vat-percent')}
              </label>
              <input
                id="ext-vat"
                type="number"
                step="1"
                min="0"
                max="100"
                value={vatPercent}
                onChange={(e) => setVatPercent(e.target.value)}
                className={INPUT_CLASSES}
              />
            </div>
            <div>
              <label htmlFor="ext-deduction" className="block text-sm font-medium text-foreground mb-1.5">
                {t('fiscal.form.deduction-percent')}
              </label>
              <input
                id="ext-deduction"
                type="number"
                step="1"
                min="0"
                max="100"
                value={deductionPercent}
                onChange={(e) => setDeductionPercent(e.target.value)}
                className={INPUT_CLASSES}
              />
            </div>
          </div>

          {/* Shared toggle */}
          <label htmlFor="ext-shared" className="flex items-center gap-2 cursor-pointer">
            <input
              id="ext-shared"
              type="checkbox"
              checked={isShared}
              onChange={(e) => setIsShared(e.target.checked)}
              className="h-4 w-4 rounded border-input text-guard-primary focus:ring-guard-primary"
            />
            <span className="text-sm text-foreground">{t('transactions.form.fields.shared')}</span>
          </label>

          {/* Error */}
          {linkMutation.isError && (
            <div role="alert" className="p-3 rounded-lg bg-guard-danger/10 border border-guard-danger/20">
              <p className="text-sm text-guard-danger">{linkMutation.error.message}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg font-medium text-foreground bg-muted hover:bg-muted/80 transition-colors"
            >
              {t('common.buttons.cancel')}
            </button>
            <button
              type="submit"
              disabled={linkMutation.isPending || !categoryId || !date}
              className={cn(
                'flex-1 py-2.5 rounded-lg font-semibold text-white transition-all duration-200 ease-out-quart',
                'bg-guard-primary hover:bg-guard-primary/90',
                'disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
              )}
            >
              {linkMutation.isPending ? t('common.loading') : t('fiscal.extraction.create-transaction')}
            </button>
          </div>
        </form>
      </div>
    </ModalBackdrop>
  );
}
