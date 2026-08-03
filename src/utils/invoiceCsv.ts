/**
 * Parser for the invoice line-item CSV.
 *
 * The file carries ONLY line items: client, series, date and tax rates stay in
 * the form. Every limit and every amount rule mirrors `InvoiceLineItemSchema`,
 * so a row accepted here is never rejected later by the API.
 *
 * Expected header (aliases in Spanish are accepted, case-insensitive):
 *   title,subItems,description,hours,hourlyRate,amount
 */

import {
  INVOICE_CSV_COLUMN,
  INVOICE_CSV_ERROR,
  INVOICE_CSV_SUB_ITEM_SEPARATOR,
  INVOICE_LINE_ITEM_LIMIT,
  type InvoiceCsvColumn,
  type InvoiceCsvError,
} from '@/constants/finance';
import { parseCsv } from '@/utils/csv';
import { eurosToCents } from '@/utils/money';

/** A line item ready to be pushed into the invoice form. */
export interface InvoiceCsvLineItem {
  title: string;
  subItems: string[];
  description: string;
  hours: number | null;
  hourlyRateCents: number | null;
  amountCents: number;
}

export interface InvoiceCsvIssue {
  /** 1-based line number in the source file. 0 marks a file-level problem. */
  line: number;
  messageKey: InvoiceCsvError;
  /** Interpolation values for the translated message. */
  params?: Record<string, number | string>;
}

export interface InvoiceCsvParseResult {
  items: InvoiceCsvLineItem[];
  issues: InvoiceCsvIssue[];
}

export interface InvoiceCsvParseOptions {
  /** Fallback rate for rows with hours but no explicit rate (billing profile). */
  defaultHourlyRateCents?: number | null;
  /** How many items the caller can still accept (existing lines already used up some). */
  maxItems?: number;
}

/**
 * Header aliases → canonical column. Keys are normalized (lowercase, accent-free,
 * no spaces or punctuation), so `Sub Items`, `sub-items` and `SUBÍTEMS` all match.
 */
const COLUMN_ALIASES: Readonly<Record<string, InvoiceCsvColumn>> = {
  title: INVOICE_CSV_COLUMN.TITLE,
  concepto: INVOICE_CSV_COLUMN.TITLE,
  conceptos: INVOICE_CSV_COLUMN.TITLE,
  subitems: INVOICE_CSV_COLUMN.SUB_ITEMS,
  subitem: INVOICE_CSV_COLUMN.SUB_ITEMS,
  subconceptos: INVOICE_CSV_COLUMN.SUB_ITEMS,
  subconcepto: INVOICE_CSV_COLUMN.SUB_ITEMS,
  description: INVOICE_CSV_COLUMN.DESCRIPTION,
  descripcion: INVOICE_CSV_COLUMN.DESCRIPTION,
  hours: INVOICE_CSV_COLUMN.HOURS,
  horas: INVOICE_CSV_COLUMN.HOURS,
  hourlyrate: INVOICE_CSV_COLUMN.HOURLY_RATE,
  rate: INVOICE_CSV_COLUMN.HOURLY_RATE,
  tarifa: INVOICE_CSV_COLUMN.HOURLY_RATE,
  preciohora: INVOICE_CSV_COLUMN.HOURLY_RATE,
  amount: INVOICE_CSV_COLUMN.AMOUNT,
  importe: INVOICE_CSV_COLUMN.AMOUNT,
  total: INVOICE_CSV_COLUMN.AMOUNT,
};

/** Lowercase, strip accents and every non-alphanumeric character. */
function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]/g, '');
}

/** Map each canonical column to its position in the header row. */
function mapColumns(headerRow: string[]): Partial<Record<InvoiceCsvColumn, number>> {
  const columns: Partial<Record<InvoiceCsvColumn, number>> = {};
  headerRow.forEach((header, index) => {
    const column = COLUMN_ALIASES[normalizeHeader(header)];
    // First occurrence wins, so a duplicated header cannot shadow the real one
    if (column && columns[column] === undefined) columns[column] = index;
  });
  return columns;
}

type NumericCell = { valid: true; value: number | null } | { valid: false };

/**
 * A single separator followed by exactly three digits, with a leading group that
 * cannot be a decimal fraction (non-zero, no leading zero): `1,234` / `1.234`.
 * Both locales agree this is a thousands group — Spanish writes decimals with one
 * or two digits (`12,5`), English uses the dot. Reading it as a decimal instead
 * would divide the amount by a thousand without a word.
 */
const THOUSANDS_GROUP = /^[1-9]\d{0,2}[.,]\d{3}$/;

