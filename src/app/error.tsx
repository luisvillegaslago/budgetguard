'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';
import { useTranslate } from '@/hooks/useTranslations';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

// biome-ignore lint/suspicious/noShadowRestrictedNames: Next.js requires Error as the component name
export default function Error({ error: _error, reset }: ErrorProps) {
  const { t } = useTranslate();

  return (
    <div className="min-h-screen bg-guard-light dark:bg-guard-dark flex items-center justify-center px-4">
      <div className="text-center">
        <div className="inline-flex items-center justify-center p-4 bg-guard-danger/10 rounded-full mb-6">
          <AlertCircle className="h-12 w-12 text-guard-danger" />
        </div>

        <h1 className="text-2xl font-bold text-foreground mb-2">{t('errors.page.title')}</h1>
        <p className="text-guard-muted mb-8">{t('errors.page.description')}</p>

        <button type="button" onClick={reset} className="btn-primary inline-flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          {t('errors.page.retry')}
        </button>
      </div>
    </div>
  );
}
