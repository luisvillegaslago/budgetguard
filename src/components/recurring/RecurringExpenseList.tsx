'use client';

/**
 * BudgetGuard Recurring Expense List
 * Displays all recurring expense rules with management actions
 */

import { Pencil, Power, Repeat } from 'lucide-react';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { RECURRING_FREQUENCY, SHARED_EXPENSE } from '@/constants/finance';
import {
  useDeleteRecurringExpense,
  useRecurringExpenses,
  useUpdateRecurringExpense,
} from '@/hooks/useRecurringExpenses';
import { useTranslate } from '@/hooks/useTranslations';
import type { RecurringExpense } from '@/types/finance';
import { cn } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

interface RecurringExpenseItemProps {
  expense: RecurringExpense;
  onEdit: (expense: RecurringExpense) => void;
}

function RecurringExpenseItem({ expense, onEdit }: RecurringExpenseItemProps) {
  const { t } = useTranslate();
  const deleteMutation = useDeleteRecurringExpense();
  const updateMutation = useUpdateRecurringExpense();
  const iconColor = expense.category?.color ?? '#EF4444';
  const isShared = expense.sharedDivisor > SHARED_EXPENSE.DEFAULT_DIVISOR;

  const frequencyLabel = t(`recurring.frequency.${expense.frequency}`);

  let scheduleDetail = '';
  if (expense.frequency === RECURRING_FREQUENCY.WEEKLY && expense.dayOfWeek !== null) {
    scheduleDetail = t(`recurring.days-of-week-long.${expense.dayOfWeek}`);
  } else if (expense.frequency === RECURRING_FREQUENCY.MONTHLY && expense.dayOfMonth !== null) {
    scheduleDetail = `${t('recurring.form.fields.day-of-month')}: ${expense.dayOfMonth}`;
  } else if (
    expense.frequency === RECURRING_FREQUENCY.YEARLY &&
    expense.dayOfMonth !== null &&
    expense.monthOfYear !== null
  ) {
    scheduleDetail = `${expense.dayOfMonth} ${t(`recurring.months.${expense.monthOfYear}`)}`;
  }

  const handleToggleActive = () => {
    if (expense.isActive) {
      deleteMutation.mutate(expense.recurringExpenseId);
    } else {
      updateMutation.mutate({
        id: expense.recurringExpenseId,
        data: { isActive: true },
      });
    }
  };

  const isProcessing = deleteMutation.isPending || updateMutation.isPending;

  return (
    <div
      className={cn(
        'flex items-center gap-4 py-3 px-4 rounded-lg transition-colors group',
        expense.isActive ? 'hover:bg-muted/50' : 'opacity-60 hover:bg-muted/30',
      )}
    >
      {/* Icon */}
      <div className="flex-shrink-0 p-2 rounded-lg" style={{ backgroundColor: `${iconColor}15` }}>
        <CategoryIcon icon={expense.category?.icon} color={iconColor} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground truncate">{expense.category?.name}</p>
          <span
            className={cn(
              'text-[10px] font-bold px-1.5 py-0.5 rounded',
              expense.frequency === RECURRING_FREQUENCY.WEEKLY &&
                'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
              expense.frequency === RECURRING_FREQUENCY.MONTHLY &&
                'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
              expense.frequency === RECURRING_FREQUENCY.YEARLY &&
                'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300',
            )}
          >
            {frequencyLabel}
          </span>
          {isShared && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-guard-primary/10 text-guard-primary">
              {t('transactions.shared-badge')}
            </span>
          )}
          {!expense.isActive && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-guard-muted/20 text-guard-muted">
              {t('recurring.management.inactive')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-guard-muted">{scheduleDetail}</span>
          {expense.description && <span className="text-xs text-guard-muted truncate">- {expense.description}</span>}
        </div>
      </div>

      {/* Amount */}
      <span className="text-sm font-semibold text-guard-danger flex-shrink-0">
        {formatCurrency(expense.amountCents)}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => onEdit(expense)}
          className="p-1.5 rounded-md text-guard-muted hover:text-foreground hover:bg-muted transition-colors"
          aria-label={t('recurring.management.actions.edit')}
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleToggleActive}
          disabled={isProcessing}
          className={cn(
            'p-1.5 rounded-md transition-colors',
            expense.isActive
              ? 'text-guard-muted hover:text-guard-danger hover:bg-guard-danger/10'
              : 'text-guard-success hover:bg-guard-success/10',
          )}
          aria-label={
            expense.isActive ? t('recurring.management.actions.deactivate') : t('recurring.management.actions.activate')
          }
        >
          {isProcessing ? <LoadingSpinner size="sm" /> : <Power className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

interface RecurringExpenseListProps {
  onEdit: (expense: RecurringExpense) => void;
  onAdd: () => void;
}

export function RecurringExpenseList({ onEdit, onAdd }: RecurringExpenseListProps) {
  const { t } = useTranslate();
  const { data, isLoading, isError, refetch } = useRecurringExpenses();

  if (isLoading) {
    return (
      <div className="card">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 py-3 px-4 animate-pulse">
              <div className="h-9 w-9 bg-muted rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-28 bg-muted rounded" />
                <div className="h-3 w-20 bg-muted rounded" />
              </div>
              <div className="h-4 w-16 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="card">
        <ErrorState message={t('errors.generic')} onRetry={() => refetch()} />
      </div>
    );
  }

  const expenses = data?.data ?? [];

  if (expenses.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={Repeat}
          title={t('recurring.management.empty.title')}
          subtitle={t('recurring.management.empty.subtitle')}
          action={
            <button type="button" onClick={onAdd} className="btn-primary inline-flex items-center gap-2">
              {t('recurring.management.add')}
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">{t('common.records', { count: expenses.length })}</h3>
      </div>

      <ul className="-mx-4">
        {expenses.map((expense) => (
          <li key={expense.recurringExpenseId}>
            <RecurringExpenseItem expense={expense} onEdit={onEdit} />
          </li>
        ))}
      </ul>
    </div>
  );
}
