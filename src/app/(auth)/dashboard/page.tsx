'use client';

/**
 * BudgetGuard Dashboard
 * Main page showing monthly overview, category breakdown, and transactions
 */

import { Plus, Shield } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BalanceCards } from '@/components/dashboard/BalanceCards';
import { CategoryBreakdown } from '@/components/dashboard/CategoryBreakdown';
import { TransactionForm } from '@/components/transactions/TransactionForm';
import { TransactionList } from '@/components/transactions/TransactionList';
import { MonthPicker } from '@/components/ui/MonthPicker';
import { useFinanceStore } from '@/stores/useFinanceStore';

export default function DashboardPage() {
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const goToCurrentMonth = useFinanceStore((s) => s.goToCurrentMonth);

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
                <Shield className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold text-foreground">BudgetGuard</span>
            </div>

            {/* Month Picker */}
            <MonthPicker />

            {/* New Transaction Button */}
            <button
              type="button"
              onClick={() => setShowTransactionForm(true)}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Nueva</span>
            </button>
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

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Category Breakdown */}
            <section>
              <CategoryBreakdown />
            </section>

            {/* Transaction List */}
            <section>
              <TransactionList />
            </section>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-sm text-guard-muted text-center">BudgetGuard - Control de gastos familiar</p>
        </div>
      </footer>

      {/* Transaction Form Modal */}
      {showTransactionForm && <TransactionForm onClose={() => setShowTransactionForm(false)} />}
    </div>
  );
}
