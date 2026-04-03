'use client';

/**
 * BudgetGuard Dashboard
 * Main page showing monthly overview, category breakdown, and transactions
 */

import { FileInput, Layers, Plus } from 'lucide-react';
import { useState } from 'react';
import { BalanceCards } from '@/components/dashboard/BalanceCards';
import { CategoryBreakdown } from '@/components/dashboard/CategoryBreakdown';
import { FiscalDeadlineBanner } from '@/components/fiscal/FiscalDeadlineBanner';
import { FiscalDocumentUpload } from '@/components/fiscal/FiscalDocumentUpload';
import { RecurringPendingPanel } from '@/components/recurring/RecurringPendingPanel';
import { PendingTransactionsBanner } from '@/components/transactions/PendingTransactionsBanner';
import { TransactionForm } from '@/components/transactions/TransactionForm';
import { TransactionGroupForm } from '@/components/transactions/TransactionGroupForm';
import { TransactionList } from '@/components/transactions/TransactionList';
import { ActiveTripBanner } from '@/components/trips/ActiveTripBanner';
import { TripExpenseForm } from '@/components/trips/TripExpenseForm';
import { MonthPicker } from '@/components/ui/MonthPicker';
import { useDashboardUrlSync } from '@/hooks/useDashboardUrlSync';
import { useTranslate } from '@/hooks/useTranslations';
import { useMonthNavigation, useSelectedMonth } from '@/stores/useFinanceStore';
import type { Transaction } from '@/types/finance';
import { getCurrentMonth } from '@/utils/helpers';

function MobileTodayButton() {
  const { t } = useTranslate();
  const selectedMonth = useSelectedMonth();
  const { goToCurrentMonth } = useMonthNavigation();
  const isCurrentMonth = selectedMonth === getCurrentMonth();

  if (isCurrentMonth) return null;

  return (
    <button
      type="button"
      onClick={goToCurrentMonth}
      className="sm:hidden px-3 py-1.5 text-sm font-medium text-guard-primary hover:bg-guard-primary/10 rounded-lg transition-colors"
    >
      {t('common.today')}
    </button>
  );
}

export default function DashboardPage() {
  const { t } = useTranslate();
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [showInvoiceUpload, setShowInvoiceUpload] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [tripExpenseForTripId, setTripExpenseForTripId] = useState<number | null>(null);

  // Bidirectional sync: URL ↔ Zustand (month, type filter)
  useDashboardUrlSync();

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Month Picker + Actions */}
      <div className="flex flex-col items-center sm:flex-row sm:justify-between gap-3 mb-8">
        <MonthPicker />

        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <MobileTodayButton />
          <button
            type="button"
            onClick={() => setShowGroupForm(true)}
            className="btn-ghost flex items-center gap-2"
            aria-label={t('dashboard.actions.group-expense')}
          >
            <Layers className="h-4 w-4" aria-hidden="true" />
            <span>{t('dashboard.actions.group-expense')}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowInvoiceUpload(true)}
            className="btn-ghost flex items-center gap-2"
            aria-label={t('dashboard.actions.add-invoice')}
          >
            <FileInput className="h-4 w-4" aria-hidden="true" />
            <span>{t('dashboard.actions.add-invoice')}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowTransactionForm(true)}
            className="btn-primary flex items-center gap-2"
            aria-label={t('transactions.new')}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>{t('transactions.new')}</span>
          </button>
        </div>
      </div>

      <div className="space-y-8">
        {/* Banners */}
        <ActiveTripBanner onAddExpense={setTripExpenseForTripId} />

        {/* Balance Cards */}
        <section>
          <BalanceCards />
        </section>

        {/* Collapsible panels */}
        <div className="space-y-3">
          <PendingTransactionsBanner />
          <FiscalDeadlineBanner />
          <RecurringPendingPanel />
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
          {/* Category Breakdown */}
          <section className="order-2 md:order-1">
            <CategoryBreakdown />
          </section>

          {/* Transaction List */}
          <section className="order-1 md:order-2">
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
      {showGroupForm && <TransactionGroupForm onClose={() => setShowGroupForm(false)} />}

      {/* Invoice Upload Modal */}
      {showInvoiceUpload && (
        <FiscalDocumentUpload year={new Date().getFullYear()} onClose={() => setShowInvoiceUpload(false)} />
      )}

      {/* Trip Expense Modal */}
      {tripExpenseForTripId !== null && (
        <TripExpenseForm tripId={tripExpenseForTripId} onClose={() => setTripExpenseForTripId(null)} />
      )}
    </div>
  );
}
