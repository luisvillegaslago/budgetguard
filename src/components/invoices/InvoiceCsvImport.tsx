'use client';

/**
 * CSV import for invoice line items.
 *
 * The file only carries concepts: the parsed rows are appended to whatever the
 * form already has, and everything else (client, series, date, taxes) stays
 * untouched. Parsing happens in the browser — no endpoint involved.
 *
 * Rendered as its own modal on top of the invoice form, with the same drag &
 * drop dropzone the skydiving ImportPanel uses.
 */

import { FileUp, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { INVOICE_CSV_ERROR, INVOICE_LINE_ITEM_LIMIT } from '@/constants/finance';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useTranslate } from '@/hooks/useTranslations';
import { type InvoiceCsvIssue, type InvoiceCsvLineItem, parseInvoiceCsv } from '@/utils/invoiceCsv';
import { formatCurrency } from '@/utils/money';

// Enough to spot a pattern without turning the panel into a scrollable log
const MAX_VISIBLE_ROW_ISSUES = 5;

// 50 line items never fill a megabyte; anything larger is the wrong file and would
// only block the main thread while it parses
const MAX_FILE_BYTES = 1_000_000;

// Excel on a Spanish Windows saves CSV as Windows-1252, whose accented bytes are
// invalid UTF-8 and decode to this character. Importing them would persist mojibake
// into the invoice and its PDF.
const REPLACEMENT_CHARACTER = '�';

interface InvoiceCsvImportProps {
  /** Fallback rate for rows with hours but no rate column. */
  defaultHourlyRateCents?: number | null;
  /** Line items the form already holds, so the importer respects the 50-line ceiling. */
  usedSlots: number;
  onImport: (items: InvoiceCsvLineItem[]) => void;
}

interface ParsedFile {
  name: string;
  items: InvoiceCsvLineItem[];
  issues: InvoiceCsvIssue[];
}

export function InvoiceCsvImport(props: InvoiceCsvImportProps) {
  const { t } = useTranslate();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="text-xs text-guard-primary hover:text-guard-primary/80 flex items-center gap-1"
      >
        <FileUp className="h-3 w-3" aria-hidden="true" />
        {t('invoices.csv.import')}
      </button>

      {/* Mounted only while open, so its focus trap is never active over the bare form */}
      {isOpen && <InvoiceCsvImportDialog {...props} onClose={() => setIsOpen(false)} />}
    </>
  );
}

interface InvoiceCsvImportDialogProps extends InvoiceCsvImportProps {
  onClose: () => void;
}

