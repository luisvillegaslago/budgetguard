'use client';

/**
 * BudgetGuard Invoices Page
 * Lists all invoices with filters and create action
 */

import { FileText, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BadDebtCard } from '@/components/fiscal/BadDebtCard';
import { InvoiceForm } from '@/components/invoices/InvoiceForm';
import { InvoiceList } from '@/components/invoices/InvoiceList';
import { TabBar, type TabBarItem } from '@/components/ui/TabBar';
import { INVOICE_STATUS, STATUS_FILTER } from '@/constants/finance';
import { useInvoices } from '@/hooks/useInvoices';
import { useTranslate } from '@/hooks/useTranslations';
import { useUrlParams } from '@/hooks/useUrlParams';
import type { InvoiceStatus } from '@/types/finance';

type InvoiceStatusFilter = InvoiceStatus | typeof STATUS_FILTER.ALL;

const VALID_STATUSES = new Set<string>([
  INVOICE_STATUS.DRAFT,
  INVOICE_STATUS.FINALIZED,
  INVOICE_STATUS.PAID,
  INVOICE_STATUS.CANCELLED,
]);

const STATUS_FILTERS: Array<{ key: InvoiceStatusFilter; value: InvoiceStatus | undefined }> = [
  { key: STATUS_FILTER.ALL, value: undefined },
  { key: INVOICE_STATUS.DRAFT, value: INVOICE_STATUS.DRAFT },
  { key: INVOICE_STATUS.FINALIZED, value: INVOICE_STATUS.FINALIZED },
  { key: INVOICE_STATUS.PAID, value: INVOICE_STATUS.PAID },
  { key: INVOICE_STATUS.CANCELLED, value: INVOICE_STATUS.CANCELLED },
];

export default function InvoicesPage() {
  const { t } = useTranslate();
  const router = useRouter();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const { searchParams, updateParams } = useUrlParams('/invoices');

  const statusParam = searchParams.get('status');
  const statusFilter: InvoiceStatus | undefined =
    statusParam && VALID_STATUSES.has(statusParam) ? (statusParam as InvoiceStatus) : undefined;

  const { data: invoices, isLoading } = useInvoices(statusFilter ? { status: statusFilter } : undefined);

  const filterTabs: TabBarItem<InvoiceStatusFilter>[] = STATUS_FILTERS.map(({ key }) => ({
    id: key,
    label: key === STATUS_FILTER.ALL ? t('invoices.filters.all') : t(`invoices.status.${key}`),
  }));

  const handleFilterChange = (key: InvoiceStatusFilter) => {
    updateParams({ status: STATUS_FILTERS.find((filter) => filter.key === key)?.value });
  };

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
      <TabBar
        tabs={filterTabs}
        activeTab={statusFilter ?? STATUS_FILTER.ALL}
        onChange={handleFilterChange}
        ariaLabel={t('invoices.filters.a11y')}
        className="mb-6"
      />

      {/* Invoice List */}
      <InvoiceList invoices={invoices ?? []} isLoading={isLoading} />

      {/* The IVA of an invoice that never gets paid is recoverable, but only inside hard deadlines
          (art. 80.Cuatro LIVA). It hangs off this page and not off /fiscal because the thought that
          leads to it — "this client never paid me" — happens in front of the invoice list, and
          because its windows run from each invoice's devengo and belong to no quarter. It opens
          itself only when a window is running out; for a portfolio of non-established clients the
          article reaches nothing, so it stays shut and says why rather than looking empty. */}
      <div className="mt-8">
        <BadDebtCard />
      </div>

      {/* Create Form Modal */}
      {showCreateForm && <InvoiceForm onClose={() => setShowCreateForm(false)} onCreated={handleCreated} />}
    </div>
  );
}
