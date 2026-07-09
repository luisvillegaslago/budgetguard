'use client';

/**
 * Unified upload modal for modelo documents (303, 130, 390, 100).
 * Detects the modelo type/year/quarter/result from the file (filename first, AI as
 * fallback) and pre-fills the form, while keeping every field manually editable.
 */

import { AlertTriangle, ExternalLink, Loader2, Upload, X, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ConfidenceBadge } from '@/components/fiscal/ConfidenceBadge';
import { ModalBackdrop } from '@/components/ui/ModalBackdrop';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import type { ModeloType } from '@/constants/finance';
import { FISCAL_DOCUMENT_TYPE, FISCAL_STATUS, LOW_CONFIDENCE_THRESHOLD, MODELO_TYPE } from '@/constants/finance';
import { useDetectModelo, useFiscalDocuments, useUploadFiscalDocument } from '@/hooks/useFiscalDocuments';
import { useTranslate } from '@/hooks/useTranslations';
import { parseDocumentFilename } from '@/utils/fiscalFileParser';
import { cn } from '@/utils/helpers';
import { centsToEuros, eurosToCents } from '@/utils/money';

interface ModeloDocumentUploadProps {
  defaultYear: number;
  defaultQuarter?: number;
  onClose: () => void;
}

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 2019;
const MAX_YEAR = CURRENT_YEAR + 1;
// Year options from current year + 1 down to 2019 (descending).
const YEAR_OPTIONS = Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => MAX_YEAR - i);
const QUARTER_OPTIONS = [1, 2, 3, 4];

function isSelectableYear(year: number | null): year is number {
  return year != null && year >= MIN_YEAR && year <= MAX_YEAR;
}

const INPUT_CLASSES = cn(
  'w-full px-4 py-2.5 rounded-lg border border-input bg-background text-foreground',
  'focus:ring-2 focus:ring-guard-primary focus:border-transparent',
  'transition-colors duration-200 ease-out-quart',
);

function isAnnualModelo(type: ModeloType | ''): boolean {
  return type === MODELO_TYPE.M390 || type === MODELO_TYPE.M100;
}

function getCurrentQuarter(): number {
  return Math.ceil((new Date().getMonth() + 1) / 3);
}

