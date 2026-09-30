/**
 * Repository for raw crypto events ingested by the sync workers and CSV
 * importers, across every supported exchange (Binance, Kraken, Coinbase).
 *
 * Each row records its originating exchange in the "Source" column. Idempotent
 * inserts via UNIQUE(UserID, EventType, ExternalID): re-running a sync window
 * inserts 0 duplicates. Bulk insert uses multi-row VALUES with .flatMap() for
 * params (project convention, see TransactionRepository).
 */

import {
  CRYPTO_DUST_SECOND_TOLERANCE,
  CRYPTO_EVENT_TYPE,
  CRYPTO_EXCHANGE,
  type CryptoEventType,
  type CryptoExchange,
} from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import {
  CURRENT_REWARD_ID_PATTERN,
  isRewardEventType,
  REWARD_ID_EVENT_TYPES,
  rewardExternalId,
} from '@/services/exchanges/shared/rewardExternalId';
import { splitSymbol } from '@/utils/cryptoSymbol';
import { query } from './connection';

interface RawEventRow {
  EventID: string;
  UserID: number;
  Source: string;
  EventType: string;
  ExternalID: string;
  OccurredAt: string;
  RawPayload: Record<string, unknown>;
  IngestedAt: string;
  JobID: number | null;
}

export interface CryptoRawEvent {
  eventId: string;
  source: CryptoExchange;
  eventType: CryptoEventType;
  externalId: string;
  occurredAt: string;
  rawPayload: Record<string, unknown>;
  ingestedAt: string;
  jobId: number | null;
}

export interface RawEventInput {
  eventType: CryptoEventType;
  externalId: string;
  occurredAt: Date;
  rawPayload: Record<string, unknown>;
  // Originating exchange. CSV importers set this explicitly; the Binance API
  // sync path omits it and the insert defaults to 'binance' (see below).
  source?: CryptoExchange;
}

function rowToEvent(row: RawEventRow): CryptoRawEvent {
  return {
    eventId: row.EventID,
    source: row.Source as CryptoExchange,
    eventType: row.EventType as CryptoEventType,
    externalId: row.ExternalID,
    occurredAt: row.OccurredAt,
    rawPayload: row.RawPayload,
    ingestedAt: row.IngestedAt,
    jobId: row.JobID,
  };
}

/**
 * Bulk insert raw events for the authenticated user. Returns the number of
 * rows actually inserted (excluding duplicates skipped by ON CONFLICT).
 */
export async function bulkInsertRawEvents(inputs: RawEventInput[], jobId: number): Promise<number> {
  const userId = await getUserIdOrThrow();
  return bulkInsertRawEventsForUser(userId, inputs, jobId);
}

// 7 bind parameters per row: 500 rows are 3,500, far below PostgreSQL's
// 65,535-parameter ceiling. A single symbol's spot history can run to tens of
// thousands of fills, and one statement over the ceiling is rejected whole.
const RAW_EVENT_INSERT_CHUNK = 500;

/**
 * Inserts in chunks of RAW_EVENT_INSERT_CHUNK rows, one after another so a
 * large history does not take every pool connection at once. Each chunk is
 * idempotent on its own; if one fails the error propagates and a re-run skips
 * the chunks already stored.
 */
export async function bulkInsertRawEventsForUser(
  userId: number,
  inputs: RawEventInput[],
  jobId: number,
): Promise<number> {
  const chunks = Array.from({ length: Math.ceil(inputs.length / RAW_EVENT_INSERT_CHUNK) }, (_, i) =>
    inputs.slice(i * RAW_EVENT_INSERT_CHUNK, (i + 1) * RAW_EVENT_INSERT_CHUNK),
  );
  return chunks.reduce<Promise<number>>(
    async (total, chunk) => (await total) + (await insertRawEventChunk(userId, chunk, jobId)),
    Promise.resolve(0),
  );
}

