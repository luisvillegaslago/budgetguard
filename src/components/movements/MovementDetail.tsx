'use client';

/**
 * Movement Detail
 * Shows category history detail (stats + monthly breakdown) for the selected category
 * Supports editing/deleting transactions and filtering by subcategory
 */

import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, History, RefreshCw } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { CategoryHistoryMonths } from '@/components/category-history/CategoryHistoryMonths';
import { CategoryHistoryStats } from '@/components/category-history/CategoryHistoryStats';
import { DateRangeSelector } from '@/components/category-history/DateRangeSelector';
import { TransactionForm } from '@/components/transactions/TransactionForm';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { DateRangePreset } from '@/constants/finance';
import { DATE_RANGE_PRESET, QUERY_KEY } from '@/constants/finance';
import { useCategoryHistory } from '@/hooks/useCategoryHistory';
import { useDeleteTransaction } from '@/hooks/useTransactions';
import { useTranslate } from '@/hooks/useTranslations';
import { useGroupByMonth, useToggleGroupByMonth } from '@/stores/useFinanceStore';
import type { Category, CategoryHistoryMonth, Transaction } from '@/types/finance';
import { cn } from '@/utils/helpers';

interface SubcategoryOption {
  categoryId: number;
  name: string;
}

interface MovementDetailProps {
  category: Category;
  initialSubcategoryId?: number | null;
}

export function MovementDetail({ category, initialSubcategoryId = null }: MovementDetailProps) {
  const { t } = useTranslate();
  const queryClient = useQueryClient();
  const [range, setRange] = useState<DateRangePreset>(DATE_RANGE_PRESET.ONE_YEAR);
  const { data, isLoading, isError, refetch } = useCategoryHistory(category.categoryId, range);
  const deleteTransaction = useDeleteTransaction();
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<number | null>(initialSubcategoryId);
  const groupByMonth = useGroupByMonth();
  const toggleGroupByMonth = useToggleGroupByMonth();

  const categoryColor = category.color ?? '#6366F1';

  // Extract unique subcategories from all transactions
  const subcategories = useMemo((): SubcategoryOption[] => {
    if (!data?.months) return [];
    const map = new Map<number, string>();
    data.months.forEach((month) => {
      month.transactions.forEach((tx) => {
        if (tx.category && tx.categoryId !== category.categoryId) {
          map.set(tx.categoryId, tx.category.name);
        }
      });
    });
    return Array.from(map.entries())
      .map(([categoryId, name]) => ({ categoryId, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data?.months, category.categoryId]);

  // Filter months by selected subcategory
  const filteredMonths = useMemo((): CategoryHistoryMonth[] => {
    if (!data?.months) return [];
    if (selectedSubcategoryId === null) return data.months;

    return data.months
      .map((month) => {
        const filtered = month.transactions.filter((tx) => tx.categoryId === selectedSubcategoryId);
        if (filtered.length === 0) return null;
        return {
          ...month,
          transactions: filtered,
          totalCents: filtered.reduce((sum, tx) => sum + tx.amountCents, 0),
          transactionCount: filtered.length,
        };
      })
      .filter((m): m is CategoryHistoryMonth => m !== null);
  }, [data?.months, selectedSubcategoryId]);

  const handleEdit = useCallback((transaction: Transaction) => {
    setEditingTransaction(transaction);
  }, []);

  const handleDelete = useCallback(
    async (transactionId: number) => {
      await deleteTransaction.mutateAsync(transactionId);
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.CATEGORY_HISTORY] });
    },
    [deleteTransaction, queryClient],
  );

  const handleFormClose = useCallback(() => {
    setEditingTransaction(null);
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY.CATEGORY_HISTORY] });
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
        <p className="text-guard-danger">{t('category-history.errors.load')}</p>
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
      {/* Category header */}
      <div className="flex items-center gap-4">
        <div className="p-3 rounded-xl" style={{ backgroundColor: `${categoryColor}15` }}>
          <CategoryIcon icon={category.icon} color={categoryColor} className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-bold text-foreground">{category.name}</h2>
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

        {subcategories.length > 1 && (
          <div
            className="flex gap-1 rounded-lg bg-muted/50 p-1 flex-wrap"
            role="tablist"
            aria-label={t('movements.subcategory-filter')}
          >
            <button
              type="button"
              role="tab"
              aria-selected={selectedSubcategoryId === null}
              onClick={() => setSelectedSubcategoryId(null)}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200',
                selectedSubcategoryId === null
                  ? 'bg-guard-primary text-white shadow-sm'
                  : 'text-guard-muted hover:text-foreground hover:bg-muted',
              )}
            >
              {t('movements.all-subcategories')}
            </button>
            {subcategories.map((sub) => (
              <button
                key={sub.categoryId}
                type="button"
                role="tab"
                aria-selected={selectedSubcategoryId === sub.categoryId}
                onClick={() => setSelectedSubcategoryId(sub.categoryId)}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200',
                  selectedSubcategoryId === sub.categoryId
                    ? 'bg-guard-primary text-white shadow-sm'
                    : 'text-guard-muted hover:text-foreground hover:bg-muted',
                )}
              >
                {sub.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Stats cards */}
      <CategoryHistoryStats summary={summary} />

      {/* Monthly transaction sections */}
      {filteredMonths.length > 0 ? (
        <CategoryHistoryMonths
          months={filteredMonths}
          groupByMonth={groupByMonth}
          onEditTransaction={handleEdit}
          onDeleteTransaction={handleDelete}
        />
      ) : months.length > 0 ? (
        <div className="card">
          <EmptyState
            icon={History}
            title={t('movements.no-transactions-subcategory')}
            subtitle={t('movements.try-other-subcategory')}
          />
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon={History}
            title={t('category-history.empty.title')}
            subtitle={t('category-history.empty.subtitle')}
          />
        </div>
      )}

      {/* Edit transaction modal */}
      {editingTransaction && <TransactionForm onClose={handleFormClose} transaction={editingTransaction} />}
    </div>
  );
}
