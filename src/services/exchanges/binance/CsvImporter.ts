/**
 * Binance CSV import — fallback for data the API doesn't return (C2C older
 * than 6 months, ancient operations, manual reconciliation).
 *
 * Maps each CSV row to a raw event reusing the same EventType vocabulary
 * the API sync produces, so the existing EventNormalizer picks them up
 * without changes. We pick the closest API-equivalent EventType per row:
 *
 *   Deposit                                → CRYPTO_EVENT_TYPE.DEPOSIT
 *   Withdraw                               → CRYPTO_EVENT_TYPE.WITHDRAW
 *   Distribution / Airdrop / Launchpool    → CRYPTO_EVENT_TYPE.DIVIDEND
 *   Reward / Interest / Earn / Staking     → CRYPTO_EVENT_TYPE.DIVIDEND
 *   C2C Buy/Sell                           → CRYPTO_EVENT_TYPE.C2C
 *   Spot Buy/Sell + Fee (grouped by time)  → CRYPTO_EVENT_TYPE.SPOT_TRADE
 *   Convert                                → CRYPTO_EVENT_TYPE.CONVERT
 *   Anything else                          → ignored (counted as skipped)
 *
 * ExternalID is a hash of the row content prefixed with `csv-` to avoid
 * collisions with API-sourced events. Re-importing the same CSV is
 * idempotent thanks to UNIQUE(UserID, EventType, ExternalID).
 */

import { createHash } from 'node:crypto';
import { CRYPTO_EVENT_TYPE } from '@/constants/finance';
import { type RawEventInput } from '@/services/database/BinanceRawEventsRepository';

// ============================================================
// CSV parser (no deps, handles quoted fields with commas inside)
// ============================================================

