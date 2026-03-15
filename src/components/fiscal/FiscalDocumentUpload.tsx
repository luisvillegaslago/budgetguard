'use client';

/**
 * Upload modal for received invoices (factura_recibida).
 * Simplified flow: file → upload → OCR auto-detects amount, date, vendor → confirmation modal.
 * Modelos are uploaded from the fiscal page, facturas emitidas from the invoices section.
 */

import { Check, Loader2, Upload, X, Zap } from 'lucide-react';
import { useCallback, useState } from 'react';
import { FiscalExtractionConfirm } from '@/components/fiscal/FiscalExtractionConfirm';
import { ModalBackdrop } from '@/components/ui/ModalBackdrop';
import { FISCAL_DOCUMENT_TYPE, FISCAL_STATUS } from '@/constants/finance';
import { useDeleteFiscalDocument, useExtractDocument, useUploadFiscalDocument } from '@/hooks/useFiscalDocuments';
import { useTranslate } from '@/hooks/useTranslations';
import type { ExtractedInvoiceData } from '@/types/finance';
import { cn } from '@/utils/helpers';

type UploadStep = 'idle' | 'uploading' | 'analyzing' | 'done';

interface FiscalDocumentUploadProps {
  year: number;
  onClose: () => void;
}

export function FiscalDocumentUpload({ year, onClose }: FiscalDocumentUploadProps) {
  const { t, locale } = useTranslate();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [step, setStep] = useState<UploadStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [failedDocId, setFailedDocId] = useState<number | null>(null);
  const [extractionData, setExtractionData] = useState<{
    documentId: number;
    data: ExtractedInvoiceData;
  } | null>(null);
  const uploadMutation = useUploadFiscalDocument(year);
  const extractMutation = useExtractDocument();
  const deleteMutation = useDeleteFiscalDocument(year);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setError(null);
    setStep('uploading');

    try {
      const metadata: Record<string, unknown> = {
        documentType: FISCAL_DOCUMENT_TYPE.FACTURA_RECIBIDA,
        modeloType: null,
        fiscalYear: year,
        fiscalQuarter: null,
        status: FISCAL_STATUS.PENDING,
        taxAmountCents: null,
        description: null,
      };

      const uploaded = await uploadMutation.mutateAsync({ file: selectedFile, metadata });

      // Auto-trigger OCR
      if (uploaded.documentId) {
        setStep('analyzing');
        try {
          const extracted = await extractMutation.mutateAsync({ documentId: uploaded.documentId, locale });
          setStep('done');
          setExtractionData({ documentId: uploaded.documentId, data: extracted });
          return;
        } catch (ocrErr) {
          setStep('idle');
          setFailedDocId(uploaded.documentId);
          const code = ocrErr instanceof Error ? ocrErr.message : '';
          const errorMessages: Record<string, string> = {
            extraction_failed: t('fiscal.extraction.errors.extraction-failed'),
            api_credits_exhausted: t('fiscal.extraction.errors.api-credits'),
            unrecognizable_amount: t('fiscal.extraction.errors.unrecognizable'),
          };
          setError(errorMessages[code] ?? t('fiscal.extraction.errors.extraction-failed'));
          return;
        }
      }

      onClose();
    } catch (err) {
      setStep('idle');
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  // Show extraction confirmation modal
  if (extractionData) {
    return (
      <FiscalExtractionConfirm
        documentId={extractionData.documentId}
        extractedData={extractionData.data}
        onClose={onClose}
        onSuccess={onClose}
      />
    );
  }

  // Show progress during upload + OCR
  if (step === 'uploading' || step === 'analyzing') {
    return (
      <ModalBackdrop onClose={onClose} labelledBy="fiscal-upload-title" escapeClose={false}>
        <div className="card w-full max-w-md animate-modal-in p-8">
          <div className="flex flex-col items-center gap-6">
            <Loader2 className="h-8 w-8 text-guard-primary animate-spin" aria-hidden="true" />

            {/* Progress steps */}
            <div className="w-full space-y-3">
              {/* Step 1: Upload */}
              <div className="flex items-center gap-3">
                {step === 'uploading' ? (
                  <Loader2 className="h-4 w-4 text-guard-primary animate-spin shrink-0" aria-hidden="true" />
                ) : (
                  <Check className="h-4 w-4 text-guard-success shrink-0" aria-hidden="true" />
                )}
                <span
                  className={cn('text-sm', step === 'uploading' ? 'text-foreground font-medium' : 'text-guard-muted')}
                >
                  {t('fiscal.extraction.step-uploading')}
                </span>
              </div>

              {/* Step 2: Analyze */}
              <div className="flex items-center gap-3">
                {step === 'analyzing' ? (
                  <Loader2 className="h-4 w-4 text-guard-primary animate-spin shrink-0" aria-hidden="true" />
                ) : (
                  <div className="h-4 w-4 rounded-full border border-input shrink-0" />
                )}
                <span
                  className={cn('text-sm', step === 'analyzing' ? 'text-foreground font-medium' : 'text-guard-muted')}
                >
                  {t('fiscal.extraction.step-analyzing')}
                </span>
              </div>
            </div>

            <p className="text-xs text-guard-muted">{t('fiscal.extraction.analyzing-hint')}</p>
          </div>
        </div>
      </ModalBackdrop>
    );
  }

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
                {!failedDocId && (
                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="p-1 text-guard-muted hover:text-guard-danger rounded transition-colors"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
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

          {/* OCR hint — hidden when error */}
          {!failedDocId && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-guard-primary/5 border border-guard-primary/20">
              <Zap className="h-4 w-4 text-guard-primary mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-xs text-guard-muted">{t('fiscal.extraction.ocr-hint')}</p>
            </div>
          )}

          {/* Error Alert */}
          {error && (
            <div role="alert" className="p-3 rounded-lg bg-guard-danger/10 border border-guard-danger/20">
              <p className="text-sm text-guard-danger">{error}</p>
            </div>
          )}

          {/* Action buttons when OCR failed */}
          {failedDocId && (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setExtractionData({
                    documentId: failedDocId,
                    data: {
                      totalAmountCents: 0,
                      baseAmountCents: null,
                      taxAmountCents: null,
                      vatPercent: null,
                      date: null,
                      vendor: null,
                      invoiceNumber: null,
                      description: null,
                      confidence: 0,
                    },
                  });
                }}
                className={cn(
                  'flex-1 py-2.5 rounded-lg font-medium text-sm transition-colors',
                  'bg-guard-primary text-white hover:bg-guard-primary/90',
                )}
              >
                {t('fiscal.extraction.enter-manually')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await deleteMutation.mutateAsync({ id: failedDocId });
                  onClose();
                }}
                disabled={deleteMutation.isPending}
                className={cn(
                  'flex-1 py-2.5 rounded-lg font-medium text-sm transition-colors',
                  'bg-guard-danger text-white hover:bg-guard-danger/90',
                )}
              >
                {t('common.buttons.delete')}
              </button>
            </div>
          )}

          {/* Submit Button — hidden when error */}
          {!failedDocId && (
            <button
              type="submit"
              disabled={!selectedFile}
              className={cn(
                'w-full py-3 rounded-lg font-semibold text-white transition-all duration-200 ease-out-quart',
                'bg-guard-primary hover:bg-guard-primary/90',
                'disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
              )}
            >
              {t('fiscal.documents.upload-and-analyze')}
            </button>
          )}
        </form>
      </div>
    </ModalBackdrop>
  );
}
