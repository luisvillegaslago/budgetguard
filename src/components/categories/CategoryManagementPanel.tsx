'use client';

/**
 * BudgetGuard Category Management Panel
 * Main container for CRUD operations on categories
 */

import { AlertCircle, FolderOpen, Plus, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { CategoryDeleteDialog } from '@/components/categories/CategoryDeleteDialog';
import { CategoryFormModal } from '@/components/categories/CategoryFormModal';
import { CategoryTree } from '@/components/categories/CategoryTree';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { FILTER_TYPE, TRANSACTION_TYPE } from '@/constants/finance';
import { useAllCategoriesHierarchical, useUpdateCategory } from '@/hooks/useCategories';
import { useTranslate } from '@/hooks/useTranslations';
import type { Category, TransactionType } from '@/types/finance';
import { cn } from '@/utils/helpers';

type FilterType = typeof FILTER_TYPE.ALL | TransactionType;

interface ModalState {
  type: 'none' | 'create' | 'edit' | 'subcategory' | 'delete';
  category?: Category;
  parentCategory?: Category;
}

export function CategoryManagementPanel() {
  const { t } = useTranslate();
  const [typeFilter, setTypeFilter] = useState<FilterType>(FILTER_TYPE.ALL);
  const [modal, setModal] = useState<ModalState>({ type: 'none' });
  const updateCategory = useUpdateCategory();

  const queryType = typeFilter === FILTER_TYPE.ALL ? undefined : (typeFilter as TransactionType);
  const { data: categories, isLoading, isError, refetch } = useAllCategoriesHierarchical(queryType);

  const handleEdit = (category: Category) => {
    setModal({ type: 'edit', category });
  };

  const handleDelete = (category: Category) => {
    setModal({ type: 'delete', category });
  };

  const handleToggleActive = async (category: Category) => {
    await updateCategory.mutateAsync({
      id: category.categoryId,
      data: { isActive: !category.isActive },
    });
  };

  const handleAddSubcategory = (parent: Category) => {
    setModal({ type: 'subcategory', parentCategory: parent });
  };

  const closeModal = () => {
    setModal({ type: 'none' });
  };

  const filterButtons: { key: FilterType; label: string }[] = [
    { key: FILTER_TYPE.ALL, label: t('category-management.filter.all') },
    { key: TRANSACTION_TYPE.INCOME, label: t('category-management.filter.income') },
    { key: TRANSACTION_TYPE.EXPENSE, label: t('category-management.filter.expense') },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t('category-management.title')}</h2>
          <p className="text-sm text-guard-muted">{t('category-management.subtitle')}</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Type Filter */}
          <div className="flex gap-1 bg-muted rounded-lg p-1" role="tablist">
            {filterButtons.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={typeFilter === key}
                onClick={() => setTypeFilter(key)}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ease-out-quart',
                  typeFilter === key
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-guard-muted hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Add Category Button */}
          <button
            type="button"
            onClick={() => setModal({ type: 'create' })}
            className="btn-primary flex items-center gap-2"
          >
            <span>{t('category-management.add-category')}</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="card">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        )}

        {isError && (
          <div className="text-center py-12" role="alert">
            <AlertCircle className="h-12 w-12 mx-auto mb-3 text-guard-danger opacity-50" aria-hidden="true" />
            <p className="text-guard-danger">{t('errors.load-categories')}</p>
            <button type="button" onClick={() => refetch()} className="btn-ghost mt-4 inline-flex items-center gap-2">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {t('common.buttons.retry')}
            </button>
          </div>
        )}

        {!isLoading && !isError && categories?.length === 0 && (
          <div className="text-center py-12 text-guard-muted">
            <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-30" aria-hidden="true" />
            <p className="font-medium">{t('category-management.empty.title')}</p>
            <p className="text-sm mt-1">{t('category-management.empty.subtitle')}</p>
            <button
              type="button"
              onClick={() => setModal({ type: 'create' })}
              className="btn-primary mt-4 inline-flex items-center gap-2"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t('category-management.empty.cta')}
            </button>
          </div>
        )}

        {!isLoading && !isError && categories && categories.length > 0 && (
          <CategoryTree
            categories={categories}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onToggleActive={handleToggleActive}
            onAddSubcategory={handleAddSubcategory}
          />
        )}
      </div>

      {/* Modals */}
      {modal.type === 'create' && <CategoryFormModal onClose={closeModal} />}

      {modal.type === 'edit' && modal.category && (
        <CategoryFormModal onClose={closeModal} editCategory={modal.category} />
      )}

      {modal.type === 'subcategory' && modal.parentCategory && (
        <CategoryFormModal onClose={closeModal} parentCategory={modal.parentCategory} />
      )}

      {modal.type === 'delete' && modal.category && (
        <CategoryDeleteDialog category={modal.category} onClose={closeModal} onDeleted={closeModal} />
      )}
    </div>
  );
}
