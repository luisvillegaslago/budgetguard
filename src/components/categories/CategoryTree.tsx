'use client';

/**
 * BudgetGuard Category Tree
 * Hierarchical list of categories with expand/collapse and action buttons
 */

import { ChevronRight, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { Tooltip } from '@/components/ui/Tooltip';
import { TRANSACTION_TYPE } from '@/constants/finance';
import { useTranslate } from '@/hooks/useTranslations';
import type { Category } from '@/types/finance';
import { cn } from '@/utils/helpers';

interface CategoryRowProps {
  category: Category;
  depth: number;
  index: number;
  isExpanded: boolean;
  onToggleExpand: (id: number) => void;
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
  onToggleActive: (category: Category) => void;
  onAddSubcategory: (parent: Category) => void;
}

function CategoryRow({
  category,
  depth,
  index,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onToggleActive,
  onAddSubcategory,
}: CategoryRowProps) {
  const { t } = useTranslate();
  const hasChildren = (category.subcategories?.length ?? 0) > 0;
  const isParent = depth === 0;
  const barColor = category.color ?? '#6366F1';

  return (
    <div
      className={cn('animate-fade-in', category.isActive ? '' : 'opacity-50')}
      style={{ animationDelay: `${index * 40}ms`, animationFillMode: 'both' }}
    >
      <div
        className={cn(
          'flex items-center gap-3 py-3 group',
          'hover:bg-muted/30 -mx-2 px-2 rounded-lg transition-colors',
          depth > 0 && 'pl-12',
        )}
      >
        {/* Expand/collapse chevron — only for parents */}
        {isParent ? (
          <button
            type="button"
            onClick={() => onToggleExpand(category.categoryId)}
            className="w-5 flex-shrink-0"
            aria-expanded={isExpanded}
            aria-label={
              isExpanded ? t('dashboard.category-breakdown.collapse') : t('dashboard.category-breakdown.expand')
            }
          >
            {hasChildren && (
              <ChevronRight
                className={cn(
                  'h-4 w-4 text-guard-muted transition-transform duration-200 ease-out-quart',
                  isExpanded && 'rotate-90',
                )}
                aria-hidden="true"
              />
            )}
          </button>
        ) : (
          <div className="w-5 flex-shrink-0" />
        )}

        {/* Icon */}
        <div className="flex-shrink-0 p-2 rounded-lg" style={{ backgroundColor: `${barColor}15` }}>
          <CategoryIcon icon={category.icon} color={barColor} />
        </div>

        {/* Name + badges */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">{category.name}</span>
          {!category.isActive && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-guard-muted/20 text-guard-muted">
              {t('category-management.badges.inactive')}
            </span>
          )}
          {category.defaultShared && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-guard-primary/10 text-guard-primary">
              {t('category-management.badges.shared')}
            </span>
          )}
          {category.modelo100CasillaCode && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-guard-warning/10 text-guard-warning tabular-nums">
              [{category.modelo100CasillaCode}]
            </span>
          )}
        </div>

        {/* Type badge */}
        <span
          className={cn(
            'px-2 py-0.5 text-[10px] font-semibold rounded-full',
            category.type === TRANSACTION_TYPE.INCOME
              ? 'bg-guard-success/10 text-guard-success'
              : 'bg-guard-danger/10 text-guard-danger',
          )}
        >
          {category.type === TRANSACTION_TYPE.INCOME
            ? t('category-management.filter.income')
            : t('category-management.filter.expense')}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
          <Tooltip content={t('category-management.actions.edit')}>
            <button
              type="button"
              onClick={() => onEdit(category)}
              className="p-1.5 text-guard-muted hover:text-foreground hover:bg-muted rounded-md transition-colors"
              aria-label={t('category-management.actions.edit')}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </Tooltip>

          <Tooltip
            content={
              category.isActive
                ? t('category-management.actions.deactivate')
                : t('category-management.actions.activate')
            }
          >
            <button
              type="button"
              onClick={() => onToggleActive(category)}
              className="p-1.5 text-guard-muted hover:text-foreground hover:bg-muted rounded-md transition-colors"
              aria-label={
                category.isActive
                  ? t('category-management.actions.deactivate')
                  : t('category-management.actions.activate')
              }
            >
              {category.isActive ? (
                <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
          </Tooltip>

          <Tooltip content={t('category-management.actions.delete')}>
            <button
              type="button"
              onClick={() => onDelete(category)}
              className="p-1.5 text-guard-muted hover:text-guard-danger hover:bg-guard-danger/10 rounded-md transition-colors"
              aria-label={t('category-management.actions.delete')}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </Tooltip>

          {isParent && (
            <Tooltip content={t('category-management.actions.add-subcategory')}>
              <button
                type="button"
                onClick={() => onAddSubcategory(category)}
                className="p-1.5 text-guard-muted hover:text-guard-primary hover:bg-guard-primary/10 rounded-md transition-colors"
                aria-label={t('category-management.actions.add-subcategory')}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}

interface CategoryTreeProps {
  categories: Category[];
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
  onToggleActive: (category: Category) => void;
  onAddSubcategory: (parent: Category) => void;
}

export function CategoryTree({ categories, onEdit, onDelete, onToggleActive, onAddSubcategory }: CategoryTreeProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const handleToggleExpand = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  let globalIndex = 0;

  return (
    <div className="divide-y divide-border">
      {categories.map((category) => {
        const currentIndex = globalIndex++;
        const isExpanded = expandedId === category.categoryId;

        return (
          <div key={category.categoryId}>
            <CategoryRow
              category={category}
              depth={0}
              index={currentIndex}
              isExpanded={isExpanded}
              onToggleExpand={handleToggleExpand}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleActive={onToggleActive}
              onAddSubcategory={onAddSubcategory}
            />

            {/* Subcategories */}
            {isExpanded &&
              category.subcategories?.map((sub) => {
                const subIndex = globalIndex++;
                return (
                  <CategoryRow
                    key={sub.categoryId}
                    category={sub}
                    depth={1}
                    index={subIndex}
                    isExpanded={false}
                    onToggleExpand={handleToggleExpand}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onToggleActive={onToggleActive}
                    onAddSubcategory={onAddSubcategory}
                  />
                );
              })}
          </div>
        );
      })}
    </div>
  );
}
