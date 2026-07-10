/**
 * Kraken `ledgers.csv` import.
 *
 * Kraken's ledger export records one row per balance change with the columns:
 *   txid,refid,time,type,subtype,aclass,asset,amount,fee,balance
 *
 * We map each row (or pair of rows) onto the same EventType vocabulary the
 * Binance pipeline already produces, so the existing EventNormalizer consumes
 * Kraken events without changes:
 *
 *   trade (paired by refid)            → CRYPTO_EVENT_TYPE.SPOT_TRADE
 *   deposit                            → CRYPTO_EVENT_TYPE.DEPOSIT
 *   withdrawal                         → CRYPTO_EVENT_TYPE.WITHDRAW (row fee = network fee)
 *   staking / earn(subtype=reward)     → CRYPTO_EVENT_TYPE.DIVIDEND ("Earn rewards:" hint)
 *   dividend                           → CRYPTO_EVENT_TYPE.DIVIDEND ("Airdrop:" hint)
 *   anything else                      → ignored (counted as skipped)
 *
 * A `trade` is split across TWO rows sharing the same `refid`: the positive
 * `amount` row is the acquired/base asset, the negative one the disposed/quote
 * asset. We synthesise one SPOT_TRADE payload per refid with `baseAsset` /
 * `quoteAsset` set EXPLICITLY (both already asset-normalised) so the normalizer
 * never has to suffix-split a symbol.
 *
 * Every asset is normalised via `normalizeKrakenAsset`. ExternalIDs are hashed
 * with the `kraken-` namespace so they never collide with Binance CSV ids, and
 * re-importing the same ledger is idempotent.
 */

import { CRYPTO_EVENT_TYPE, CRYPTO_EXCHANGE } from '@/constants/finance';
import { normalizeKrakenAsset } from '@/services/exchanges/kraken/krakenAssetCode';
import { parseCsv } from '@/services/exchanges/shared/csvParser';
import { hashRow as sharedHashRow } from '@/services/exchanges/shared/externalId';
import type {
  CsvImportResult,
  CsvImportSummary,
  ExchangeCsvImporter,
  RawEventInput,
} from '@/services/exchanges/shared/types';

// ============================================================
// Row schema
// ============================================================

export interface KrakenLedgerRow {
  txid: string;
  refid: string;
  time: Date;
  type: string;
  subtype: string;
  asset: string; // already normalised to the canonical ticker
  amount: number;
  fee: number;
}

export class KrakenCsvParseError extends Error {
  constructor(
    message: string,
    public readonly column?: string,
  ) {
    super(message);
    this.name = 'KrakenCsvParseError';
  }
}

// Logical column → header name. Kraken's ledger header is stable, so a direct
// name match is enough (no alias fan-out like Binance needs).
const REQUIRED_COLUMNS = ['txid', 'refid', 'time', 'type', 'subtype', 'asset', 'amount', 'fee', 'balance'] as const;

function resolveColumn(header: string[], name: string): number {
  const idx = header.indexOf(name);
  if (idx < 0) throw new KrakenCsvParseError('csv-missing-column', name);
  return idx;
}

/**
 * Parse a Kraken ledger timestamp into a UTC Date. Format is
 * `YYYY-MM-DD HH:MM:SS` (optionally with fractional seconds), always in UTC.
 */