function InvoiceCsvImportDialog({ defaultHourlyRateCents, usedSlots, onImport, onClose }: InvoiceCsvImportDialogProps) {
  const { t } = useTranslate();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const close = useCallback(() => onClose(), [onClose]);

  // Captures Escape and Tab before the invoice form's own trap, which listens on
  // document too and would otherwise close the whole draft or move focus behind
  // the backdrop
  useFocusTrap(dialogRef, close, { capture: true });

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const processFile = async (file: File) => {
    setFileError(null);
    setParsed(null);

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setFileError(INVOICE_CSV_ERROR.NOT_CSV);
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileError(INVOICE_CSV_ERROR.FILE_TOO_LARGE);
      return;
    }
    if (usedSlots >= INVOICE_LINE_ITEM_LIMIT.MAX_LINE_ITEMS) {
      setFileError(INVOICE_CSV_ERROR.INVOICE_FULL);
      return;
    }

    try {
      const content = await file.text();
      if (content.includes(REPLACEMENT_CHARACTER)) {
        setFileError(INVOICE_CSV_ERROR.BAD_ENCODING);
        return;
      }

      const result = parseInvoiceCsv(content, {
        defaultHourlyRateCents,
        maxItems: INVOICE_LINE_ITEM_LIMIT.MAX_LINE_ITEMS - usedSlots,
      });
      setParsed({ name: file.name, items: result.items, issues: result.issues });
    } catch {
      // A read that fails leaves no preview, so without this the modal just sat there
      setFileError(INVOICE_CSV_ERROR.READ_FAILED);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Clearing the value is what makes re-picking the SAME file fire a change event
    // again — otherwise a file fixed in Excel kept showing the stale parse
    event.target.value = '';
    if (file) void processFile(file);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void processFile(file);
  };

  const handleConfirm = () => {
    if (!parsed || parsed.items.length === 0) return;
    onImport(parsed.items);
    close();
  };

  const totalCents = parsed?.items.reduce((sum, item) => sum + item.amountCents, 0) ?? 0;
  // File-level issues (line 0) carry the "the rest was discarded" warning, so they
  // are never the ones cut by the row cap
  const fileIssues = parsed?.issues.filter((issue) => issue.line === 0) ?? [];
  const rowIssues = parsed?.issues.filter((issue) => issue.line > 0) ?? [];
  const hiddenRowIssues = rowIssues.length - MAX_VISIBLE_ROW_ISSUES;

  return (
    // Sits above the invoice form's own backdrop (z-50). Focused on mount so the
    // keyboard lands inside it.
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 bg-guard-dark/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4 animate-backdrop-in outline-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invoice-csv-title"
    >
      <div className="bg-card rounded-xl shadow-lg w-full max-w-lg max-h-[85vh] overflow-y-auto animate-modal-in">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 id="invoice-csv-title" className="text-lg font-semibold text-foreground">
            {t('invoices.csv.title')}
          </h2>
          <button
            type="button"
            onClick={close}
            className="p-1 hover:bg-muted rounded-lg transition-colors"
            aria-label={t('common.buttons.close')}
          >
            <X className="h-5 w-5 text-guard-muted" aria-hidden="true" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="hidden"
            aria-label={t('invoices.csv.select-file')}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragEnter={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`w-full border-2 border-dashed rounded-lg p-6 flex flex-col items-center gap-2 transition-colors ${
              isDragging
                ? 'border-guard-primary text-guard-primary bg-guard-primary/5'
                : parsed
                  ? 'border-guard-primary/50 text-guard-primary'
                  : 'border-border text-guard-muted hover:border-guard-primary hover:text-guard-primary'
            }`}
          >
            <Upload className="h-6 w-6" aria-hidden="true" />
            <span className="text-sm font-medium">{parsed?.name ?? t('invoices.csv.drop-hint')}</span>
            <span className="text-xs">{t('invoices.csv.format-hint')}</span>
          </button>

          {fileError && (
            <p role="alert" className="text-xs text-guard-danger">
              {t(fileError)}
            </p>
          )}

          {parsed && (
            <div className="space-y-2">
              <p className="text-xs text-guard-muted">
                {parsed.items.length > 0
                  ? t('invoices.csv.summary', { count: parsed.items.length, total: formatCurrency(totalCents) })
                  : t('invoices.csv.no-valid-rows')}
              </p>

              {parsed.items.length > 0 && (
                <ul className="space-y-1">
                  {parsed.items.map((item, index) => (
                    // Rows have no id and duplicated concepts are legitimate, so the
                    // position in the parsed file is the only stable key available
                    <li key={`${index}-${item.title}`} className="flex items-baseline justify-between gap-3 text-xs">
                      <span className="truncate text-foreground">{item.title || item.description}</span>
                      <span className="tabular-nums text-guard-muted shrink-0">
                        {item.hours != null && `${item.hours} h · `}
                        {formatCurrency(item.amountCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {(fileIssues.length > 0 || rowIssues.length > 0) && (
                <ul className="space-y-0.5 border-t border-border pt-2">
                  {fileIssues.map((issue) => (
                    <li key={issue.messageKey} className="text-xs text-guard-danger">
                      {t(issue.messageKey, issue.params)}
                    </li>
                  ))}
                  {rowIssues.slice(0, MAX_VISIBLE_ROW_ISSUES).map((issue) => (
                    <li key={`${issue.line}-${issue.messageKey}`} className="text-xs text-guard-danger">
                      {t('invoices.csv.line', { line: issue.line })}: {t(issue.messageKey, issue.params)}
                    </li>
                  ))}
                  {hiddenRowIssues > 0 && (
                    <li className="text-xs text-guard-muted">
                      {t('invoices.csv.more-issues', { count: hiddenRowIssues })}
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={close} className="btn-secondary">
              {t('common.buttons.cancel')}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!parsed || parsed.items.length === 0}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('invoices.csv.confirm', { count: parsed?.items.length ?? 0 })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
