'use client';

/**
 * BudgetGuard Category Delete Dialog
 * Confirmation dialog with conflict handling for category deletion
 */

import { AlertTriangle, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { API_ERROR } from '@/constants/finance';
import { useDeleteCategory, useUpdateCategory } from '@/hooks/useCategories';
import { useTranslate } from '@/hooks/useTranslations';
import type { Category } from '@/types/finance';
import { cn } from '@/utils/helpers';

interface CategoryDeleteDialogProps {
  category: Category;
  onClose: () => void;
  onDeleted: () => void;
}

type ConflictState =
  | { type: 'none' }
  | { type: 'has-transactions'; count: number }
  | { type: 'has-subcategories'; count: number };

export function CategoryDeleteDialog({ category, onClose, onDeleted }: CategoryDeleteDialogProps) {
  const { t } = useTranslate();
  const deleteCategory = useDeleteCategory();
  const updateCategory = useUpdateCategory();
  const [conflict, setConflict] = useState<ConflictState>({ type: 'none' });
  const dialogRef = useRef<HTMLDivElement>(null);

  const handleDelete = async () => {
    try {
      await deleteCategory.mutateAsync(category.categoryId);
      onDeleted();
    } catch (error) {
      const err = error as Error & { count?: number };
      if (err.message === API_ERROR.CONFLICT.HAS_TRANSACTIONS) {
        setConflict({ type: 'has-transactions', count: err.count ?? 0 });
      } else if (err.message === API_ERROR.CONFLICT.HAS_SUBCATEGORIES) {
        setConflict({ type: 'has-subcategories', count: err.count ?? 0 });
      }
    }
  };

  const handleDeactivate = async () => {
    await updateCategory.mutateAsync({
      id: category.categoryId,
      data: { isActive: false },
    });
    onDeleted();
  };

  // Focus trap and Escape handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleBackdropClick = (_e: React.MouseEvent<HTMLDivElement>) => {
    // Do not close on backdrop click
  };

  const isLoading = deleteCategory.isPending || updateCategory.isPending;

  return (
    <div
      className="fixed inset-0 bg-guard-dark/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-backdrop-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
      onClick={handleBackdropClick}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div ref={dialogRef} className="card w-full max-w-md animate-modal-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-guard-danger/10 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-guard-danger" aria-hidden="true" />
            </div>
            <h2 id="delete-dialog-title" className="text-lg font-bold text-foreground">
              {t('category-management.delete.title')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-guard-muted hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            aria-label={t('common.buttons.close')}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4">
          {conflict.type === 'none' && (
            <p className="text-sm text-guard-muted">
              {t('category-management.delete.confirm', { name: category.name })}
            </p>
          )}

          {conflict.type === 'has-transactions' && (
            <div className="p-3 rounded-lg bg-guard-danger/10 border border-guard-danger/20" role="alert">
              <p className="text-sm text-guard-danger">
                {t('category-management.delete.has-transactions', { count: String(conflict.count) })}
              </p>
            </div>
          )}

          {conflict.type === 'has-subcategories' && (
            <div className="p-3 rounded-lg bg-guard-danger/10 border border-guard-danger/20" role="alert">
              <p className="text-sm text-guard-danger">
                {t('category-management.delete.has-subcategories', { count: String(conflict.count) })}
              </p>
            </div>
          )}

          {/* Error from mutation */}
          {deleteCategory.isError && conflict.type === 'none' && (
            <div className="p-3 rounded-lg bg-guard-danger/10 border border-guard-danger/20" role="alert">
              <p className="text-sm text-guard-danger">{t('category-management.delete.errors.delete')}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6">
          <button type="button" onClick={onClose} disabled={isLoading} className="btn-ghost">
            {t('common.buttons.cancel')}
          </button>

          {conflict.type === 'has-transactions' && (
            <button
              type="button"
              onClick={handleDeactivate}
              disabled={isLoading}
              className={cn(
                'px-4 py-2 rounded-lg font-medium text-white transition-all duration-200 ease-out-quart',
                'bg-guard-primary hover:bg-guard-primary/90 active:scale-[0.98]',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {updateCategory.isPending ? (
                <span className="flex items-center gap-2">
                  <LoadingSpinner size="sm" className="border-white/30 border-t-white" />
                  {t('category-management.form.saving')}
                </span>
              ) : (
                t('category-management.delete.deactivate-instead')
              )}
            </button>
          )}

          {conflict.type !== 'has-subcategories' && conflict.type !== 'has-transactions' && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isLoading}
              className={cn(
                'px-4 py-2 rounded-lg font-medium text-white transition-all duration-200 ease-out-quart',
                'bg-guard-danger hover:bg-guard-danger/90 active:scale-[0.98]',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {deleteCategory.isPending ? (
                <span className="flex items-center gap-2">
                  <LoadingSpinner size="sm" className="border-white/30 border-t-white" />
                  {t('category-management.delete.deleting')}
                </span>
              ) : (
                t('common.buttons.delete')
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
