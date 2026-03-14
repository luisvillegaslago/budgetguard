'use client';

/**
 * Bulk upload modal for fiscal documents.
 * Multi-file drag & drop with auto-detected metadata from filenames.
 * Sends files in batches of 10.
 */

import { CheckCircle, Upload, X, XCircle } from 'lucide-react';
import { useCallback, useState } from 'react';
import { ModalBackdrop } from '@/components/ui/ModalBackdrop';
import { useBulkUploadDocuments } from '@/hooks/useFiscalDocuments';
import { useTranslate } from '@/hooks/useTranslations';
import { type ParsedFileMetadata, parseDocumentFilename } from '@/utils/fiscalFileParser';
import { cn } from '@/utils/helpers';

interface FiscalBulkUploadProps {
  onClose: () => void;
}

interface FileWithMetadata {
  file: File;
  metadata: ParsedFileMetadata;
}

const BATCH_SIZE = 10;

export function FiscalBulkUpload({ onClose }: FiscalBulkUploadProps) {
  const { t } = useTranslate();
  const [files, setFiles] = useState<FileWithMetadata[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [results, setResults] = useState<Array<{ fileName: string; success: boolean; error?: string }>>([]);
  const bulkUpload = useBulkUploadDocuments();

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    const parsed: FileWithMetadata[] = fileArray.map((file) => ({
      file,
      metadata: parseDocumentFilename(file.name),
    }));
    setFiles((prev) => [...prev, ...parsed]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    const allResults: typeof results = [];
    const totalBatches = Math.ceil(files.length / BATCH_SIZE);

    let batchIdx = 0;
    while (batchIdx < totalBatches) {
      const start = batchIdx * BATCH_SIZE;
      const batch = files.slice(start, start + BATCH_SIZE);
      setUploadProgress({ current: start, total: files.length });

      try {
        const result = await bulkUpload.mutateAsync({
          files: batch.map((f) => f.file),
          metadata: batch.map((f) => f.metadata as unknown as Record<string, unknown>),
        });
        allResults.push(...result.results);
      } catch {
        batch.forEach((f) => {
          allResults.push({ fileName: f.file.name, success: false, error: 'Batch failed' });
        });
      }

      batchIdx++;
    }

    setUploadProgress(null);
    setResults(allResults);
  };

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const isComplete = results.length > 0;

  return (
    <ModalBackdrop onClose={onClose} labelledBy="fiscal-bulk-title">
      <div className="card w-full max-w-2xl animate-modal-in max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 id="fiscal-bulk-title" className="text-xl font-bold text-foreground">
            {t('fiscal.documents.bulk-title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-guard-muted hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Drop Zone */}
          {!isComplete && (
            // biome-ignore lint/a11y/noStaticElementInteractions: Drop zone requires drag event handlers
            <div
              onDrop={handleDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              className={cn(
                'border-2 border-dashed rounded-lg p-8 text-center transition-colors duration-200 ease-out-quart',
                isDragOver ? 'border-guard-primary bg-guard-primary/5' : 'border-input',
              )}
            >
              <Upload className="h-10 w-10 mx-auto text-guard-muted mb-3" aria-hidden="true" />
              <p className="text-sm text-guard-muted mb-1">{t('fiscal.documents.bulk-drag-drop')}</p>
              <label className="text-sm text-guard-primary cursor-pointer hover:underline">
                {t('fiscal.documents.browse')}
                <input
                  type="file"
                  className="hidden"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={(e) => {
                    if (e.target.files) addFiles(e.target.files);
                  }}
                />
              </label>
            </div>
          )}

          {/* File List */}
          {files.length > 0 && !isComplete && (
            <div className="rounded-lg border border-input p-3 space-y-1 max-h-60 overflow-y-auto">
              <p className="text-sm font-medium text-foreground mb-2">
                {t('fiscal.documents.bulk-files-count', { count: files.length })}
              </p>
              {files.map((item, index) => (
                <div
                  key={`${item.file.name}-${index}`}
                  className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm text-foreground truncate">{item.file.name}</span>
                    <span className="text-xs text-guard-muted shrink-0">
                      {item.metadata.documentType === 'modelo'
                        ? `M${item.metadata.modeloType}${item.metadata.fiscalQuarter ? ` Q${item.metadata.fiscalQuarter}` : ''} ${item.metadata.fiscalYear ?? '?'}`
                        : t('fiscal.documents.types.factura')}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    className="p-1 text-guard-muted hover:text-guard-danger rounded transition-colors"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Progress */}
          {uploadProgress && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-foreground">
                <span>{t('fiscal.documents.bulk-uploading')}</span>
                <span className="tabular-nums">
                  {uploadProgress.current}/{uploadProgress.total}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-guard-primary rounded-full transition-all duration-300"
                  style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Results */}
          {isComplete && (
            <div className="space-y-3">
              <div className="flex items-center gap-4 text-sm">
                {succeeded > 0 && (
                  <span className="flex items-center gap-1.5 text-guard-success font-medium">
                    <CheckCircle className="h-4 w-4" aria-hidden="true" />
                    {t('fiscal.documents.bulk-succeeded', { count: succeeded })}
                  </span>
                )}
                {failed > 0 && (
                  <span className="flex items-center gap-1.5 text-guard-danger font-medium">
                    <XCircle className="h-4 w-4" aria-hidden="true" />
                    {t('fiscal.documents.bulk-failed', { count: failed })}
                  </span>
                )}
              </div>
              {failed > 0 && (
                <div className="p-3 rounded-lg bg-guard-danger/10 border border-guard-danger/20 space-y-1 max-h-40 overflow-y-auto">
                  {results
                    .filter((r) => !r.success)
                    .map((r) => (
                      <p key={r.fileName} className="text-xs text-guard-danger">
                        {r.fileName}: {r.error}
                      </p>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Submit Button */}
          {!isComplete ? (
            <button
              type="button"
              onClick={handleUpload}
              disabled={files.length === 0 || uploadProgress != null}
              className={cn(
                'w-full py-3 rounded-lg font-semibold text-white transition-all duration-200 ease-out-quart',
                'bg-guard-primary hover:bg-guard-primary/90',
                'disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
              )}
            >
              {t('fiscal.documents.bulk-upload-submit', { count: files.length })}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className={cn(
                'w-full py-3 rounded-lg font-semibold text-white transition-all duration-200 ease-out-quart',
                'bg-guard-primary hover:bg-guard-primary/90 active:scale-[0.98]',
              )}
            >
              {t('common.buttons.close')}
            </button>
          )}
        </div>
      </div>
    </ModalBackdrop>
  );
}
