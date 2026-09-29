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
 *   Reward / Interest / Earn / Staking     → CRYPTO_EVENT_TYPE.DIVIDEND (positive rows only)
 *   C2C Buy/Sell                           → CRYPTO_EVENT_TYPE.C2C
 *   Spot Buy/Sell + Fee (grouped by time)  → CRYPTO_EVENT_TYPE.SPOT_TRADE, one per fill
 *   Convert                                → CRYPTO_EVENT_TYPE.CONVERT
 *   Internal transfers, Earn subscriptions
 *   and redemptions, Staking Purchase      → ignored (counted as skipped)
 *   Anything else                          → ignored (counted as skipped)
 *
 * ExternalID is a hash of the row content prefixed with `csv-` to avoid
 * collisions with API-sourced events. Re-importing the same CSV is
 * idempotent thanks to UNIQUE(UserID, EventType, ExternalID).
 */

import { CRYPTO_EVENT_TYPE, CRYPTO_EXCHANGE } from '@/constants/finance';
import { hashRow as sharedHashRow } from '@/services/exchanges/shared/externalId';
import type {
  CsvImportResult,
  CsvImportSummary,
  ExchangeCsvImporter,
  RawEventInput,
} from '@/services/exchanges/shared/types';
import { parseCsv } from '@/utils/csv';

// Re-exported so existing callers/tests can keep importing the generic parser
// from this module; the implementation now lives in @/utils/csv.
export { parseCsv };

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

// CsvImportSummary now lives in shared/types and is re-exported for callers
// that still import it from this module.
export type { CsvImportSummary };

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
  // Locking the user's own coins into staking: the Spot row is negative, the
  // Earn row positive, and neither is a reward.
  'staking purchase',
  // Moves between the user's own wallets (Spot, Funding, Earn, Futures). The
  // coins keep their original lot, so neither row may open a transfer_in.
  'transfer between',
  'transfer to',
  'transfer from',
  'main and funding wallet',
];

