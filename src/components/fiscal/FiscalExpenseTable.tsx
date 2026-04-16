'use client';

/**
 * BudgetGuard Fiscal Expense Table
 * Detailed table of deductible expenses with fiscal breakdown columns
 */

import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { useTranslate } from '@/hooks/useTranslations';
import type { FiscalTransaction } from '@/types/finance';
import { formatDate } from '@/utils/helpers';
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
      {/* Desktop table */}
      <div className="hidden lg:block">
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
                  <td className="px-4 py-2 text-foreground/80 truncate max-w-[180px]">
                    {expense.description || `${expense.parentCategoryName} – ${expense.categoryName}`}
                  </td>
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
      </div>

      {/* Mobile/Tablet cards */}
      <div className="lg:hidden divide-y divide-border">
        {expenses.map((expense) => (
          <div key={expense.transactionId} className="px-2 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  {expense.vendorName ?? expense.parentCategoryName}
                </p>
                <p className="text-xs text-foreground/80 truncate">
                  {expense.description || `${expense.parentCategoryName} – ${expense.categoryName}`}
                </p>
              </div>
              <span className="text-sm font-medium tabular-nums shrink-0 ml-2">
                {formatCurrency(expense.fullAmountCents)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div>
                <span className="text-guard-muted">{t('fiscal.expenses.date')}</span>
                <p className="text-guard-muted tabular-nums">{formatDate(expense.transactionDate)}</p>
              </div>
              <div>
                <span className="text-guard-muted">{t('fiscal.expenses.vat-rate')}</span>
                <p className="tabular-nums">{expense.vatPercent}%</p>
              </div>
              <div>
                <span className="text-guard-muted">{t('fiscal.expenses.base-deductible')}</span>
                <p className="tabular-nums font-medium">{formatCurrency(expense.baseDeducibleCents)}</p>
              </div>
              <div>
                <span className="text-guard-muted">{t('fiscal.expenses.vat-deductible')}</span>
                <p className="tabular-nums font-medium">{formatCurrency(expense.ivaDeducibleCents)}</p>
              </div>
            </div>
          </div>
        ))}
        {/* Mobile subtotal */}
        <div className="px-2 py-3 bg-muted/30">
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>{t('fiscal.expenses.subtotal')}</span>
            <div className="flex gap-4 tabular-nums">
              <span>{formatCurrency(subtotalBase)}</span>
              <span>{formatCurrency(subtotalIva)}</span>
            </div>
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
}
