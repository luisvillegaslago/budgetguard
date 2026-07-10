/**
 * Coinbase retail CSV import (Coinbase.com → Reports → Transaction History).
 *
 * One row per operation. We map each row to a raw event reusing the same
 * EventType vocabulary the Binance API sync produces, so the existing
 * EventNormalizer picks them up without changes:
 *
 *   Buy / Advanced Trade Buy                     → SPOT_TRADE (isBuyer: true)
 *   Sell / Advanced Trade Sell                   → SPOT_TRADE (isBuyer: false)
 *   Convert                                      → CONVERT (both sides parsed from Notes)
 *   Receive                                      → DEPOSIT (transfer_in)
 *   Send                                         → WITHDRAW (transfer_out)
 *   Rewards / Learning / Inflation Reward Income → DIVIDEND ("Airdrop:" hint)
 *   Staking Income                               → DIVIDEND ("Earn rewards:" hint)
 *   Anything else                                → ignored (counted as skipped)
 *
 * Unlike Binance, a spot trade is a single self-describing row (the asset on
 * one side, the fiat counter on the other), so there is no multi-row grouping
 * except CONVERT, whose target asset/amount live inside the free-text Notes
 * column (e.g. "Converted 0.5 ETH to 1,500.00 USDC").
 *
 * ExternalID is a hash of the row content namespaced with a `coinbase-` prefix
 * so CSV ids never collide with Binance/Kraken ones. Re-importing the same file
 * is idempotent thanks to UNIQUE(UserID, EventType, ExternalID).
 */

import { CRYPTO_EVENT_TYPE, CRYPTO_EXCHANGE } from '@/constants/finance';
import { CsvParseError } from '@/services/exchanges/binance/CsvImporter';
import { parseCsv } from '@/services/exchanges/shared/csvParser';
import { hashRow as sharedHashRow } from '@/services/exchanges/shared/externalId';
import type {
  CsvImportResult,
  CsvImportSummary,
  ExchangeCsvImporter,
  RawEventInput,
} from '@/services/exchanges/shared/types';

// ============================================================
// Header / row schema
// ============================================================

// Canonical Coinbase header (a few preamble lines may precede it). We resolve
// each logical column by an exact name or a startsWith prefix so the verbose
// "Total (inclusive of fees and/or spread)" / "Fees and/or Spread" headers
// still match.
const HEADER_FIRST_COL = 'Timestamp';
const HEADER_SECOND_COL = 'Transaction Type';
const HEADER_QUANTITY_COL = 'Quantity Transacted';

interface CoinbaseRow {
  timestamp: Date;
  type: string;
  asset: string;
  quantity: string; // cleaned native amount
  spotCurrency: string;
  subtotal: string; // cleaned fiat value (excl. fees)
  total: string; // cleaned fiat value (incl. fees)
  fees: string; // cleaned fiat fee
  notes: string;
  canonical: string; // stable raw-cell join used for hashing
}

/** Locate the header row index, skipping any preamble lines. -1 when absent. */
function findHeaderIndex(rows: string[][]): number {
  return rows.findIndex(
    (row) => (row[0] ?? '').trim() === HEADER_FIRST_COL && (row[1] ?? '').trim() === HEADER_SECOND_COL,
  );
}

/** Resolve a logical column by exact match first, then by a startsWith prefix. */
function resolveColumn(header: string[], exact: string, prefix?: string): number {
  const trimmed = header.map((h) => h.trim());
  const exactIdx = trimmed.indexOf(exact);
  if (exactIdx >= 0) return exactIdx;
  if (prefix) {
    const prefixIdx = trimmed.findIndex((h) => h.startsWith(prefix));
    if (prefixIdx >= 0) return prefixIdx;
  }
  return -1;
}

/**
 * Strip thousands separators and any currency symbol/whitespace from a numeric
 * cell, keeping the sign, decimal point and exponent. Coinbase exports values
 * like "1,500.00" or "€1,500.00" inside quoted fields.
 */
function cleanNumber(value: string): string {
  return (value ?? '')
    .replace(/,/g, '')
    .replace(/[^0-9.eE+-]/g, '')
    .trim();
}

/** Absolute numeric string (drops a single leading minus), preserving precision. */
function absNumber(value: string): string {
  const cleaned = cleanNumber(value);
  return cleaned.startsWith('-') ? cleaned.slice(1) : cleaned;
}

/**
 * Parse a Coinbase timestamp into a UTC Date. Accepts the ISO-8601 form
 * "2024-03-15T08:12:45Z" and the spaced form "2024-03-15 08:12:45 UTC".
 */