export function ModeloDocumentUpload({ defaultYear, defaultQuarter, onClose }: ModeloDocumentUploadProps) {
  const { t } = useTranslate();
  const toast = useToast();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [modeloType, setModeloType] = useState<ModeloType | ''>('');
  const [fiscalYear, setFiscalYear] = useState(defaultYear);
  const [fiscalQuarter, setFiscalQuarter] = useState<number | null>(defaultQuarter ?? null);
  // Default to FILED: the entry point is the "I filed a tax form" button.
  const [status, setStatus] = useState<string>(FISCAL_STATUS.FILED);
  const [taxAmount, setTaxAmount] = useState('');
  const [description, setDescription] = useState('');
  const [detectedConfidence, setDetectedConfidence] = useState<number | null>(null);
  const [showManualHint, setShowManualHint] = useState(false);
  const [showDeferralReminder, setShowDeferralReminder] = useState(false);
  // True only while the form still reflects what the filename/AI recognised, so the
  // "detected" summary never mislabels a value the user picked by hand.
  const [isAutoDetected, setIsAutoDetected] = useState(false);

  const detectMutation = useDetectModelo();
  const uploadMutation = useUploadFiscalDocument(fiscalYear);
  // Every modelo already archived for the selected year, to warn about duplicates.
  const { data: yearModelos } = useFiscalDocuments(fiscalYear, undefined, FISCAL_DOCUMENT_TYPE.MODELO);

  const isAnnual = isAnnualModelo(modeloType);

  /**
   * Nothing in the database prevents filing the same modelo twice, and the fiscal
   * page would hide the duplicate (it renders the first match only). Warn instead of
   * blocking: a complementaria or a rectificación is a legitimate second document.
   */
  const alreadyFiled = useMemo(() => {
    if (!modeloType) return null;
    const targetQuarter = isAnnual ? null : fiscalQuarter;
    return (
      (yearModelos ?? []).find(
        (doc) =>
          doc.modeloType === modeloType && doc.fiscalQuarter === targetQuarter && doc.status === FISCAL_STATUS.FILED,
      ) ?? null
    );
  }, [yearModelos, modeloType, fiscalQuarter, isAnnual]);

  // Result may be negative (refund due), so only NaN is invalid.
  const trimmedTaxAmount = taxAmount.trim();
  const parsedTaxAmount = trimmedTaxAmount === '' ? null : Number(trimmedTaxAmount);
  const isTaxAmountInvalid = parsedTaxAmount !== null && Number.isNaN(parsedTaxAmount);

  const detectedPeriod = isAnnual || fiscalQuarter == null ? String(fiscalYear) : `${fiscalQuarter}T ${fiscalYear}`;

  /** Drop every value derived from the previous file, so nothing leaks across selections. */
  const resetDetectedFields = () => {
    setModeloType('');
    setFiscalYear(defaultYear);
    setFiscalQuarter(defaultQuarter ?? null);
    setTaxAmount('');
    setDescription('');
    setDetectedConfidence(null);
    setShowManualHint(false);
    setIsAutoDetected(false);
    detectMutation.reset();
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    resetDetectedFields();
  };

  const handleFileSelected = async (file: File) => {
    resetDetectedFields();
    setSelectedFile(file);

    // Cost-saving cascade: the filename alone may already identify the modelo.
    const parsed = parseDocumentFilename(file.name);
    if (parsed.documentType === FISCAL_DOCUMENT_TYPE.MODELO && parsed.modeloType) {
      const annual = isAnnualModelo(parsed.modeloType);
      setModeloType(parsed.modeloType);
      // A filename may carry a year outside the selectable range; fall back rather
      // than leaving the year Select showing no matching option.
      setFiscalYear(isSelectableYear(parsed.fiscalYear) ? parsed.fiscalYear : defaultYear);
      setFiscalQuarter(annual ? null : (parsed.fiscalQuarter ?? defaultQuarter ?? getCurrentQuarter()));
      setIsAutoDetected(true);
      return;
    }

    // Fall back to AI detection.
    try {
      const detected = await detectMutation.mutateAsync({ file });
      const annual = detected.modeloType === MODELO_TYPE.M390 || detected.modeloType === MODELO_TYPE.M100;
      if (detected.modeloType) {
        setModeloType(detected.modeloType);
        setIsAutoDetected(true);
      }
      if (isSelectableYear(detected.fiscalYear)) setFiscalYear(detected.fiscalYear);
      setFiscalQuarter(annual ? null : detected.fiscalQuarter);
      if (detected.resultAmountCents != null) setTaxAmount(String(centsToEuros(detected.resultAmountCents)));
      setDetectedConfidence(detected.confidence);
      // Flag for manual review when nothing was recognized or confidence is low.
      if (!detected.modeloType || detected.confidence < LOW_CONFIDENCE_THRESHOLD) setShowManualHint(true);
    } catch {
      // AI detection failed — never block manual entry.
      setShowManualHint(true);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFileSelected(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleModeloChange = (value: string) => {
    const next = value as ModeloType;
    setModeloType(next);
    // The user has taken over: stop presenting the value as auto-detected and
    // retire the manual-review hint, which has already served its purpose.
    setIsAutoDetected(false);
    setShowManualHint(false);
    if (next === MODELO_TYPE.M390 || next === MODELO_TYPE.M100) {
      setFiscalQuarter(null);
    } else if (fiscalQuarter == null) {
      setFiscalQuarter(defaultQuarter ?? getCurrentQuarter());
    }
  };

  const isSubmitDisabled =
    !selectedFile ||
    !modeloType ||
    (!isAnnual && fiscalQuarter == null) ||
    isTaxAmountInvalid ||
    detectMutation.isPending ||
    uploadMutation.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitDisabled || !selectedFile || !modeloType) return;

    const metadata: Record<string, unknown> = {
      documentType: FISCAL_DOCUMENT_TYPE.MODELO,
      modeloType,
      fiscalYear,
      fiscalQuarter: isAnnual ? null : fiscalQuarter,
      status,
      taxAmountCents: parsedTaxAmount !== null ? eurosToCents(parsedTaxAmount) : null,
      description: description || null,
    };

    try {
      await uploadMutation.mutateAsync({ file: selectedFile, metadata });
      toast.success(t('fiscal.documents.upload-success'));
    } catch {
      // Surface the translated upload error instead of a generic "load" message.
      toast.error(uploadMutation.errorMessage ?? t('fiscal.documents.errors.upload-failed'));
      return;
    }

    if (modeloType === MODELO_TYPE.M130) {
      setShowDeferralReminder(true);
      return;
    }
    onClose();
  };

  if (showDeferralReminder) {
    return (
      <ModalBackdrop onClose={onClose} labelledBy="deferral-reminder-title">
        <div className="card w-full max-w-md animate-modal-in">
          <h2 id="deferral-reminder-title" className="text-xl font-bold text-foreground mb-3">
            {t('fiscal.deferral-reminder.title')}
          </h2>
          <p className="text-sm text-foreground/80 mb-4">{t('fiscal.deferral-reminder.description')}</p>
          <a
            href="https://sede.agenciatributaria.gob.es/Sede/procedimientoini/RB01.shtml"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'flex items-center justify-center gap-2 w-full py-3 rounded-lg font-semibold text-white mb-3',
              'bg-guard-primary hover:bg-guard-primary/90 transition-all duration-200 ease-out-quart active:scale-[0.98]',
            )}
          >
            {t('fiscal.deferral-reminder.open-link')}
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-lg text-sm font-medium text-guard-muted hover:text-foreground hover:bg-muted transition-colors"
          >
            {t('common.buttons.close')}
          </button>
        </div>
      </ModalBackdrop>
    );
  }

  // Progress screen while the AI detects the modelo.
  if (detectMutation.isPending) {
    return (
      <ModalBackdrop onClose={onClose} labelledBy="modelo-upload-title" escapeClose={false}>
        <div className="card w-full max-w-md animate-modal-in p-8">
          <div className="flex flex-col items-center gap-6">
            <Loader2 className="h-8 w-8 text-guard-primary animate-spin" aria-hidden="true" />
            <div className="flex items-center gap-3">
              <Loader2 className="h-4 w-4 text-guard-primary animate-spin shrink-0" aria-hidden="true" />
              <span className="text-sm text-foreground font-medium">{t('fiscal.modelo-upload.detecting')}</span>
            </div>
            <p className="text-xs text-guard-muted">{t('fiscal.extraction.analyzing-hint')}</p>
          </div>
        </div>
      </ModalBackdrop>
    );
  }

  return (
    <ModalBackdrop onClose={onClose} labelledBy="modelo-upload-title">
      <div className="card w-full max-w-md animate-modal-in max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 id="modelo-upload-title" className="text-xl font-bold text-foreground">
            {t('fiscal.modelo-upload.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-guard-muted hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Drop Zone */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: Drop zone requires drag event handlers */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={cn(
              'border-2 border-dashed rounded-lg p-6 text-center transition-colors duration-200 ease-out-quart',
              isDragOver ? 'border-guard-primary bg-guard-primary/5' : 'border-input hover:border-guard-primary/50',
              selectedFile && 'border-guard-success/50 bg-guard-success/5',
            )}
          >
            {selectedFile ? (
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm font-medium text-foreground">{selectedFile.name}</span>
                <button
                  type="button"
                  onClick={handleClearFile}
                  className="p-1 text-guard-muted hover:text-guard-danger rounded transition-colors"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="h-8 w-8 mx-auto text-guard-muted mb-2" aria-hidden="true" />
                <p className="text-sm text-guard-muted">{t('fiscal.documents.drag-drop')}</p>
                <label className="mt-2 inline-block text-sm text-guard-primary cursor-pointer hover:underline">
                  {t('fiscal.documents.browse')}
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleFileSelected(file);
                    }}
                  />
                </label>
              </>
            )}
          </div>

          {/* OCR hint — shown before a file is selected */}
          {!selectedFile && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-guard-primary/5 border border-guard-primary/20">
              <Zap className="h-4 w-4 text-guard-primary mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-xs text-guard-muted">{t('fiscal.extraction.ocr-hint')}</p>
            </div>
          )}

          {/* Detected summary — only for values the filename or the AI recognised */}
          {isAutoDetected && modeloType && (
            <div className="px-3 py-2 rounded-lg bg-guard-primary/5 border border-guard-primary/20 text-sm text-foreground">
              {t('fiscal.modelo-upload.detected', { modelo: modeloType, period: detectedPeriod })}
            </div>
          )}

          {/* Confidence badge — tied to the detection, so it hides once the user overrides it */}
          {isAutoDetected && detectedConfidence != null && <ConfidenceBadge confidence={detectedConfidence} />}

          {/* Duplicate warning — this modelo/period is already filed */}
          {alreadyFiled && (
            <div
              role="alert"
              className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-guard-warning/10 border border-guard-warning/20"
            >
              <AlertTriangle className="h-4 w-4 text-guard-warning mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-sm text-guard-warning">
                {t('fiscal.modelo-upload.already-filed', { modelo: modeloType, period: detectedPeriod })}
              </p>
            </div>
          )}

          {/* Manual-review hint (low confidence, not recognized, or detection failed) */}
          {showManualHint && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-guard-warning/10 border border-guard-warning/20">
              <AlertTriangle className="h-4 w-4 text-guard-warning mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-sm text-guard-warning">{t('fiscal.modelo-upload.not-detected')}</p>
            </div>
          )}

          {/* Modelo / Year / Quarter */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="modeloType" className="block text-sm font-medium text-foreground mb-1.5">
                {t('fiscal.modelo-upload.fields.modelo')}
              </label>
              <Select id="modeloType" value={modeloType} onChange={(e) => handleModeloChange(e.target.value)}>
                <option value="" disabled hidden>
                  —
                </option>
                <option value={MODELO_TYPE.M303}>303</option>
                <option value={MODELO_TYPE.M130}>130</option>
                <option value={MODELO_TYPE.M390}>390</option>
                <option value={MODELO_TYPE.M100}>100</option>
              </Select>
            </div>
            <div>
              <label htmlFor="fiscalYear" className="block text-sm font-medium text-foreground mb-1.5">
                {t('fiscal.modelo-upload.fields.year')}
              </label>
              <Select
                id="fiscalYear"
                value={String(fiscalYear)}
                onChange={(e) => setFiscalYear(Number(e.target.value))}
              >
                {YEAR_OPTIONS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label htmlFor="fiscalQuarter" className="block text-sm font-medium text-foreground mb-1.5">
                {t('fiscal.modelo-upload.fields.quarter')}
              </label>
              <Select
                id="fiscalQuarter"
                value={fiscalQuarter != null ? String(fiscalQuarter) : ''}
                disabled={isAnnual}
                onChange={(e) => setFiscalQuarter(e.target.value === '' ? null : Number(e.target.value))}
              >
                <option value="" disabled hidden>
                  —
                </option>
                {QUARTER_OPTIONS.map((q) => (
                  <option key={q} value={q}>
                    {q}T
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {/* Status */}
          <div>
            <label htmlFor="modeloStatus" className="block text-sm font-medium text-foreground mb-1.5">
              {t('fiscal.documents.fields.status')}
            </label>
            <Select id="modeloStatus" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value={FISCAL_STATUS.FILED}>{t('fiscal.documents.status.filed')}</option>
              <option value={FISCAL_STATUS.PENDING}>{t('fiscal.documents.status.pending')}</option>
            </Select>
          </div>

          {/* Result amount */}
          <div>
            <label htmlFor="modeloTaxAmount" className="block text-sm font-medium text-foreground mb-1.5">
              {t('fiscal.modelo-upload.fields.result-amount')}
              <span className="text-guard-muted text-xs ml-1 font-normal">({t('common.labels.optional')})</span>
            </label>
            <input
              id="modeloTaxAmount"
              type="number"
              step="0.01"
              value={taxAmount}
              onChange={(e) => setTaxAmount(e.target.value)}
              className={INPUT_CLASSES}
              placeholder="0.00"
              aria-invalid={isTaxAmountInvalid}
            />
            {isTaxAmountInvalid && (
              <p role="alert" className="text-xs text-guard-danger mt-1">
                {t('fiscal.documents.errors.tax-amount-invalid')}
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label htmlFor="modeloDescription" className="block text-sm font-medium text-foreground mb-1.5">
              {t('fiscal.documents.fields.description')}
              <span className="text-guard-muted text-xs ml-1 font-normal">({t('common.labels.optional')})</span>
            </label>
            <input
              id="modeloDescription"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={INPUT_CLASSES}
              maxLength={255}
            />
          </div>

          {/* Error */}
          {uploadMutation.isError && (
            <div role="alert" className="p-3 rounded-lg bg-guard-danger/10 border border-guard-danger/20">
              <p className="text-sm text-guard-danger">
                {uploadMutation.errorMessage ?? t('fiscal.documents.errors.upload-failed')}
              </p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitDisabled}
            className={cn(
              'w-full py-3 rounded-lg font-semibold text-white transition-all duration-200 ease-out-quart',
              'bg-guard-primary hover:bg-guard-primary/90',
              'disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
            )}
          >
            {uploadMutation.isPending
              ? t('common.loading')
              : alreadyFiled
                ? t('fiscal.modelo-upload.upload-anyway')
                : t('fiscal.documents.upload-submit')}
          </button>
        </form>
      </div>
    </ModalBackdrop>
  );
}
