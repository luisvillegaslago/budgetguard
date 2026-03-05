'use client';

/**
 * BudgetGuard Category Management Page
 * Full CRUD interface for managing income and expense categories
 */

import { ArrowLeft, Shield } from 'lucide-react';
import Link from 'next/link';
import { CategoryManagementPanel } from '@/components/categories/CategoryManagementPanel';
import { useTranslate } from '@/hooks/useTranslations';

export default function CategoriesPage() {
  const { t } = useTranslate();

  return (
    <div className="min-h-screen flex flex-col bg-guard-light dark:bg-guard-dark">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Back + Logo */}
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-guard-muted hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                aria-label={t('category-management.back')}
              >
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </Link>
              <div className="flex items-center gap-2">
                <div className="p-2 bg-guard-primary rounded-lg">
                  <Shield className="h-5 w-5 text-white" aria-hidden="true" />
                </div>
                <span className="text-xl font-bold text-foreground">{t('common.app-name')}</span>
              </div>
            </div>

            {/* Title (centered via flex-1) */}
            <h1 className="text-lg font-semibold text-foreground hidden sm:block flex-1 text-center">
              {t('category-management.title')}
            </h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <CategoryManagementPanel />
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-sm text-guard-muted text-center">{t('dashboard.footer')}</p>
        </div>
      </footer>
    </div>
  );
}