async function insertRawEventChunk(userId: number, inputs: RawEventInput[], jobId: number): Promise<number> {
  const COLS_PER_ROW = 7;
  const placeholders = inputs
    .map((_, i) => {
      const base = i * COLS_PER_ROW + 1;
      return `($${base}, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
    })
    .join(', ');

  const params = inputs.flatMap((event) => [
    userId,
    event.source ?? CRYPTO_EXCHANGE.BINANCE,
    event.eventType,
    event.externalId,
    event.occurredAt.toISOString(),
    JSON.stringify(event.rawPayload),
    jobId,
  ]);

  const rows = await query<{ inserted: number }>(
    `WITH ins AS (
       INSERT INTO "CryptoRawEvents"
         ("UserID", "Source", "EventType", "ExternalID", "OccurredAt", "RawPayload", "JobID")
       VALUES ${placeholders}
       ON CONFLICT ("UserID", "EventType", "ExternalID") DO NOTHING
       RETURNING 1 AS inserted
     )
     SELECT COUNT(*)::int AS inserted FROM ins`,
    params,
  );

  return rows[0]?.inserted ?? 0;
}

// ============================================================
// Cross-source dedup (CSV ↔ API)
// ============================================================

// deposit/withdraw timestamps differ by minutes/hours between the CSV export
// and the API, but always land on the same UTC day — so we match them at day
// granularity. Dust is matched within a few seconds (below); every other type
// shares the exact second.
const DAY_GRANULARITY_TYPES = new Set<string>([CRYPTO_EVENT_TYPE.DEPOSIT, CRYPTO_EVENT_TYPE.WITHDRAW]);

// A dust conversion is stamped a second or two apart by the CSV export and the
// API, so its candidates are also looked up in the buckets of the whole seconds
// either side, nearest first.
const DUST_NEARBY_SECOND_OFFSETS = Array.from({ length: CRYPTO_DUST_SECOND_TOLERANCE }, (_, i) => i + 1).flatMap(
  (distance) => [-distance, distance],
);

// The CSV export books every Earn, staking and airdrop credit as a `dividend`
// row, while the API spreads the same credits over five endpoints. Matching
// them as one family is what lets a CSV "Simple Earn Flexible Interest" row
// recognise the reward the API stored as `earn_flex`, and the other way round.
const REWARD_EVENT_TYPES = new Set<string>([
  CRYPTO_EVENT_TYPE.DIVIDEND,
  CRYPTO_EVENT_TYPE.EARN_FLEX,
  CRYPTO_EVENT_TYPE.EARN_LOCKED,
  CRYPTO_EVENT_TYPE.STAKING_INTEREST,
  CRYPTO_EVENT_TYPE.ETH_STAKING,
]);
const REWARD_IDENTITY_FAMILY = 'reward';

// Payload keys the identity reads. The index query ships only these keys of the
// stored rows, so stored rows and incoming candidates go through the same
// extraction in TypeScript instead of a SQL copy of it that can drift.
const IDENTITY_PAYLOAD_KEYS = [
  'symbol',
  'asset',
  'coin',
  'fromAsset',
  'detail',
  'qty',
  'quoteQty',
  'amount',
  'fromAmount',
  'rewards',
  'distributeAmount',
  'transactionFee',
  'isBuyer',
  'csvSource',
  'baseAsset',
  'quoteAsset',
] as const;

// The index reads each of those keys as a column of its own, one direct
// lookup per key. Expanding every payload with jsonb_each and aggregating the
// matches back, or building the subset with jsonb_build_object, costs about
// twice as much per row (measured on 100k spot payloads, local PostgreSQL 17,
// 2026-09-29). The keys are the constants above, never user input.
const PAYLOAD_COLUMN_PREFIX = 'payload_';
const IDENTITY_PAYLOAD_COLUMNS_SQL = IDENTITY_PAYLOAD_KEYS.map(
  (key) => `"RawPayload"->'${key}' AS "${PAYLOAD_COLUMN_PREFIX}${key}"`,
).join(',\n            ');

interface EventIdentity {
  bucket: string; // identityType|asset|side|timeKey
  // Candidate amounts. Withdrawals carry both the net and the gross (net + fee)
  // because the CSV stores the gross while the API stores the net + fee apart.
  amounts: number[];
}

/**
 * Build the cross-source identity used to recognise the SAME real operation
 * imported via different sources (CSV vs API), which carry different ExternalIDs.
 * Returns null when there is nothing to match on (then it is never a duplicate).
 * `identityType` is the EventType, or the reward family for reward types.
 */
function buildIdentity(
  identityType: string,
  asset: string | null,
  amount: number | null,
  side: string,
  fee: number,
  occurredAt: Date,
): EventIdentity | null {
  if (asset === null || amount === null || !Number.isFinite(amount)) return null;
  const timeKey = DAY_GRANULARITY_TYPES.has(identityType)
    ? occurredAt.toISOString().slice(0, 10) // YYYY-MM-DD (UTC)
    : String(Math.floor(occurredAt.getTime() / 1000));
  const gross = Number.isFinite(fee) && fee > 0 ? amount + fee : amount;
  const amounts = gross !== amount ? [amount, gross] : [amount];
  return { bucket: `${identityType}|${asset}|${side}|${timeKey}`, amounts };
}

/**
 * Identity of a raw payload, for a stored row and for a candidate alike.
 * Reward endpoints name the credited quantity differently: `rewards` (Simple
 * Earn Flexible), `distributeAmount` (ETH staking, where `amount` is the ETH
 * staked) and `amount` (everything else, including the CSV `dividend` rows).
 */
function identityFromPayload(
  eventType: string,
  payload: Record<string, unknown>,
  occurredAt: Date,
): EventIdentity | null {
  const detail = payload.detail as Record<string, unknown> | undefined;
  const isReward = REWARD_EVENT_TYPES.has(eventType);
  const assetRaw = payload.symbol ?? payload.asset ?? payload.coin ?? payload.fromAsset ?? detail?.fromAsset ?? null;
  const amountRaw = isReward
    ? (payload.rewards ?? payload.distributeAmount ?? payload.amount ?? null)
    : (payload.qty ?? payload.amount ?? payload.fromAmount ?? detail?.amount ?? null);
  const side = payload.isBuyer == null ? '' : String(payload.isBuyer);
  const fee = Number(payload.transactionFee ?? 0);
  return buildIdentity(
    isReward ? REWARD_IDENTITY_FAMILY : eventType,
    assetRaw == null ? null : String(assetRaw),
    amountRaw == null ? null : Number(amountRaw),
    side,
    fee,
    occurredAt,
  );
}

/** Numeric closeness with relative tolerance (robust to float representation). */
function closeAmount(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(Math.abs(a), 1) * 1e-9;
}

/** Every CSV importer stamps `csvSource: true`; API payloads never carry it. */
function isCsvPayload(payload: Record<string, unknown>): boolean {
  return payload.csvSource === true;
}

/**
 * The market spellings a spot fill is filed and looked up under, per second.
 * A CSV importer knows both coins but writes the acquired one first, so a sell
 * reads inverted (PLNBTC for a BTCPLN sell): it is filed under both orders. An
 * API fill is filed under its market symbol as Binance spells it, with no need
 * to split it into coins (a quote missing from the known suffixes would not
 * split). Two markets that share a second and a size stay apart. A fill with
 * neither is never matched by second: it is kept.
 */
function spotSecondKeys(occurredAt: Date, payload: Record<string, unknown>): string[] {
  const second = Math.floor(occurredAt.getTime() / 1000);
  const { baseAsset, quoteAsset, symbol } = payload;
  const spellings =
    typeof baseAsset === 'string' && typeof quoteAsset === 'string'
      ? [`${baseAsset}${quoteAsset}`, `${quoteAsset}${baseAsset}`]
      : typeof symbol === 'string'
        ? [symbol]
        : [];
  return Array.from(new Set(spellings), (spelling) => `${second}|${spelling}`);
}

/** qty and quoteQty of a spot payload, skipping the ones that are absent. */
function spotQuantities(payload: Record<string, unknown>): number[] {
  return [payload.qty, payload.quoteQty]
    .filter((value) => value != null && value !== '')
    .map(Number)
    .filter(Number.isFinite);
}

/**
 * One stored row, as the cross-source filter sees it. Every key the row is
 * filed under (its bucket and each of its spot second keys) refers to this
 * same object, so a candidate paired with it through any key uses it up for
 * all of them: one stored row absorbs at most one candidate.
 */
interface StoredOperation {
  fromCsv: boolean;
  consumed: boolean;
}

// A stored row under one key, with the amounts that key compares: the
// identity amounts in a bucket, qty and quoteQty under a spot second key.
interface FiledOperation {
  operation: StoredOperation;
  amounts: number[];
}

/**
 * What the user already has stored, keyed for cross-source matching. Load it
 * once per CSV import or sync job with `loadCrossSourceIndex` and pass every
 * batch of candidates through `dropCrossSourceDuplicates`. Filtering marks
 * the stored rows it pairs with candidates, so an index serves one job only.
 */
export interface CrossSourceIndex {
  byBucket: Map<string, FiledOperation[]>;
  // second|market -> spot fills stored in that second, to catch a CSV spot
  // trade exported with the INVERTED symbol (base↔quote swapped) that
  // duplicates an API order at the same second — its symbol/side differ so the
  // bucket misses it. See spotSecondKeys for how each side is filed.
  spotBySecond: Map<string, FiledOperation[]>;
  // `EventType|ExternalID` of every stored row. A candidate with one of these
  // ids is that row, which the UNIQUE key absorbs on insert.
  storedIds: Map<string, StoredOperation>;
  // `EventType|ExternalID` that today's reward id builder gives to rewards
  // stored under an earlier, position-based id. The API sends those rewards
  // again under the current id, which the UNIQUE constraint cannot relate to
  // the stored one.
  rewardsStoredUnderOtherId: Map<string, StoredOperation>;
  // `EventType|ExternalID` of every candidate already filtered with this
  // index, and whether it was kept.
  decided: Map<string, boolean>;
}

interface IndexRow {
  EventType: string;
  ExternalID: string;
  ms: string;
  // Only for rewards stored under an id today's builder would not give them.
  RewardPayload: Record<string, unknown> | null;
  // One `payload_<key>` column per IDENTITY_PAYLOAD_KEYS entry.
  [payloadColumn: string]: unknown;
}

/**
 * The identity keys of a stored row, as an object. A key the payload lacks, or
 * holds as JSON null, is left out: the identity reads both as absent.
 */
function payloadOf(row: IndexRow): Record<string, unknown> {
  return Object.fromEntries(
    IDENTITY_PAYLOAD_KEYS.map((key): [string, unknown] => [key, row[`${PAYLOAD_COLUMN_PREFIX}${key}`]]).filter(
      ([, value]) => value != null,
    ),
  );
}

function idKey(eventType: string, externalId: string): string {
  return `${eventType}|${externalId}`;
}

function fileOperation(map: Map<string, FiledOperation[]>, key: string, filed: FiledOperation): void {
  const entries = map.get(key);
  if (entries) entries.push(filed);
  else map.set(key, [filed]);
}

export async function loadCrossSourceIndex(userId: number): Promise<CrossSourceIndex> {
  // The full payload of a reward is only read to recompute the id of one
  // stored under an earlier id, so rows whose ExternalID already has today's
  // format are filtered out in SQL instead of shipped on every job.
  const rows = await query<IndexRow>(
    `SELECT "EventType",
            "ExternalID",
            ${IDENTITY_PAYLOAD_COLUMNS_SQL},
            (EXTRACT(EPOCH FROM "OccurredAt") * 1000)::bigint::text AS ms,
            CASE WHEN "EventType" = ANY($2::text[])
                  AND ("EventType" || ':' || "ExternalID") !~ $3
                 THEN "RawPayload" END AS "RewardPayload"
       FROM "CryptoRawEvents"
      WHERE "UserID" = $1`,
    [userId, REWARD_ID_EVENT_TYPES, CURRENT_REWARD_ID_PATTERN],
  );

  const index: CrossSourceIndex = {
    byBucket: new Map(),
    spotBySecond: new Map(),
    storedIds: new Map(),
    rewardsStoredUnderOtherId: new Map(),
    decided: new Map(),
  };
  rows.forEach((row) => {
    const payload = payloadOf(row);
    const occurredAt = new Date(Number(row.ms));
    const operation: StoredOperation = { fromCsv: isCsvPayload(payload), consumed: false };
    index.storedIds.set(idKey(row.EventType, row.ExternalID), operation);
    if (row.EventType === CRYPTO_EVENT_TYPE.SPOT_TRADE) {
      const amounts = spotQuantities(payload);
      spotSecondKeys(occurredAt, payload).forEach((key) => {
        fileOperation(index.spotBySecond, key, { operation, amounts });
      });
    }
    const identity = identityFromPayload(row.EventType, payload, occurredAt);
    if (identity !== null) fileOperation(index.byBucket, identity.bucket, { operation, amounts: identity.amounts });
    if (isRewardEventType(row.EventType) && row.RewardPayload !== null) {
      const currentId = rewardExternalId(row.EventType, row.RewardPayload);
      if (currentId !== row.ExternalID) index.rewardsStoredUnderOtherId.set(idKey(row.EventType, currentId), operation);
    }
  });
  return index;
}

/**
 * The answer for a candidate the index knows by its id, before any amount is
 * compared; undefined when it does not know it.
 * - Filtered earlier with this index: the same answer again. A later task of
 *   the job that fetches the same event must neither store what was dropped
 *   nor use up a second stored row.
 * - An API reward stored under its earlier id: dropped, since the UNIQUE key
 *   cannot relate the two ids. It uses that row up.
 * - Stored under its own id: kept, for the UNIQUE key to absorb. It uses its
 *   row up, so no other candidate is paired with it.
 */
function decisionById(index: CrossSourceIndex, input: RawEventInput): boolean | undefined {
  const key = idKey(input.eventType, input.externalId);
  const earlier = index.decided.get(key);
  if (earlier !== undefined) return earlier;
  const stored = index.storedIds.get(key);
  const storedUnderOtherId =
    !isCsvPayload(input.rawPayload) && isRewardEventType(input.eventType)
      ? index.rewardsStoredUnderOtherId.get(key)
      : undefined;
  [stored, storedUnderOtherId].forEach((operation) => {
    if (operation) operation.consumed = true;
  });
  if (storedUnderOtherId) return false;
  return stored ? true : undefined;
}

/**
 * Whether a candidate may be paired with a stored row still unused. A CSV
 * candidate is compared with every stored row: an overlapping export gives
 * the fills of a busy second other position-based ids, and only the amounts
 * recognise them. An API candidate is compared with CSV rows only: two API
 * fills of one second, side and size are two trades with two ids, and the
 * UNIQUE key already absorbs a re-fetch.
 */
function mayPair(operation: StoredOperation, candidateFromCsv: boolean): boolean {
  return !operation.consumed && (candidateFromCsv || operation.fromCsv);
}

function matchesAny(stored: number[], amounts: number[]): boolean {
  return amounts.some((amount) => stored.some((existing) => closeAmount(existing, amount)));
}

/**
 * Uses up the first stored row the candidate may be paired with whose amounts
 * match, looked up through the candidate's bucket, then for a dust conversion
 * through the buckets of the seconds around it (CRYPTO_DUST_SECOND_TOLERANCE), and for
 * a spot fill through its second keys. Returns whether one was found.
 */
function claimStoredTwin(index: CrossSourceIndex, input: RawEventInput): boolean {
  const fromCsv = isCsvPayload(input.rawPayload);
  const identity = identityFromPayload(input.eventType, input.rawPayload, input.occurredAt);
  const lookups: Array<{ filed: FiledOperation[] | undefined; amounts: number[] }> =
    identity === null ? [] : [{ filed: index.byBucket.get(identity.bucket), amounts: identity.amounts }];
  if (identity !== null && input.eventType === CRYPTO_EVENT_TYPE.DUST) {
    // The bucket ends in the whole second: only that suffix changes.
    const prefix = identity.bucket.slice(0, identity.bucket.lastIndexOf('|') + 1);
    const second = Math.floor(input.occurredAt.getTime() / 1000);
    DUST_NEARBY_SECOND_OFFSETS.forEach((offset) => {
      lookups.push({ filed: index.byBucket.get(`${prefix}${second + offset}`), amounts: identity.amounts });
    });
  }
  if (input.eventType === CRYPTO_EVENT_TYPE.SPOT_TRADE) {
    const quantities = spotQuantities(input.rawPayload);
    spotSecondKeys(input.occurredAt, input.rawPayload).forEach((key) => {
      lookups.push({ filed: index.spotBySecond.get(key), amounts: quantities });
    });
  }
  const twin = lookups.reduce<StoredOperation | undefined>(
    (found, { filed, amounts }) =>
      found ??
      filed?.find((entry) => mayPair(entry.operation, fromCsv) && matchesAny(entry.amounts, amounts))?.operation,
    undefined,
  );
  if (twin === undefined) return false;
  twin.consumed = true;
  return true;
}

/**
 * Drop candidates whose operation is already stored under a different
 * source/ExternalID: a CSV row the API sync already brought in, the other way
 * round, or a fill an overlapping CSV export stored under another id. Matches
 * on EventType (or the reward family) + asset + side, a per-type timestamp
 * (exact second; within CRYPTO_DUST_SECOND_TOLERANCE seconds for dust; same UTC day
 * for deposit/withdraw) and the amount
 * (allowing the withdrawal network fee). An API reward is also dropped when
 * the same reward is stored under its earlier position-based id, matched
 * exactly on the id both would get today. Returns the events to keep plus how
 * many were skipped as duplicates.
 *
 * Matching is one-to-one: a stored row absorbs at most one candidate. Two
 * fills of the same second, side and size are two trades, so a stored row
 * that matches both stands for one of them and the other is kept. Candidates
 * the index knows by id claim their own row first, before any amount is
 * compared, so which candidate a stored row goes to does not depend on the
 * order of the batch. A kept candidate is not added as a row later candidates
 * could be paired with: two alike candidates of one file are two fills, and an
 * API candidate never pairs with API rows.
 *
 * Dedup is intentionally source-agnostic: a Kraken/Coinbase CSV that overlaps
 * a Binance API window is matched on the operation identity, not the exchange.
 */
export function dropCrossSourceDuplicates(
  index: CrossSourceIndex,
  inputs: RawEventInput[],
): { kept: RawEventInput[]; skipped: number } {
  const byId = inputs.map((input) => decisionById(index, input));
  const kept = inputs.filter((input, position) => {
    const key = idKey(input.eventType, input.externalId);
    const keep = byId[position] ?? index.decided.get(key) ?? !claimStoredTwin(index, input);
    index.decided.set(key, keep);
    return keep;
  });
  return { kept, skipped: inputs.length - kept.length };
}

/**
 * What filtering with an index has decided that the stored rows cannot tell a
 * fresh index: the `EventType|ExternalID` of every candidate dropped, and of
 * every stored CSV row a candidate used up. A sync job that runs in rounds
 * loads a new index each round; without these, a later round would pair a
 * second API event with a CSV row an earlier round already paired, and an
 * event met again would get a different answer (see decisionById).
 *
 * Kept candidates need nothing: stored ones come back as rows, and one whose
 * insert failed finds no twin again, since rows are only ever used up. Used-up
 * rows that are not CSV are left out: a sync filters API events, which pair
 * with CSV rows only.
 */
export interface CrossSourceCarryOver {
  dropped: string[];
  consumed: string[];
}

export function exportCrossSourceCarryOver(index: CrossSourceIndex): CrossSourceCarryOver {
  return {
    dropped: Array.from(index.decided.entries())
      .filter(([, keep]) => !keep)
      .map(([key]) => key),
    consumed: Array.from(index.storedIds.entries())
      .filter(([, operation]) => operation.consumed && operation.fromCsv)
      .map(([key]) => key),
  };
}

/** Applies an earlier round's decisions to an index loaded for this round. */
export function restoreCrossSourceCarryOver(index: CrossSourceIndex, carryOver: CrossSourceCarryOver): void {
  carryOver.dropped.forEach((key) => {
    index.decided.set(key, false);
  });
  carryOver.consumed.forEach((key) => {
    const operation = index.storedIds.get(key);
    if (operation) operation.consumed = true;
  });
}

/** One-shot form for the CSV upload: load the index and filter one batch. */
export async function filterCrossSourceDuplicates(
  userId: number,
  inputs: RawEventInput[],
): Promise<{ kept: RawEventInput[]; skipped: number }> {
  if (inputs.length === 0) return { kept: [], skipped: 0 };
  return dropCrossSourceDuplicates(await loadCrossSourceIndex(userId), inputs);
}

/**
 * Highest Binance trade id stored per spot symbol by the API sync, for an
 * incremental sync to resume each myTrades walk right after it. One query for
 * every symbol of the job.
 *
 * Only rows the API stored count: their payload is the myTrades fill, whose
 * `id` is the symbol's trade sequence. CSV rows are excluded by `csvSource`
 * (and carry no `id` today); an id from any other sequence would make the walk
 * skip real fills. The regex keeps the numeric cast from failing on a payload
 * that is not a myTrades fill.
 */
export async function loadLastApiTradeIds(userId: number): Promise<Map<string, number>> {
  const rows = await query<{ Symbol: string; LastTradeID: string }>(
    `SELECT "RawPayload"->>'symbol' AS "Symbol",
            MAX(("RawPayload"->>'id')::numeric)::text AS "LastTradeID"
       FROM "CryptoRawEvents"
      WHERE "UserID" = $1
        AND "EventType" = $2
        AND "Source" = $3
        AND ("RawPayload"->>'csvSource') IS DISTINCT FROM 'true'
        AND "RawPayload"->>'symbol' IS NOT NULL
        AND "RawPayload"->>'id' ~ '^[0-9]+$'
      GROUP BY "RawPayload"->>'symbol'`,
    [userId, CRYPTO_EVENT_TYPE.SPOT_TRADE, CRYPTO_EXCHANGE.BINANCE],
  );
  return new Map(
    rows
      .map((row): [string, number] => [row.Symbol, Number(row.LastTradeID)])
      .filter(([, id]) => Number.isSafeInteger(id)),
  );
}

/**
 * Page of events for the authenticated user, optionally filtered by EventType,
 * date range and asset. Used by the /crypto movements table.
 *
 * Spot trades are collapsed into one logical row per Binance order (grouped by
 * symbol + orderId + side) so the user sees "Buy 0.03958 BTC @ avg price"
 * instead of one row per partial fill. Grouping happens in SQL so pagination
 * and the total count stay correct across pages. Rows without an orderId fall
 * back to grouping by their own EventID, i.e. they stay ungrouped.
 *
 * The asset filter matches the coin across every payload shape (spot symbol
 * prefix/suffix, .asset, .coin, convert from/to, dust detail, card purchase).
 */
export async function listRawEvents(filters: {
  eventType?: CryptoEventType;
  from?: Date;
  to?: Date;
  asset?: string;
  limit: number;
  offset: number;
}): Promise<{ events: CryptoRawEvent[]; total: number }> {
  const userId = await getUserIdOrThrow();
  const conditions = ['"UserID" = $1'];
  const params: unknown[] = [userId];
  let paramIdx = 2;

  if (filters.eventType) {
    conditions.push(`"EventType" = $${paramIdx}`);
    params.push(filters.eventType);
    paramIdx++;
  }
  if (filters.from) {
    conditions.push(`"OccurredAt" >= $${paramIdx}`);
    params.push(filters.from.toISOString());
    paramIdx++;
  }
  if (filters.to) {
    conditions.push(`"OccurredAt" <= $${paramIdx}`);
    params.push(filters.to.toISOString());
    paramIdx++;
  }
  if (filters.asset) {
    const a = `$${paramIdx}`;
    conditions.push(
      `(("EventType" = 'spot_trade' AND ("RawPayload"->>'symbol' LIKE ${a} || '%' OR "RawPayload"->>'symbol' LIKE '%' || ${a}))
        OR "RawPayload"->>'asset' = ${a}
        OR "RawPayload"->>'coin' = ${a}
        OR "RawPayload"->>'fromAsset' = ${a}
        OR "RawPayload"->>'toAsset' = ${a}
        OR "RawPayload"->>'cryptoCurrency' = ${a}
        OR "RawPayload"->'detail'->>'fromAsset' = ${a}
        OR "RawPayload"->'detail'->>'targetAsset' = ${a})`,
    );
    params.push(filters.asset);
    paramIdx++;
  }

  const where = conditions.join(' AND ');

  // CTE shared by the data and count queries: spot fills collapsed per order,
  // every other event passed through unchanged, then merged into one stream.
  const cte = `
    WITH base AS (
      SELECT "EventID", "UserID", "Source", "EventType", "ExternalID", "OccurredAt", "RawPayload", "IngestedAt", "JobID"
      FROM "CryptoRawEvents"
      WHERE ${where}
    ),
    spot_grouped AS (
      SELECT
        MIN("EventID"::bigint)::text AS "EventID",
        MIN("UserID") AS "UserID",
        MAX("Source") AS "Source",
        'spot_trade'::text AS "EventType",
        (MAX("RawPayload"->>'symbol') || '-' || COALESCE(MAX("RawPayload"->>'orderId'), '')) AS "ExternalID",
        MAX("OccurredAt") AS "OccurredAt",
        jsonb_build_object(
          'symbol', MAX("RawPayload"->>'symbol'),
          'orderId', MAX("RawPayload"->>'orderId'),
          'isBuyer', bool_or(("RawPayload"->>'isBuyer')::boolean),
          'qty', SUM(("RawPayload"->>'qty')::numeric)::text,
          'quoteQty', SUM(("RawPayload"->>'quoteQty')::numeric)::text,
          'fills', COUNT(*)
        ) AS "RawPayload",
        MAX("IngestedAt") AS "IngestedAt",
        NULL::int AS "JobID"
      FROM base
      WHERE "EventType" = 'spot_trade'
      GROUP BY
        "RawPayload"->>'symbol',
        COALESCE("RawPayload"->>'orderId', "EventID"::text),
        ("RawPayload"->>'isBuyer')::boolean
    ),
    others AS (
      SELECT "EventID"::text AS "EventID", "UserID", "Source", "EventType"::text AS "EventType",
             "ExternalID"::text AS "ExternalID", "OccurredAt", "RawPayload", "IngestedAt", "JobID"
      FROM base
      WHERE "EventType" <> 'spot_trade'
    ),
    unioned AS (
      SELECT * FROM spot_grouped
      UNION ALL
      SELECT * FROM others
    )`;

  const [eventRows, countRows] = await Promise.all([
    query<RawEventRow>(
      `${cte}
       SELECT "EventID", "UserID", "Source", "EventType", "ExternalID", "OccurredAt", "RawPayload", "IngestedAt", "JobID"
       FROM unioned
       ORDER BY "OccurredAt" DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, filters.limit, filters.offset],
    ),
    query<{ total: number }>(`${cte} SELECT COUNT(*)::int AS total FROM unioned`, params),
  ]);

  return {
    events: eventRows.map(rowToEvent),
    total: countRows[0]?.total ?? 0,
  };
}

