'use client';

/**
 * BudgetGuard Invoice List
 * Table displaying invoices with status badges and actions
 */

import { FileText } from 'lucide-react';
import Link from 'next/link';
import { INVOICE_STATUS } from '@/constants/finance';
import { useTranslate } from '@/hooks/useTranslations';
import type { InvoiceListItem, InvoiceStatus } from '@/types/finance';
import { cn, formatDate } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

interface InvoiceListProps {
  invoices: InvoiceListItem[];
  isLoading: boolean;
}

const STATUS_STYLES: Record<InvoiceStatus, string> = {
  [INVOICE_STATUS.DRAFT]: 'bg-guard-muted/20 text-guard-muted',
  [INVOICE_STATUS.FINALIZED]: 'bg-guard-primary/20 text-guard-primary',
  [INVOICE_STATUS.PAID]: 'bg-guard-success/20 text-guard-success',
  [INVOICE_STATUS.CANCELLED]: 'bg-guard-danger/20 text-guard-danger',
};

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const { t } = useTranslate();
  return (
    <span
      className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', STATUS_STYLES[status])}
    >
      {t(`invoices.status.${status}`)}
    </span>
  );
}

export function InvoiceList({ invoices, isLoading }: InvoiceListProps) {
  const { t } = useTranslate();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {['s1', 's2', 's3', 's4', 's5'].map((key) => (
          <div key={key} className="h-14 bg-muted/50 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="text-center py-16">
        <FileText className="h-12 w-12 text-guard-muted mx-auto mb-4" aria-hidden="true" />
        <p className="text-guard-muted">{t('invoices.empty')}</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="hidden sm:grid sm:grid-cols-[1fr_1fr_1fr_auto_auto] gap-4 px-4 py-3 bg-muted/30 text-xs font-medium text-guard-muted uppercase tracking-wide">
        <span>{t('invoices.table.number')}</span>
        <span>{t('invoices.table.client')}</span>
        <span>{t('invoices.table.date')}</span>
        <span className="text-right">{t('invoices.table.total')}</span>
        <span className="text-center w-28">{t('invoices.table.status')}</span>
      </div>

      {/* Rows */}
      {invoices.map((invoice) => (
        <Link
          key={invoice.invoiceId}
          href={`/invoices/${invoice.invoiceId}`}
          className="grid sm:grid-cols-[1fr_1fr_1fr_auto_auto] gap-2 sm:gap-4 px-4 py-3 border-t border-border hover:bg-muted/30 transition-colors items-center"
        >
          <span className="font-medium text-foreground">{invoice.invoiceNumber}</span>
          <span className="text-sm text-foreground truncate">{invoice.clientTradingName ?? invoice.clientName}</span>
          <span className="text-sm text-guard-muted">{formatDate(invoice.invoiceDate, 'long')}</span>
          <span className="text-sm font-medium text-foreground text-right">{formatCurrency(invoice.totalCents)}</span>
          <span className="text-center w-28">
            <StatusBadge status={invoice.status} />
          </span>
        </Link>
      ))}
    </div>
  );
}
