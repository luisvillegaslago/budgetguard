'use client';

/**
 * CSV import panel shared between jumps and tunnel sessions
 * Parses CSV client-side, previews data, and sends to bulk import API
 */

import { Upload, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslate } from '@/hooks/useTranslations';

interface ImportPanelProps {
  type: 'jumps' | 'tunnel';
  onImport: (rows: Record<string, unknown>[]) => Promise<{ inserted: number; skipped: number; updated?: number }>;
  onClose: () => void;
  parseRow: (row: Record<string, string>) => Record<string, unknown> | null;
}

export function ImportPanel({ type, onImport, onClose, parseRow }: ImportPanelProps) {
  const { t } = useTranslate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<Record<string, unknown>[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; skipped: number; updated?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setFileName(file.name);
      setError(null);
      setResult(null);
      setParsedRows([]);

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          const lines = text.split('\n').filter((line) => line.trim().length > 0);

          if (lines.length < 2) {
            setError(t('skydiving.import.errors.invalid-file'));
            return;
          }

          // Parse CSV header using parseCSVLine to handle quoted commas
          const headers = parseCSVLine(lines[0] ?? '').map((h) => h.trim().replace(/^"|"$/g, ''));

          // biome-ignore lint/suspicious/noConsole: Import debugging
          console.log('[Import] CSV headers:', headers);
          // biome-ignore lint/suspicious/noConsole: Import debugging
          console.log('[Import] Total data rows:', lines.length - 1);

          // Parse rows
          const rows: Record<string, unknown>[] = [];
          let skippedCount = 0;
          lines.slice(1).forEach((line, index) => {
            const values = parseCSVLine(line);
            const rawRow: Record<string, string> = {};
            headers.forEach((header, i) => {
              rawRow[header] = values[i]?.trim() ?? '';
            });

            const parsed = parseRow(rawRow);
            if (parsed) {
              rows.push(parsed);
            } else {
              skippedCount++;
              if (skippedCount <= 3) {
                // biome-ignore lint/suspicious/noConsole: Import debugging
                console.warn(`[Import] Row ${index + 1} skipped. Raw:`, rawRow);
              }
            }
          });

          // biome-ignore lint/suspicious/noConsole: Import debugging
          console.log(`[Import] Parsed: ${rows.length} valid, ${skippedCount} skipped`);

          if (rows.length === 0) {
            setError(
              t('skydiving.import.errors.no-valid-rows', {
                total: lines.length - 1,
                headers: headers.slice(0, 5).join(', '),
              }),
            );
            return;
          }

          setParsedRows(rows);
        } catch (err) {
          // biome-ignore lint/suspicious/noConsole: Import debugging
          console.error('[Import] Parse error:', err);
          setError(t('skydiving.import.errors.invalid-file') + (err instanceof Error ? `: ${err.message}` : ''));
        }
      };
      reader.readAsText(file);
    },
    [parseRow, t],
  );

  const handleImport = async () => {
    setImporting(true);
    setError(null);
    try {
      const importResult = await onImport(parsedRows);
      setResult(importResult);
    } catch {
      setError(t('skydiving.import.errors.import-failed'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-lg w-full max-w-md shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">{t('skydiving.import.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-guard-muted hover:text-foreground rounded-lg transition-colors"
            aria-label={t('common.buttons.close')}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* File input */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
              aria-label={t('skydiving.import.select-file')}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`w-full border-2 border-dashed rounded-lg p-6 flex flex-col items-center gap-2 transition-colors ${
                fileName
                  ? 'border-guard-primary/50 text-guard-primary'
                  : 'border-border text-guard-muted hover:border-guard-primary hover:text-guard-primary'
              }`}
            >
              <Upload className="h-6 w-6" aria-hidden="true" />
              <span className="text-sm font-medium">{fileName ?? t('skydiving.import.select-file')}</span>
              {!fileName && (
                <span className="text-xs">{type === 'jumps' ? 'skyduck_jumps.csv' : 'tunnel time.csv'}</span>
              )}
            </button>
          </div>

          {/* Preview */}
          {parsedRows.length > 0 && !result && (
            <div className="text-sm text-foreground">
              <p className="font-medium">{t('skydiving.import.preview', { count: parsedRows.length })}</p>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="text-sm text-guard-success font-medium bg-guard-success/10 rounded-lg p-3">
              {result.updated
                ? t('skydiving.import.result-with-updated', {
                    inserted: result.inserted,
                    updated: result.updated,
                    skipped: result.skipped,
                  })
                : t('skydiving.import.result', { inserted: result.inserted, skipped: result.skipped })}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-sm text-guard-danger font-medium bg-guard-danger/10 rounded-lg p-3">{error}</div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary">
              {t('common.buttons.close')}
            </button>
            {parsedRows.length > 0 && !result && (
              <button type="button" onClick={handleImport} disabled={importing} className="btn-primary">
                {importing ? t('skydiving.import.importing') : t('skydiving.import.confirm')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Simple CSV line parser that handles quoted fields with commas
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  Array.from(line).forEach((char) => {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  });

  result.push(current);
  return result;
}