/**
 * Distinct list of coins the user has interacted with, for the movements asset
 * filter. Combines direct asset/coin fields (via SQL) with the base/quote
 * assets parsed out of spot-trade symbols (via `splitSymbol`), deduped and
 * sorted alphabetically.
 */
export async function listUserAssets(): Promise<string[]> {
  const userId = await getUserIdOrThrow();
  const rows = await query<{ kind: 'asset' | 'symbol'; value: string | null }>(
    `SELECT DISTINCT 'asset' AS kind, val AS value FROM (
       SELECT "RawPayload"->>'asset' AS val FROM "CryptoRawEvents"
         WHERE "UserID" = $1 AND "EventType" IN ('dividend','earn_flex','earn_locked','staking_interest','eth_staking')
       UNION ALL SELECT "RawPayload"->>'coin' FROM "CryptoRawEvents"
         WHERE "UserID" = $1 AND "EventType" IN ('deposit','withdraw')
       UNION ALL SELECT "RawPayload"->'detail'->>'fromAsset' FROM "CryptoRawEvents"
         WHERE "UserID" = $1 AND "EventType" = 'dust'
       UNION ALL SELECT "RawPayload"->'detail'->>'targetAsset' FROM "CryptoRawEvents"
         WHERE "UserID" = $1 AND "EventType" = 'dust'
       UNION ALL SELECT "RawPayload"->>'fromAsset' FROM "CryptoRawEvents"
         WHERE "UserID" = $1 AND "EventType" = 'convert'
       UNION ALL SELECT "RawPayload"->>'toAsset' FROM "CryptoRawEvents"
         WHERE "UserID" = $1 AND "EventType" = 'convert'
       UNION ALL SELECT "RawPayload"->>'cryptoCurrency' FROM "CryptoRawEvents"
         WHERE "UserID" = $1 AND "EventType" = 'fiat_payment'
     ) direct
     UNION
     SELECT DISTINCT 'symbol' AS kind, "RawPayload"->>'symbol' AS value
       FROM "CryptoRawEvents" WHERE "UserID" = $1 AND "EventType" = 'spot_trade'`,
    [userId],
  );

  const assets = new Set<string>();
  rows.forEach((row) => {
    if (!row.value) return;
    if (row.kind === 'symbol') {
      const split = splitSymbol(row.value);
      if (split) {
        assets.add(split.base);
        assets.add(split.quote);
      } else {
        assets.add(row.value);
      }
    } else {
      assets.add(row.value);
    }
  });

  return Array.from(assets).sort((a, b) => a.localeCompare(b));
}