function parseTimestamp(value: string): Date | null {
  const trimmed = (value ?? '').trim().replace(/\s+UTC$/i, '');
  if (!trimmed) return null;
  let iso = trimmed.includes(' ') ? trimmed.replace(' ', 'T') : trimmed;
  // Append a Z when no explicit zone marker is present (Coinbase reports UTC).
  if (!/[zZ]$/.test(iso) && !/[+-]\d{2}:?\d{2}$/.test(iso)) iso = `${iso}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Turn the raw CSV matrix into typed rows, skipping the preamble + header. */
function rowsToCoinbaseRows(rawRows: string[][]): CoinbaseRow[] {
  const headerIdx = findHeaderIndex(rawRows);
  if (headerIdx < 0) throw new CsvParseError('csv-missing-column', HEADER_FIRST_COL);

  const header = rawRows[headerIdx] ?? [];
  const timeIdx = resolveColumn(header, HEADER_FIRST_COL);
  const typeIdx = resolveColumn(header, HEADER_SECOND_COL);
  const assetIdx = resolveColumn(header, 'Asset');
  const quantityIdx = resolveColumn(header, HEADER_QUANTITY_COL);
  const currencyIdx = resolveColumn(header, 'Spot Price Currency');
  const subtotalIdx = resolveColumn(header, 'Subtotal');
  const totalIdx = resolveColumn(header, 'Total (inclusive of fees and/or spread)', 'Total');
  const feesIdx = resolveColumn(header, 'Fees and/or Spread', 'Fees');
  const notesIdx = resolveColumn(header, 'Notes');

  if (typeIdx < 0 || quantityIdx < 0) throw new CsvParseError('csv-missing-column', HEADER_QUANTITY_COL);

  const cell = (row: string[], idx: number): string => (idx >= 0 ? (row[idx] ?? '').trim() : '');

  return (
    rawRows
      .slice(headerIdx + 1)
      // Drop blank trailing rows (parseCsv can yield empty/whitespace-only lines).
      .filter((row) => (row[timeIdx] ?? '').trim().length > 0)
      .map((row) => {
        const timeStr = cell(row, timeIdx);
        const timestamp = parseTimestamp(timeStr);
        if (!timestamp) throw new CsvParseError('csv-invalid-time', timeStr);

        return {
          timestamp,
          type: cell(row, typeIdx),
          asset: cell(row, assetIdx),
          quantity: absNumber(cell(row, quantityIdx)),
          spotCurrency: cell(row, currencyIdx),
          subtotal: absNumber(cell(row, subtotalIdx)),
          total: absNumber(cell(row, totalIdx)),
          fees: absNumber(cell(row, feesIdx)),
          notes: cell(row, notesIdx),
          canonical: row.map((c) => (c ?? '').trim()).join('|'),
        };
      })
  );
}

// ============================================================
// Row → raw event mapping
// ============================================================

// CsvImportSummary lives in shared/types; re-exported for callers/tests.
export type { CsvImportSummary };

/** Best fiat value for the trade's counter quantity (gross, fee carried apart). */
function fiatCounter(row: CoinbaseRow): string {
  const subtotal = Number(row.subtotal);
  if (Number.isFinite(subtotal) && subtotal > 0) return row.subtotal;
  return row.total;
}

/** Build a stable, namespaced externalId from one row's canonical content. */
function hashRow(op: string, row: CoinbaseRow): string {
  return sharedHashRow(`coinbase-${op}`, row.canonical);
}

/** Classify a normalized (lowercased) transaction type into our routing buckets. */
const SPOT_BUY_TYPES = new Set(['buy', 'advanced trade buy']);
const SPOT_SELL_TYPES = new Set(['sell', 'advanced trade sell']);
const STAKING_TYPES = new Set(['staking income']);
const AIRDROP_TYPES = new Set(['rewards income', 'learning reward', 'inflation reward']);

/**
 * Spot trade — a single self-describing row: the asset on one side, the fiat
 * counter (Spot Price Currency) on the other. Mirrors the `myTrades` payload
 * the normalizer consumes, carrying baseAsset/quoteAsset explicitly so any
 * pair resolves without suffix-splitting.
 */
function mapSpotTrade(row: CoinbaseRow, isBuyer: boolean): RawEventInput {
  return {
    eventType: CRYPTO_EVENT_TYPE.SPOT_TRADE,
    externalId: hashRow(isBuyer ? 'spot-buy' : 'spot-sell', row),
    occurredAt: row.timestamp,
    rawPayload: {
      symbol: `${row.asset}${row.spotCurrency}`,
      baseAsset: row.asset,
      quoteAsset: row.spotCurrency,
      isBuyer,
      qty: row.quantity,
      quoteQty: fiatCounter(row),
      commission: row.fees || '0',
      commissionAsset: row.spotCurrency || null,
      time: row.timestamp.getTime(),
      csvSource: true,
    },
  };
}

/**
 * Convert — DISPOSAL of the source asset + ACQUISITION of the target. The
 * target asset/amount live in the free-text Notes column, e.g.
 * "Converted 0.5 ETH to 1,500.00 USDC". We parse both sides from Notes and
 * fall back to the row's own Asset/Quantity for the source side.
 */
const CONVERT_NOTES = /Converted\s+([\d.,]+)\s+([A-Za-z0-9]+)\s+to\s+([\d.,]+)\s+([A-Za-z0-9]+)/i;

function mapConvert(row: CoinbaseRow): RawEventInput | null {
  const match = row.notes.match(CONVERT_NOTES);
  const fromAmount = match ? cleanNumber(match[1] ?? '') : row.quantity;
  const fromAsset = match ? (match[2] ?? '').toUpperCase() : row.asset;
  const toAmount = match ? cleanNumber(match[3] ?? '') : '';
  const toAsset = match ? (match[4] ?? '').toUpperCase() : '';

  // Without a parseable target side there is nothing to acquire — skip.
  if (!toAsset || !toAmount) return null;

  return {
    eventType: CRYPTO_EVENT_TYPE.CONVERT,
    externalId: hashRow('convert', row),
    occurredAt: row.timestamp,
    rawPayload: {
      fromAsset,
      toAsset,
      fromAmount,
      toAmount,
      createTime: row.timestamp.getTime(),
      csvSource: true,
    },
  };
}

/** Receive → DEPOSIT (transfer_in). */
function mapDeposit(row: CoinbaseRow): RawEventInput {
  return {
    eventType: CRYPTO_EVENT_TYPE.DEPOSIT,
    externalId: hashRow('deposit', row),
    occurredAt: row.timestamp,
    rawPayload: { coin: row.asset, amount: row.quantity, time: row.timestamp.getTime(), csvSource: true },
  };
}

/** Send → WITHDRAW (transfer_out). The fee column is fiat, not the network fee. */
function mapWithdraw(row: CoinbaseRow): RawEventInput {
  return {
    eventType: CRYPTO_EVENT_TYPE.WITHDRAW,
    externalId: hashRow('withdraw', row),
    occurredAt: row.timestamp,
    rawPayload: {
      coin: row.asset,
      amount: row.quantity,
      transactionFee: '0',
      time: row.timestamp.getTime(),
      csvSource: true,
    },
  };
}

/**
 * Reward income → DIVIDEND. We inject an explicit "Earn rewards:" / "Airdrop:"
 * enInfo prefix so the downstream classifyDividend routes staking vs airdrop
 * deterministically (it trusts the prefix over its generic keyword scan).
 */
function mapDividend(row: CoinbaseRow, kind: 'staking' | 'airdrop'): RawEventInput {
  const enInfo = kind === 'staking' ? `Earn rewards: ${row.type}` : `Airdrop: ${row.type}`;
  return {
    eventType: CRYPTO_EVENT_TYPE.DIVIDEND,
    externalId: hashRow('div', row),
    occurredAt: row.timestamp,
    rawPayload: { asset: row.asset, amount: row.quantity, enInfo, time: row.timestamp.getTime(), csvSource: true },
  };
}

function mapSingleRow(row: CoinbaseRow): RawEventInput | null {
  const type = row.type.toLowerCase();
  if (SPOT_BUY_TYPES.has(type)) return mapSpotTrade(row, true);
  if (SPOT_SELL_TYPES.has(type)) return mapSpotTrade(row, false);
  if (type === 'convert') return mapConvert(row);
  if (type === 'receive') return mapDeposit(row);
  if (type === 'send') return mapWithdraw(row);
  if (STAKING_TYPES.has(type)) return mapDividend(row, 'staking');
  if (AIRDROP_TYPES.has(type)) return mapDividend(row, 'airdrop');
  return null;
}

export function mapRowsToRawEvents(rows: CoinbaseRow[]): CsvImportResult {
  const events: RawEventInput[] = [];
  const skippedOperations: Record<string, number> = {};

  rows.forEach((row) => {
    const event = mapSingleRow(row);
    if (event) {
      events.push(event);
    } else {
      const key = row.type || 'Unknown';
      skippedOperations[key] = (skippedOperations[key] ?? 0) + 1;
    }
  });

  const summary: CsvImportSummary = {
    rowsRead: rows.length,
    rowsMapped: events.length,
    rowsSkipped: rows.length - events.length,
    skippedOperations,
  };
  return { events, summary };
}

// ============================================================
// ExchangeCsvImporter implementation
// ============================================================

/**
 * Detect a Coinbase "Transaction History" CSV. The registry hands us the first
 * non-empty line, which is the header only when no preamble precedes it; we
 * also accept a `coinbase` filename hint so preamble-prefixed exports still
 * route here. (import() does the real preamble skipping.)
 */
function detectCoinbase(headerLine: string, filename: string): boolean {
  const normalized = headerLine.trim().replace(/^"|"$/g, '');
  const headerMatch =
    normalized.startsWith(`${HEADER_FIRST_COL},${HEADER_SECOND_COL}`) && headerLine.includes(HEADER_QUANTITY_COL);
  return headerMatch || /coinbase/i.test(filename);
}

export const coinbaseCsvImporter: ExchangeCsvImporter = {
  exchange: CRYPTO_EXCHANGE.COINBASE,

  detect(headerLine: string, filename: string): boolean {
    return detectCoinbase(headerLine, filename);
  },

  import(text: string): CsvImportResult {
    const rows = rowsToCoinbaseRows(parseCsv(text));
    const { events, summary } = mapRowsToRawEvents(rows);
    return {
      events: events.map((event) => ({ ...event, source: CRYPTO_EXCHANGE.COINBASE })),
      summary,
    };
  },
};
