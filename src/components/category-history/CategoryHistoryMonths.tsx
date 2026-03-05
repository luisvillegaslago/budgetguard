'use client';

/**
 * Monthly transaction sections with sticky headers for category history
 * Read-only display — no edit/delete actions
 */

import { SHARED_EXPENSE } from '@/constants/finance';
import { useTranslate } from '@/hooks/useTranslations';
import type { CategoryHistoryMonth, Transaction } from '@/types/finance';
import { formatDate } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

interface TransactionRowProps {
  transaction: Transaction;
}

function TransactionRow({ transaction }: TransactionRowProps) {
  const { t } = useTranslate();
  const subcategoryName = transaction.category?.name ?? t('transactions.no-category');
  const isShared = transaction.sharedDivisor > SHARED_EXPENSE.DEFAULT_DIVISOR;

  return (
    <div className="flex items-center gap-3 py-2.5 px-4">
      <span className="text-xs text-guard-muted w-12 flex-shrink-0">{formatDate(transaction.transactionDate)}</span>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground truncate">{transaction.description || subcategoryName}</p>
        {transaction.description && <p className="text-xs text-guard-muted truncate">{subcategoryName}</p>}
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {isShared && (
          <span className="text-[10px] font-medium text-guard-primary bg-guard-primary/10 px-1 py-0.5 rounded">
            {t('transactions.shared-badge')}
          </span>
        )}
        <span className="text-sm font-semibold text-guard-danger tabular-nums">
          {formatCurrency(transaction.amountCents)}
        </span>
      </div>
    </div>
  );
}

interface MonthSectionProps {
  monthData: CategoryHistoryMonth;
}

function MonthSection({ monthData }: MonthSectionProps) {
  const { t } = useTranslate();
  const monthLabel = formatDate(`${monthData.month}-01`, 'month');

  return (
    <section>
      <div className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-white/80 dark:bg-guard-dark/80 backdrop-blur-md border-b border-guard-muted/10">
        <span className="text-sm font-bold uppercase tracking-wider text-guard-muted">{monthLabel}</span>
        <span className="text-sm font-semibold text-guard-danger">
          {t('category-history.month-total', { amount: formatCurrency(monthData.totalCents) })}
        </span>
      </div>

      <div className="divide-y divide-border/50">
        {monthData.transactions.map((tx: Transaction) => (
          <TransactionRow key={tx.transactionId} transaction={tx} />
        ))}
      </div>
    </section>
  );
}

interface CategoryHistoryMonthsProps {
  months: CategoryHistoryMonth[];
}

export function CategoryHistoryMonths({ months }: CategoryHistoryMonthsProps) {
  return (
    <div className="card overflow-hidden p-0">
      {months.map((monthData) => (
        <MonthSection key={monthData.month} monthData={monthData} />
      ))}
    </div>
  );
}
