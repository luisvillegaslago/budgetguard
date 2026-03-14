'use client';

/**
 * Single fiscal document upload form with drag & drop.
 * Uses the same modal/form patterns as TransactionForm and TransactionGroupForm.
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { Upload, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ModalBackdrop } from '@/components/ui/ModalBackdrop';
import { Select } from '@/components/ui/Select';
import { FISCAL_DOCUMENT_TYPE, FISCAL_STATUS, MODELO_TYPE } from '@/constants/finance';
import { useUploadFiscalDocument } from '@/hooks/useFiscalDocuments';
import { useTranslate } from '@/hooks/useTranslations';
import { cn } from '@/utils/helpers';
import { eurosToCents } from '@/utils/money';

interface FiscalDocumentUploadProps {
  year: number;
  quarter?: number;
  /** Pre-filled modelo metadata — hides type/modelo/year/quarter fields when set */
  prefilledModelo?: {
    modeloType: '303' | '130' | '390' | '100';
  };
  onClose: () => void;
}

const INPUT_CLASSES = cn(
  'w-full px-4 py-2.5 rounded-lg border border-input bg-background text-foreground',
  'focus:ring-2 focus:ring-guard-primary focus:border-transparent',
  'transition-colors duration-200 ease-out-quart',
);

const UploadFormSchema = z.object({
  documentType: z.enum(['modelo', 'factura_recibida']),
  modeloType: z.enum(['303', '130', '390', '100']).nullable(),
  fiscalYear: z.coerce.number().int().min(2019).max(2100),
  fiscalQuarter: z.coerce.number().int().min(1).max(4).nullable(),
  status: z.enum(['pending', 'filed']),
  taxAmount: z.coerce.number().min(0).nullable(),
  description: z.string().max(255).nullable(),
});

type UploadFormData = z.infer<typeof UploadFormSchema>;

