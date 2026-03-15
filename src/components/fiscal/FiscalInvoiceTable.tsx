'use client';

/**
 * BudgetGuard Fiscal Invoice Table
 * Table of issued invoices (income) with base amount and VAT
 */

import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { useTranslate } from '@/hooks/useTranslations';
import type { FiscalTransaction } from '@/types/finance';
import { formatDate } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

interface FiscalInvoiceTableProps {
  invoices: FiscalTransaction[];
}

export function FiscalInvoiceTable({ invoices }: FiscalInvoiceTableProps) {
  const { t } = useTranslate();

  if (invoices.length === 0) {
    return (
      <CollapsibleSection title={t('fiscal.invoices.title')}>
        <p className="text-sm text-guard-muted text-center py-6">{t('fiscal.invoices.empty')}</p>
      </CollapsibleSection>
    );
  }

  const totalBase = invoices.reduce((sum, inv) => sum + inv.baseCents, 0);

  return (
    <CollapsibleSection title={t('fiscal.invoices.title')} className="overflow-hidden">
      {/* Desktop table */}
      <div className="hidden lg:block">
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
                  <td className="px-4 py-2 text-foreground max-w-[200px]">
                    <div className="truncate">{invoice.vendorName ?? invoice.parentCategoryName}</div>
                    {invoice.companyTaxId && <span className="text-xs text-guard-muted">{invoice.companyTaxId}</span>}
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

      {/* Mobile/Tablet cards */}
      <div className="lg:hidden divide-y divide-border">
        {invoices.map((invoice) => (
          <div key={invoice.transactionId} className="px-2 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                {invoice.invoiceNumber && (
                  <span className="text-sm font-medium text-guard-primary">{invoice.invoiceNumber}</span>
                )}
                <p className="text-sm text-foreground truncate">{invoice.vendorName ?? invoice.parentCategoryName}</p>
              </div>
              <span className="text-sm font-medium tabular-nums shrink-0 ml-2">
                {formatCurrency(invoice.baseCents)}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-guard-muted">
              <span className="tabular-nums">{formatDate(invoice.transactionDate)}</span>
              {invoice.description && <span className="truncate">{invoice.description}</span>}
              <span className="tabular-nums ml-auto">
                {t('fiscal.invoices.vat')}: {formatCurrency(invoice.ivaCents)}
              </span>
            </div>
          </div>
        ))}
        {/* Mobile total */}
        <div className="px-2 py-3 bg-muted/30">
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>{t('fiscal.invoices.total-quarter')}</span>
            <span className="tabular-nums">{formatCurrency(totalBase)}</span>
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
}
