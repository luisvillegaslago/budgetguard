'use client';

/**
 * BudgetGuard Quick Expense Actions
 * Reusable cluster of "create" actions (group expenses, upload invoice, new transaction)
 * with their own modal state. Used on the dashboard header and the movements monthly tab,
 * so the create flow is available without duplicating modal wiring.
 */

import { FileInput, Layers, Plus } from 'lucide-react';
import { useState } from 'react';
import { FiscalDocumentUpload } from '@/components/fiscal/FiscalDocumentUpload';
import { TransactionForm } from '@/components/transactions/TransactionForm';
import { TransactionGroupForm } from '@/components/transactions/TransactionGroupForm';
import { useTranslate } from '@/hooks/useTranslations';
import { cn } from '@/utils/helpers';

interface QuickExpenseActionsProps {
  className?: string;
}

export function QuickExpenseActions({ className }: QuickExpenseActionsProps) {
  const { t } = useTranslate();
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [showInvoiceUpload, setShowInvoiceUpload] = useState(false);

  return (
    <>
      <div className={cn('flex items-center gap-2', className)}>
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

      {showTransactionForm && <TransactionForm onClose={() => setShowTransactionForm(false)} />}
      {showGroupForm && <TransactionGroupForm onClose={() => setShowGroupForm(false)} />}
      {showInvoiceUpload && (
        <FiscalDocumentUpload year={new Date().getFullYear()} onClose={() => setShowInvoiceUpload(false)} />
      )}
    </>
  );
}
