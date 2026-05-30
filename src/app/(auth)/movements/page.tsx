'use client';

/**
 * BudgetGuard Movements Page
 * Two tabs: "Monthly expenses" (flat list for the selected month) and
 * "By category" (master-detail category browser + history).
 */

import { ArrowLeft, List } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CategoryBreakdown } from '@/components/dashboard/CategoryBreakdown';
import { FiscalDeadlineBanner } from '@/components/fiscal/FiscalDeadlineBanner';
import { CategoryBrowser } from '@/components/movements/CategoryBrowser';
import { CompanyMovementDetail } from '@/components/movements/CompanyMovementDetail';
import { MovementDetail } from '@/components/movements/MovementDetail';
import { RecurringPendingPanel } from '@/components/recurring/RecurringPendingPanel';
import { PendingTransactionsBanner } from '@/components/transactions/PendingTransactionsBanner';
import { QuickExpenseActions } from '@/components/transactions/QuickExpenseActions';
import { TransactionForm } from '@/components/transactions/TransactionForm';
import { TransactionList } from '@/components/transactions/TransactionList';
import { MonthPicker } from '@/components/ui/MonthPicker';
import { TRANSACTION_TYPE } from '@/constants/finance';
import { useCategoriesHierarchical } from '@/hooks/useCategories';
import { useAllCompanies } from '@/hooks/useCompanies';
import { useTranslate } from '@/hooks/useTranslations';
import type { Category, Transaction } from '@/types/finance';

type MovementsTab = 'monthly' | 'by-category';

export default function MovementsPage() {
  const { t } = useTranslate();
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get('category');
  const companyIdParam = searchParams.get('companyId');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [initialSubcategoryId, setInitialSubcategoryId] = useState<number | null>(null);
  // Deep links with ?category= open the category tab; otherwise default to the monthly list.
  const [activeTab, setActiveTab] = useState<MovementsTab>(categoryParam ? 'by-category' : 'monthly');
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const { data: categories } = useCategoriesHierarchical(TRANSACTION_TYPE.EXPENSE);

  // Resolve company from URL param
  const companyId = companyIdParam ? Number(companyIdParam) : null;
  const companyRole = searchParams.get('role');
  const { data: companies } = useAllCompanies();
  const selectedCompany = useMemo(() => {
    if (!companyId || !companies) return null;
    return companies.find((c) => c.companyId === companyId) ?? null;
  }, [companyId, companies]);

  // Build back URL preserving the company role sub-tab
  const backUrl = companyRole ? `/settings?tab=companies&role=${companyRole}` : '/settings?tab=companies';

  // Pre-select category from URL param
  useEffect(() => {
    if (categoryParam && categories && !selectedCategory) {
      const id = Number.parseInt(categoryParam, 10);
      const found = categories.find((c) => c.categoryId === id);
      if (found) setSelectedCategory(found);
    }
  }, [categoryParam, categories, selectedCategory]);

  const handleSelectCategory = useCallback((category: Category, subcategoryId?: number) => {
    setSelectedCategory(category);
    setInitialSubcategoryId(subcategoryId ?? null);
    // Update URL without navigation
    const url = new URL(window.location.href);
    url.searchParams.set('category', String(category.categoryId));
    window.history.replaceState({}, '', url.toString());
  }, []);

  // Company mode: full-width detail view
  if (selectedCompany) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header with back link */}
        <div className="mb-8">
          <Link
            href={backUrl}
            className="inline-flex items-center gap-1.5 text-sm text-guard-muted hover:text-foreground transition-colors mb-3"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t('companies.back-to-list')}
          </Link>
          <h1 className="text-2xl font-bold text-foreground">{t('movements.title')}</h1>
          <p className="text-sm text-guard-muted mt-0.5">{t('movements.subtitle')}</p>
        </div>

        <CompanyMovementDetail company={selectedCompany} />
      </div>
    );
  }

  const tabs: Array<{ id: MovementsTab; label: string }> = [
    { id: 'monthly', label: t('movements.tabs.monthly-list') },
    { id: 'by-category', label: t('movements.tabs.by-category') },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('movements.title')}</h1>
        <p className="text-sm text-guard-muted mt-0.5">{t('movements.subtitle')}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-guard-primary text-guard-primary'
                : 'border-transparent text-guard-muted hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Monthly list tab */}
      {activeTab === 'monthly' && (
        <div className="space-y-6">
          <div className="flex flex-col items-center sm:flex-row sm:justify-between gap-3">
            <MonthPicker />
            <QuickExpenseActions className="w-full sm:w-auto justify-end" />
          </div>

          <div className="space-y-3">
            <PendingTransactionsBanner />
            <FiscalDeadlineBanner />
            <RecurringPendingPanel />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
            <section className="order-2 md:order-1">
              <CategoryBreakdown />
            </section>
            <section className="order-1 md:order-2">
              <TransactionList
                onAddTransaction={() => setShowCreateForm(true)}
                onEditTransaction={setEditingTransaction}
              />
            </section>
          </div>
        </div>
      )}

      {/* By-category tab: master-detail layout */}
      {activeTab === 'by-category' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-8">
          {/* Category browser (left panel) */}
          <div className="lg:col-span-4">
            <CategoryBrowser
              selectedCategoryId={selectedCategory?.categoryId ?? null}
              selectedSubcategoryId={initialSubcategoryId}
              onSelectCategory={handleSelectCategory}
            />
          </div>

          {/* Detail (right panel) */}
          <div className="lg:col-span-8">
            {selectedCategory ? (
              <MovementDetail
                key={`${selectedCategory.categoryId}-${initialSubcategoryId ?? 'all'}`}
                category={selectedCategory}
                initialSubcategoryId={initialSubcategoryId}
              />
            ) : (
              <div className="card flex flex-col items-center justify-center py-20 text-center">
                <List className="h-12 w-12 text-guard-muted/30 mb-4" aria-hidden="true" />
                <p className="text-guard-muted">{t('movements.select-category')}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Transaction form modal (create + edit) */}
      {editingTransaction && (
        <TransactionForm transaction={editingTransaction} onClose={() => setEditingTransaction(null)} />
      )}
      {showCreateForm && !editingTransaction && <TransactionForm onClose={() => setShowCreateForm(false)} />}
    </div>
  );
}
