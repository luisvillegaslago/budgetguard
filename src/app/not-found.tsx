'use client';

import { Home, Shield } from 'lucide-react';
import Link from 'next/link';
import { useTranslate } from '@/hooks/useTranslations';

export default function NotFound() {
  const { t } = useTranslate();

  return (
    <div className="min-h-screen bg-guard-light dark:bg-guard-dark flex items-center justify-center px-4">
      <div className="text-center">
        <div className="inline-flex items-center justify-center p-4 bg-guard-primary/10 rounded-full mb-6">
          <Shield className="h-12 w-12 text-guard-primary" />
        </div>

        <h1 className="text-4xl font-bold text-foreground mb-2">{t('errors.not-found.code')}</h1>
        <p className="text-xl text-guard-muted mb-2">{t('errors.not-found.title')}</p>
        <p className="text-guard-muted mb-8">{t('errors.not-found.description')}</p>

        <Link href="/dashboard" className="btn-primary inline-flex items-center gap-2">
          <Home className="h-4 w-4" />
          {t('errors.not-found.go-home')}
        </Link>
      </div>
    </div>
  );
}
