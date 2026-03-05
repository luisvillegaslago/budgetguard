import { AlertCircle, RefreshCw } from 'lucide-react';
import { useTranslate } from '@/hooks/useTranslations';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

/**
 * Reusable error state component with alert icon, message and retry button.
 */
export function ErrorState({ message, onRetry }: ErrorStateProps) {
  const { t } = useTranslate();

  return (
    <div className="text-center py-8" role="alert">
      <AlertCircle className="h-12 w-12 mx-auto mb-3 text-guard-danger opacity-50" aria-hidden="true" />
      <p className="text-guard-danger">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-ghost mt-4 inline-flex items-center gap-2">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t('common.buttons.retry')}
        </button>
      )}
    </div>
  );
}
