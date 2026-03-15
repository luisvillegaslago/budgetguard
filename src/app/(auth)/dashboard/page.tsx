'use client';

/**
 * BudgetGuard Dashboard
 * Main page showing monthly overview, category breakdown, and transactions
 */

import { Beer, FileInput, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { BalanceCards } from '@/components/dashboard/BalanceCards';
import { CategoryBreakdown } from '@/components/dashboard/CategoryBreakdown';
import { FiscalDeadlineBanner } from '@/components/fiscal/FiscalDeadlineBanner';
import { FiscalDocumentUpload } from '@/components/fiscal/FiscalDocumentUpload';
import { RecurringPendingPanel } from '@/components/recurring/RecurringPendingPanel';
import { TransactionForm } from '@/components/transactions/TransactionForm';
import { TransactionGroupForm } from '@/components/transactions/TransactionGroupForm';
import { TransactionList } from '@/components/transactions/TransactionList';
import { MonthPicker } from '@/components/ui/MonthPicker';
import { GOING_OUT_CATEGORY, TRANSACTION_TYPE } from '@/constants/finance';
import { useCategoriesHierarchical } from '@/hooks/useCategories';
import { useDashboardUrlSync } from '@/hooks/useDashboardUrlSync';
import { useTranslate } from '@/hooks/useTranslations';
import type { Transaction } from '@/types/finance';

export default function DashboardPage() {
  const { t } = useTranslate();
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [showInvoiceUpload, setShowInvoiceUpload] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  // Bidirectional sync: URL ↔ Zustand (month, type filter)
  useDashboardUrlSync();

  // Resolve "Salir" category ID for the going-out shortcut
  const { data: expenseCategories } = useCategoriesHierarchical(TRANSACTION_TYPE.EXPENSE);
  const goingOutCategoryId = useMemo(
    () => expenseCategories?.find((c) => c.name === GOING_OUT_CATEGORY.NAME)?.categoryId,
    [expenseCategories],
  );

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Month Picker + Actions */}
      <div className="flex items-center justify-between mb-8">
        <MonthPicker />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowGroupForm(true)}
            className="btn-ghost flex items-center gap-2"
            aria-label={t('dashboard.actions.going-out')}
          >
            <Beer className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t('dashboard.actions.going-out')}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowInvoiceUpload(true)}
            className="btn-ghost flex items-center gap-2"
            aria-label={t('dashboard.actions.add-invoice')}
          >
            <FileInput className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t('dashboard.actions.add-invoice')}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowTransactionForm(true)}
            className="btn-primary flex items-center gap-2"
            aria-label={t('transactions.new')}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t('transactions.new')}</span>
          </button>
        </div>
      </div>

      <div className="space-y-8">
        {/* Fiscal Deadline Banner */}
        <FiscalDeadlineBanner />

        {/* Balance Cards */}
        <section>
          <BalanceCards />
        </section>

        {/* Recurring Pending Panel */}
        <RecurringPendingPanel />

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
          {/* Category Breakdown */}
          <section>
            <CategoryBreakdown />
          </section>

          {/* Transaction List */}
          <section>
            <TransactionList
              onAddTransaction={() => setShowTransactionForm(true)}
              onEditTransaction={setEditingTransaction}
            />
          </section>
        </div>
      </div>

      {/* Transaction Form Modal */}
      {editingTransaction && (
        <TransactionForm transaction={editingTransaction} onClose={() => setEditingTransaction(null)} />
      )}
      {showTransactionForm && !editingTransaction && <TransactionForm onClose={() => setShowTransactionForm(false)} />}

      {/* Transaction Group Form Modal */}
      {showGroupForm && (
        <TransactionGroupForm onClose={() => setShowGroupForm(false)} defaultParentCategoryId={goingOutCategoryId} />
      )}

      {/* Invoice Upload Modal */}
      {showInvoiceUpload && (
        <FiscalDocumentUpload year={new Date().getFullYear()} onClose={() => setShowInvoiceUpload(false)} />
      )}
    </div>
  );
}
