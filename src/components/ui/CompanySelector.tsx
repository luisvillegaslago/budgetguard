'use client';

/**
 * BudgetGuard Company Selector
 * Combobox with type-to-search and inline "create on the fly" capability
 */

import { Building2, Check, ChevronsUpDown, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCompanies, useQuickCreateCompany } from '@/hooks/useCompanies';
import { useTranslate } from '@/hooks/useTranslations';
import type { Company } from '@/types/finance';
import { cn } from '@/utils/helpers';

interface CompanySelectorProps {
  value: number | null;
  onChange: (companyId: number | null) => void;
  disabled?: boolean;
}

export function CompanySelector({ value, onChange, disabled }: CompanySelectorProps) {
  const { t } = useTranslate();
  const { data: companies } = useCompanies();
  const quickCreate = useQuickCreateCompany();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedCompany = useMemo(() => companies?.find((c) => c.companyId === value) ?? null, [companies, value]);

  const filtered = useMemo(() => {
    if (!companies) return [];
    if (!search.trim()) return companies;
    const q = search.toLowerCase().trim();
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.tradingName?.toLowerCase().includes(q) ||
        c.taxId?.toLowerCase().includes(q),
    );
  }, [companies, search]);

  const showCreateOption =
    search.trim().length > 0 && !filtered.some((c) => c.name.toLowerCase() === search.toLowerCase().trim());

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (company: Company) => {
    onChange(company.companyId);
    setIsOpen(false);
    setSearch('');
  };

  const handleClear = () => {
    onChange(null);
    setSearch('');
  };

  const handleCreate = async () => {
    const name = search.trim();
    if (!name) return;

    try {
      const company = await quickCreate.mutateAsync(name);
      onChange(company.companyId);
      setIsOpen(false);
      setSearch('');
    } catch {
      // Error handled by mutation state
    }
  };

  const handleToggle = () => {
    if (disabled) return;
    setIsOpen(!isOpen);
    if (!isOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger: flex wrapper with button + optional clear icon */}
      <div
        className={cn(
          'w-full flex items-center justify-between px-3 py-2 rounded-lg border bg-background text-left text-sm',
          'transition-colors duration-200 ease-out-quart',
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-guard-primary/50 cursor-pointer',
          isOpen ? 'border-guard-primary ring-2 ring-guard-primary' : 'border-input',
        )}
        onClick={handleToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleToggle();
        }}
        tabIndex={disabled ? -1 : 0}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="flex items-center gap-2 min-w-0">
          <Building2 className="h-4 w-4 text-guard-muted shrink-0" aria-hidden="true" />
          {selectedCompany ? (
            <span className="truncate text-foreground">
              {selectedCompany.name}
              {selectedCompany.taxId && (
                <span className="ml-1.5 text-xs text-guard-muted">({selectedCompany.taxId})</span>
              )}
            </span>
          ) : (
            <span className="text-guard-muted">{t('companies.selector.placeholder')}</span>
          )}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {selectedCompany && !disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              className="p-0.5 hover:bg-muted rounded"
              aria-label={t('common.buttons.clear')}
            >
              <X className="h-3 w-3 text-guard-muted" aria-hidden="true" />
            </button>
          )}
          <ChevronsUpDown className="h-4 w-4 text-guard-muted" aria-hidden="true" />
        </span>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-background shadow-md animate-fade-in">
          {/* Search input */}
          <div className="p-2 border-b border-border">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('companies.selector.search')}
              className="w-full px-3 py-1.5 text-sm rounded-md border border-input bg-background text-foreground focus:ring-1 focus:ring-guard-primary focus:border-transparent"
              autoComplete="off"
            />
          </div>

          {/* Options list */}
          <div className="max-h-48 overflow-y-auto p-1">
            {filtered.map((company) => (
              <button
                key={company.companyId}
                type="button"
                onClick={() => handleSelect(company)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md text-left',
                  'hover:bg-muted transition-colors',
                  value === company.companyId && 'bg-guard-primary/10 text-guard-primary',
                )}
              >
                {value === company.companyId ? (
                  <Check className="h-4 w-4 text-guard-primary shrink-0" aria-hidden="true" />
                ) : (
                  <span className="w-4 shrink-0" />
                )}
                <span className="truncate">{company.name}</span>
                {company.taxId && <span className="text-xs text-guard-muted shrink-0">({company.taxId})</span>}
              </button>
            ))}

            {/* Create option */}
            {showCreateOption && (
              <button
                type="button"
                onClick={handleCreate}
                disabled={quickCreate.isPending}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md text-left text-guard-primary hover:bg-guard-primary/10 transition-colors"
              >
                <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {t('companies.selector.create')} &ldquo;{search.trim()}&rdquo;
                </span>
              </button>
            )}

            {filtered.length === 0 && !showCreateOption && (
              <p className="px-3 py-2 text-sm text-guard-muted text-center">{t('companies.selector.empty')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