interface NumericCellOptions {
  /** Money columns only: hours are written with up to three decimals by time trackers. */
  thousands?: boolean;
  /** Amount and rate accept 0 (a line billed as a courtesy); hours do not. */
  zero?: boolean;
}

/**
 * Read a decimal out of a cell.
 *
 * Accepts the dot notation the generator emits (`12.5`) and the comma notation a
 * Spanish spreadsheet produces (`1.234,56`): when both separators are present the
 * last one is the decimal mark. Currency symbols and blanks are stripped.
 * An empty cell is a valid absent value; a negative is always invalid.
 */
function parseNumericCell(raw: string | undefined, options: NumericCellOptions = {}): NumericCell {
  const cleaned = (raw ?? '').replace(/[\s€$%]/g, '').trim();
  if (cleaned.length === 0) return { valid: true, value: null };

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  const normalized =
    options.thousands && THOUSANDS_GROUP.test(cleaned)
      ? cleaned.replace(/[.,]/, '') // 1,234 / 1.234 → 1234
      : lastComma > lastDot
        ? cleaned.replace(/\./g, '').replace(',', '.') // 1.234,56 → 1234.56
        : cleaned.replace(/,/g, ''); // 1,234.56 → 1234.56

  if (!/^\d*\.?\d+$/.test(normalized)) return { valid: false };

  const value = Number(normalized);
  if (!Number.isFinite(value)) return { valid: false };
  if (value < 0 || (value === 0 && !options.zero)) return { valid: false };
  return { valid: true, value };
}

/** Split the packed sub-items cell, dropping blanks left by trailing separators. */
function parseSubItems(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(INVOICE_CSV_SUB_ITEM_SEPARATOR)
    .map((subItem) => subItem.trim())
    .filter((subItem) => subItem.length > 0);
}

type RowOutcome =
  | { item: InvoiceCsvLineItem }
  | { errorKey: InvoiceCsvError; params?: Record<string, number | string> };

function cellAt(row: string[], index: number | undefined): string {
  return index === undefined ? '' : (row[index] ?? '').trim();
}

/**
 * Validate a single data row. Returns the parsed item or the first rule it broke,
 * so the panel can point at the exact line before anything reaches the form.
 */
