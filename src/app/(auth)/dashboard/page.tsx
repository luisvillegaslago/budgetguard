'use client';

/**
 * BudgetGuard Dashboard
 * Main page showing monthly overview, category breakdown, and transactions
 */

import { Beer, LayoutGrid, Plane, Plus, Repeat, Settings, Shield } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BalanceCards } from '@/components/dashboard/BalanceCards';
import { CategoryBreakdown } from '@/components/dashboard/CategoryBreakdown';
import { RecurringPendingPanel } from '@/components/recurring/RecurringPendingPanel';
import { TransactionForm } from '@/components/transactions/TransactionForm';
import { TransactionGroupForm } from '@/components/transactions/TransactionGroupForm';
import { TransactionList } from '@/components/transactions/TransactionList';
import { MonthPicker } from '@/components/ui/MonthPicker';
import { GOING_OUT_CATEGORY, TRANSACTION_TYPE } from '@/constants/finance';
import { useCategoriesHierarchical } from '@/hooks/useCategories';
import { useTranslate } from '@/hooks/useTranslations';
import { useFinanceStore } from '@/stores/useFinanceStore';
import type { Transaction } from '@/types/finance';

export default function DashboardPage() {
  const { t } = useTranslate();
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [showNavMenu, setShowNavMenu] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const goToCurrentMonth = useFinanceStore((s) => s.goToCurrentMonth);
  const navMenuRef = useRef<HTMLDivElement>(null);

  // Resolve "Salir" category ID for the going-out shortcut
  const { data: expenseCategories } = useCategoriesHierarchical(TRANSACTION_TYPE.EXPENSE);
  const goingOutCategoryId = useMemo(
    () => expenseCategories?.find((c) => c.name === GOING_OUT_CATEGORY.NAME)?.categoryId,
    [expenseCategories],
  );

  // Close nav menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (navMenuRef.current && !navMenuRef.current.contains(e.target as Node)) {
        setShowNavMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync selected month with actual current month on mount
  // Prevents stale state from HMR/module caching in development
  useEffect(() => {
    goToCurrentMonth();
  }, [goToCurrentMonth]);

  return (
    <div className="min-h-screen flex flex-col bg-guard-light dark:bg-guard-dark">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="p-2 bg-guard-primary rounded-lg">
                <Shield className="h-5 w-5 text-white" aria-hidden="true" />
              </div>
              <span className="text-xl font-bold text-foreground">{t('common.app-name')}</span>
            </div>

            {/* Month Picker */}
            <MonthPicker />

            {/* Actions */}
            <div className="flex items-center gap-2">
              {/* Navigation Menu */}
              <div className="relative" ref={navMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowNavMenu(!showNavMenu)}
                  className="p-2 text-guard-muted hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                  aria-label={t('dashboard.actions.menu')}
                  aria-expanded={showNavMenu}
                  aria-haspopup="true"
                >
                  <LayoutGrid className="h-5 w-5" aria-hidden="true" />
                </button>
                {showNavMenu && (
                  <div className="absolute right-0 mt-2 w-52 rounded-lg border border-border bg-card shadow-md z-50 animate-fade-in overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        setShowGroupForm(true);
                        setShowNavMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <Beer className="h-4 w-4 text-guard-muted" aria-hidden="true" />
                      {t('dashboard.actions.going-out')}
                    </button>
                    <Link
                      href="/trips"
                      onClick={() => setShowNavMenu(false)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <Plane className="h-4 w-4 text-guard-muted" aria-hidden="true" />
                      {t('trips.title')}
                    </Link>
                    <Link
                      href="/recurring-expenses"
                      onClick={() => setShowNavMenu(false)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <Repeat className="h-4 w-4 text-guard-muted" aria-hidden="true" />
                      {t('recurring.management.title')}
                    </Link>
                    <Link
                      href="/categories"
                      onClick={() => setShowNavMenu(false)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <Settings className="h-4 w-4 text-guard-muted" aria-hidden="true" />
                      {t('category-management.title')}
                    </Link>
                  </div>
                )}
              </div>

              {/* New Transaction Button (direct, no dropdown) */}
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
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          {/* Balance Cards */}
          <section>
            <BalanceCards />
          </section>

          {/* Recurring Pending Panel */}
          <RecurringPendingPanel />

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
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
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-sm text-guard-muted text-center">{t('dashboard.footer')}</p>
        </div>
      </footer>

      {/* Transaction Form Modal */}
      {editingTransaction && (
        <TransactionForm transaction={editingTransaction} onClose={() => setEditingTransaction(null)} />
      )}
      {showTransactionForm && !editingTransaction && <TransactionForm onClose={() => setShowTransactionForm(false)} />}

      {/* Transaction Group Form Modal */}
      {showGroupForm && (
        <TransactionGroupForm onClose={() => setShowGroupForm(false)} defaultParentCategoryId={goingOutCategoryId} />
      )}
    </div>
  );
}
