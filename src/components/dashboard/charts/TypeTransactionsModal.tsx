'use client';

/**
 * BudgetGuard Type Transactions Modal
 * Popup listing the selected month's transactions of a given type (income/expense).
 * Opened from the dashboard balance cards.
 */

import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { TRANSACTION_TYPE, type TransactionType } from '@/constants/finance';
import { useTranslate } from '@/hooks/useTranslations';
import { useSetFilters } from '@/stores/useFinanceStore';
import type { Transaction } from '@/types/finance';
import { CHART_COLORS } from './chartConfig';
import { MonthTransactionsModal } from './MonthTransactionsModal';

interface TypeTransactionsModalProps {
  type: TransactionType;
  month: string;
  onClose: () => void;
}

export function TypeTransactionsModal({ type, month, onClose }: TypeTransactionsModalProps) {
  const { t } = useTranslate();
  const setFilters = useSetFilters();

  const isIncome = type === TRANSACTION_TYPE.INCOME;
  const color = isIncome ? CHART_COLORS.income : CHART_COLORS.expense;
  const Icon = isIncome ? ArrowDownLeft : ArrowUpRight;
  const title = isIncome ? t('dashboard.balance-cards.income') : t('dashboard.balance-cards.expenses');

  // Category breadcrumb (parent › child) as the secondary line.
  const secondary = (tx: Transaction) =>
    tx.parentCategory ? `${tx.parentCategory.name} › ${tx.category?.name ?? ''}` : (tx.category?.name ?? null);

  return (
    <MonthTransactionsModal
      title={title}
      icon={
        <div className="flex-shrink-0 p-2 rounded-lg" style={{ backgroundColor: `${color}15`, color }}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      }
      month={month}
      filter={(tx) => tx.type === type}
      secondary={secondary}
      footerHref="/movements"
      onFooterClick={() => setFilters({ type })}
      onClose={onClose}
    />
  );
}
