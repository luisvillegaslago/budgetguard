'use client';

/**
 * BudgetGuard Invoice Detail Page
 * Shows invoice preview with status actions and PDF download
 */

import { ArrowLeft, Download, Loader2, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { InvoiceForm } from '@/components/invoices/InvoiceForm';
import { INVOICE_STATUS, PAYMENT_METHOD } from '@/constants/finance';
import { useCategories } from '@/hooks/useCategories';
import { useDeleteInvoice, useFinalizeInvoice, useInvoice, useUpdateInvoiceStatus } from '@/hooks/useInvoices';
import { useTranslate } from '@/hooks/useTranslations';
import type { InvoiceStatus } from '@/types/finance';
import { cn, formatDate } from '@/utils/helpers';
import { formatInvoiceLabel, getInvoiceLabels, getInvoiceLocale } from '@/utils/invoiceLabels';
import { centsToEuros, formatCurrency } from '@/utils/money';

const STATUS_STYLES: Record<InvoiceStatus, string> = {
  [INVOICE_STATUS.DRAFT]: 'bg-guard-muted/20 text-guard-muted',
  [INVOICE_STATUS.FINALIZED]: 'bg-guard-primary/20 text-guard-primary',
  [INVOICE_STATUS.PAID]: 'bg-guard-success/20 text-guard-success',
  [INVOICE_STATUS.CANCELLED]: 'bg-guard-danger/20 text-guard-danger',
};

export default function InvoiceDetailPage() {
  const { t } = useTranslate();
  const router = useRouter();
  const params = useParams();
  const invoiceId = Number(params.id);

  const { data: invoice, isLoading, error } = useInvoice(invoiceId);
  const { data: categories } = useCategories('income');
  const updateStatus = useUpdateInvoiceStatus();
  const deleteInvoice = useDeleteInvoice();
  const finalizeInvoice = useFinalizeInvoice();

  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-guard-primary" />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <p className="text-guard-danger">{t('invoices.errors.load')}</p>
        <Link href="/invoices" className="text-guard-primary hover:underline mt-2 inline-block">
          {t('invoices.back-to-list')}
        </Link>
      </div>
    );
  }

  const handleFinalize = async () => {
    await finalizeInvoice.mutateAsync(invoiceId);
    setConfirmFinalize(false);
  };

  const handleMarkPaid = async (categoryId: number) => {
    await updateStatus.mutateAsync({ invoiceId, data: { status: INVOICE_STATUS.PAID, categoryId } });
    setShowCategoryPicker(false);
  };

  const handleCancel = async () => {
    await updateStatus.mutateAsync({ invoiceId, data: { status: INVOICE_STATUS.CANCELLED } });
    setConfirmCancel(false);
  };

  const handleRevertToDraft = async () => {
    await updateStatus.mutateAsync({ invoiceId, data: { status: INVOICE_STATUS.DRAFT } });
    setConfirmRevert(false);
  };

  const handleDelete = async () => {
    await deleteInvoice.mutateAsync(invoiceId);
    setConfirmDelete(false);
    router.push('/invoices');
  };

  const handleDownloadPdf = async () => {
    if (pdfProgress !== null) return;
    setPdfProgress(0);

    try {
      const response = await fetch(`/api/invoices/${invoiceId}/pdf`);
      if (!response.ok) throw new Error('PDF generation failed');

      const contentLength = response.headers.get('Content-Length');
      const total = contentLength ? Number.parseInt(contentLength, 10) : 0;
      const reader = response.body?.getReader();

      if (!reader) throw new Error('No response body');

      const chunks: Uint8Array[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        setPdfProgress(total > 0 ? Math.round((received / total) * 100) : 50);
      }

      const blob = new Blob(chunks, { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoice.invoiceNumber ?? `draft-${invoiceId}`}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: open in new tab
      window.open(`/api/invoices/${invoiceId}/pdf`, '_blank');
    } finally {
      setPdfProgress(null);
    }
  };

  const l = getInvoiceLabels(invoice.invoiceLanguage);
  const invoiceLocale = getInvoiceLocale(invoice.invoiceLanguage);
  const showHourlyColumns = invoice.lineItems.some((item) => item.hours != null || item.hourlyRateCents != null);
  const tableGridClass = showHourlyColumns ? 'grid-cols-[2fr_1fr_1fr_1fr]' : 'grid-cols-[3fr_1fr]';

  const formatRate = (cents: number) => {
    const euros = centsToEuros(cents);
    return `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(euros)} €/hr`;
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back + Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <Link
          href="/invoices"
          className="flex items-center gap-1 text-sm text-guard-muted hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('invoices.back-to-list')}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={pdfProgress !== null}
            className="btn-secondary flex items-center gap-2"
          >
            {pdfProgress !== null ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {pdfProgress > 0 ? `${pdfProgress}%` : t('common.loading')}
              </>
            ) : (
              <>
                <Download className="h-4 w-4" aria-hidden="true" />
                PDF
              </>
            )}
          </button>

          {invoice.status === INVOICE_STATUS.DRAFT && (
            <>
              <button
                type="button"
                onClick={() => setShowEditForm(true)}
                className="btn-secondary flex items-center gap-2"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
                {t('invoices.actions.edit')}
              </button>
              <button
                type="button"
                onClick={() => setConfirmFinalize(true)}
                disabled={finalizeInvoice.isPending}
                className="btn-primary flex items-center gap-2"
              >
                {finalizeInvoice.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {finalizeInvoice.isPending ? t('invoices.actions.finalizing') : t('invoices.actions.finalize')}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={deleteInvoice.isPending}
                className="btn-danger flex items-center gap-2"
              >
                {deleteInvoice.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('common.buttons.delete')}
              </button>
            </>
          )}

          {invoice.status === INVOICE_STATUS.FINALIZED && (
            <>
              <button
                type="button"
                onClick={() => setConfirmRevert(true)}
                disabled={updateStatus.isPending}
                className="btn-secondary flex items-center gap-2"
              >
                {updateStatus.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('invoices.actions.revert-to-draft')}
              </button>
              <button
                type="button"
                onClick={() => setShowCategoryPicker(true)}
                disabled={updateStatus.isPending}
                className="btn-primary flex items-center gap-2"
              >
                {t('invoices.actions.mark-paid')}
              </button>
              <button type="button" onClick={() => setConfirmCancel(true)} className="btn-danger">
                {t('invoices.actions.cancel')}
              </button>
            </>
          )}

          {invoice.status === INVOICE_STATUS.PAID && (
            <button type="button" onClick={() => setConfirmCancel(true)} className="btn-danger">
              {t('invoices.actions.cancel')}
            </button>
          )}

          {invoice.status === INVOICE_STATUS.CANCELLED && (
            <button
              type="button"
              onClick={() => setConfirmRevert(true)}
              disabled={updateStatus.isPending}
              className="btn-secondary flex items-center gap-2"
            >
              {updateStatus.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('invoices.actions.revert-to-draft')}
            </button>
          )}
        </div>
      </div>

      {/* Invoice Preview Card */}
      <div className="bg-card rounded-xl border border-border p-8">
        {/* Status badge */}
        <div className="flex justify-end mb-4">
          <span
            className={cn(
              'inline-flex items-center px-3 py-1 rounded-full text-sm font-medium',
              STATUS_STYLES[invoice.status],
            )}
          >
            {t(`invoices.status.${invoice.status}`)}
          </span>
        </div>

        {/* Header */}
        <div className="flex justify-between mb-8">
          <div>
            <h2 className="text-xl font-bold text-foreground">{invoice.billerName}</h2>
            <p className="text-sm text-guard-muted">NIF: {invoice.billerNif}</p>
            {invoice.billerAddress && <p className="text-sm text-guard-muted">{invoice.billerAddress}</p>}
            {invoice.billerPhone && <p className="text-sm text-guard-muted">{invoice.billerPhone}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs text-guard-muted uppercase tracking-wide mb-1">{l.billTo}</p>
            <p className="font-semibold text-foreground">{invoice.clientName}</p>
            {invoice.clientTradingName && <p className="text-sm text-guard-muted">{invoice.clientTradingName}</p>}
            {invoice.clientAddress && <p className="text-sm text-guard-muted">{invoice.clientAddress}</p>}
            {(invoice.clientCity || invoice.clientPostalCode) && (
              <p className="text-sm text-guard-muted">
                {[invoice.clientPostalCode, invoice.clientCity].filter(Boolean).join(' ')}
              </p>
            )}
            {invoice.clientTaxId && (
              <p className="text-sm text-guard-muted">
                {l.taxId}: {invoice.clientTaxId}
              </p>
            )}
          </div>
        </div>

        {/* Meta */}
        <div className="flex justify-between mb-6 pb-4 border-b border-border">
          <div>
            <p className="text-xs text-guard-muted uppercase tracking-wide">{l.date}</p>
            <p className="font-medium text-foreground">{formatDate(invoice.invoiceDate, 'long', invoiceLocale)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-guard-muted uppercase tracking-wide">{l.invoiceNumber}</p>
            <p className="text-lg font-bold text-guard-primary">{formatInvoiceLabel(invoice.invoiceNumber)}</p>
          </div>
        </div>

        {/* Table */}
        <div className="mb-6">
          <div
            className={`grid ${tableGridClass} gap-4 px-3 py-2 bg-guard-dark text-white rounded-t-lg text-xs font-medium uppercase tracking-wide`}
          >
            <span>{l.description}</span>
            {showHourlyColumns && (
              <>
                <span className="text-center">{l.hours}</span>
                <span className="text-right">{l.hourlyRate}</span>
              </>
            )}
            <span className="text-right">{l.balance}</span>
          </div>

          {invoice.lineItems.map((item) => (
            <div
              key={item.lineItemId}
              className={`grid ${tableGridClass} gap-4 px-3 py-3 border-b border-border text-sm`}
            >
              <span className="text-foreground whitespace-pre-line">{item.description}</span>
              {showHourlyColumns && (
                <>
                  <span className="text-center text-guard-muted">{item.hours != null ? item.hours : '-'}</span>
                  <span className="text-right text-guard-muted">
                    {item.hourlyRateCents != null ? formatRate(item.hourlyRateCents) : '-'}
                  </span>
                </>
              )}
              <span className="text-right font-medium text-foreground">{formatCurrency(item.amountCents)}</span>
            </div>
          ))}

          <div className={`grid ${tableGridClass} gap-4 px-3 py-3 border-t-2 border-guard-dark`}>
            <span className={`${showHourlyColumns ? 'col-span-3' : 'col-span-1'} text-right font-bold text-foreground`}>
              {l.total}
            </span>
            <span className="text-right font-bold text-foreground">{formatCurrency(invoice.totalCents)}</span>
          </div>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div className="mb-6">
            <p className="text-sm text-guard-muted">{invoice.notes}</p>
          </div>
        )}

        {/* Payment info */}
        <div className="pt-4 border-t border-border">
          <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">
            {l.paymentMethod}:{' '}
            {invoice.billerPaymentMethod === PAYMENT_METHOD.BANK_TRANSFER
              ? l.bankTransfer
              : invoice.billerPaymentMethod}
          </p>
          {invoice.billerPaymentMethod === PAYMENT_METHOD.BANK_TRANSFER && (
            <div className="text-sm text-guard-muted space-y-0.5">
              {invoice.billerBankName && (
                <p>
                  <span className="font-medium text-foreground/80">{l.entityName}:</span> {invoice.billerBankName}
                </p>
              )}
              {invoice.billerIban && (
                <p>
                  <span className="font-medium text-foreground/80">{l.iban}:</span> {invoice.billerIban}
                </p>
              )}
              {invoice.billerSwift && (
                <p>
                  <span className="font-medium text-foreground/80">{l.swift}:</span> {invoice.billerSwift}
                </p>
              )}
              {invoice.billerBankAddress && (
                <p>
                  <span className="font-medium text-foreground/80">{l.address}:</span> {invoice.billerBankAddress}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Category Picker Modal (for marking as paid) */}
      {showCategoryPicker && (
        <div className="fixed inset-0 bg-guard-dark/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-lg p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-foreground mb-4">{t('invoices.actions.select-category')}</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {categories?.map((cat) => (
                <button
                  key={cat.categoryId}
                  type="button"
                  onClick={() => handleMarkPaid(cat.categoryId)}
                  disabled={updateStatus.isPending}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted transition-colors text-sm text-foreground flex items-center gap-2"
                >
                  {updateStatus.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                  {cat.name}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setShowCategoryPicker(false)} className="mt-4 w-full btn-secondary">
              {t('common.buttons.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Edit Form Modal */}
      {showEditForm && <InvoiceForm invoice={invoice} onClose={() => setShowEditForm(false)} />}

      {/* Cancel Confirmation Modal */}
      {confirmCancel && (
        <div className="fixed inset-0 bg-guard-dark/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-lg p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-foreground mb-2">{t('invoices.actions.confirm-cancel-title')}</h3>
            <p className="text-sm text-guard-muted mb-4">
              {invoice.status === INVOICE_STATUS.PAID
                ? t('invoices.actions.confirm-cancel-paid')
                : t('invoices.actions.confirm-cancel-finalized')}
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setConfirmCancel(false)} className="flex-1 btn-secondary">
                {t('common.buttons.close')}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={updateStatus.isPending}
                className="flex-1 btn-danger flex items-center justify-center gap-2"
              >
                {updateStatus.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('invoices.actions.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Finalize Confirmation Modal */}
      {confirmFinalize && (
        <div className="fixed inset-0 bg-guard-dark/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-lg p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t('invoices.actions.confirm-finalize-title')}
            </h3>
            <p className="text-sm text-guard-muted mb-4">{t('invoices.actions.confirm-finalize-message')}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmFinalize(false)}
                disabled={finalizeInvoice.isPending}
                className="flex-1 btn-secondary"
              >
                {t('common.buttons.cancel')}
              </button>
              <button
                type="button"
                onClick={handleFinalize}
                disabled={finalizeInvoice.isPending}
                className="flex-1 btn-primary flex items-center justify-center gap-2"
              >
                {finalizeInvoice.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {finalizeInvoice.isPending
                  ? t('invoices.actions.finalizing')
                  : t('invoices.actions.confirm-finalize-submit')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-guard-dark/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-lg p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-foreground mb-2">{t('invoices.actions.confirm-delete-title')}</h3>
            <p className="text-sm text-guard-muted mb-4">{t('invoices.actions.confirm-delete-message')}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleteInvoice.isPending}
                className="flex-1 btn-secondary"
              >
                {t('common.buttons.cancel')}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteInvoice.isPending}
                className="flex-1 btn-danger flex items-center justify-center gap-2"
              >
                {deleteInvoice.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('common.buttons.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revert to Draft Confirmation Modal */}
      {confirmRevert && (
        <div className="fixed inset-0 bg-guard-dark/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-lg p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-foreground mb-2">{t('invoices.actions.confirm-revert-title')}</h3>
            <p className="text-sm text-guard-muted mb-4">{t('invoices.actions.confirm-revert-message')}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmRevert(false)}
                disabled={updateStatus.isPending}
                className="flex-1 btn-secondary"
              >
                {t('common.buttons.cancel')}
              </button>
              <button
                type="button"
                onClick={handleRevertToDraft}
                disabled={updateStatus.isPending}
                className="flex-1 btn-primary flex items-center justify-center gap-2"
              >
                {updateStatus.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('invoices.actions.revert-to-draft')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
