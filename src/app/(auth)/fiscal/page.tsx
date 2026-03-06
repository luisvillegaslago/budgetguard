'use client';

/**
 * BudgetGuard Fiscal Page
 * Two views:
 * - Quarterly: Modelo 303 (IVA) + Modelo 130 (IRPF) + detail tables
 * - Annual: Modelo 390 (annual IVA) + Modelo 100 (annual IRPF section)
 */

import { ArrowLeft, Calculator } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { FiscalExpenseTable } from '@/components/fiscal/FiscalExpenseTable';
import { FiscalInvoiceTable } from '@/components/fiscal/FiscalInvoiceTable';
import { FiscalQuarterSelector } from '@/components/fiscal/FiscalQuarterSelector';
import { Modelo100Card } from '@/components/fiscal/Modelo100Card';
import { Modelo130Card } from '@/components/fiscal/Modelo130Card';
import { Modelo303Card } from '@/components/fiscal/Modelo303Card';
import { Modelo390Card } from '@/components/fiscal/Modelo390Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAnnualFiscalReport, useFiscalReport } from '@/hooks/useFiscalReport';
import { useTranslate } from '@/hooks/useTranslations';
import { cn } from '@/utils/helpers';

type FiscalView = 'quarterly' | 'annual';

/**
 * Get current fiscal quarter (1-4) from current date
 */
function getCurrentQuarter(): number {
  return Math.ceil((new Date().getMonth() + 1) / 3);
}

export default function FiscalPage() {
  const { t } = useTranslate();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [quarter, setQuarter] = useState(getCurrentQuarter);
  const [view, setView] = useState<FiscalView>('quarterly');

  const { data: report, isLoading, isError } = useFiscalReport(year, quarter);
  const { data: annualReport, isLoading: isAnnualLoading, isError: isAnnualError } = useAnnualFiscalReport(year);

  const isCurrentLoading = view === 'quarterly' ? isLoading : isAnnualLoading;
  const isCurrentError = view === 'quarterly' ? isError : isAnnualError;

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
                aria-label={t('fiscal.back')}
              >
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </Link>
              <div className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-guard-primary" aria-hidden="true" />
                <h1 className="text-xl font-bold text-foreground">{t('fiscal.title')}</h1>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* View Toggle */}
              <fieldset className="flex gap-1 bg-muted rounded-lg p-1 border-0 m-0" aria-label="Fiscal view">
                <button
                  type="button"
                  aria-pressed={view === 'quarterly'}
                  onClick={() => setView('quarterly')}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200',
                    view === 'quarterly'
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-guard-muted hover:text-foreground',
                  )}
                >
                  {t('fiscal.annual.tab-quarterly')}
                </button>
                <button
                  type="button"
                  aria-pressed={view === 'annual'}
                  onClick={() => setView('annual')}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200',
                    view === 'annual' ? 'bg-card text-foreground shadow-sm' : 'text-guard-muted hover:text-foreground',
                  )}
                >
                  {t('fiscal.annual.tab-annual')}
                </button>
              </fieldset>

              {/* Quarter Selector (only shown in quarterly view) */}
              {view === 'quarterly' ? (
                <FiscalQuarterSelector
                  year={year}
                  quarter={quarter}
                  onYearChange={setYear}
                  onQuarterChange={setQuarter}
                />
              ) : (
                <FiscalQuarterSelector
                  year={year}
                  quarter={quarter}
                  onYearChange={setYear}
                  onQuarterChange={setQuarter}
                />
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isCurrentLoading && (
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner size="lg" label={t('common.loading')} />
          </div>
        )}

        {isCurrentError && (
          <div className="card text-center py-12">
            <p className="text-guard-danger">{t('fiscal.errors.load')}</p>
          </div>
        )}

        {/* Quarterly View */}
        {view === 'quarterly' && report && !isLoading && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Modelo303Card data={report.modelo303} />
              <Modelo130Card data={report.modelo130} />
            </div>

            <FiscalExpenseTable expenses={report.expenses} />
            <FiscalInvoiceTable invoices={report.invoices} />
          </div>
        )}

        {/* Annual View */}
        {view === 'annual' && annualReport && !isAnnualLoading && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Modelo390Card data={annualReport.modelo390} />
              <Modelo100Card data={annualReport.modelo100} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
