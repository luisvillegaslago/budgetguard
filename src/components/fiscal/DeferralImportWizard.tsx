'use client';

/**
 * Import wizard for an AEAT "RESOLUCIÓN DE APLAZAMIENTO/FRACCIONAMIENTO".
 *
 * Upload → read → confirm → book, the same shape as `ModeloDocumentUpload` and
 * `FiscalExtractionConfirm`: the machine reads the document, the human approves what it read, and
 * only then is anything written. The read step touches nothing but the vision API.
 *
 * What makes this one different from the other two is the split. A fracción is paid as a single
 * charge but is three legally distinct things, and only one of them is an expense: the intereses de
 * demora, deductible as a financial expense (casilla 0203, DGT V4080-15 and STS 150/2021). The
 * principal is the tax itself, and the recargo de apremio is expressly excluded by art. 15.c LIS.
 * Booking the instalment whole is what left 95 EUR of interest undeducted for two years.
 *
 * The confirm step is fully editable on purpose. `CreateDeferralSchema` refuses a letter whose rows
 * do not add up to its own totals row, so a digit the reader got wrong has to be correctable here
 * or the import is stuck — and the verdict beside the table names the fracción and the cents that
 * disagree. It reports; it does not block. The user may go on with findings on screen, and the
 * server is the one that says no.
 *
 * Nothing recomputes the split. AEAT loads the rounding remainder onto the last fracción (781,66 ×5
 * then 781,69), so the letter's own numbers are the source and are only ever checked against
 * themselves.
 */

import { AlertTriangle, CheckCircle2, FileText, Loader2, Upload, X } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ConfidenceBadge } from '@/components/fiscal/ConfidenceBadge';
import { DeferralFraccionesTable } from '@/components/fiscal/DeferralFraccionesTable';
import { DeferralPartsLegend } from '@/components/fiscal/DeferralPartsLegend';
import { DeferralVerdictPanel } from '@/components/fiscal/DeferralVerdictPanel';
import {
  buildCreatePayload,
  type DeferralFraccionDraft,
  type DeferralHeaderDraft,
  deferralMovements,
  draftToFraccion,
  type EditableFraccionField,
  toFraccionDrafts,
  toHeaderDraft,
  toVerifiable,
} from '@/components/fiscal/deferralDraft';
import { ModalBackdrop } from '@/components/ui/ModalBackdrop';
import { Select } from '@/components/ui/Select';
import type { FiscalQuarter, ModeloType } from '@/constants/finance';
import { FISCAL_QUARTER, LOW_CONFIDENCE_THRESHOLD, MODELO_TYPE } from '@/constants/finance';
import { type DeferralImportResponse, useCreateDeferral, useDeferrals, useExtractDeferral } from '@/hooks/useDeferrals';
import { useTranslate } from '@/hooks/useTranslations';
import { verifyDeferral } from '@/utils/deferral';
import { cn, formatDate } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

interface DeferralImportWizardProps {
  /** Year selected on the fiscal page, used only until the letter says which period it defers */
  defaultYear: number;
  onClose: () => void;
}

/** upload → confirm (what was read) → outcome (what will be booked) → success. */
type WizardStep = 'upload' | 'confirm' | 'outcome' | 'success';

/**
 * Why a reading produced no fracciones. The two are different problems for the user: the wrong
 * document is a different document, a mangled one is a better capture of the same page.
 */
type ReadFailure = 'not-a-deferral' | 'unreadable';

const MIN_YEAR = 2019;
const YEAR_LOOKAHEAD = 1;

const INPUT_CLASSES = cn(
  'w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm',
  'transition-colors duration-200 ease-out-quart',
);

const QUARTER_OPTIONS = Object.values(FISCAL_QUARTER);

const MODELO_OPTIONS = [MODELO_TYPE.M303, MODELO_TYPE.M130, MODELO_TYPE.M390, MODELO_TYPE.M100];

/** The annual modelos carry no quarter, exactly as in `FiscalDocuments` and in CK_Deferrals_Quarter. */
function isAnnualModelo(modeloType: ModeloType | ''): boolean {
  return modeloType === MODELO_TYPE.M390 || modeloType === MODELO_TYPE.M100;
}

