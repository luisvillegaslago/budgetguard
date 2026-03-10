'use client';

/**
 * BudgetGuard Invoices Page
 * Lists all invoices with filters and create action
 */

import { FileText, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { InvoiceForm } from '@/components/invoices/InvoiceForm';
import { InvoiceList } from '@/components/invoices/InvoiceList';
import { INVOICE_STATUS } from '@/constants/finance';
import { useInvoices } from '@/hooks/useInvoices';
import { useTranslate } from '@/hooks/useTranslations';
import type { InvoiceStatus } from '@/types/finance';
import { cn } from '@/utils/helpers';

const STATUS_FILTERS: Array<{ key: string; value: InvoiceStatus | undefined }> = [
  { key: 'all', value: undefined },
  { key: INVOICE_STATUS.DRAFT, value: INVOICE_STATUS.DRAFT },
  { key: INVOICE_STATUS.FINALIZED, value: INVOICE_STATUS.FINALIZED },
  { key: INVOICE_STATUS.PAID, value: INVOICE_STATUS.PAID },
  { key: INVOICE_STATUS.CANCELLED, value: INVOICE_STATUS.CANCELLED },
];

export default function InvoicesPage() {
  const { t } = useTranslate();
  const router = useRouter();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | undefined>(undefined);

  const { data: invoices, isLoading } = useInvoices(statusFilter ? { status: statusFilter } : undefined);

  const handleCreated = (invoiceId: number) => {
    setShowCreateForm(false);
    router.push(`/invoices/${invoiceId}`);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-guard-primary" aria-hidden="true" />
          <h1 className="text-2xl font-bold text-foreground">{t('invoices.title')}</h1>
        </div>
        <button type="button" onClick={() => setShowCreateForm(true)} className="btn-primary flex items-center gap-2">
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{t('invoices.new')}</span>
        </button>
      </div>

      {/* Status filters */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => setStatusFilter(filter.value)}
            className={cn(
              'px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              statusFilter === filter.value
                ? 'border-guard-primary text-guard-primary'
                : 'border-transparent text-guard-muted hover:text-foreground',
            )}
          >
            {filter.key === 'all' ? t('invoices.filters.all') : t(`invoices.status.${filter.key}`)}
          </button>
        ))}
      </div>

      {/* Invoice List */}
      <InvoiceList invoices={invoices ?? []} isLoading={isLoading} />

      {/* Create Form Modal */}
      {showCreateForm && <InvoiceForm onClose={() => setShowCreateForm(false)} onCreated={handleCreated} />}
    </div>
  );
}
