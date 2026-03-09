'use client';

/**
 * BudgetGuard Company Management Panel
 * CRUD operations for companies/providers in Settings
 */

import { AlertCircle, Building2, Eye, EyeOff, Pencil, Plus, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CompanyFormModal } from '@/components/settings/CompanyFormModal';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SearchInput } from '@/components/ui/SearchInput';
import { useAllCompanies, useUpdateCompany } from '@/hooks/useCompanies';
import { useTranslate } from '@/hooks/useTranslations';
import type { Company } from '@/types/finance';
import { cn } from '@/utils/helpers';

interface ModalState {
  type: 'none' | 'create' | 'edit';
  company?: Company;
}

export function CompanyManagementPanel() {
  const { t } = useTranslate();
  const [searchQuery, setSearchQuery] = useState('');
  const [modal, setModal] = useState<ModalState>({ type: 'none' });
  const updateCompany = useUpdateCompany();
  const { data: companies, isLoading, isError, refetch } = useAllCompanies();

  const filtered = useMemo(() => {
    if (!companies || !searchQuery.trim()) return companies;
    const q = searchQuery.toLowerCase().trim();
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.tradingName?.toLowerCase().includes(q) ||
        c.taxId?.toLowerCase().includes(q) ||
        c.city?.toLowerCase().includes(q),
    );
  }, [companies, searchQuery]);

  const handleToggleActive = async (company: Company) => {
    await updateCompany.mutateAsync({
      id: company.companyId,
      data: { isActive: !company.isActive },
    });
  };

  const closeModal = () => setModal({ type: 'none' });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t('companies.title')}</h2>
          <p className="text-sm text-guard-muted">{t('companies.subtitle')}</p>
        </div>

        <button
          type="button"
          onClick={() => setModal({ type: 'create' })}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>{t('companies.add')}</span>
        </button>
      </div>

      {/* Search */}
      <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder={t('companies.search-placeholder')} />

      {/* Content */}
      <div className="card">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        )}

        {isError && (
          <div className="text-center py-12" role="alert">
            <AlertCircle className="h-12 w-12 mx-auto mb-3 text-guard-danger opacity-50" aria-hidden="true" />
            <p className="text-guard-danger">{t('companies.errors.load')}</p>
            <button type="button" onClick={() => refetch()} className="btn-ghost mt-4 inline-flex items-center gap-2">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {t('common.buttons.retry')}
            </button>
          </div>
        )}

        {!isLoading && !isError && filtered?.length === 0 && (
          <div className="text-center py-12 text-guard-muted">
            <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" aria-hidden="true" />
            <p className="font-medium">{t('companies.empty.title')}</p>
            <p className="text-sm mt-1">{t('companies.empty.subtitle')}</p>
            <button
              type="button"
              onClick={() => setModal({ type: 'create' })}
              className="btn-primary mt-4 inline-flex items-center gap-2"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t('companies.empty.cta')}
            </button>
          </div>
        )}

        {!isLoading && !isError && filtered && filtered.length > 0 && (
          <div className="divide-y divide-border">
            {filtered.map((company) => (
              <div
                key={company.companyId}
                className={cn('flex items-center justify-between px-4 py-3 gap-4', !company.isActive && 'opacity-50')}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-guard-primary shrink-0" aria-hidden="true" />
                    <span className="font-medium text-foreground truncate">{company.name}</span>
                    {company.taxId && (
                      <span className="text-xs px-1.5 py-0.5 bg-muted rounded text-guard-muted shrink-0">
                        {company.taxId}
                      </span>
                    )}
                    {!company.isActive && (
                      <span className="text-xs px-1.5 py-0.5 bg-guard-danger/10 text-guard-danger rounded shrink-0">
                        {t('companies.inactive')}
                      </span>
                    )}
                  </div>
                  {(company.tradingName || company.city || company.country) && (
                    <p className="text-xs text-guard-muted mt-0.5 ml-6 truncate">
                      {[company.tradingName, company.city, company.country].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setModal({ type: 'edit', company })}
                    className="p-1.5 text-guard-muted hover:text-foreground hover:bg-muted rounded-md transition-colors"
                    aria-label={t('companies.actions.edit')}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleActive(company)}
                    className="p-1.5 text-guard-muted hover:text-foreground hover:bg-muted rounded-md transition-colors"
                    aria-label={company.isActive ? t('companies.actions.deactivate') : t('companies.actions.activate')}
                  >
                    {company.isActive ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {modal.type === 'create' && <CompanyFormModal onClose={closeModal} />}
      {modal.type === 'edit' && modal.company && <CompanyFormModal onClose={closeModal} company={modal.company} />}
    </div>
  );
}
