'use client';

/**
 * Upload modal for modelo documents (303, 130, 390, 100).
 * Used from the fiscal page with pre-filled modelo type.
 */

import { ExternalLink, Upload, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { ModalBackdrop } from '@/components/ui/ModalBackdrop';
import { Select } from '@/components/ui/Select';
import type { ModeloType } from '@/constants/finance';
import { FISCAL_STATUS, MODELO_TYPE } from '@/constants/finance';
import { useUploadFiscalDocument } from '@/hooks/useFiscalDocuments';
import { useTranslate } from '@/hooks/useTranslations';
import { cn } from '@/utils/helpers';
import { eurosToCents } from '@/utils/money';

interface ModeloDocumentUploadProps {
  year: number;
  quarter?: number;
  modeloType: ModeloType;
  onClose: () => void;
}

const INPUT_CLASSES = cn(
  'w-full px-4 py-2.5 rounded-lg border border-input bg-background text-foreground',
  'focus:ring-2 focus:ring-guard-primary focus:border-transparent',
  'transition-colors duration-200 ease-out-quart',
);

export function ModeloDocumentUpload({ year, quarter, modeloType, onClose }: ModeloDocumentUploadProps) {
  const { t } = useTranslate();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [status, setStatus] = useState<string>(FISCAL_STATUS.FILED);
  const [taxAmount, setTaxAmount] = useState('');
  const [description, setDescription] = useState('');
  const [showDeferralReminder, setShowDeferralReminder] = useState(false);
  const uploadMutation = useUploadFiscalDocument(year);

  const isAnnual = modeloType === '390' || modeloType === '100';

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

    const metadata: Record<string, unknown> = {
      documentType: 'modelo',
      modeloType,
      fiscalYear: year,
      fiscalQuarter: isAnnual ? null : (quarter ?? null),
      status,
      taxAmountCents: taxAmount ? eurosToCents(Number(taxAmount)) : null,
      description: description || null,
    };

    await uploadMutation.mutateAsync({ file: selectedFile, metadata });

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

  return (
    <ModalBackdrop onClose={onClose} labelledBy="modelo-upload-title">
      <div className="card w-full max-w-md animate-modal-in max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 id="modelo-upload-title" className="text-xl font-bold text-foreground">
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

        {/* Prefilled info */}
        <div className="px-3 py-2 rounded-lg bg-guard-primary/5 border border-guard-primary/20 text-sm text-foreground mb-4">
          Modelo {modeloType} {!isAnnual && quarter ? `Q${quarter}` : ''} {year}
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

          {/* Tax Amount */}
          <div>
            <label htmlFor="modeloTaxAmount" className="block text-sm font-medium text-foreground mb-1.5">
              {t('fiscal.documents.fields.tax-amount')}
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
            />
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
              <p className="text-sm text-guard-danger">{t('fiscal.errors.load')}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!selectedFile || uploadMutation.isPending}
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
