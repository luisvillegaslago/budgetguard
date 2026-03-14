'use client';

/**
 * Company Movement Detail
 * Shows all transactions linked to a company, grouped by month
 * Reuses CategoryHistory components for consistent display
 */

import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Building2, RefreshCw } from 'lucide-react';
import { useCallback, useState } from 'react';
import { CategoryHistoryMonths } from '@/components/category-history/CategoryHistoryMonths';
import { CategoryHistoryStats } from '@/components/category-history/CategoryHistoryStats';
import { DateRangeSelector } from '@/components/category-history/DateRangeSelector';
import { TransactionForm } from '@/components/transactions/TransactionForm';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { DateRangePreset } from '@/constants/finance';
import { DATE_RANGE_PRESET, QUERY_KEY } from '@/constants/finance';
import { useCompanyTransactions } from '@/hooks/useCompanyTransactions';
import { useDeleteTransaction } from '@/hooks/useTransactions';
import { useTranslate } from '@/hooks/useTranslations';
import { useGroupByMonth, useToggleGroupByMonth } from '@/stores/useFinanceStore';
import type { Company, Transaction } from '@/types/finance';

interface CompanyMovementDetailProps {
  company: Company;
}

export function CompanyMovementDetail({ company }: CompanyMovementDetailProps) {
  const { t } = useTranslate();
  const queryClient = useQueryClient();
  const [range, setRange] = useState<DateRangePreset>(DATE_RANGE_PRESET.ONE_YEAR);
  const { data, isLoading, isError, refetch } = useCompanyTransactions(company.companyId, range);
  const deleteTransaction = useDeleteTransaction();
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const groupByMonth = useGroupByMonth();
  const toggleGroupByMonth = useToggleGroupByMonth();

  const handleEdit = useCallback((transaction: Transaction) => {
    setEditingTransaction(transaction);
  }, []);

  const handleDelete = useCallback(
    async (transactionId: number) => {
      await deleteTransaction.mutateAsync(transactionId);
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.COMPANIES, 'transactions'] });
    },
    [deleteTransaction, queryClient],
  );

  const handleFormClose = useCallback(() => {
    setEditingTransaction(null);
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY.COMPANIES, 'transactions'] });
  }, [queryClient]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="text-center py-12" role="alert">
        <AlertCircle className="h-12 w-12 mx-auto mb-3 text-guard-danger opacity-50" aria-hidden="true" />
        <p className="text-guard-danger">{t('companies.errors.load-transactions')}</p>
        <button type="button" onClick={() => refetch()} className="btn-ghost mt-4 inline-flex items-center gap-2">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t('common.buttons.retry')}
        </button>
      </div>
    );
  }

  const { summary, months } = data;

  return (
    <div className="space-y-6">
      {/* Company header */}
      <div className="flex items-center gap-4">
        <div className="p-3 rounded-xl bg-guard-primary/10">
          <Building2 className="h-6 w-6 text-guard-primary" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">{company.name}</h2>
          {company.taxId && <p className="text-sm text-guard-muted">{company.taxId}</p>}
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        <DateRangeSelector value={range} onChange={setRange} />

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={groupByMonth}
            onChange={toggleGroupByMonth}
            className="h-4 w-4 rounded border-input text-guard-primary focus:ring-guard-primary accent-guard-primary"
          />
          <span className="text-sm text-guard-muted">{t('movements.group-by-month')}</span>
        </label>
      </div>

      {/* Stats cards */}
      <CategoryHistoryStats summary={summary} />

      {/* Monthly transaction sections */}
      {months.length > 0 ? (
        <CategoryHistoryMonths
          months={months}
          groupByMonth={groupByMonth}
          onEditTransaction={handleEdit}
          onDeleteTransaction={handleDelete}
        />
      ) : (
        <div className="card">
          <EmptyState
            icon={Building2}
            title={t('companies.empty-transactions.title')}
            subtitle={t('companies.empty-transactions.subtitle')}
          />
        </div>
      )}

      {/* Edit transaction modal */}
      {editingTransaction && <TransactionForm onClose={handleFormClose} transaction={editingTransaction} />}
    </div>
  );
}