function getCurrentQuarter(): FiscalQuarter {
  return Math.ceil((new Date().getMonth() + 1) / 3) as FiscalQuarter;
}

function buildYearOptions(): number[] {
  const maxYear = new Date().getFullYear() + YEAR_LOOKAHEAD;
  return Array.from({ length: maxYear - MIN_YEAR + 1 }, (_, index) => maxYear - index);
}

/** Label + control, so every field of the header reads the same way. */
function Field({
  label,
  htmlFor,
  hint,
  optional,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useTranslate();

  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground mb-1.5">
        {label}
        {optional && <span className="text-guard-muted text-xs ml-1 font-normal">({t('common.labels.optional')})</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-guard-muted mt-1">{hint}</p>}
    </div>
  );
}

export function DeferralImportWizard({ defaultYear, onClose }: DeferralImportWizardProps) {
  const { t } = useTranslate();

  const [step, setStep] = useState<WizardStep>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [readFailure, setReadFailure] = useState<ReadFailure | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [header, setHeader] = useState<DeferralHeaderDraft | null>(null);
  const [fraccionDrafts, setFraccionDrafts] = useState<DeferralFraccionDraft[]>([]);
  const [result, setResult] = useState<DeferralImportResponse | null>(null);

  const extractMutation = useExtractDeferral();
  const createMutation = useCreateDeferral();
  // Every stored resolution, to recognise a letter that has already been imported
  const { data: storedDeferrals } = useDeferrals();

  const yearOptions = useMemo(buildYearOptions, []);

  // The rows as numbers: what the verification checks and what the payload is built from
  const fracciones = useMemo(() => fraccionDrafts.map(draftToFraccion), [fraccionDrafts]);

  const verdict = useMemo(
    () => (header === null ? null : verifyDeferral(toVerifiable(header, fracciones))),
    [header, fracciones],
  );

  const movements = useMemo(() => deferralMovements(fracciones), [fracciones]);

  const payload = useMemo(
    () => (header === null ? null : buildCreatePayload(header, fraccionDrafts)),
    [header, fraccionDrafts],
  );

  /** The expediente is unique per user: a second import of the same letter is a duplicate. */
  const alreadyImported = useMemo(() => {
    const expediente = header?.expedienteNumber.trim().toUpperCase() ?? '';
    if (expediente === '') return null;
    return (storedDeferrals ?? []).find((stored) => stored.expedienteNumber.toUpperCase() === expediente) ?? null;
  }, [storedDeferrals, header]);

  const isAnnual = isAnnualModelo(header?.modeloType ?? '');

  const updateHeader = <K extends keyof DeferralHeaderDraft>(field: K, value: DeferralHeaderDraft[K]) => {
    setHeader((current) => (current === null ? current : { ...current, [field]: value }));
  };

  const handleModeloChange = (value: string) => {
    const modeloType = value as ModeloType;
    setHeader((current) =>
      current === null
        ? current
        : {
            ...current,
            modeloType,
            fiscalQuarter: isAnnualModelo(modeloType) ? null : (current.fiscalQuarter ?? getCurrentQuarter()),
          },
    );
  };

  const handleFraccionChange = (index: number, field: EditableFraccionField, value: string) => {
    setFraccionDrafts((current) =>
      current.map((draft, position) => (position === index ? { ...draft, [field]: value } : draft)),
    );
  };

  const handleFileSelected = (file: File) => {
    setSelectedFile(file);
    setReadFailure(null);
    extractMutation.reset();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelected(file);
  };

  /**
   * Read the letter. A reading with no fracciones is never carried forward: an empty ANEXO I is
   * either the wrong document or a page the reader could not resolve, and both need the user to
   * do something different rather than to correct an empty table.
   */
  const handleRead = async () => {
    if (!selectedFile) return;
    setReadFailure(null);

    try {
      const extracted = await extractMutation.mutateAsync({ file: selectedFile });

      if (extracted.fracciones.length === 0) {
        const looksLikeAResolution = extracted.expedienteNumber !== null || extracted.modeloType !== null;
        setReadFailure(looksLikeAResolution ? 'unreadable' : 'not-a-deferral');
        return;
      }

      const draft = toHeaderDraft(extracted);
      setHeader({ ...draft, fiscalYear: extracted.fiscalYear ?? defaultYear });
      setFraccionDrafts(toFraccionDrafts(extracted.fracciones));
      setConfidence(extracted.confidence);
      setStep('confirm');
    } catch {
      // The translated API error is rendered from the mutation itself
    }
  };

  /** Back to the start, so a second letter never inherits a field from the first. */
  const handleRestart = () => {
    setStep('upload');
    setSelectedFile(null);
    setHeader(null);
    setFraccionDrafts([]);
    setConfidence(null);
    setReadFailure(null);
    extractMutation.reset();
    createMutation.reset();
  };

  const handleCreate = async () => {
    if (payload === null) return;
    try {
      const created = await createMutation.mutateAsync(payload);
      setResult(created);
      setStep('success');
    } catch {
      // The translated API error is rendered below the button
    }
  };

  const period =
    header === null
      ? ''
      : header.fiscalQuarter === null
        ? String(header.fiscalYear)
        : t('fiscal.deferrals.confirm.period', { quarter: header.fiscalQuarter, year: header.fiscalYear });

  // ============================================================
  // Reading — nothing has been written, and nothing will be until the user confirms
  // ============================================================

  if (extractMutation.isPending) {
    return (
      <ModalBackdrop onClose={onClose} labelledBy="deferral-wizard-title" escapeClose={false}>
        <div className="card w-full max-w-md animate-modal-in p-8">
          <div className="flex flex-col items-center gap-6">
            <Loader2 className="h-8 w-8 text-guard-primary animate-spin" aria-hidden="true" />
            <h2 id="deferral-wizard-title" className="text-sm font-medium text-foreground">
              {t('fiscal.deferrals.upload.analyzing')}
            </h2>
            <p className="text-xs text-guard-muted text-center">{t('fiscal.deferrals.upload.analyzing-hint')}</p>
          </div>
        </div>
      </ModalBackdrop>
    );
  }

  return (
    <ModalBackdrop onClose={onClose} labelledBy="deferral-wizard-title">
      <div
        className={cn(
          'card w-full animate-modal-in max-h-[90vh] overflow-y-auto',
          step === 'upload' || step === 'success' ? 'max-w-lg' : 'max-w-4xl',
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-5 w-5 text-guard-primary shrink-0" aria-hidden="true" />
            <h2 id="deferral-wizard-title" className="text-xl font-bold text-foreground truncate">
              {step === 'upload' && t('fiscal.deferrals.upload.title')}
              {step === 'confirm' && t('fiscal.deferrals.confirm.title')}
              {step === 'outcome' && t('fiscal.deferrals.outcome.title')}
              {step === 'success' && t('fiscal.deferrals.success.title')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.buttons.close')}
            className="shrink-0 p-2 text-guard-muted hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* ========================= Upload ========================= */}
        {step === 'upload' && (
          <div className="space-y-4">
            <p className="text-sm text-foreground/80">{t('fiscal.deferrals.upload.description')}</p>

            {/* biome-ignore lint/a11y/noStaticElementInteractions: Drop zone requires drag event handlers */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              className={cn(
                'border-2 border-dashed rounded-lg p-6 text-center transition-colors duration-200 ease-out-quart',
                isDragOver ? 'border-guard-primary bg-guard-primary/5' : 'border-input hover:border-guard-primary/50',
                selectedFile && 'border-guard-success/50 bg-guard-success/5',
              )}
            >
              {selectedFile ? (
                <div className="flex items-center justify-center gap-2">
                  <span className="min-w-0 truncate text-sm font-medium text-foreground">{selectedFile.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      setReadFailure(null);
                      extractMutation.reset();
                    }}
                    aria-label={t('common.buttons.clear')}
                    className="shrink-0 tap-target p-1 text-guard-muted hover:text-guard-danger rounded transition-colors"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 mx-auto text-guard-muted mb-2" aria-hidden="true" />
                  <p className="text-sm text-guard-muted">{t('fiscal.deferrals.upload.drag-drop')}</p>
                  <label className="mt-2 inline-block text-sm text-guard-primary cursor-pointer hover:underline">
                    {t('fiscal.deferrals.upload.browse')}
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.png,.jpg,.jpeg,.gif,.webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileSelected(file);
                      }}
                    />
                  </label>
                </>
              )}
            </div>

            <p className="text-xs text-guard-muted">{t('fiscal.deferrals.upload.accepted-formats')}</p>

            {readFailure !== null && (
              <div
                role="alert"
                className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-guard-warning/10 border border-guard-warning/20"
              >
                <AlertTriangle className="h-4 w-4 text-guard-warning mt-0.5 shrink-0" aria-hidden="true" />
                <p className="text-sm text-guard-warning">{t(`fiscal.deferrals.errors.${readFailure}`)}</p>
              </div>
            )}

            {extractMutation.isError && (
              <div role="alert" className="p-3 rounded-lg bg-guard-danger/10 border border-guard-danger/20">
                <p className="text-sm text-guard-danger">{extractMutation.errorMessage}</p>
              </div>
            )}

            <button
              type="button"
              onClick={handleRead}
              disabled={!selectedFile}
              className={cn(
                'w-full py-3 rounded-lg font-semibold text-white transition-all duration-200 ease-out-quart',
                'bg-guard-primary hover:bg-guard-primary/90',
                'disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
              )}
            >
              {t('fiscal.deferrals.upload.submit')}
            </button>
          </div>
        )}

        {/* ========================= Confirm ========================= */}
        {step === 'confirm' && header !== null && verdict !== null && (
          <div className="space-y-6">
            <p className="text-sm text-foreground/80">{t('fiscal.deferrals.confirm.description')}</p>

            {confidence !== null && (
              <div className="space-y-3">
                <ConfidenceBadge confidence={confidence} />
                {confidence < LOW_CONFIDENCE_THRESHOLD && (
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-guard-warning/10 border border-guard-warning/20">
                    <AlertTriangle className="h-4 w-4 text-guard-warning mt-0.5 shrink-0" aria-hidden="true" />
                    <p className="text-sm text-guard-warning">{t('fiscal.deferrals.confirm.low-confidence')}</p>
                  </div>
                )}
              </div>
            )}

            {alreadyImported !== null && (
              <div
                role="alert"
                className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-guard-warning/10 border border-guard-warning/20"
              >
                <AlertTriangle className="h-4 w-4 text-guard-warning mt-0.5 shrink-0" aria-hidden="true" />
                <p className="text-sm text-guard-warning">
                  {t('fiscal.deferrals.errors.already-imported', {
                    expediente: alreadyImported.expedienteNumber,
                    date: formatDate(alreadyImported.createdAt, 'long'),
                  })}
                </p>
              </div>
            )}

            {/* Header of the resolution */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">{t('fiscal.deferrals.confirm.header-title')}</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Field label={t('fiscal.deferrals.fields.expediente-number')} htmlFor="deferral-expediente">
                  <input
                    id="deferral-expediente"
                    type="text"
                    maxLength={30}
                    value={header.expedienteNumber}
                    onChange={(e) => updateHeader('expedienteNumber', e.target.value)}
                    aria-invalid={header.expedienteNumber.trim() === ''}
                    className={INPUT_CLASSES}
                  />
                </Field>

                <Field label={t('fiscal.deferrals.fields.liquidacion-number')} htmlFor="deferral-liquidacion" optional>
                  <input
                    id="deferral-liquidacion"
                    type="text"
                    maxLength={30}
                    value={header.liquidacionNumber}
                    onChange={(e) => updateHeader('liquidacionNumber', e.target.value)}
                    className={INPUT_CLASSES}
                  />
                </Field>

                <Field label={t('fiscal.deferrals.fields.modelo-type')} htmlFor="deferral-modelo">
                  <Select
                    id="deferral-modelo"
                    value={header.modeloType}
                    onChange={(e) => handleModeloChange(e.target.value)}
                  >
                    <option value="" disabled hidden>
                      —
                    </option>
                    {MODELO_OPTIONS.map((modelo) => (
                      <option key={modelo} value={modelo}>
                        {modelo}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label={t('fiscal.deferrals.fields.fiscal-year')} htmlFor="deferral-year">
                  <Select
                    id="deferral-year"
                    value={String(header.fiscalYear)}
                    onChange={(e) => updateHeader('fiscalYear', Number(e.target.value))}
                  >
                    {yearOptions.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label={t('fiscal.deferrals.fields.fiscal-quarter')} htmlFor="deferral-quarter">
                  <Select
                    id="deferral-quarter"
                    disabled={isAnnual}
                    value={header.fiscalQuarter === null ? '' : String(header.fiscalQuarter)}
                    onChange={(e) =>
                      updateHeader(
                        'fiscalQuarter',
                        e.target.value === '' ? null : (Number(e.target.value) as FiscalQuarter),
                      )
                    }
                  >
                    <option value="" disabled hidden>
                      —
                    </option>
                    {QUARTER_OPTIONS.map((quarter) => (
                      <option key={quarter} value={quarter}>
                        {quarter}T
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field
                  label={t('fiscal.deferrals.fields.interest-start-date')}
                  htmlFor="deferral-interest-start"
                  hint={t('fiscal.deferrals.fields.interest-start-date-hint')}
                >
                  <input
                    id="deferral-interest-start"
                    type="date"
                    value={header.interestStartDate}
                    onChange={(e) => updateHeader('interestStartDate', e.target.value)}
                    aria-invalid={header.interestStartDate === ''}
                    className={INPUT_CLASSES}
                  />
                </Field>

                <Field
                  label={t('fiscal.deferrals.fields.interest-rate')}
                  htmlFor="deferral-rate"
                  hint={t('fiscal.deferrals.fields.interest-rate-hint')}
                >
                  <input
                    id="deferral-rate"
                    type="number"
                    step="0.001"
                    min="0"
                    max="100"
                    inputMode="decimal"
                    value={header.interestRatePercent}
                    onChange={(e) => updateHeader('interestRatePercent', e.target.value)}
                    className={INPUT_CLASSES}
                  />
                </Field>

                <Field label={t('fiscal.deferrals.fields.principal')} htmlFor="deferral-principal">
                  <input
                    id="deferral-principal"
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={header.principal}
                    onChange={(e) => updateHeader('principal', e.target.value)}
                    className={cn(INPUT_CLASSES, 'text-right tabular-nums')}
                  />
                </Field>

                <Field label={t('fiscal.deferrals.fields.surcharge')} htmlFor="deferral-surcharge">
                  <input
                    id="deferral-surcharge"
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={header.surcharge}
                    onChange={(e) => updateHeader('surcharge', e.target.value)}
                    className={cn(INPUT_CLASSES, 'text-right tabular-nums')}
                  />
                </Field>

                <Field label={t('fiscal.deferrals.fields.interest')} htmlFor="deferral-interest">
                  <input
                    id="deferral-interest"
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={header.interest}
                    onChange={(e) => updateHeader('interest', e.target.value)}
                    className={cn(INPUT_CLASSES, 'text-right tabular-nums')}
                  />
                </Field>

                {/* Derived, never stored: the total deuda is the sum of its own three parts */}
                <div>
                  <p className="block text-sm font-medium text-foreground mb-1.5">
                    {t('fiscal.deferrals.fields.total')}
                  </p>
                  <p className="px-3 py-2 text-sm font-semibold text-foreground text-right tabular-nums">
                    {formatCurrency(verdict.declaredTotals.totalCents)}
                  </p>
                </div>
              </div>
            </section>

            {/* ANEXO I */}
            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  {t('fiscal.deferrals.confirm.fracciones-title')}
                </h3>
                <p className="text-xs text-guard-muted mt-1">{t('fiscal.deferrals.confirm.edit-hint')}</p>
              </div>
              <DeferralFraccionesTable
                drafts={fraccionDrafts}
                declaredTotals={verdict.declaredTotals}
                onFieldChange={handleFraccionChange}
              />
            </section>

            <DeferralVerdictPanel verdict={verdict} />

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={handleRestart}
                className="flex-1 py-2.5 rounded-lg font-medium text-foreground bg-muted hover:bg-muted/80 transition-colors"
              >
                {t('fiscal.deferrals.confirm.back')}
              </button>
              <button
                type="button"
                onClick={() => setStep('outcome')}
                disabled={payload === null}
                className={cn(
                  'flex-1 py-2.5 rounded-lg font-semibold text-white transition-all duration-200 ease-out-quart',
                  'bg-guard-primary hover:bg-guard-primary/90',
                  'disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
                )}
              >
                {t('fiscal.deferrals.confirm.submit')}
              </button>
            </div>
          </div>
        )}

        {/* ========================= Outcome ========================= */}
        {step === 'outcome' && header !== null && (
          <div className="space-y-6">
            <p className="text-sm text-foreground/80">{t('fiscal.deferrals.outcome.description')}</p>

            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
              <p className="text-sm font-semibold text-foreground">
                {header.expedienteNumber}
                {header.modeloType !== '' && ` · ${header.modeloType} · ${period}`}
              </p>
              <p className="text-sm text-foreground/80 mt-1">
                {t('fiscal.deferrals.outcome.movements', {
                  count: movements.length,
                  fracciones: fraccionDrafts.length,
                })}
              </p>
            </div>

            <DeferralPartsLegend />

            <ul className="space-y-2 text-xs text-guard-muted">
              <li>{t('fiscal.deferrals.outcome.pending-note')}</li>
              <li>{t('fiscal.deferrals.outcome.interest-note')}</li>
              <li>{t('fiscal.deferrals.outcome.models-note')}</li>
              {/* The recargo column is zero on every letter read so far; say so before it looks like a bug */}
              {fracciones.every((fraccion) => fraccion.surchargeCents === 0) && (
                <li>{t('fiscal.deferrals.outcome.no-surcharge-note')}</li>
              )}
            </ul>

            {alreadyImported !== null && (
              <div
                role="alert"
                className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-guard-warning/10 border border-guard-warning/20"
              >
                <AlertTriangle className="h-4 w-4 text-guard-warning mt-0.5 shrink-0" aria-hidden="true" />
                <p className="text-sm text-guard-warning">
                  {t('fiscal.deferrals.errors.already-imported', {
                    expediente: alreadyImported.expedienteNumber,
                    date: formatDate(alreadyImported.createdAt, 'long'),
                  })}
                </p>
              </div>
            )}

            {createMutation.isError && (
              <div role="alert" className="p-3 rounded-lg bg-guard-danger/10 border border-guard-danger/20">
                <p className="text-sm text-guard-danger">{createMutation.errorMessage}</p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep('confirm')}
                disabled={createMutation.isPending}
                className="flex-1 py-2.5 rounded-lg font-medium text-foreground bg-muted hover:bg-muted/80 transition-colors disabled:opacity-50"
              >
                {t('fiscal.deferrals.outcome.back')}
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={payload === null || createMutation.isPending}
                className={cn(
                  'flex-1 py-2.5 rounded-lg font-semibold text-white transition-all duration-200 ease-out-quart',
                  'bg-guard-primary hover:bg-guard-primary/90',
                  'disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
                )}
              >
                {createMutation.isPending
                  ? t('fiscal.deferrals.outcome.creating')
                  : t('fiscal.deferrals.outcome.create', { count: movements.length })}
              </button>
            </div>
          </div>
        )}

        {/* ========================= Success ========================= */}
        {step === 'success' && result !== null && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-guard-success/10 border border-guard-success/20">
              <CheckCircle2 className="h-4 w-4 text-guard-success mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-sm text-guard-success">
                {t('fiscal.deferrals.success.description', { count: result.movementCount })}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-lg font-medium text-foreground bg-muted hover:bg-muted/80 transition-colors"
              >
                {t('fiscal.deferrals.success.close')}
              </button>
              <Link
                href="/movements"
                onClick={onClose}
                className={cn(
                  'flex-1 py-2.5 rounded-lg font-semibold text-white text-center transition-all duration-200 ease-out-quart',
                  'bg-guard-primary hover:bg-guard-primary/90 active:scale-[0.98]',
                )}
              >
                {t('fiscal.deferrals.success.view-movements')}
              </Link>
            </div>
          </div>
        )}
      </div>
    </ModalBackdrop>
  );
}
