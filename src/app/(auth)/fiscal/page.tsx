'use client';

/**
 * BudgetGuard Fiscal Page
 * Two views:
 * - Quarterly: Modelo 303 (IVA) + Modelo 130 (IRPF) + detail tables
 * - Annual: Modelo 390 (annual IVA) + Modelo 100 (annual IRPF section)
 * Filing status badges with contextual upload (pre-filled modelo metadata).
 */

import { Calculator } from 'lucide-react';
import { useCallback, useState } from 'react';
import { FiscalDeadlineBanner } from '@/components/fiscal/FiscalDeadlineBanner';
import { FiscalDeadlinePanel } from '@/components/fiscal/FiscalDeadlinePanel';
import { FiscalExpenseTable } from '@/components/fiscal/FiscalExpenseTable';
import { FiscalFilingStatus } from '@/components/fiscal/FiscalFilingStatus';
import { FiscalInvoiceTable } from '@/components/fiscal/FiscalInvoiceTable';
import { FiscalQuarterSelector } from '@/components/fiscal/FiscalQuarterSelector';
import { Modelo100Card } from '@/components/fiscal/Modelo100Card';
import { Modelo130Card } from '@/components/fiscal/Modelo130Card';
import { Modelo303Card } from '@/components/fiscal/Modelo303Card';
import { Modelo390Card } from '@/components/fiscal/Modelo390Card';
import { ModeloDocumentUpload } from '@/components/fiscal/ModeloDocumentUpload';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { FiscalStatus, ModeloType } from '@/constants/finance';
import { FISCAL_DOCUMENT_TYPE, FISCAL_STATUS, MODELO_TYPE } from '@/constants/finance';
import { useFiscalDocuments } from '@/hooks/useFiscalDocuments';
import { useAnnualFiscalReport, useFiscalReport } from '@/hooks/useFiscalReport';
import { useTranslate } from '@/hooks/useTranslations';
import { useUrlParams } from '@/hooks/useUrlParams';
import type { FiscalDocument } from '@/types/finance';
import { cn } from '@/utils/helpers';

type FiscalView = 'quarterly' | 'annual';

function getCurrentQuarter(): number {
  return Math.ceil((new Date().getMonth() + 1) / 3);
}

function getFilingInfo(
  documents: FiscalDocument[],
  modeloType: string,
  quarter: number | null,
): { status: string; document: FiscalDocument | null } {
  const match = documents.find(
    (d) => d.modeloType === modeloType && d.fiscalQuarter === quarter && d.status === FISCAL_STATUS.FILED,
  );
  return match ? { status: FISCAL_STATUS.FILED, document: match } : { status: FISCAL_STATUS.PENDING, document: null };
}

