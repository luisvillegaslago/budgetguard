'use client';

/**
 * BudgetGuard Settings Page
 * Dev-only settings including database sync between local and remote PostgreSQL.
 */

import { ArrowLeft, Settings } from 'lucide-react';
import Link from 'next/link';
import { DbSyncPanel } from '@/components/settings/DbSyncPanel';
import { useTranslate } from '@/hooks/useTranslations';

export default function SettingsPage() {
  const { t } = useTranslate();

  return (
    <div className="min-h-screen bg-guard-light dark:bg-guard-dark">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="p-2 text-guard-muted hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                aria-label={t('settings.back')}
              >
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </Link>
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-guard-primary" aria-hidden="true" />
                <h1 className="text-xl font-bold text-foreground">{t('settings.title')}</h1>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <DbSyncPanel />
      </main>
    </div>
  );
}
