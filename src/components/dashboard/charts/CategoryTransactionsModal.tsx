'use client';

/**
 * BudgetGuard Category Transactions Modal
 * Popup listing the transactions of a category (parent + its subcategories)
 * for the selected month. Opened from the dashboard "Top categories" widget.
 */

import { CategoryIcon } from '@/components/ui/CategoryIcon';
import type { Transaction } from '@/types/finance';
import { MonthTransactionsModal } from './MonthTransactionsModal';

interface CategoryTransactionsModalProps {
  categoryId: number;
  categoryName: string;
  categoryIcon: string | null;
  categoryColor: string | null;
  month: string;
  onClose: () => void;
}

export function CategoryTransactionsModal({
  categoryId,
  categoryName,
  categoryIcon,
  categoryColor,
  month,
  onClose,
}: CategoryTransactionsModalProps) {
  const color = categoryColor ?? '#6366F1';

  // Match transactions on the parent category itself or any of its subcategories.
  const filter = (tx: Transaction) => tx.categoryId === categoryId || tx.parentCategory?.categoryId === categoryId;

  // Show the subcategory name when the transaction belongs to a child category.
  const secondary = (tx: Transaction) => (tx.parentCategory ? (tx.category?.name ?? null) : null);

  return (
    <MonthTransactionsModal
      title={categoryName}
      icon={
        <div className="flex-shrink-0 p-2 rounded-lg" style={{ backgroundColor: `${color}15` }}>
          <CategoryIcon icon={categoryIcon} color={color} />
        </div>
      }
      month={month}
      filter={filter}
      secondary={secondary}
      footerHref={`/movements?category=${categoryId}`}
      onClose={onClose}
    />
  );
}
