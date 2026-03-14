'use client';

/**
 * BudgetGuard Fiscal Expense Table
 * Detailed table of deductible expenses with fiscal breakdown columns
 */

import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { useTranslate } from '@/hooks/useTranslations';
import type { FiscalTransaction } from '@/types/finance';
import { formatCurrency } from '@/utils/money';

interface FiscalExpenseTableProps {
  expenses: FiscalTransaction[];
}

export function FiscalExpenseTable({ expenses }: FiscalExpenseTableProps) {
  const { t } = useTranslate();

  if (expenses.length === 0) {
    return (
      <CollapsibleSection title={t('fiscal.expenses.title')}>
        <p className="text-sm text-guard-muted text-center py-6">{t('fiscal.expenses.empty')}</p>
      </CollapsibleSection>
    );
  }

  // Compute subtotals
  const subtotalBase = expenses.reduce((sum, e) => sum + e.baseDeducibleCents, 0);
  const subtotalIva = expenses.reduce((sum, e) => sum + e.ivaDeducibleCents, 0);

  return (
    <CollapsibleSection title={t('fiscal.expenses.title')} className="overflow-hidden">
      <div className="overflow-x-auto -mx-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-2 text-xs font-semibold text-guard-muted uppercase tracking-wider">
                {t('fiscal.expenses.date')}
              </th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-guard-muted uppercase tracking-wider">
                {t('fiscal.expenses.vendor')}
              </th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-guard-muted uppercase tracking-wider">
                {t('fiscal.expenses.description')}
              </th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-guard-muted uppercase tracking-wider">
                {t('fiscal.expenses.total')}
              </th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-guard-muted uppercase tracking-wider">
                {t('fiscal.expenses.vat-rate')}
              </th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-guard-muted uppercase tracking-wider">
                {t('fiscal.expenses.deduction-rate')}
              </th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-guard-muted uppercase tracking-wider">
                {t('fiscal.expenses.base-deductible')}
              </th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-guard-muted uppercase tracking-wider">
                {t('fiscal.expenses.vat-deductible')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {expenses.map((expense) => (
              <tr key={expense.transactionId} className="hover:bg-muted/50 transition-colors">
                <td className="px-4 py-2 tabular-nums text-guard-muted whitespace-nowrap">
                  {formatDate(expense.transactionDate)}
                </td>
                <td className="px-4 py-2 text-foreground max-w-[200px]">
                  <div className="truncate">{expense.vendorName ?? expense.parentCategoryName}</div>
                  {expense.companyTaxId && <span className="text-xs text-guard-muted">{expense.companyTaxId}</span>}
                </td>
                <td className="px-4 py-2 text-foreground/80 truncate max-w-[180px]">{expense.description ?? '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">
                  {formatCurrency(expense.fullAmountCents)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-guard-muted">{expense.vatPercent}%</td>
                <td className="px-4 py-2 text-right tabular-nums text-guard-muted">{expense.deductionPercent}%</td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">
                  {formatCurrency(expense.baseDeducibleCents)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">
                  {formatCurrency(expense.ivaDeducibleCents)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/30">
              <td colSpan={6} className="px-4 py-2 text-sm font-semibold text-foreground">
                {t('fiscal.expenses.subtotal')}
              </td>
              <td className="px-4 py-2 text-right tabular-nums font-bold text-foreground">
                {formatCurrency(subtotalBase)}
              </td>
              <td className="px-4 py-2 text-right tabular-nums font-bold text-foreground">
                {formatCurrency(subtotalIva)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </CollapsibleSection>
  );
}

/**
 * Format ISO date to short display format
 */
function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}