export default function FiscalPage() {
  const { t } = useTranslate();
  const { searchParams, updateParams } = useUrlParams('/fiscal');
  const [uploadModelo, setUploadModelo] = useState<ModeloType | null>(null);

  // Read filters from URL (defaults: current year, current quarter, quarterly view)
  const year = Number(searchParams.get('year')) || new Date().getFullYear();
  const quarter = Number(searchParams.get('quarter')) || getCurrentQuarter();
  const view: FiscalView = searchParams.get('view') === 'annual' ? 'annual' : 'quarterly';

  const setYear = useCallback((y: number) => updateParams({ year: String(y) }), [updateParams]);
  const setQuarter = useCallback((q: number) => updateParams({ quarter: String(q) }), [updateParams]);
  const setView = useCallback(
    (v: FiscalView) => updateParams({ view: v === 'quarterly' ? undefined : v }),
    [updateParams],
  );

  const { data: report, isLoading, isError } = useFiscalReport(year, quarter);
  const { data: annualReport, isLoading: isAnnualLoading, isError: isAnnualError } = useAnnualFiscalReport(year);
  const { data: documents } = useFiscalDocuments(
    year,
    view === 'quarterly' ? quarter : undefined,
    FISCAL_DOCUMENT_TYPE.MODELO,
  );

  const isCurrentLoading = view === 'quarterly' ? isLoading : isAnnualLoading;
  const isCurrentError = view === 'quarterly' ? isError : isAnnualError;

  const modeloDocs = (documents ?? []) as FiscalDocument[];
  const m303 = getFilingInfo(modeloDocs, MODELO_TYPE.M303, quarter);
  const m130 = getFilingInfo(modeloDocs, MODELO_TYPE.M130, quarter);
  const m390 = getFilingInfo(modeloDocs, MODELO_TYPE.M390, null);
  const m100 = getFilingInfo(modeloDocs, MODELO_TYPE.M100, null);

  const isAnnualModelo = uploadModelo === MODELO_TYPE.M390 || uploadModelo === MODELO_TYPE.M100;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Deadline Banner */}
      <FiscalDeadlineBanner className="mb-6" />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-guard-primary" aria-hidden="true" />
          <h1 className="text-2xl font-bold text-foreground">{t('fiscal.title')}</h1>
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
                view === 'quarterly' ? 'bg-card text-foreground shadow-sm' : 'text-guard-muted hover:text-foreground',
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

          {/* Quarter Selector */}
          <FiscalQuarterSelector year={year} quarter={quarter} onYearChange={setYear} onQuarterChange={setQuarter} />
        </div>
      </div>

      {/* Main Content */}
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-8">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <FiscalFilingStatus status={m303.status as FiscalStatus} />
                {m303.document ? (
                  <a
                    href={m303.document.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-guard-success hover:underline"
                  >
                    {t('fiscal.documents.download')}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => setUploadModelo(MODELO_TYPE.M303)}
                    className="text-xs text-guard-primary hover:underline"
                  >
                    {t('fiscal.documents.upload-button')}
                  </button>
                )}
              </div>
              <Modelo303Card data={report.modelo303} />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <FiscalFilingStatus status={m130.status as FiscalStatus} />
                {m130.document ? (
                  <a
                    href={m130.document.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-guard-success hover:underline"
                  >
                    {t('fiscal.documents.download')}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => setUploadModelo(MODELO_TYPE.M130)}
                    className="text-xs text-guard-primary hover:underline"
                  >
                    {t('fiscal.documents.upload-button')}
                  </button>
                )}
              </div>
              <Modelo130Card data={report.modelo130} />
            </div>
          </div>

          <FiscalInvoiceTable invoices={report.invoices} />
          <FiscalExpenseTable expenses={report.expenses} />
          <FiscalDeadlinePanel year={year} />
        </div>
      )}

      {/* Annual View */}
      {view === 'annual' && annualReport && !isAnnualLoading && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-8">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <FiscalFilingStatus status={m390.status as FiscalStatus} />
                {m390.document ? (
                  <a
                    href={m390.document.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-guard-success hover:underline"
                  >
                    {t('fiscal.documents.download')}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => setUploadModelo(MODELO_TYPE.M390)}
                    className="text-xs text-guard-primary hover:underline"
                  >
                    {t('fiscal.documents.upload-button')}
                  </button>
                )}
              </div>
              <Modelo390Card data={annualReport.modelo390} />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <FiscalFilingStatus status={m100.status as FiscalStatus} />
                {m100.document ? (
                  <a
                    href={m100.document.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-guard-success hover:underline"
                  >
                    {t('fiscal.documents.download')}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => setUploadModelo(MODELO_TYPE.M100)}
                    className="text-xs text-guard-primary hover:underline"
                  >
                    {t('fiscal.documents.upload-button')}
                  </button>
                )}
              </div>
              <Modelo100Card data={annualReport.modelo100} />
            </div>
          </div>

          <FiscalDeadlinePanel year={year} />
        </div>
      )}

      {/* Upload Modal — pre-filled with selected modelo */}
      {uploadModelo && (
        <ModeloDocumentUpload
          year={year}
          quarter={isAnnualModelo ? undefined : quarter}
          modeloType={uploadModelo}
          onClose={() => setUploadModelo(null)}
        />
      )}
    </div>
  );
}