function parseTimestamp(value: string): Date | null {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(trimmed)) return null;
  const d = new Date(`${trimmed.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function rowsToKrakenLedgerRows(rawRows: string[][]): KrakenLedgerRow[] {
  if (rawRows.length === 0) throw new KrakenCsvParseError('csv-empty');
  const header = rawRows[0]?.map((h) => h.trim()) ?? [];

  const txidIdx = resolveColumn(header, 'txid');
  const refidIdx = resolveColumn(header, 'refid');
  const timeIdx = resolveColumn(header, 'time');
  const typeIdx = resolveColumn(header, 'type');
  const subtypeIdx = resolveColumn(header, 'subtype');
  const assetIdx = resolveColumn(header, 'asset');
  const amountIdx = resolveColumn(header, 'amount');
  const feeIdx = resolveColumn(header, 'fee');

  // Some Kraken ledger rows are blank padding lines (a trailing txid-less row);
  // drop any row without a recognisable timestamp instead of throwing.
  return rawRows
    .slice(1)
    .filter((row) => (row[timeIdx] ?? '').trim().length > 0)
    .map((row) => {
      const timeStr = row[timeIdx] ?? '';
      const time = parseTimestamp(timeStr);
      if (!time) throw new KrakenCsvParseError('csv-invalid-time', timeStr);

      const amount = Number(row[amountIdx] ?? '');
      if (!Number.isFinite(amount)) throw new KrakenCsvParseError('csv-invalid-amount', row[amountIdx]);
      const feeRaw = (row[feeIdx] ?? '').trim();
      const fee = feeRaw === '' ? 0 : Number(feeRaw);
      if (!Number.isFinite(fee)) throw new KrakenCsvParseError('csv-invalid-fee', row[feeIdx]);

      return {
        txid: (row[txidIdx] ?? '').trim(),
        refid: (row[refidIdx] ?? '').trim(),
        time,
        type: (row[typeIdx] ?? '').trim(),
        subtype: (row[subtypeIdx] ?? '').trim(),
        asset: normalizeKrakenAsset(row[assetIdx] ?? ''),
        amount,
        fee,
      };
    });
}

// ============================================================
// Row → raw event mapping
// ============================================================

export type { CsvImportSummary };

/** Canonical string for a single ledger row, fed into the shared hasher. */
function canonicalRow(r: KrakenLedgerRow): string {
  return `${r.txid}|${r.refid}|${r.time.toISOString()}|${r.type}|${r.subtype}|${r.asset}|${r.amount}|${r.fee}`;
}

function hashRow(prefix: string, ...rows: KrakenLedgerRow[]): string {
  // `kraken-${prefix}` namespaces the id so it never collides with the Binance
  // `csv-${prefix}` ids or with a future Coinbase importer.
  return sharedHashRow(`kraken-${prefix}`, ...rows.map(canonicalRow));
}

/**
 * Synthesise a SPOT_TRADE from the rows sharing one `refid`. The positive
 * `amount` row is the acquired base asset, the negative one the disposed quote
 * asset. Returns null when the pair is incomplete (then the group is skipped).
 *
 * The Kraken `fee` is charged per row in that row's own asset; we surface it as
 * the trade commission (preferring the quote-side fee, where Kraken books it).
 */
function synthesizeSpotTrade(group: KrakenLedgerRow[]): RawEventInput | null {
  const baseRow = group.find((r) => r.amount > 0) ?? null;
  const quoteRow = group.find((r) => r.amount < 0) ?? null;
  if (!baseRow || !quoteRow) return null;

  const feeRow = quoteRow.fee !== 0 ? quoteRow : baseRow.fee !== 0 ? baseRow : null;

  return {
    eventType: CRYPTO_EVENT_TYPE.SPOT_TRADE,
    externalId: hashRow('spot', baseRow, quoteRow),
    occurredAt: baseRow.time,
    rawPayload: {
      symbol: `${baseRow.asset}${quoteRow.asset}`,
      baseAsset: baseRow.asset,
      quoteAsset: quoteRow.asset,
      isBuyer: true, // base asset was acquired
      qty: String(baseRow.amount),
      quoteQty: String(Math.abs(quoteRow.amount)),
      commission: feeRow ? String(Math.abs(feeRow.fee)) : '0',
      commissionAsset: feeRow ? feeRow.asset : null,
      time: baseRow.time.getTime(),
      csvSource: true,
    },
  };
}

/**
 * Map a non-trade ledger row to a single raw event, or null when the row type
 * is not fiscally relevant (transfer/spend/receive/adjustment/rollover/…).
 */
function mapSingleRow(r: KrakenLedgerRow): RawEventInput | null {
  const type = r.type.toLowerCase();

  if (type === 'deposit') {
    return {
      eventType: CRYPTO_EVENT_TYPE.DEPOSIT,
      externalId: hashRow('deposit', r),
      occurredAt: r.time,
      rawPayload: { coin: r.asset, amount: String(Math.abs(r.amount)), time: r.time.getTime(), csvSource: true },
    };
  }

  if (type === 'withdrawal') {
    return {
      eventType: CRYPTO_EVENT_TYPE.WITHDRAW,
      externalId: hashRow('withdraw', r),
      occurredAt: r.time,
      rawPayload: {
        coin: r.asset,
        amount: String(Math.abs(r.amount)),
        // Kraken books the network fee on the same row, in the same asset.
        transactionFee: String(Math.abs(r.fee)),
        time: r.time.getTime(),
        csvSource: true,
      },
    };
  }

  const dividendKind = classifyDividendType(type, r.subtype);
  if (dividendKind) {
    // The EventNormalizer routes airdrop vs staking off the `enInfo` prefix —
    // emit the explicit hint matching our own classification.
    const enInfoHint = dividendKind === 'staking' ? `Earn rewards: ${r.type}` : `Airdrop: ${r.type}`;
    return {
      eventType: CRYPTO_EVENT_TYPE.DIVIDEND,
      externalId: hashRow('div', r),
      occurredAt: r.time,
      rawPayload: {
        asset: r.asset,
        amount: String(Math.abs(r.amount)),
        enInfo: enInfoHint,
        time: r.time.getTime(),
        csvSource: true,
      },
    };
  }

  return null;
}

/**
 * Route a row type/subtype to a dividend bucket:
 *   - staking                  → staking reward
 *   - earn with subtype reward → staking reward
 *   - dividend                 → airdrop
 * Everything else (earn allocations, migrations, …) returns null → skipped.
 */
function classifyDividendType(type: string, subtype: string): 'staking' | 'airdrop' | null {
  if (type === 'staking') return 'staking';
  if (type === 'earn') return subtype.toLowerCase().includes('reward') ? 'staking' : null;
  if (type === 'dividend') return 'airdrop';
  return null;
}

export function mapRowsToRawEvents(rows: KrakenLedgerRow[]): CsvImportResult {
  const events: RawEventInput[] = [];
  const skippedOperations: Record<string, number> = {};
  let mapped = 0;

  const countSkipped = (r: KrakenLedgerRow) => {
    skippedOperations[r.type] = (skippedOperations[r.type] ?? 0) + 1;
  };

  // Split trade rows (grouped by refid) from everything else.
  const tradeGroups = new Map<string, KrakenLedgerRow[]>();
  const others: KrakenLedgerRow[] = [];
  rows.forEach((r) => {
    if (r.type.toLowerCase() === 'trade') {
      const list = tradeGroups.get(r.refid) ?? [];
      list.push(r);
      tradeGroups.set(r.refid, list);
    } else {
      others.push(r);
    }
  });

  tradeGroups.forEach((group) => {
    const synthesised = synthesizeSpotTrade(group);
    if (synthesised) {
      events.push(synthesised);
      mapped += group.length;
    } else {
      group.forEach(countSkipped);
    }
  });

  others.forEach((r) => {
    const event = mapSingleRow(r);
    if (event) {
      events.push(event);
      mapped += 1;
    } else {
      countSkipped(r);
    }
  });

  return {
    events,
    summary: {
      rowsRead: rows.length,
      rowsMapped: mapped,
      rowsSkipped: rows.length - mapped,
      skippedOperations,
    },
  };
}

// ============================================================
// ExchangeCsvImporter implementation
// ============================================================

// Columns that unambiguously identify a Kraken ledgers.csv export.
const KRAKEN_HEADER_SIGNATURE = REQUIRED_COLUMNS;

function detectKrakenHeader(headerLine: string): boolean {
  const columns = headerLine.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
  return KRAKEN_HEADER_SIGNATURE.every((col) => columns.includes(col));
}

/**
 * Kraken ledgers.csv importer. Runs parseCsv → rowsToKrakenLedgerRows →
 * mapRowsToRawEvents and stamps `source: 'kraken'` on every produced event.
 */
export const krakenCsvImporter: ExchangeCsvImporter = {
  exchange: CRYPTO_EXCHANGE.KRAKEN,

  detect(headerLine: string): boolean {
    return detectKrakenHeader(headerLine);
  },

  import(text: string): CsvImportResult {
    const ledgerRows = rowsToKrakenLedgerRows(parseCsv(text));
    const { events, summary } = mapRowsToRawEvents(ledgerRows);
    return {
      events: events.map((event) => ({ ...event, source: CRYPTO_EXCHANGE.KRAKEN })),
      summary,
    };
  },
};
