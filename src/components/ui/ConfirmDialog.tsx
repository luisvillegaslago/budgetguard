'use client';

/**
 * Reusable confirmation dialog. Replaces window.confirm() with a modal that
 * matches the project's design system (focus trap, Escape, animated backdrop).
 *
 * Usage:
 *   const [open, setOpen] = useState(false);
 *   <ConfirmDialog
 *     open={open}
 *     title="Stop sync?"
 *     message="The sync will abort within a few seconds."
 *     confirmLabel="Stop"
 *     variant="danger"
 *     onConfirm={async () => { await stop(); setOpen(false); }}
 *     onCancel={() => setOpen(false)}
 *   />
 */

import { AlertTriangle, X } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ModalBackdrop } from '@/components/ui/ModalBackdrop';
import { useTranslate } from '@/hooks/useTranslations';
import { cn } from '@/utils/helpers';

export type ConfirmVariant = 'primary' | 'danger';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'primary',
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslate();

  if (!open) return null;

  const confirmTone =
    variant === 'danger' ? 'bg-guard-danger hover:bg-guard-danger/90' : 'bg-guard-primary hover:bg-guard-primary/90';

  const iconTone =
    variant === 'danger' ? 'bg-guard-danger/10 text-guard-danger' : 'bg-guard-primary/10 text-guard-primary';

  return (
    <ModalBackdrop onClose={onCancel} labelledBy="confirm-dialog-title">
      <div className="card w-full max-w-md animate-modal-in">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-lg', iconTone)}>
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 id="confirm-dialog-title" className="text-lg font-bold text-foreground">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="p-2 text-guard-muted hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:opacity-50"
            aria-label={t('common.buttons.close')}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <p className="text-sm text-guard-muted whitespace-pre-wrap">{message}</p>

        <div className="flex justify-end gap-3 mt-6">
          <button type="button" onClick={onCancel} disabled={isLoading} className="btn-ghost">
            {cancelLabel ?? t('common.buttons.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              'px-4 py-2 rounded-lg font-medium text-white transition-all duration-200 ease-out-quart',
              confirmTone,
              'active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <LoadingSpinner size="sm" className="border-white/30 border-t-white" />
                {confirmLabel}
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