export function FiscalDocumentUpload({ year, quarter, prefilledModelo, onClose }: FiscalDocumentUploadProps) {
  const { t } = useTranslate();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const uploadMutation = useUploadFiscalDocument(year);

  const isPrefilled = prefilledModelo != null;

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<UploadFormData>({
    resolver: zodResolver(UploadFormSchema),
    defaultValues: {
      documentType: isPrefilled ? FISCAL_DOCUMENT_TYPE.MODELO : FISCAL_DOCUMENT_TYPE.MODELO,
      modeloType: prefilledModelo?.modeloType ?? MODELO_TYPE.M303,
      fiscalYear: year,
      fiscalQuarter: quarter ?? null,
      status: FISCAL_STATUS.FILED,
      taxAmount: null,
      description: null,
    },
  });

  const documentType = watch('documentType');
  const modeloType = watch('modeloType');
  const isAnnualModelo = modeloType === MODELO_TYPE.M390 || modeloType === MODELO_TYPE.M100;

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) setSelectedFile(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const onSubmit = async (data: UploadFormData) => {
    if (!selectedFile) return;

    const metadata: Record<string, unknown> = {
      documentType: data.documentType,
      modeloType: data.documentType === FISCAL_DOCUMENT_TYPE.MODELO ? data.modeloType : null,
      fiscalYear: data.fiscalYear,
      fiscalQuarter:
        isAnnualModelo || data.documentType === FISCAL_DOCUMENT_TYPE.FACTURA_RECIBIDA ? null : data.fiscalQuarter,
      status: data.status,
      taxAmountCents: data.taxAmount != null ? eurosToCents(data.taxAmount) : null,
      description: data.description || null,
    };

    await uploadMutation.mutateAsync({ file: selectedFile, metadata });
    onClose();
  };

  return (
    <ModalBackdrop onClose={onClose} labelledBy="fiscal-upload-title">
      <div className="card w-full max-w-md animate-modal-in max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 id="fiscal-upload-title" className="text-xl font-bold text-foreground">
            {t('fiscal.documents.upload-title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-guard-muted hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
                  onClick={() => setSelectedFile(null)}
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
                      if (file) setSelectedFile(file);
                    }}
                  />
                </label>
              </>
            )}
          </div>

          {/* Prefilled info banner */}
          {isPrefilled && (
            <div className="px-3 py-2 rounded-lg bg-guard-primary/5 border border-guard-primary/20 text-sm text-foreground">
              Modelo {prefilledModelo.modeloType} {quarter ? `Q${quarter}` : ''} {year}
            </div>
          )}

          {/* Document Type — hidden when prefilled */}
          {!isPrefilled && (
            <div>
              <label htmlFor="docType" className="block text-sm font-medium text-foreground mb-1.5">
                {t('fiscal.documents.fields.document-type')}
              </label>
              <Select id="docType" {...register('documentType')}>
                <option value={FISCAL_DOCUMENT_TYPE.MODELO}>{t('fiscal.documents.types.modelo')}</option>
                <option value={FISCAL_DOCUMENT_TYPE.FACTURA_RECIBIDA}>{t('fiscal.documents.types.factura')}</option>
                <option value={FISCAL_DOCUMENT_TYPE.FACTURA_EMITIDA}>
                  {t('fiscal.documents.types.factura-emitida')}
                </option>
              </Select>
            </div>
          )}

          {/* Modelo Type — hidden when prefilled */}
          {!isPrefilled && documentType === FISCAL_DOCUMENT_TYPE.MODELO && (
            <div>
              <label htmlFor="modeloType" className="block text-sm font-medium text-foreground mb-1.5">
                {t('fiscal.documents.fields.modelo-type')}
              </label>
              <Select id="modeloType" {...register('modeloType')}>
                <option value={MODELO_TYPE.M303}>Modelo 303</option>
                <option value={MODELO_TYPE.M130}>Modelo 130</option>
                <option value={MODELO_TYPE.M390}>Modelo 390</option>
                <option value={MODELO_TYPE.M100}>Modelo 100</option>
              </Select>
            </div>
          )}

          {/* Year & Quarter — hidden when prefilled */}
          {!isPrefilled && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="fiscalYear" className="block text-sm font-medium text-foreground mb-1.5">
                  {t('fiscal.documents.fields.year')}
                </label>
                <input
                  id="fiscalYear"
                  type="number"
                  {...register('fiscalYear')}
                  className={cn(INPUT_CLASSES, errors.fiscalYear && 'border-guard-danger')}
                />
                {errors.fiscalYear && (
                  <p role="alert" className="mt-1 text-sm text-guard-danger">
                    {errors.fiscalYear.message}
                  </p>
                )}
              </div>
              {!isAnnualModelo && documentType === FISCAL_DOCUMENT_TYPE.MODELO && (
                <div>
                  <label htmlFor="fiscalQuarter" className="block text-sm font-medium text-foreground mb-1.5">
                    {t('fiscal.documents.fields.quarter')}
                  </label>
                  <Select id="fiscalQuarter" {...register('fiscalQuarter', { valueAsNumber: true })}>
                    <option value={1}>Q1</option>
                    <option value={2}>Q2</option>
                    <option value={3}>Q3</option>
                    <option value={4}>Q4</option>
                  </Select>
                </div>
              )}
            </div>
          )}

          {/* Status */}
          <div>
            <label htmlFor="docStatus" className="block text-sm font-medium text-foreground mb-1.5">
              {t('fiscal.documents.fields.status')}
            </label>
            <Select id="docStatus" {...register('status')}>
              <option value={FISCAL_STATUS.FILED}>{t('fiscal.documents.status.filed')}</option>
              <option value={FISCAL_STATUS.PENDING}>{t('fiscal.documents.status.pending')}</option>
            </Select>
          </div>

          {/* Tax Amount */}
          <div>
            <label htmlFor="taxAmount" className="block text-sm font-medium text-foreground mb-1.5">
              {t('fiscal.documents.fields.tax-amount')}
              <span className="text-guard-muted text-xs ml-1 font-normal">({t('common.labels.optional')})</span>
            </label>
            <input
              id="taxAmount"
              type="number"
              step="0.01"
              {...register('taxAmount', { valueAsNumber: true })}
              className={INPUT_CLASSES}
              placeholder="0.00"
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="docDescription" className="block text-sm font-medium text-foreground mb-1.5">
              {t('fiscal.documents.fields.description')}
              <span className="text-guard-muted text-xs ml-1 font-normal">({t('common.labels.optional')})</span>
            </label>
            <input
              id="docDescription"
              type="text"
              {...register('description')}
              className={INPUT_CLASSES}
              maxLength={255}
            />
          </div>

          {/* Error Alert */}
          {uploadMutation.isError && (
            <div role="alert" className="p-3 rounded-lg bg-guard-danger/10 border border-guard-danger/20">
              <p className="text-sm text-guard-danger">{t('fiscal.errors.load')}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!selectedFile || isSubmitting || uploadMutation.isPending}
            className={cn(
              'w-full py-3 rounded-lg font-semibold text-white transition-all duration-200 ease-out-quart',
              'bg-guard-primary hover:bg-guard-primary/90',
              'disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
            )}
          >
            {uploadMutation.isPending ? t('common.loading') : t('fiscal.documents.upload-submit')}
          </button>
        </form>
      </div>
    </ModalBackdrop>
  );
}
