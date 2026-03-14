'use client';

/**
 * BudgetGuard Company Management Panel
 * CRUD operations for companies/providers in Settings with role sub-tabs
 */

import { AlertCircle, ArrowRight, Building2, Eye, EyeOff, Pencil, Plus, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { CompanyFormModal } from '@/components/settings/CompanyFormModal';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SearchInput } from '@/components/ui/SearchInput';
import type { CompanyRole } from '@/constants/finance';
import { COMPANY_ROLE } from '@/constants/finance';
import { useAllCompanies, useUpdateCompany } from '@/hooks/useCompanies';
import { useTranslate } from '@/hooks/useTranslations';
import type { Company } from '@/types/finance';
import { cn } from '@/utils/helpers';

interface ModalState {
  type: 'none' | 'create' | 'edit';
  company?: Company;
}

function resolveInitialRole(param: string | null): CompanyRole {
  return param === COMPANY_ROLE.PROVIDER ? COMPANY_ROLE.PROVIDER : COMPANY_ROLE.CLIENT;
}

export function CompanyManagementPanel() {
  const { t } = useTranslate();
  const searchParams = useSearchParams();
  const [activeRole, setActiveRoleState] = useState<CompanyRole>(() => resolveInitialRole(searchParams.get('role')));
  const [searchQuery, setSearchQuery] = useState('');
  const [modal, setModal] = useState<ModalState>({ type: 'none' });
  const updateCompany = useUpdateCompany();
  const { data: companies, isLoading, isError, refetch } = useAllCompanies(activeRole);

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

  const setActiveRole = useCallback((role: CompanyRole) => {
    setActiveRoleState(role);
    setSearchQuery('');
    // Sync role to URL so back-navigation preserves the sub-tab
    const url = new URL(window.location.href);
    if (role === COMPANY_ROLE.CLIENT) {
      url.searchParams.delete('role');
    } else {
      url.searchParams.set('role', role);
    }
    window.history.replaceState({}, '', url.toString());
  }, []);

  const closeModal = () => setModal({ type: 'none' });

  const isClient = activeRole === COMPANY_ROLE.CLIENT;

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
          <span>{isClient ? t('companies.add-client') : t('companies.add-provider')}</span>
        </button>
      </div>

      {/* Role sub-tabs */}
      <div className="flex gap-1 border-b border-border">
        <button
          type="button"
          onClick={() => setActiveRole(COMPANY_ROLE.CLIENT)}
          className={cn(
            'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
            activeRole === COMPANY_ROLE.CLIENT
              ? 'border-guard-primary text-guard-primary'
              : 'border-transparent text-guard-muted hover:text-foreground',
          )}
        >
          {t('companies.tabs.clients')}
        </button>
        <button
          type="button"
          onClick={() => setActiveRole(COMPANY_ROLE.PROVIDER)}
          className={cn(
            'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
            activeRole === COMPANY_ROLE.PROVIDER
              ? 'border-guard-primary text-guard-primary'
              : 'border-transparent text-guard-muted hover:text-foreground',
          )}
        >
          {t('companies.tabs.providers')}
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
            {searchQuery.trim() ? (
              <>
                <p className="font-medium">{t('companies.empty.no-results')}</p>
                <p className="text-sm mt-1">{t('companies.empty.no-results-subtitle')}</p>
              </>
            ) : (
              <>
                <p className="font-medium">
                  {isClient ? t('companies.empty.title-clients') : t('companies.empty.title-providers')}
                </p>
                <p className="text-sm mt-1">
                  {isClient ? t('companies.empty.subtitle-clients') : t('companies.empty.subtitle-providers')}
                </p>
                <button
                  type="button"
                  onClick={() => setModal({ type: 'create' })}
                  className="btn-primary mt-4 inline-flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {isClient ? t('companies.empty.cta-client') : t('companies.empty.cta-provider')}
                </button>
              </>
            )}
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
                  <Link
                    href={`/movements?companyId=${company.companyId}&role=${activeRole}`}
                    className="p-1.5 text-guard-muted hover:text-guard-primary hover:bg-muted rounded-md transition-colors"
                    aria-label={t('companies.actions.view-transactions')}
                    title={t('companies.actions.view-transactions')}
                  >
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
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
      {modal.type === 'create' && <CompanyFormModal onClose={closeModal} role={activeRole} />}
      {modal.type === 'edit' && modal.company && (
        <CompanyFormModal onClose={closeModal} company={modal.company} role={modal.company.role} />
      )}
    </div>
  );
}
