'use client';

/**
 * Drag-and-drop uploader for the Binance "Export Transaction History" CSV.
 *
 * Posts the file to /api/crypto/import/csv and renders the per-row counts
 * the endpoint returns (rows mapped vs. skipped, with skipped operations
 * grouped by type so the user can spot what's being lost).
 */

import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileUp, Loader2, Upload } from 'lucide-react';
import { type ChangeEvent, type DragEvent, useId, useRef, useState } from 'react';
import { API_ENDPOINT, API_ERROR, QUERY_KEY } from '@/constants/finance';
import { useApiMutation } from '@/hooks/useApiMutation';
import { useTranslate } from '@/hooks/useTranslations';
import type { ApiResponse } from '@/types/finance';
import { extractApiErrorKey } from '@/utils/apiErrorHandler';
import { fetchApi } from '@/utils/fetchApi';

const BINANCE_EXPORT_URL = 'https://www.binance.com/en/my/download-center?type=asset-transaction-history';

/**
 * Splits the localized step-1 around the `{link}` placeholder so we can
 * inject a real anchor in place of the link text — keeps i18n flexible
 * (translators control word order around the link).
 */
function renderStep1WithLink(template: string, linkText: string) {
  const parts = template.split('{link}');
  return (
    <>
      {parts[0]}
      <a
        href={BINANCE_EXPORT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-guard-primary hover:underline"
      >
        {linkText}
      </a>
      {parts[1] ?? ''}
    </>
  );
}

interface ImportResult {
  jobId: number;
  rowsRead: number;
  rowsMapped: number;
  rowsSkipped: number;
  skippedOperations: Record<string, number>;
  eventsInserted: number;
  eventsDuplicate: number;
  /** True while the background normalize is still running — UI can point
   *  the user at the sync panel for live progress. */
  normalizing: boolean;
}

async function uploadCsv(file: File): Promise<ImportResult> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetchApi(API_ENDPOINT.CRYPTO_IMPORT_CSV, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    const errorData: ApiResponse<never> = await response.json();
    throw new Error(extractApiErrorKey(errorData, API_ERROR.MUTATION.IMPORT.CRYPTO_CSV));
  }
  const data: ApiResponse<ImportResult> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error ?? 'Unknown error');
  return data.data;
}

export function CryptoCsvUploader() {
  const { t } = useTranslate();
  const queryClient = useQueryClient();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const upload = useApiMutation({
    mutationFn: uploadCsv,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.CRYPTO_EVENTS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.CRYPTO_MODELO] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.CRYPTO_DISPOSALS] });
    },
  });

  const handleSelect = (selected: File | null) => {
    setFile(selected);
    upload.reset();
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    handleSelect(f);
  };

  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0] ?? null;
    handleSelect(f);
  };

  const handleDragOver = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleUpload = () => {
    if (file) upload.mutate(file);
  };

  const result = upload.data;
  const skippedEntries = result ? Object.entries(result.skippedOperations) : [];

  return (
    <div className="bg-card rounded-xl border border-border p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t('crypto.csv.title')}</h2>
        <p className="text-sm text-guard-muted mt-1">{t('crypto.csv.subtitle')}</p>

        <p className="text-xs font-semibold text-foreground mt-3">{t('crypto.csv.instructions-title')}</p>
        <ol className="list-decimal pl-5 mt-1 space-y-1 text-xs text-guard-muted">
          <li>{renderStep1WithLink(t('crypto.csv.step-1'), t('crypto.csv.step-1-link'))}</li>
          <li>{t('crypto.csv.step-2')}</li>
          <li>{t('crypto.csv.step-3')}</li>
          <li>{t('crypto.csv.step-4')}</li>
        </ol>
      </div>

      <label
        htmlFor={inputId}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-sm cursor-pointer transition-colors ${
          isDragging ? 'border-guard-primary bg-guard-primary/10' : 'border-border hover:bg-muted/40'
        }`}
      >
        <FileUp className="h-6 w-6 text-guard-muted" aria-hidden="true" />
        {file ? (
          <span className="font-mono text-xs text-foreground">{t('crypto.csv.selected', { name: file.name })}</span>
        ) : (
          <span className="text-guard-muted">{t('crypto.csv.drop-here')}</span>
        )}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={handleFileInput}
        />
      </label>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={handleUpload}
          disabled={!file || upload.isPending}
          className="btn-primary inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {upload.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Upload className="h-4 w-4" aria-hidden="true" />
          )}
          {upload.isPending ? t('crypto.csv.uploading') : t('crypto.csv.upload')}
        </button>
      </div>

      {upload.errorMessage && <p className="text-sm text-guard-danger">{upload.errorMessage}</p>}

      {result && (
        <div className="rounded-lg border border-guard-success/30 bg-guard-success/10 p-4 space-y-2 text-sm">
          <div className="flex items-center gap-2 text-guard-success font-semibold">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {t('crypto.csv.result-title')}
          </div>
          <ul className="text-xs space-y-0.5 font-mono">
            <li>{t('crypto.csv.result-rows-read', { n: result.rowsRead })}</li>
            <li>{t('crypto.csv.result-rows-mapped', { n: result.rowsMapped })}</li>
            <li>{t('crypto.csv.result-rows-skipped', { n: result.rowsSkipped })}</li>
            <li>{t('crypto.csv.result-events-inserted', { n: result.eventsInserted })}</li>
            <li>{t('crypto.csv.result-events-duplicate', { n: result.eventsDuplicate })}</li>
          </ul>
          {result.normalizing && (
            <p className="text-xs text-guard-muted italic">{t('crypto.csv.result-normalizing')}</p>
          )}
          {skippedEntries.length > 0 && (
            <div className="pt-2 border-t border-guard-success/20 space-y-1">
              <p className="text-xs font-semibold text-foreground">{t('crypto.csv.result-skipped-ops')}</p>
              <ul className="text-xs space-y-0.5 font-mono">
                {skippedEntries.map(([op, count]) => (
                  <li key={op} className="flex justify-between gap-3">
                    <span className="text-guard-muted truncate">{op}</span>
                    <span>{count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-guard-muted pt-2 border-t border-guard-success/20">
            {t('crypto.csv.result-recompute-hint')}
          </p>
        </div>
      )}
    </div>
  );
}
