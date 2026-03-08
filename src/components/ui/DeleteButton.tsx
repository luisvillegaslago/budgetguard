'use client';

/**
 * Reusable two-click delete button with confirm state and click-outside dismiss.
 */

import { Trash2 } from 'lucide-react';
import { useConfirmTimeout } from '@/hooks/useConfirmTimeout';
import { useTranslate } from '@/hooks/useTranslations';
import { cn } from '@/utils/helpers';
import { LoadingSpinner } from './LoadingSpinner';

interface DeleteButtonProps {
  onDelete: () => void;
  isDeleting: boolean;
  confirmLabel?: string;
  defaultLabel?: string;
  className?: string;
}

export function DeleteButton({ onDelete, isDeleting, confirmLabel, defaultLabel, className }: DeleteButtonProps) {
  const { t } = useTranslate();
  const { showConfirm, handleConfirm, buttonRef } = useConfirmTimeout(onDelete);

  const resolvedConfirmLabel = confirmLabel ?? t('transactions.delete.confirm');
  const resolvedDefaultLabel = defaultLabel ?? t('transactions.delete.button');

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        handleConfirm();
      }}
      disabled={isDeleting}
      className={cn(
        'p-2 rounded-lg transition-all duration-200 ease-out-quart',
        showConfirm
          ? 'bg-guard-danger text-white'
          : 'text-guard-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-guard-danger/10 hover:text-guard-danger',
        className,
      )}
      aria-label={showConfirm ? resolvedConfirmLabel : resolvedDefaultLabel}
    >
      {isDeleting ? <LoadingSpinner size="sm" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}