const STAKING_REWARD_OPS = [
  'simple earn flexible interest',
  'simple earn locked rewards',
  'staking rewards',
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
 * type (matched by `predicate`) into synthetic raw events per timestamp.
 *   - spot:    Buy + Sell [+ Fee]               → one SPOT_TRADE per fill
 *   - dust:    Small Assets Exchange BNB legs   → DUST
 *   - convert: Binance Convert legs             → CONVERT
 */
type GroupKey = 'spot' | 'dust' | 'convert';
const GROUP_PREDICATES: Record<GroupKey, (r: BinanceCsvRow) => boolean> = {
  spot: (r) => isSpotTradeOp(r.operation) && r.account.toLowerCase() === 'spot',
  dust: (r) => r.operation.toLowerCase() === 'small assets exchange bnb',
  convert: (r) => r.operation.toLowerCase() === 'binance convert',
};

interface GroupSynthesis {
  events: RawEventInput[];
  /** Rows that ended up inside an event; the rest of the group is reported as skipped. */
  used: BinanceCsvRow[];
}

/** Dust and convert map a group to at most one event and count the whole group when they do. */
function wholeGroup(group: BinanceCsvRow[], event: RawEventInput | null): GroupSynthesis {
  return event ? { events: [event], used: group } : { events: [], used: [] };
}

const GROUP_SYNTHESIZERS: Record<GroupKey, (group: BinanceCsvRow[]) => GroupSynthesis> = {
  spot: synthesizeSpotTrades,
  dust: (group) => wholeGroup(group, synthesizeDust(group)),
  convert: (group) => wholeGroup(group, synthesizeConvert(group)),
};

export function mapRowsToRawEvents(rows: BinanceCsvRow[]): CsvImportResult {
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
      const { events: synthesised, used } = GROUP_SYNTHESIZERS[kind](group);
      events.push(...synthesised);
      mapped += used.length;
      // Rows that could not be paired into an event are counted per operation.
      const usedRows = new Set(used);
      group
        .filter((r) => !usedRows.has(r))
        .forEach((r) => {
          skippedOperations[r.operation] = (skippedOperations[r.operation] ?? 0) + 1;
        });
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
 * A spot fill in CSV is split across 2-3 rows with the same timestamp:
 *   Buy/Transaction Buy  (positive Change of base asset)
 *   Sell/Transaction Sold (negative Change of quote asset)
 *   Fee/Transaction Fee  (negative Change of fee asset, optional)
 *
 * An order that fills several times within one second repeats that triplet
 * under the same timestamp, so a group can hold several fills. Each fill
 * becomes its own SPOT_TRADE raw payload mimicking what `myTrades` returns
 * (so normalizeSpotTrade picks it up). Fills are kept apart rather than
 * summed because filterCrossSourceDuplicates matches a CSV trade against the
 * API by the amount of a single fill.
 */
type NonEmptyRows = [BinanceCsvRow, ...BinanceCsvRow[]];

interface SpotFill {
  base: NonEmptyRows; // acquired coin (positive Change)
  quote: NonEmptyRows; // coin given up (negative Change)
  fee: BinanceCsvRow[];
}

function isSpotFeeRow(r: BinanceCsvRow): boolean {
  const op = r.operation.toLowerCase();
  return op === 'fee' || op === 'transaction fee';
}

function synthesizeSpotTrades(group: BinanceCsvRow[]): GroupSynthesis {
  const tradeRows = group.filter((r) => !isSpotFeeRow(r));
  const fills = attachSpotFees(
    pairSpotFills(
      tradeRows.filter((r) => r.change > 0),
      tradeRows.filter((r) => r.change < 0),
    ),
    group.filter(isSpotFeeRow),
  );
  return {
    events: fills.map(spotFillToRawEvent),
    used: fills.flatMap((fill) => [...fill.base, ...fill.quote, ...fill.fee]),
  };
}

/**
 * Above this many acquired or given-up rows in one group the exhaustive
 * search is skipped and the first-free pairing is used as it is, even where
 * it strands a row. Over 15,000 random groups of 8 + 8 rows the search
 * visited at most ~63,000 states; at 10 + 10 it reached ~360,000 and at
 * 12 + 12 millions, enough for one odd second to stall an upload. A large
 * group of a single coin pair still pairs every row: first-free pairing can
 * only strand a row when both sides hold more than one coin.
 */
const MAX_EXACT_PAIRING_ROWS = 8;

/** For each acquired row, the index of its given-up row, or null when it has none. */
type SpotPairing = Array<number | null>;

/**
 * Recovers the fills of a group whether the export interleaves the triplets
 * or lists them grouped by operation. Nothing in a row says which row it
 * traded against; the only rule is that a fill never has the same coin on
 * both sides. So the group takes the pairing that keeps the most rows, and
 * among those, the one where each acquired row in file order holds the
 * earliest given-up row that still allows it: Binance lists a trade's rows
 * in the same order on both sides. Taking the first free row of another coin
 * can strand a row (ETH bought with BTC and BTC bought with USDT, listed
 * USDT first: ETH takes USDT and BTC is left facing only BTC); whenever it
 * does not, the pairing chosen here is exactly the first-free one, fills and
 * ExternalIDs alike.
 *
 * When a single pair of coins has unequal row counts, the rows are summed
 * into one fill so no quantity is lost. Rows left without a partner stay out
 * of every fill.
 */
function pairSpotFills(acquired: BinanceCsvRow[], given: BinanceCsvRow[]): SpotFill[] {
  const [firstAcquired, ...restAcquired] = acquired;
  const [firstGiven, ...restGiven] = given;
  if (!firstAcquired || !firstGiven) return [];

  const isSinglePair =
    acquired.every((r) => r.coin === firstAcquired.coin) &&
    given.every((r) => r.coin === firstGiven.coin) &&
    firstAcquired.coin !== firstGiven.coin;
  if (isSinglePair && acquired.length !== given.length) {
    return [{ base: [firstAcquired, ...restAcquired], quote: [firstGiven, ...restGiven], fee: [] }];
  }

  const acquiredCoins = acquired.map((r) => r.coin);
  const givenCoins = given.map((r) => r.coin);
  const pairing =
    Math.max(acquired.length, given.length) > MAX_EXACT_PAIRING_ROWS
      ? firstFreePairing(acquiredCoins, givenCoins)
      : maximumPairing(acquiredCoins, givenCoins);

  return pairing.reduce<SpotFill[]>((fills, givenIdx, acquiredIdx) => {
    const base = acquired[acquiredIdx];
    const quote = givenIdx === null ? undefined : given[givenIdx];
    if (base && quote) fills.push({ base: [base], quote: [quote], fee: [] });
    return fills;
  }, []);
}

/** Each acquired row takes the first unused given-up row of another coin. */
function firstFreePairing(acquiredCoins: string[], givenCoins: string[]): SpotPairing {
  const taken = new Set<number>();
  return acquiredCoins.map((coin) => {
    const idx = givenCoins.findIndex((candidate, givenIdx) => !taken.has(givenIdx) && candidate !== coin);
    if (idx < 0) return null;
    taken.add(idx);
    return idx;
  });
}

/**
 * Exhaustive search for the pairing that keeps the most rows. Acquired rows
 * are decided in file order, each trying the given-up rows in file order
 * before staying unpaired, and only a strictly larger pairing replaces the
 * best one found, so the first maximum reached is the row-order one that
 * pairSpotFills describes. The first path walked is the first-free pairing,
 * and when that pairs every row it can, the search stops right there.
 */
function maximumPairing(acquiredCoins: string[], givenCoins: string[]): SpotPairing {
  const ceiling = Math.min(acquiredCoins.length, givenCoins.length);
  const taken = new Set<number>();
  const current: SpotPairing = [];
  let best: SpotPairing = [];
  let bestSize = 0;

  const search = (acquiredIdx: number, size: number): void => {
    // Rows still open on the scarcer side bound what this branch can add.
    const reachable = size + Math.min(acquiredCoins.length - acquiredIdx, givenCoins.length - taken.size);
    if (bestSize === ceiling || reachable <= bestSize) return;
    if (acquiredIdx === acquiredCoins.length) {
      best = [...current];
      bestSize = size;
      return;
    }
    givenCoins.forEach((coin, givenIdx) => {
      if (taken.has(givenIdx) || coin === acquiredCoins[acquiredIdx]) return;
      taken.add(givenIdx);
      current.push(givenIdx);
      search(acquiredIdx + 1, size + 1);
      current.pop();
      taken.delete(givenIdx);
    });
    current.push(null);
    search(acquiredIdx + 1, size);
    current.pop();
  };

  search(0, 0);
  return best;
}

/**
 * One fee row per fill pairs by position. Otherwise every fee row in the
 * first fee coin goes to the first fill: the fee still reaches the EUR
 * figures, only its split between fills is lost. A fill carries a single
 * commission asset, so fee rows in any other coin stay out and the import
 * summary reports them as skipped.
 */
function attachSpotFees(fills: SpotFill[], feeRows: BinanceCsvRow[]): SpotFill[] {
  if (feeRows.length === fills.length) {
    return fills.map((fill, idx) => {
      const feeRow = feeRows[idx];
      return feeRow ? { ...fill, fee: [feeRow] } : fill;
    });
  }
  const feeCoin = feeRows[0]?.coin;
  return fills.map((fill, idx) =>
    idx === 0 && feeCoin ? { ...fill, fee: feeRows.filter((r) => r.coin === feeCoin) } : fill,
  );
}

/**
 * Sum of the Change column. Float addition leaves noise such as
 * 0.30000000000000004; a float64 parsed from the CSV carries 15 significant
 * digits at best, so the sum is rounded to that. A single row is returned
 * untouched so a one-fill trade keeps the exact payload it always had.
 */
function sumChange(rows: BinanceCsvRow[]): number {
  if (rows.length === 1) return rows[0]?.change ?? 0;
  return Number(rows.reduce((acc, r) => acc + r.change, 0).toPrecision(15));
}

function spotFillToRawEvent(fill: SpotFill, index: number): RawEventInput {
  const [baseRow] = fill.base;
  const [quoteRow] = fill.quote;
  const feeRow = fill.fee[0] ?? null;

  // myTrades shape we rely on inside normalizeSpotTrade:
  //   { symbol, isBuyer, qty, quoteQty, commission, commissionAsset, time }
  // We also carry base/quote explicitly: unlike the API `symbol` (a real
  // market we can split heuristically), the CSV-synthesised symbol can pair
  // any two coins (e.g. BTC/ADA), so the suffix-based splitSymbol would fail.
  // The importer already knows both sides — preserve them.
  const payload = {
    symbol: `${baseRow.coin}${quoteRow.coin}`,
    baseAsset: baseRow.coin,
    quoteAsset: quoteRow.coin,
    isBuyer: true, // base coin was acquired
    qty: String(sumChange(fill.base)),
    quoteQty: String(Math.abs(sumChange(fill.quote))),
    commission: feeRow ? String(Math.abs(sumChange(fill.fee))) : '0',
    commissionAsset: feeRow ? feeRow.coin : null,
    time: baseRow.utcTime.getTime(),
    csvSource: true,
  };

  // The first fill keeps the id a one-fill group has always had, so
  // re-importing a file that was imported before adds only the fills that
  // were missing. Later fills carry their position: two fills with identical
  // amounts would otherwise hash alike and the unique key would drop one.
  // Exception: a single coin pair with uneven row counts is summed into fill
  // 0, which keeps the old id, so a re-import leaves the partial quantity an
  // earlier import stored; that row has to be deleted before re-importing.
  // Nor does a group whose first acquired row now pairs with a given-up row
  // other than the first: docs/CRYPTO_MODULE.md (Ingestion) says what to
  // delete before re-importing it.
  const externalId = hashRow('spot', baseRow, quoteRow, feeRow);
  return {
    eventType: CRYPTO_EVENT_TYPE.SPOT_TRADE,
    externalId: index === 0 ? externalId : `${externalId}-${index}`,
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

  if (op === 'deposit') {
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
  // Income only ever credits the wallet: a negative row under a reward label
  // is coins leaving, so it is skipped rather than booked as positive income.
  const dividendKind = classifyDividendOp(r.operation);
  if (dividendKind && r.change > 0) {
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
        amount: String(r.change),
        enInfo: enInfoHint,
        time: r.utcTime.getTime(),
        csvSource: true,
      },
    };
  }

  return null;
}

function hashRow(prefix: string, ...rows: (BinanceCsvRow | null)[]): string {
  // Canonicalise each non-null row to a stable string, then delegate to the
  // shared hasher. Passing the `csv-${prefix}` namespace keeps the produced
  // ExternalID byte-identical to the historical `csv-${prefix}-${hash}` format.
  const parts = rows
    .filter((r): r is BinanceCsvRow => r !== null)
    .map((r) => `${r.utcTime.toISOString()}|${r.account}|${r.operation}|${r.coin}|${r.change}|${r.remark}`);
  return sharedHashRow(`csv-${prefix}`, ...parts);
}

// ============================================================
// ExchangeCsvImporter implementation
// ============================================================

// Header columns that unambiguously identify a Binance "Export Transaction
// History" CSV across both header conventions (legacy `UTC_Time`/`User_ID`
// and newer `Time`/`User ID`).
const BINANCE_HEADER_SIGNATURE = ['Operation', 'Coin', 'Change'] as const;

function detectBinanceHeader(headerLine: string): boolean {
  const columns = headerLine.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
  const hasTime = columns.includes('UTC_Time') || columns.includes('Time');
  return hasTime && BINANCE_HEADER_SIGNATURE.every((col) => columns.includes(col));
}

/**
 * Binance CSV importer. Wraps the existing parse → group → map pipeline and
 * stamps `source: 'binance'` on every produced raw event so the downstream
 * insert persists the originating exchange.
 */
export const binanceCsvImporter: ExchangeCsvImporter = {
  exchange: CRYPTO_EXCHANGE.BINANCE,

  detect(headerLine: string): boolean {
    return detectBinanceHeader(headerLine);
  },

  import(text: string, filename: string): CsvImportResult {
    // Binance bakes the user's TZ into the export filename — sniff the offset
    // so timestamps are shifted back to UTC before storing.
    const tzOffsetMinutes = detectOffsetFromFilename(filename);
    const csvRows = rowsToBinanceCsvRows(parseCsv(text), tzOffsetMinutes);
    const { events, summary } = mapRowsToRawEvents(csvRows);
    return {
      events: events.map((event) => ({ ...event, source: CRYPTO_EXCHANGE.BINANCE })),
      summary,
    };
  },
};
