'use client';

/**
 * BudgetGuard Recurring Expenses Management Page
 * CRUD interface for managing recurring expense rules
 */

import { ArrowLeft, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { RecurringExpenseForm } from '@/components/recurring/RecurringExpenseForm';
import { RecurringExpenseList } from '@/components/recurring/RecurringExpenseList';
import { useTranslate } from '@/hooks/useTranslations';
import type { RecurringExpense } from '@/types/finance';

export default function RecurringExpensesPage() {
  const { t } = useTranslate();
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<RecurringExpense | null>(null);

  const handleEdit = (expense: RecurringExpense) => {
    setEditingExpense(expense);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingExpense(null);
  };

  return (
    <div className="min-h-screen bg-guard-light dark:bg-guard-dark">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="p-2 text-guard-muted hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              aria-label={t('recurring.management.back')}
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{t('recurring.management.title')}</h1>
              <p className="text-sm text-guard-muted mt-0.5">{t('recurring.management.subtitle')}</p>
            </div>
          </div>

          <button type="button" onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t('recurring.management.add')}</span>
          </button>
        </div>

        {/* List */}
        <RecurringExpenseList onEdit={handleEdit} onAdd={() => setShowForm(true)} />
      </div>

      {/* Form Modal */}
      {editingExpense && <RecurringExpenseForm expense={editingExpense} onClose={handleCloseForm} />}
      {showForm && !editingExpense && <RecurringExpenseForm onClose={handleCloseForm} />}
    </div>
  );
}
