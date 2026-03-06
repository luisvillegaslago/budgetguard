'use client';

/**
 * BudgetGuard Fiscal Invoice Table
 * Table of issued invoices (income) with base amount and VAT
 */

import { useTranslate } from '@/hooks/useTranslations';
import type { FiscalTransaction } from '@/types/finance';
import { formatCurrency } from '@/utils/money';

interface FiscalInvoiceTableProps {
  invoices: FiscalTransaction[];
}

export function FiscalInvoiceTable({ invoices }: FiscalInvoiceTableProps) {
  const { t } = useTranslate();

  if (invoices.length === 0) {
    return (
      <div className="card">
        <h3 className="text-lg font-bold text-foreground mb-4">{t('fiscal.invoices.title')}</h3>
        <p className="text-sm text-guard-muted text-center py-6">{t('fiscal.invoices.empty')}</p>
      </div>
    );
  }

  const totalBase = invoices.reduce((sum, inv) => sum + inv.baseCents, 0);

  return (
    <div className="card overflow-hidden">
      <h3 className="text-lg font-bold text-foreground mb-4">{t('fiscal.invoices.title')}</h3>

      <div className="overflow-x-auto -mx-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-2 text-xs font-semibold text-guard-muted uppercase tracking-wider">
                {t('fiscal.invoices.number')}
              </th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-guard-muted uppercase tracking-wider">
                {t('fiscal.invoices.date')}
              </th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-guard-muted uppercase tracking-wider">
                {t('fiscal.invoices.client')}
              </th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-guard-muted uppercase tracking-wider">
                {t('fiscal.invoices.description')}
              </th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-guard-muted uppercase tracking-wider">
                {t('fiscal.invoices.base')}
              </th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-guard-muted uppercase tracking-wider">
                {t('fiscal.invoices.vat')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {invoices.map((invoice) => (
              <tr key={invoice.transactionId} className="hover:bg-muted/50 transition-colors">
                <td className="px-4 py-2 font-medium text-guard-primary">{invoice.invoiceNumber ?? '—'}</td>
                <td className="px-4 py-2 tabular-nums text-guard-muted whitespace-nowrap">
                  {formatDate(invoice.transactionDate)}
                </td>
                <td className="px-4 py-2 text-foreground truncate max-w-[150px]">
                  {invoice.vendorName ?? invoice.parentCategoryName}
                </td>
                <td className="px-4 py-2 text-foreground/80 truncate max-w-[200px]">{invoice.description ?? '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">{formatCurrency(invoice.baseCents)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-guard-muted">
                  {formatCurrency(invoice.ivaCents)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/30">
              <td colSpan={4} className="px-4 py-2 text-sm font-semibold text-foreground">
                {t('fiscal.invoices.total-quarter')}
              </td>
              <td className="px-4 py-2 text-right tabular-nums font-bold text-foreground">
                {formatCurrency(totalBase)}
              </td>
              <td className="px-4 py-2 text-right tabular-nums font-bold text-guard-muted">
                {formatCurrency(invoices.reduce((sum, inv) => sum + inv.ivaCents, 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}