function parseRow(
  row: string[],
  columns: Partial<Record<InvoiceCsvColumn, number>>,
  options: InvoiceCsvParseOptions,
): RowOutcome {
  const title = cellAt(row, columns[INVOICE_CSV_COLUMN.TITLE]);
  const description = cellAt(row, columns[INVOICE_CSV_COLUMN.DESCRIPTION]);
  const subItems = parseSubItems(cellAt(row, columns[INVOICE_CSV_COLUMN.SUB_ITEMS]));

  if (title.length === 0 && description.length === 0) return { errorKey: INVOICE_CSV_ERROR.TITLE_REQUIRED };
  if (title.length > INVOICE_LINE_ITEM_LIMIT.TITLE_LENGTH) {
    return { errorKey: INVOICE_CSV_ERROR.TITLE_TOO_LONG, params: { max: INVOICE_LINE_ITEM_LIMIT.TITLE_LENGTH } };
  }
  if (description.length > INVOICE_LINE_ITEM_LIMIT.DESCRIPTION_LENGTH) {
    return {
      errorKey: INVOICE_CSV_ERROR.DESCRIPTION_TOO_LONG,
      params: { max: INVOICE_LINE_ITEM_LIMIT.DESCRIPTION_LENGTH },
    };
  }
  if (subItems.length > INVOICE_LINE_ITEM_LIMIT.MAX_SUB_ITEMS) {
    return { errorKey: INVOICE_CSV_ERROR.TOO_MANY_SUB_ITEMS, params: { max: INVOICE_LINE_ITEM_LIMIT.MAX_SUB_ITEMS } };
  }
  if (subItems.some((subItem) => subItem.length > INVOICE_LINE_ITEM_LIMIT.SUB_ITEM_LENGTH)) {
    return { errorKey: INVOICE_CSV_ERROR.SUB_ITEM_TOO_LONG, params: { max: INVOICE_LINE_ITEM_LIMIT.SUB_ITEM_LENGTH } };
  }

  // No thousands grouping on hours: a time tracker exports 1,5 h as "1.500"
  const hours = parseNumericCell(cellAt(row, columns[INVOICE_CSV_COLUMN.HOURS]));
  if (!hours.valid) return { errorKey: INVOICE_CSV_ERROR.INVALID_HOURS };

  const hourlyRate = parseNumericCell(cellAt(row, columns[INVOICE_CSV_COLUMN.HOURLY_RATE]), {
    thousands: true,
    zero: true,
  });
  if (!hourlyRate.valid) return { errorKey: INVOICE_CSV_ERROR.INVALID_HOURLY_RATE };

  const amount = parseNumericCell(cellAt(row, columns[INVOICE_CSV_COLUMN.AMOUNT]), { thousands: true, zero: true });
  if (!amount.valid) return { errorKey: INVOICE_CSV_ERROR.INVALID_AMOUNT };

  const amountCents = amount.value === null ? null : eurosToCents(amount.value);
  // An explicit 0 is a courtesy line, but a positive amount that rounds down to
  // zero cents (0,004 €) is a typo the invoice would silently swallow
  if (amount.value !== null && amount.value > 0 && amountCents === 0) {
    return { errorKey: INVOICE_CSV_ERROR.INVALID_AMOUNT };
  }

  const base = { title, subItems, description };

  // Flat line: the amount is the only source of truth and a rate without hours is noise
  if (hours.value === null) {
    if (amountCents === null) return { errorKey: INVOICE_CSV_ERROR.AMOUNT_REQUIRED };
    return { item: { ...base, hours: null, hourlyRateCents: null, amountCents } };
  }

  const rateCents =
    hourlyRate.value !== null
      ? eurosToCents(hourlyRate.value)
      : options.defaultHourlyRateCents != null && options.defaultHourlyRateCents > 0
        ? options.defaultHourlyRateCents
        : null;
  if (rateCents === null) return { errorKey: INVOICE_CSV_ERROR.HOURLY_RATE_REQUIRED };
  // A rate typed as 0 bills the line at no charge; one that rounds down to zero is a typo
  if (hourlyRate.value !== null && hourlyRate.value > 0 && rateCents === 0) {
    return { errorKey: INVOICE_CSV_ERROR.INVALID_HOURLY_RATE };
  }

  // Same rounding the form applies, so the schema's hours × rate refinement holds
  const computedCents = Math.round(hours.value * rateCents);
  // A sheet that rounded the product itself lands a cent away from ours; the computed
  // value is the one that gets submitted, so tolerate the difference instead of
  // throwing away the row
  if (amountCents !== null && Math.abs(amountCents - computedCents) > 1) {
    return { errorKey: INVOICE_CSV_ERROR.AMOUNT_MISMATCH };
  }

  return { item: { ...base, hours: hours.value, hourlyRateCents: rateCents, amountCents: computedCents } };
}

/**
 * Parse a CSV of invoice line items.
 *
 * Never throws: every problem comes back in `issues`, and the rows that did pass
 * are still returned so the user can import them and fix the rest by hand.
 */
export function parseInvoiceCsv(content: string, options: InvoiceCsvParseOptions = {}): InvoiceCsvParseResult {
  const maxItems = options.maxItems ?? INVOICE_LINE_ITEM_LIMIT.MAX_LINE_ITEMS;
  const rows = parseCsv(content);

  if (rows.length === 0) return { items: [], issues: [{ line: 0, messageKey: INVOICE_CSV_ERROR.EMPTY_FILE }] };

  const columns = mapColumns(rows[0] ?? []);
  if (columns[INVOICE_CSV_COLUMN.TITLE] === undefined && columns[INVOICE_CSV_COLUMN.DESCRIPTION] === undefined) {
    return { items: [], issues: [{ line: 1, messageKey: INVOICE_CSV_ERROR.MISSING_COLUMNS }] };
  }

  const dataRows = rows.slice(1);
  const items: InvoiceCsvLineItem[] = [];
  const issues: InvoiceCsvIssue[] = [];

  dataRows.forEach((row, index) => {
    // Skip rows that are entirely empty (trailing newlines, spacer rows)
    if (row.every((cell) => cell.trim().length === 0)) return;

    const outcome = parseRow(row, columns, options);
    if ('item' in outcome) {
      items.push(outcome.item);
      return;
    }
    // +2: the header is line 1 and index is 0-based
    issues.push({ line: index + 2, messageKey: outcome.errorKey, params: outcome.params });
  });

  if (items.length === 0 && issues.length === 0) {
    return { items, issues: [{ line: 0, messageKey: INVOICE_CSV_ERROR.NO_ROWS }] };
  }

  if (items.length > maxItems) {
    issues.push({ line: 0, messageKey: INVOICE_CSV_ERROR.TOO_MANY_ROWS, params: { max: maxItems } });
    return { items: items.slice(0, maxItems), issues };
  }

  return { items, issues };
}