export function parseCsv(content: string): string[][] {
  // Strip the UTF-8 BOM that Binance prepends to its CSV exports.
  const sanitized = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let insideQuotes = false;

  for (let i = 0; i < sanitized.length; i++) {
    const ch = sanitized[i];
    if (insideQuotes) {
      if (ch === '"') {
        // Escaped quote inside a quoted field
        if (sanitized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          insideQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      insideQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (ch === '\r') continue;
    if (ch === '\n') {
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      continue;
    }
    field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}

// ============================================================
// Row schema
// ============================================================

export interface BinanceCsvRow {
  utcTime: Date;
  account: string;
  operation: string;
  coin: string;
  change: number;
  remark: string;
}

// Each required logical column maps to one or more accepted header names.
// Binance has shipped at least two header conventions over the years:
//   - older: `User_ID`, `UTC_Time`
//   - newer: `User ID`, `Time`   (timestamps are in the user's configured TZ)
const COLUMN_ALIASES: Record<string, readonly string[]> = {
  Time: ['UTC_Time', 'Time'],
  Account: ['Account'],
  Operation: ['Operation'],
  Coin: ['Coin'],
  Change: ['Change'],
};

export class CsvParseError extends Error {
  constructor(
    message: string,
    public readonly column?: string,
  ) {
    super(message);
    this.name = 'CsvParseError';
  }
}

/**
 * Resolve a logical column → its header index, accepting any of the aliases.
 * Throws csv-missing-column with the canonical name if none match.
 */
function resolveColumn(header: string[], logical: string): number {
  const aliases = COLUMN_ALIASES[logical] ?? [logical];
  for (const alias of aliases) {
    const idx = header.indexOf(alias);
    if (idx >= 0) return idx;
  }
  throw new CsvParseError('csv-missing-column', logical);
}

/**
 * Convert a Binance CSV. The optional `tzOffsetMinutes` shifts every
 * parsed timestamp back to UTC — Binance bakes the user's configured
 * timezone into the export (the filename suffix `(UTC+2)` reflects this),
 * so callers should sniff that offset from the upload filename and pass
 * it here. Default 0 keeps backward compatibility with older exports
 * whose `UTC_Time` column is already in UTC.
 */
export function rowsToBinanceCsvRows(rawRows: string[][], tzOffsetMinutes = 0): BinanceCsvRow[] {
  if (rawRows.length === 0) throw new CsvParseError('csv-empty');
  const header = rawRows[0]?.map((h) => h.trim()) ?? [];

  const timeIdx = resolveColumn(header, 'Time');
  const accountIdx = resolveColumn(header, 'Account');
  const operationIdx = resolveColumn(header, 'Operation');
  const coinIdx = resolveColumn(header, 'Coin');
  const changeIdx = resolveColumn(header, 'Change');
  const remarkIdx = header.indexOf('Remark');

  // If the column is the legacy `UTC_Time`, force the offset to zero
  // regardless of what the caller passed — that header is always UTC.
  const isUtcColumn = (header[timeIdx] ?? '') === 'UTC_Time';
  const effectiveOffset = isUtcColumn ? 0 : tzOffsetMinutes;

  const dataRows = rawRows.slice(1);
  return dataRows.map((row) => {
    const timeStr = row[timeIdx] ?? '';
    const utcTime = parseTimestamp(timeStr, effectiveOffset);
    if (!utcTime) throw new CsvParseError('csv-invalid-time', timeStr);

    const changeStr = row[changeIdx] ?? '';
    const change = Number(changeStr);
    if (!Number.isFinite(change)) throw new CsvParseError('csv-invalid-change', changeStr);

    return {
      utcTime,
      account: (row[accountIdx] ?? '').trim(),
      operation: (row[operationIdx] ?? '').trim(),
      coin: (row[coinIdx] ?? '').trim(),
      change,
      remark: remarkIdx >= 0 ? (row[remarkIdx] ?? '').trim() : '',
    };
  });
}

/**
 * Parse a Binance timestamp into a UTC Date. Accepted formats:
 *   - `YYYY-MM-DD HH:MM:SS`  (legacy, always UTC — Y4-M2-D2)
 *   - `YY-MM-DD HH:MM:SS`    (newer export, e.g. "21-01-21 18:52:34"
 *                             meaning 2021-01-21; in the user's TZ —
 *                             caller must supply `tzOffsetMinutes`)
 *
 * `tzOffsetMinutes` is the offset of the source timezone (e.g. UTC+2 = 120).
 * We subtract it to land back in UTC.
 */
function parseTimestamp(value: string, tzOffsetMinutes: number): Date | null {
  if (!value) return null;
  const trimmed = value.trim();

  // Format A: ISO-ish (YYYY-MM-DD HH:MM:SS, 4-digit year up front).
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(trimmed)) {
    const iso = `${trimmed.replace(' ', 'T')}Z`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : new Date(d.getTime() - tzOffsetMinutes * 60_000);
  }

  // Format B: YY-MM-DD HH:MM:SS — same field order as ISO, just a
  // 2-digit year. Binance launched in 2017 so any YY is unambiguously 20YY.
  const m = trimmed.match(/^(\d{2})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (m) {
    const [, yy, mm, dd, hh, mi, ss] = m;
    const year = 2000 + Number(yy);
    const d = new Date(Date.UTC(year, Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss)));
    return Number.isNaN(d.getTime()) ? null : new Date(d.getTime() - tzOffsetMinutes * 60_000);
  }

  return null;
}

/**
 * Sniff the timezone offset (minutes) from the filename Binance assigns to
 * its CSV exports — it always carries a `(UTC±N)` or `(UTC±N:MM)` suffix
 * reflecting the user's configured timezone. Returns 0 when no marker is
 * present (older exports were always UTC).
 */
export function detectOffsetFromFilename(filename: string): number {
  const m = filename.match(/\(UTC([+-])(\d{1,2})(?::(\d{2}))?\)/);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  const hours = Number(m[2]);
  const minutes = m[3] ? Number(m[3]) : 0;
  return sign * (hours * 60 + minutes);
}

// ============================================================
// Row → raw event mapping
// ============================================================

export interface CsvImportSummary {
  rowsRead: number;
  rowsMapped: number;
  rowsSkipped: number;
  skippedOperations: Record<string, number>;
}

interface MapResult {
  events: RawEventInput[];
  summary: CsvImportSummary;
}

/**
 * Whitelisted operation labels (case-insensitive substring match). Each
 * group routes the row to a specific TaxableEvent kind.
 *
 * IMPORTANT: anything that is NOT a real income (subscription/redemption
 * of Earn principal, internal transfers, etc.) must be in IGNORED_OPS so
 * we don't double-count the user's own capital as taxable income.
 *
 * Order matters: IGNORED is checked first to override broader matches.
 */
const IGNORED_OPS = [
  'subscription',
  'redemption',
  'transfer between',
  'transfer to',
  'transfer from',
  'main and funding wallet', // captured by Deposit/Withdraw classification too
];

const STAKING_REWARD_OPS = [
  'simple earn flexible interest',
  'simple earn locked rewards',
  'staking rewards',
  'staking purchase',
  'eth 2.0 staking rewards',
  'onchain yields fixed - distribution',
  'onchain yields flexible - distribution',
  'soft staking',
  'bnb vault rewards',
];

const AIRDROP_OPS = [
  'hodler airdrops distribution',
  'launchpool airdrop',
  'launchpad token distribution',
  'airdrop assets',
  'megadrop rewards',
  'token swap - distribution',
  'earn - airdrop distribution',
  'distribution', // generic — last so more specific labels win
];

function classifyDividendOp(op: string): 'staking' | 'airdrop' | null {
  const lower = op.toLowerCase();
  if (IGNORED_OPS.some((k) => lower.includes(k))) return null;
  if (STAKING_REWARD_OPS.some((k) => lower.includes(k))) return 'staking';
  if (AIRDROP_OPS.some((k) => lower.includes(k))) return 'airdrop';
  return null;
}

/**
 * Multi-row grouping config: each entry routes rows of a given operation
 * type (matched by `predicate`) into one synthetic raw event per timestamp.
 *   - spot:    Buy + Sell [+ Fee]               → SPOT_TRADE
 *   - dust:    Small Assets Exchange BNB legs   → DUST
 *   - convert: Binance Convert legs             → CONVERT
 */
type GroupKey = 'spot' | 'dust' | 'convert';
const GROUP_PREDICATES: Record<GroupKey, (r: BinanceCsvRow) => boolean> = {
  spot: (r) => isSpotTradeOp(r.operation) && r.account.toLowerCase() === 'spot',
  dust: (r) => r.operation.toLowerCase() === 'small assets exchange bnb',
  convert: (r) => r.operation.toLowerCase() === 'binance convert',
};
const GROUP_SYNTHESIZERS: Record<GroupKey, (group: BinanceCsvRow[]) => RawEventInput | null> = {
  spot: synthesizeSpotTrade,
  dust: synthesizeDust,
  convert: synthesizeConvert,
};

export function mapRowsToRawEvents(rows: BinanceCsvRow[]): MapResult {
  const events: RawEventInput[] = [];
  const skippedOperations: Record<string, number> = {};
  let mapped = 0;

  const groups: Record<GroupKey, Map<string, BinanceCsvRow[]>> = {
    spot: new Map(),
    dust: new Map(),
    convert: new Map(),
  };
  const others: BinanceCsvRow[] = [];

  rows.forEach((r) => {
    const key = `${r.utcTime.toISOString()}|${r.account}`;
    const matched = (Object.keys(GROUP_PREDICATES) as GroupKey[]).find((k) => GROUP_PREDICATES[k](r));
    if (matched) {
      const list = groups[matched].get(key) ?? [];
      list.push(r);
      groups[matched].set(key, list);
    } else {
      others.push(r);
    }
  });

  (Object.keys(groups) as GroupKey[]).forEach((kind) => {
    groups[kind].forEach((group) => {
      const synthesised = GROUP_SYNTHESIZERS[kind](group);
      if (synthesised) {
        events.push(synthesised);
        mapped += group.length;
      } else {
        // Could not pair → skip the whole group, count each row.
        group.forEach((r) => {
          skippedOperations[r.operation] = (skippedOperations[r.operation] ?? 0) + 1;
        });
      }
    });
  });

  // Process other rows individually
  others.forEach((r) => {
    const event = mapSingleRow(r);
    if (event) {
      events.push(event);
      mapped += 1;
    } else {
      skippedOperations[r.operation] = (skippedOperations[r.operation] ?? 0) + 1;
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

function isSpotTradeOp(op: string): boolean {
  const lower = op.toLowerCase();
  return (
    lower === 'buy' ||
    lower === 'sell' ||
    lower === 'transaction buy' ||
    lower === 'transaction sold' ||
    lower === 'transaction spend' ||
    lower === 'transaction revenue' ||
    lower === 'fee' ||
    lower === 'transaction fee'
  );
}

/**
 * A spot trade in CSV is split across 2-3 rows with the same timestamp:
 *   Buy/Transaction Buy  (positive Change of base asset)
 *   Sell/Transaction Sold (negative Change of quote asset)
 *   Fee/Transaction Fee  (negative Change of fee asset, optional)
 *
 * We detect base/quote by sign and synthesize a SPOT_TRADE raw payload that
 * mimics what `myTrades` returns (so normalizeSpotTrade picks it up).
 */
function synthesizeSpotTrade(group: BinanceCsvRow[]): RawEventInput | null {
  const isFeeRow = (r: BinanceCsvRow) => {
    const op = r.operation.toLowerCase();
    return op === 'fee' || op === 'transaction fee';
  };

  const feeRow = group.find(isFeeRow) ?? null;
  const nonFeeRows = group.filter((r) => !isFeeRow(r));
  const baseRow = nonFeeRows.find((r) => r.change > 0) ?? null;
  const quoteRow = nonFeeRows.find((r) => r.change < 0) ?? null;

  if (!baseRow || !quoteRow) return null;

  // myTrades shape we rely on inside normalizeSpotTrade:
  //   { symbol, isBuyer, qty, quoteQty, commission, commissionAsset, time }
  const symbol = `${baseRow.coin}${quoteRow.coin}`;
  const payload = {
    symbol,
    isBuyer: true, // base coin was acquired
    qty: String(baseRow.change),
    quoteQty: String(Math.abs(quoteRow.change)),
    commission: feeRow ? String(Math.abs(feeRow.change)) : '0',
    commissionAsset: feeRow ? feeRow.coin : null,
    time: baseRow.utcTime.getTime(),
    csvSource: true,
  };

  return {
    eventType: CRYPTO_EVENT_TYPE.SPOT_TRADE,
    externalId: hashRow('spot', baseRow, quoteRow, feeRow),
    occurredAt: baseRow.utcTime,
    rawPayload: payload,
  };
}

/**
 * Small Assets Exchange BNB (Binance Dust). Two rows with the same
 * timestamp:
 *   -X SOMETHING        (asset being converted out)
 *   +Y BNB              (BNB received in exchange)
 * The rows already net the dust fee internally (Binance returns
 * "transferedAmount" rather than gross+fee), so we model serviceCharge=0.
 *
 * Payload mirrors what `assetDribbletLog` returns from the API so the
 * existing `normalizeDust` picks it up unchanged.
 */
function synthesizeDust(group: BinanceCsvRow[]): RawEventInput | null {
  const fromRow = group.find((r) => r.change < 0) ?? null;
  const toRow = group.find((r) => r.change > 0 && r.coin === 'BNB') ?? null;
  if (!fromRow || !toRow) return null;

  return {
    eventType: CRYPTO_EVENT_TYPE.DUST,
    externalId: hashRow('dust', fromRow, toRow),
    occurredAt: fromRow.utcTime,
    rawPayload: {
      detail: {
        fromAsset: fromRow.coin,
        targetAsset: toRow.coin,
        amount: String(Math.abs(fromRow.change)),
        transferedAmount: String(toRow.change),
        serviceChargeAmount: '0',
      },
      operateTime: fromRow.utcTime.getTime(),
      csvSource: true,
    },
  };
}

/**
 * Binance Convert. Two rows with the same timestamp:
 *   -X FROM_ASSET   (asset converted out)
 *   +Y TO_ASSET     (asset received)
 *
 * Payload mirrors `convert/tradeFlow` so `normalizeConvert` works
 * without changes.
 */
function synthesizeConvert(group: BinanceCsvRow[]): RawEventInput | null {
  const fromRow = group.find((r) => r.change < 0) ?? null;
  const toRow = group.find((r) => r.change > 0) ?? null;
  if (!fromRow || !toRow) return null;

  return {
    eventType: CRYPTO_EVENT_TYPE.CONVERT,
    externalId: hashRow('convert', fromRow, toRow),
    occurredAt: fromRow.utcTime,
    rawPayload: {
      fromAsset: fromRow.coin,
      toAsset: toRow.coin,
      fromAmount: String(Math.abs(fromRow.change)),
      toAmount: String(toRow.change),
      createTime: fromRow.utcTime.getTime(),
      csvSource: true,
    },
  };
}

function mapSingleRow(r: BinanceCsvRow): RawEventInput | null {
  const op = r.operation.toLowerCase();

  if (op === 'deposit' || op === 'transfer between main and funding wallet') {
    return {
      eventType: CRYPTO_EVENT_TYPE.DEPOSIT,
      externalId: hashRow('deposit', r),
      occurredAt: r.utcTime,
      rawPayload: { coin: r.coin, amount: String(Math.abs(r.change)), time: r.utcTime.getTime(), csvSource: true },
    };
  }

  if (op === 'withdraw') {
    return {
      eventType: CRYPTO_EVENT_TYPE.WITHDRAW,
      externalId: hashRow('withdraw', r),
      occurredAt: r.utcTime,
      rawPayload: {
        coin: r.coin,
        amount: String(Math.abs(r.change)),
        transactionFee: '0',
        time: r.utcTime.getTime(),
        csvSource: true,
      },
    };
  }

  if (op.startsWith('c2c')) {
    return {
      eventType: CRYPTO_EVENT_TYPE.C2C,
      externalId: hashRow('c2c', r),
      occurredAt: r.utcTime,
      rawPayload: {
        tradeType: r.change > 0 ? 'BUY' : 'SELL',
        asset: r.coin,
        fiat: 'EUR',
        amount: String(Math.abs(r.change)),
        totalPrice: '0', // CSV doesn't carry the fiat counter — price service will fall back
        commission: '0',
        time: r.utcTime.getTime(),
        csvSource: true,
      },
    };
  }

  // Earn / Launchpool / Distribution. classifyDividendOp returns null for
  // subscription/redemption (capital movements, NOT income) so they're
  // counted as skipped instead of polluting the staking_reward bucket.
  const dividendKind = classifyDividendOp(r.operation);
  if (dividendKind) {
    // The downstream EventNormalizer.classifyDividend reads `enInfo` to
    // route between airdrop vs staking. We hint it explicitly here by
    // prefixing the label so the existing keyword matcher lands on the
    // right bucket regardless of how Binance worded the row.
    const enInfoHint = dividendKind === 'staking' ? `Earn rewards: ${r.operation}` : `Airdrop: ${r.operation}`;
    return {
      eventType: CRYPTO_EVENT_TYPE.DIVIDEND,
      externalId: hashRow('div', r),
      occurredAt: r.utcTime,
      rawPayload: {
        asset: r.coin,
        amount: String(Math.abs(r.change)),
        enInfo: enInfoHint,
        time: r.utcTime.getTime(),
        csvSource: true,
      },
    };
  }

  return null;
}

function hashRow(prefix: string, ...rows: (BinanceCsvRow | null)[]): string {
  const payload = rows
    .filter((r): r is BinanceCsvRow => r !== null)
    .map((r) => `${r.utcTime.toISOString()}|${r.account}|${r.operation}|${r.coin}|${r.change}|${r.remark}`)
    .join('||');
  return `csv-${prefix}-${createHash('sha256').update(payload).digest('hex').slice(0, 16)}`;
}
