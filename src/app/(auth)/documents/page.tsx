'use client';

/**
 * BudgetGuard Documents Page
 * Dedicated page for browsing and managing all fiscal documents.
 * Summary cards for filtering by type, quarter pills, and year selector.
 */

import { FileInput, FileOutput, FileText, Plus, ScrollText, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FiscalBulkUpload } from '@/components/fiscal/FiscalBulkUpload';
import { FiscalDocumentList } from '@/components/fiscal/FiscalDocumentList';
import { FiscalDocumentUpload } from '@/components/fiscal/FiscalDocumentUpload';
import { Select } from '@/components/ui/Select';
import {
  SUMMARY_COLORS,
  SummaryCard,
  type SummaryCardColorScheme,
  SummaryCardSkeleton,
} from '@/components/ui/SummaryCard';
import type { FiscalDocumentType } from '@/constants/finance';
import { FISCAL_DOCUMENT_TYPE } from '@/constants/finance';
import { useFiscalDocuments } from '@/hooks/useFiscalDocuments';
import { useTranslate } from '@/hooks/useTranslations';
import type { FiscalDocument } from '@/types/finance';
import { cn } from '@/utils/helpers';

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: CURRENT_YEAR - 2018 }, (_, i) => CURRENT_YEAR - i);
const QUARTERS = [1, 2, 3, 4] as const;

interface DocTypeSummary {
  type: FiscalDocumentType;
  count: number;
  icon: React.ReactNode;
  labelKey: string;
  colors: SummaryCardColorScheme;
}

const DOC_TYPE_COLORS: Record<FiscalDocumentType, SummaryCardColorScheme> = {
  [FISCAL_DOCUMENT_TYPE.MODELO]: SUMMARY_COLORS.violet,
  [FISCAL_DOCUMENT_TYPE.FACTURA_RECIBIDA]: SUMMARY_COLORS.amber,
  [FISCAL_DOCUMENT_TYPE.FACTURA_EMITIDA]: SUMMARY_COLORS.success,
};

function computeSummaries(documents: FiscalDocument[]): DocTypeSummary[] {
  const counts = {
    [FISCAL_DOCUMENT_TYPE.MODELO]: 0,
    [FISCAL_DOCUMENT_TYPE.FACTURA_RECIBIDA]: 0,
    [FISCAL_DOCUMENT_TYPE.FACTURA_EMITIDA]: 0,
  };

  documents.forEach((doc) => {
    counts[doc.documentType] = (counts[doc.documentType] ?? 0) + 1;
  });

  return [
    {
      type: FISCAL_DOCUMENT_TYPE.MODELO,
      count: counts[FISCAL_DOCUMENT_TYPE.MODELO],
      icon: <ScrollText className="h-5 w-5" aria-hidden="true" />,
      labelKey: 'fiscal.documents.types.modelo',
      colors: DOC_TYPE_COLORS[FISCAL_DOCUMENT_TYPE.MODELO],
    },
    {
      type: FISCAL_DOCUMENT_TYPE.FACTURA_RECIBIDA,
      count: counts[FISCAL_DOCUMENT_TYPE.FACTURA_RECIBIDA],
      icon: <FileInput className="h-5 w-5" aria-hidden="true" />,
      labelKey: 'fiscal.documents.types.factura',
      colors: DOC_TYPE_COLORS[FISCAL_DOCUMENT_TYPE.FACTURA_RECIBIDA],
    },
    {
      type: FISCAL_DOCUMENT_TYPE.FACTURA_EMITIDA,
      count: counts[FISCAL_DOCUMENT_TYPE.FACTURA_EMITIDA],
      icon: <FileOutput className="h-5 w-5" aria-hidden="true" />,
      labelKey: 'fiscal.documents.types.factura-emitida',
      colors: DOC_TYPE_COLORS[FISCAL_DOCUMENT_TYPE.FACTURA_EMITIDA],
    },
  ];
}

const STAGGER_CLASSES = ['stagger-1', 'stagger-2', 'stagger-3'] as const;

export default function DocumentsPage() {
  const { t } = useTranslate();
  const [year, setYear] = useState(CURRENT_YEAR);
  const [quarter, setQuarter] = useState<number | undefined>(undefined);
  const [documentType, setDocumentType] = useState<FiscalDocumentType | undefined>(undefined);
  const [showUpload, setShowUpload] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);

  // Fetch all documents for the year (no type/quarter filter — we filter client-side)
  const { data: allDocuments, isLoading } = useFiscalDocuments(year);

  // Filter by quarter
  const quarterFiltered = useMemo(
    () => (quarter != null ? (allDocuments ?? []).filter((d) => d.fiscalQuarter === quarter) : (allDocuments ?? [])),
    [allDocuments, quarter],
  );

  // Compute card summaries from quarter-filtered data
  const summaries = useMemo(() => computeSummaries(quarterFiltered), [quarterFiltered]);

  // Filter by document type for the table
  const displayedDocuments = useMemo(
    () => (documentType ? quarterFiltered.filter((d) => d.documentType === documentType) : quarterFiltered),
    [quarterFiltered, documentType],
  );

  const handleTypeToggle = (type: FiscalDocumentType) => {
    setDocumentType((prev) => (prev === type ? undefined : type));
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-guard-primary" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-foreground">{t('documents.title')}</h1>
          </div>

          {/* Year Selector */}
          <Select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="w-24 text-sm"
            aria-label={t('fiscal.documents.fields.year')}
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowBulkUpload(true)} className="btn-ghost flex items-center gap-2">
            <Upload className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t('fiscal.documents.bulk-button')}</span>
          </button>
          <button type="button" onClick={() => setShowUpload(true)} className="btn-primary flex items-center gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t('documents.upload')}</span>
          </button>
        </div>
      </div>

      {/* Quarter Pills */}
      <div className="flex items-center gap-2 mb-6">
        <button
          type="button"
          onClick={() => setQuarter(undefined)}
          className={cn(
            'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors duration-200',
            quarter == null ? 'bg-guard-primary text-white' : 'bg-muted text-guard-muted hover:text-foreground',
          )}
        >
          {t('documents.all-quarters')}
        </button>
        {QUARTERS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => setQuarter((prev) => (prev === q ? undefined : q))}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors duration-200',
              quarter === q ? 'bg-guard-primary text-white' : 'bg-muted text-guard-muted hover:text-foreground',
            )}
          >
            Q{q}
          </button>
        ))}
      </div>

      {/* Summary Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {[1, 2, 3].map((i) => (
            <SummaryCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {summaries.map((summary, index) => (
            <SummaryCard
              key={summary.type}
              title={t(summary.labelKey)}
              value={String(summary.count)}
              icon={summary.icon}
              colors={summary.colors}
              staggerClass={STAGGER_CLASSES[index]}
              isActive={documentType === summary.type}
              onClick={() => handleTypeToggle(summary.type)}
            />
          ))}
        </div>
      )}

      {/* Document List */}
      {!isLoading && <FiscalDocumentList documents={displayedDocuments} year={year} />}

      {/* Upload Modal */}
      {showUpload && <FiscalDocumentUpload year={year} quarter={quarter} onClose={() => setShowUpload(false)} />}

      {/* Bulk Upload Modal */}
      {showBulkUpload && <FiscalBulkUpload onClose={() => setShowBulkUpload(false)} />}
    </div>
  );
}