/**
 * Most recent OccurredAt for the user's raw events, used to compute the
 * starting point of an incremental sync (so we don't re-fetch already-ingested
 * windows).
 */
export async function getLastIngestedAt(eventType?: CryptoEventType): Promise<Date | null> {
  const userId = await getUserIdOrThrow();
  const params: unknown[] = [userId];
  let where = '"UserID" = $1';
  if (eventType) {
    where += ' AND "EventType" = $2';
    params.push(eventType);
  }

  const rows = await query<{ MaxOccurredAt: string | null }>(
    `SELECT MAX("OccurredAt") AS "MaxOccurredAt" FROM "CryptoRawEvents" WHERE ${where}`,
    params,
  );
  const max = rows[0]?.MaxOccurredAt;
  return max ? new Date(max) : null;
}

export async function countRawEventsForUser(): Promise<number> {
  const userId = await getUserIdOrThrow();
  const rows = await query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM "CryptoRawEvents" WHERE "UserID" = $1`,
    [userId],
  );
  return rows[0]?.total ?? 0;
}

/**
 * Returns the union of every asset/coin code already seen in the user's raw
 * events (across dividend, dust, deposit, withdraw, earn_*, staking_*).
 *
 * Used by the spot-trade discovery to seed candidate symbols with assets the
 * user has interacted with — even if they no longer hold a balance and the
 * coin was an obscure airdrop not on the top-altcoin fallback list.
 */
export async function listInteractedAssetsForUser(userId: number): Promise<string[]> {
  const rows = await query<{ asset: string | null }>(
    `SELECT DISTINCT asset FROM (
       -- dividend / earn_* / staking_interest store the asset under .asset
       SELECT "RawPayload"->>'asset' AS asset
         FROM "CryptoRawEvents"
         WHERE "UserID" = $1
           AND "EventType" IN ('dividend', 'earn_flex', 'earn_locked', 'staking_interest', 'eth_staking')
       UNION
       -- deposit / withdraw use .coin
       SELECT "RawPayload"->>'coin' AS asset
         FROM "CryptoRawEvents"
         WHERE "UserID" = $1
           AND "EventType" IN ('deposit', 'withdraw')
       UNION
       -- dust nests fromAsset inside .detail
       SELECT "RawPayload"->'detail'->>'fromAsset' AS asset
         FROM "CryptoRawEvents"
         WHERE "UserID" = $1 AND "EventType" = 'dust'
       UNION
       -- convert tradeFlow uses fromAsset/toAsset at the top level
       SELECT "RawPayload"->>'fromAsset' AS asset
         FROM "CryptoRawEvents"
         WHERE "UserID" = $1 AND "EventType" = 'convert'
       UNION
       SELECT "RawPayload"->>'toAsset' AS asset
         FROM "CryptoRawEvents"
         WHERE "UserID" = $1 AND "EventType" = 'convert'
     ) t
     WHERE asset IS NOT NULL AND asset != ''`,
    [userId],
  );
  return rows.map((r) => r.asset).filter((a): a is string => !!a);
}
