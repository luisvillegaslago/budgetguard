/**
 * Wrapper around the `binance` SDK (tiagosiebler) used by Phase 1+2 of the
 * crypto module.
 *
 * Provides:
 *  - validatePermissions()         — Phase 1: rejects keys with write access
 *  - WeightTracker                 — Phase 2: per-instance budget
 *  - withRetry()                   — Phase 2: exponential backoff for 429/418
 *  - fetch{X}()                    — Phase 2: thin wrappers around the 13 sync
 *                                    endpoints, returning RawEventInput[] with
 *                                    derived externalId + occurredAt
 *
 * Each fetch helper consumes one Binance API window (caller decides bounds and
 * iterates). They never throw on empty responses.
 */

import { EventEmitter } from 'node:events';
import { MainClient } from 'binance';
import {
  API_ERROR,
  BINANCE_RETRY_BASE_MS,
  BINANCE_RETRY_MAX_ATTEMPTS,
  BINANCE_RETRY_MAX_MS,
  BINANCE_WEIGHT_LIMIT,
  BINANCE_WEIGHT_THRESHOLD,
  CRYPTO_EVENT_TYPE,
  type CryptoEventType,
} from '@/constants/finance';
import type { RawEventInput } from '@/services/database/BinanceRawEventsRepository';

export interface BinanceCredentials {
  apiKey: string;
  apiSecret: string;
}

export interface BinanceKeyPermissions {
  ipRestrict: boolean;
  enableReading: boolean;
  enableWithdrawals: boolean;
  enableInternalTransfer: boolean;
  enableMargin: boolean;
  enableFutures: boolean;
  enableSpotAndMarginTrading: boolean;
  enableVanillaOptions: boolean;
  permitsUniversalTransfer: boolean;
  createTime: number;
}

export class BinanceClientError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly cause?: unknown,
    public readonly binanceCode?: number,
  ) {
    super(code);
    this.name = 'BinanceClientError';
  }
}

/**
 * Sentinel: thrown by fetch helpers when the called Binance endpoint reports
 * an "Invalid symbol" / "no permission to access symbol" 400. The caller
 * (BinanceSyncService) treats these as an empty result instead of a fatal
 * error, since they happen routinely while probing candidate trading pairs.
 */
export const BINANCE_INVALID_SYMBOL_CODE = -1121;
export const BINANCE_INVALID_PARAM_CODE = -1100;
export const BINANCE_NO_TRADING_PERMISSION_CODE = -2010;

// ============================================================
// WeightTracker — naive in-memory token bucket per BinanceClient instance
// ============================================================

class WeightTracker {
  private used = 0;
  private windowStart = Date.now();

  observe(weightUsedHeader: string | number | undefined): void {
    if (weightUsedHeader == null) return;
    const num = typeof weightUsedHeader === 'string' ? Number(weightUsedHeader) : weightUsedHeader;
    if (!Number.isFinite(num)) return;
    this.used = num;
  }

  /**
   * Awaits if the next call would exceed the threshold. Resets the counter
   * after the per-minute window ends.
   */
  async throttle(): Promise<void> {
    const now = Date.now();
    if (now - this.windowStart >= 60_000) {
      this.windowStart = now;
      this.used = 0;
      return;
    }
    if (this.used < BINANCE_WEIGHT_THRESHOLD) return;

    const waitMs = 60_000 - (now - this.windowStart);
    await sleep(waitMs);
    this.windowStart = Date.now();
    this.used = 0;
  }
}

// ============================================================
// BinanceClient
// ============================================================

// Bump the global EventEmitter listener cap once per process. The Binance
// SDK adds error/close listeners to the same TLS socket on every keep-alive
// reuse; the default 10 trips the warning during a parallel sync. With the
// extended discovery (TOP_ALTCOIN_BASES + getBalances + DB) we now generate
// 400+ candidate symbols per sync, so we cap at 500 to leave headroom while
// still catching genuine listener leaks.
let listenersBumped = false;
function bumpListenerLimitOnce(): void {
  if (listenersBumped) return;
  EventEmitter.defaultMaxListeners = Math.max(EventEmitter.defaultMaxListeners, 500);
  listenersBumped = true;
}

export class BinanceClient {
  private readonly client: MainClient;
  private readonly weight = new WeightTracker();

  constructor(credentials: BinanceCredentials) {
    bumpListenerLimitOnce();
    this.client = new MainClient({
      api_key: credentials.apiKey,
      api_secret: credentials.apiSecret,
      beautifyResponses: true,
    });
  }

  // ----------------------------------------------------------
  // Phase 1 — permissions
  // ----------------------------------------------------------

  async validatePermissions(): Promise<BinanceKeyPermissions> {
    const permissions = await this.fetchPermissions();
    if (
      permissions.enableWithdrawals ||
      permissions.enableSpotAndMarginTrading ||
      permissions.enableFutures ||
      permissions.enableMargin
    ) {
      throw new BinanceClientError(API_ERROR.CRYPTO.UNSAFE_PERMISSIONS);
    }
    if (!permissions.enableReading) {
      throw new BinanceClientError(API_ERROR.CRYPTO.UNSAFE_PERMISSIONS);
    }
    return permissions;
  }

  private async fetchPermissions(): Promise<BinanceKeyPermissions> {
    return this.withRetry(async () => {
      const raw = await this.client.getApiKeyPermissions();
      return {
        ipRestrict: Boolean(raw.ipRestrict),
        enableReading: Boolean(raw.enableReading),
        enableWithdrawals: Boolean(raw.enableWithdrawals),
        enableInternalTransfer: Boolean(raw.enableInternalTransfer),
        enableMargin: Boolean(raw.enableMargin),
        enableFutures: Boolean(raw.enableFutures),
        enableSpotAndMarginTrading: Boolean(raw.enableSpotAndMarginTrading),
        enableVanillaOptions: Boolean(raw.enableVanillaOptions),
        permitsUniversalTransfer: Boolean(raw.permitsUniversalTransfer),
        createTime: Number(raw.createTime ?? 0),
      };
    });
  }

  // ----------------------------------------------------------
  // Phase 2 — discovery
  // ----------------------------------------------------------

  /**
   * Returns the asset codes the user CURRENTLY holds (free + locked > 0).
   * Used as one of three discovery sources for spot trades.
   */
  async discoverHeldAssets(): Promise<string[]> {
    const account = await this.withRetry(() => this.client.getAccountInformation({}));
    const balances = (account?.balances ?? []) as Array<{ asset: string; free: string; locked: string }>;
    return balances.filter((b) => Number(b.free ?? 0) + Number(b.locked ?? 0) > 0).map((b) => b.asset);
  }

  /**
   * Returns every coin the user has ever interacted with according to
   * `getBalances` (a.k.a. `getAllCoinsInformation` in the Binance docs).
   *
   * Binance reports `free + locked + freeze + withdrawing + ipoable + ipoing
   * + storage > 0` for any coin that currently has any balance in any vault.
   * This catches assets parked in Earn/Staking/Vault that don't show up in
   * `getAccountInformation` (which only returns spot wallet balances).
   */
  async discoverAllInteractedAssets(): Promise<string[]> {
    const balances = await this.withRetry(() => this.client.getBalances());
    return toRecords(balances)
      .filter((b) => {
        const total =
          Number(b.free ?? 0) +
          Number(b.locked ?? 0) +
          Number(b.freeze ?? 0) +
          Number(b.withdrawing ?? 0) +
          Number(b.ipoable ?? 0) +
          Number(b.ipoing ?? 0) +
          Number(b.storage ?? 0);
        return total > 0 && typeof b.coin === 'string';
      })
      .map((b) => b.coin as string);
  }

  // ----------------------------------------------------------
  // Phase 2 — fetch helpers (one window each)
  // ----------------------------------------------------------

  /**
   * `GET /api/v3/myTrades` — fetch ALL trades for a symbol within [scopeFromMs,
   * scopeToMs], paginating with `fromId` instead of striding 24h windows.
   *
   * Strategy:
   *  1. First call: no `fromId`, no `startTime/endTime` → returns most recent
   *     1000 trades (or empty for unused pairs / -1121).
   *  2. While the latest page has 1000 entries AND its oldest trade is still
   *     ≥ scopeFromMs, paginate backwards using `fromId = oldest.id - 1000`.
   *  3. Filter the union by [scopeFromMs, scopeToMs] before returning.
   *
   * This collapses the previous "240 symbols × N days" of windowed calls down
   * to "1 call per inactive symbol + ⌈trades/1000⌉ calls per active symbol".
   */
  async fetchSpotTrades(symbol: string, scopeFromMs: number, scopeToMs: number): Promise<RawEventInput[]> {
    const allTrades: Array<Record<string, unknown>> = [];
    let nextFromId: number | undefined;
    const MAX_PAGES = 50; // Safety cap: 50 × 1000 = 50k trades per symbol

    for (let page = 0; page < MAX_PAGES; page++) {
      let pageTrades: Array<Record<string, unknown>> = [];
      try {
        const params: { symbol: string; limit: number; fromId?: number } = { symbol, limit: 1000 };
        if (nextFromId != null) params.fromId = nextFromId;
        const response = await this.withRetry(() => this.client.getAccountTradeList(params));
        pageTrades = toRecords(response);
      } catch (error) {
        if (isInvalidSymbolError(error)) return [];
        throw error;
      }

      if (pageTrades.length === 0) break;

      allTrades.push(...pageTrades);

      // Pagination only makes sense if the page is full AND the oldest
      // trade in it is still inside the scope.
      if (pageTrades.length < 1000) break;
      const oldestId = Number(pageTrades[0]?.id ?? 0);
      const oldestTime = Number(pageTrades[0]?.time ?? 0);
      if (!Number.isFinite(oldestId) || oldestId <= 0) break;
      if (oldestTime < scopeFromMs) break;

      nextFromId = Math.max(oldestId - 1000, 0);
    }

    return allTrades
      .filter((trade) => {
        const t = Number(trade.time);
        return t >= scopeFromMs && t <= scopeToMs;
      })
      .map((trade) => ({
        eventType: CRYPTO_EVENT_TYPE.SPOT_TRADE,
        externalId: `${symbol}-${String(trade.id)}`,
        occurredAt: new Date(Number(trade.time)),
        rawPayload: { symbol, ...trade },
      }));
  }

  /**
   * `GET /sapi/v1/convert/tradeFlow` — Binance Convert. ExternalID = orderId.
   *
   * The endpoint hard-caps `limit` at 100. We paginate by shrinking the time
   * window from the top: each call gives us up to 100 trades; if we hit the
   * cap we slide endTime back to (oldest.createTime - 1) and request again.
   */
  async fetchConvertTrades(startTimeMs: number, endTimeMs: number): Promise<RawEventInput[]> {
    const all: Array<Record<string, unknown>> = [];
    let cursorEnd = endTimeMs;
    const MAX_PAGES = 50; // 50 × 100 = 5k convert trades per window-set; safety cap

    for (let page = 0; page < MAX_PAGES; page++) {
      const response = await this.withRetry(() =>
        this.client.getConvertTradeHistory({
          startTime: startTimeMs,
          endTime: cursorEnd,
          limit: '100',
        }),
      );
      const list = toRecords(toRecord(response).list);
      if (list.length === 0) break;

      all.push(...list);

      if (list.length < 100) break;

      // Find the oldest trade in this page and slide cursorEnd just before it
      const oldest = list.reduce<Record<string, unknown> | null>((acc, item) => {
        const t = Number(item.createTime ?? 0);
        if (!acc) return item;
        return t < Number(acc.createTime ?? 0) ? item : acc;
      }, null);
      const oldestTime = Number(oldest?.createTime ?? 0);
      if (!Number.isFinite(oldestTime) || oldestTime <= startTimeMs) break;
      cursorEnd = oldestTime - 1;
    }

    return all.map((order) => ({
      eventType: CRYPTO_EVENT_TYPE.CONVERT,
      externalId: String(order.orderId),
      occurredAt: new Date(Number(order.createTime)),
      rawPayload: order,
    }));
  }

  async fetchFlexibleEarnRewards(startTimeMs: number, endTimeMs: number): Promise<RawEventInput[]> {
    const response = await this.withRetry(() =>
      this.client.getFlexibleRewardsHistory({
        type: 'ALL',
        startTime: startTimeMs,
        endTime: endTimeMs,
        size: 100,
      }),
    );
    const list = toRecords(toRecord(response).rows);
    return list.map((reward, idx) => ({
      eventType: CRYPTO_EVENT_TYPE.EARN_FLEX,
      externalId: `${reward.projectId ?? 'noproject'}-${String(reward.time)}-${reward.asset}-${idx}`,
      occurredAt: new Date(Number(reward.time)),
      rawPayload: reward,
    }));
  }

  async fetchLockedEarnRewards(startTimeMs: number, endTimeMs: number): Promise<RawEventInput[]> {
    const response = await this.withRetry(() =>
      this.client.getLockedRewardsHistory({
        startTime: startTimeMs,
        endTime: endTimeMs,
        size: 100,
      }),
    );
    const list = toRecords(toRecord(response).rows);
    return list.map((reward, idx) => ({
      eventType: CRYPTO_EVENT_TYPE.EARN_LOCKED,
      externalId: `${reward.positionId ?? 'noposition'}-${String(reward.time)}-${reward.asset}-${idx}`,
      occurredAt: new Date(Number(reward.time)),
      rawPayload: reward,
    }));
  }

  async fetchEthStakingRewards(startTimeMs: number, endTimeMs: number): Promise<RawEventInput[]> {
    const response = await this.withRetry(() =>
      this.client.getEthStakingHistory({
        startTime: startTimeMs,
        endTime: endTimeMs,
        size: 100,
      }),
    );
    const list = toRecords(toRecord(response).rows);
    return list.map((reward, idx) => ({
      eventType: CRYPTO_EVENT_TYPE.ETH_STAKING,
      externalId: `eth-${String(reward.time)}-${idx}`,
      occurredAt: new Date(Number(reward.time)),
      rawPayload: reward,
    }));
  }

  async fetchStakingInterest(startTimeMs: number, endTimeMs: number): Promise<RawEventInput[]> {
    const response = await this.withRetry(() =>
      this.client.getStakingHistory({
        product: 'STAKING',
        txnType: 'INTEREST',
        startTime: startTimeMs,
        endTime: endTimeMs,
        size: 100,
      }),
    );
    const list = toRecords(response);
    return list.map((row, idx) => ({
      eventType: CRYPTO_EVENT_TYPE.STAKING_INTEREST,
      externalId: `staking-${String(row.time)}-${row.asset}-${idx}`,
      occurredAt: new Date(Number(row.time)),
      rawPayload: row,
    }));
  }

  async fetchAssetDividends(startTimeMs: number, endTimeMs: number): Promise<RawEventInput[]> {
    const response = await this.withRetry(() =>
      this.client.getAssetDividendRecord({
        startTime: startTimeMs,
        endTime: endTimeMs,
        limit: 500,
      }),
    );
    const list = toRecords(toRecord(response).rows);
    return list.map((row) => ({
      eventType: CRYPTO_EVENT_TYPE.DIVIDEND,
      externalId: String(row.tranId),
      occurredAt: new Date(Number(row.divTime)),
      rawPayload: row,
    }));
  }

  async fetchDeposits(startTimeMs: number, endTimeMs: number): Promise<RawEventInput[]> {
    const list = await this.withRetry(() =>
      this.client.getDepositHistory({
        startTime: startTimeMs,
        endTime: endTimeMs,
        limit: 1000,
      }),
    );
    return toRecords(list).map((deposit, idx) => ({
      eventType: CRYPTO_EVENT_TYPE.DEPOSIT,
      externalId: String(deposit.txId ?? `dep-${deposit.insertTime}-${idx}`),
      occurredAt: new Date(Number(deposit.insertTime)),
      rawPayload: deposit,
    }));
  }

  async fetchWithdrawals(startTimeMs: number, endTimeMs: number): Promise<RawEventInput[]> {
    const list = await this.withRetry(() =>
      this.client.getWithdrawHistory({
        startTime: startTimeMs,
        endTime: endTimeMs,
        limit: 1000,
      }),
    );
    return toRecords(list).map((wd, idx) => ({
      eventType: CRYPTO_EVENT_TYPE.WITHDRAW,
      externalId: String(wd.id ?? wd.txId ?? `wd-${idx}`),
      occurredAt: new Date(String(wd.applyTime ?? '')),
      rawPayload: wd,
    }));
  }

  async fetchFiatOrders(startTimeMs: number, endTimeMs: number, transactionType: '0' | '1'): Promise<RawEventInput[]> {
    const response = await this.withRetry(() =>
      this.client.getFiatOrderHistory({
        transactionType,
        beginTime: startTimeMs,
        endTime: endTimeMs,
        rows: 500,
      }),
    );
    const list = toRecords(toRecord(response).data);
    return list.map((order) => ({
      eventType: CRYPTO_EVENT_TYPE.FIAT_ORDER,
      externalId: `${transactionType}-${String(order.orderNo)}`,
      occurredAt: new Date(Number(order.createTime)),
      rawPayload: { transactionType, ...order },
    }));
  }

  async fetchFiatPayments(
    startTimeMs: number,
    endTimeMs: number,
    transactionType: '0' | '1',
  ): Promise<RawEventInput[]> {
    const response = await this.withRetry(() =>
      this.client.getFiatPaymentsHistory({
        transactionType,
        beginTime: startTimeMs,
        endTime: endTimeMs,
        rows: 500,
      }),
    );
    const list = toRecords(toRecord(response).data);
    return list.map((payment) => ({
      eventType: CRYPTO_EVENT_TYPE.FIAT_PAYMENT,
      externalId: `${transactionType}-${String(payment.orderNo)}`,
      occurredAt: new Date(Number(payment.createTime)),
      rawPayload: { transactionType, ...payment },
    }));
  }

  async fetchDust(startTimeMs: number, endTimeMs: number): Promise<RawEventInput[]> {
    const response = await this.withRetry(() =>
      this.client.getDustLog({
        startTime: startTimeMs,
        endTime: endTimeMs,
      }),
    );
    const dribblets = toRecords(toRecord(response).userAssetDribblets);
    const events: RawEventInput[] = [];
    dribblets.forEach((dribblet) => {
      const details = toRecords(dribblet.userAssetDribbletDetails);
      details.forEach((detail) => {
        events.push({
          eventType: CRYPTO_EVENT_TYPE.DUST,
          externalId: String(detail.transId),
          occurredAt: new Date(Number(detail.operateTime)),
          rawPayload: { dribblet, detail },
        });
      });
    });
    return events;
  }

  async fetchC2CTrades(startTimeMs: number, endTimeMs: number, tradeType: 'BUY' | 'SELL'): Promise<RawEventInput[]> {
    const response = await this.withRetry(() =>
      this.client.getC2CTradeHistory({
        tradeType,
        startTimestamp: startTimeMs,
        endTimestamp: endTimeMs,
        rows: 100,
      }),
    );
    const data = toRecords(toRecord(response).data);
    return data.map((order) => ({
      eventType: CRYPTO_EVENT_TYPE.C2C,
      externalId: `${tradeType}-${String(order.orderNumber)}`,
      occurredAt: new Date(Number(order.createTime)),
      rawPayload: { tradeType, ...order },
    }));
  }

  // ----------------------------------------------------------
  // Retry / error mapping
  // ----------------------------------------------------------

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    await this.weight.throttle();

    let attempt = 0;
    let lastError: BinanceClientError | undefined;

    while (attempt < BINANCE_RETRY_MAX_ATTEMPTS) {
      try {
        const result = await fn();
        this.weight.observe(BINANCE_WEIGHT_LIMIT / BINANCE_RETRY_MAX_ATTEMPTS);
        return result;
      } catch (error) {
        const mapped = mapBinanceError(error);
        lastError = mapped;

        // Don't retry user-actionable errors:
        // - INVALID_SIGNATURE → key/secret/IP issue, won't fix itself
        // - UNSAFE_PERMISSIONS → won't fix itself
        // - Any non-rate-limit BinanceClientError that carries a binanceCode
        //   (typically Binance-domain validation errors, not transport).
        const isRetriable =
          mapped.code === API_ERROR.CRYPTO.RATE_LIMITED ||
          (mapped.code === API_ERROR.CRYPTO.EXCHANGE_UNAVAILABLE && mapped.binanceCode == null);

        if (!isRetriable) {
          throw mapped;
        }

        attempt++;
        // Rate-limit hits warrant a much longer backoff than transport errors —
        // Binance's IP ban for repeated -1003 hits escalates aggressively.
        const baseMs = mapped.code === API_ERROR.CRYPTO.RATE_LIMITED ? 30_000 : BINANCE_RETRY_BASE_MS;
        const delay = Math.min(baseMs * 2 ** (attempt - 1), BINANCE_RETRY_MAX_MS);
        await sleep(delay);
      }
    }

    throw lastError ?? new BinanceClientError(API_ERROR.CRYPTO.EXCHANGE_UNAVAILABLE);
  }
}

// ============================================================
// Helpers
// ============================================================

/**
 * Top ~40 most-traded altcoins on Binance Spot. Used as a default discovery
 * set for `myTrades` so users that have moved everything to stablecoins
 * still get their historical trades imported. Pairs that the user never
 * touched return empty (-1121) and are silently skipped by fetchSpotTrades.
 *
 * Trade-off: 40 base × 6 quotes = 240 candidate symbols. With Binance's
 * 6000 weight/min and weight=20 per myTrades call, a full backfill spanning
 * a year (365 windows × 240 symbols = 87.6k calls) takes ~5h. For multi-year
 * backfills the CSV import (Phase 5) is the supported escape hatch.
 */
const TOP_ALTCOIN_BASES = [
  'BTC',
  'ETH',
  'BNB',
  'SOL',
  'XRP',
  'ADA',
  'DOGE',
  'AVAX',
  'DOT',
  'MATIC',
  'LINK',
  'LTC',
  'BCH',
  'ATOM',
  'NEAR',
  'UNI',
  'AAVE',
  'XLM',
  'ALGO',
  'FIL',
  'ICP',
  'APT',
  'ARB',
  'OP',
  'INJ',
  'SUI',
  'TIA',
  'SEI',
  'PEPE',
  'SHIB',
  'WLD',
  'JUP',
  'STRK',
  'TAO',
  'FET',
  'RNDR',
  'IMX',
  'GRT',
  'SAND',
  'MANA',
];

const COMMON_QUOTE_FOR_PAIRS = ['USDT', 'BUSD', 'EUR', 'BTC', 'BNB', 'USDC'];

/**
 * Common pair candidates for a base asset. Generates `${base}${quote}` for
 * each quote in COMMON_QUOTE_FOR_PAIRS, excluding the self-pair.
 *
 * Important: BTC, BNB, USDT etc. are ALSO valid bases (BTCUSDT, BTCEUR,
 * BNBEUR, USDTUSDC…). Earlier versions short-circuited when the base was
 * itself a quote asset and lost ~80% of the user's spot trades.
 */
export function candidateSymbolsFor(baseAsset: string): string[] {
  return COMMON_QUOTE_FOR_PAIRS.filter((quote) => quote !== baseAsset).map((quote) => `${baseAsset}${quote}`);
}

/**
 * Return the union of (currently held assets) + (top altcoins) so the spot
 * trade sync covers historical activity even when the user has moved
 * everything to stablecoins.
 */
export function defaultSyncBaseAssets(heldAssets: string[]): string[] {
  const set = new Set<string>();
  heldAssets.forEach((a) => {
    set.add(a);
  });
  TOP_ALTCOIN_BASES.forEach((a) => {
    set.add(a);
  });
  return Array.from(set);
}

/**
 * Generate inclusive [start, end] windows of at most `windowDays` covering
 * [from, to]. Endpoints with strict 24h limits (myTrades) use windowDays=1.
 */
export function generateWindows(from: Date, to: Date, windowDays: number): Array<{ start: Date; end: Date }> {
  if (from.getTime() >= to.getTime()) return [];
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const totalMs = to.getTime() - from.getTime();
  const count = Math.ceil(totalMs / windowMs);

  return Array.from({ length: count }, (_, i) => {
    const start = new Date(from.getTime() + i * windowMs);
    const endCandidate = new Date(start.getTime() + windowMs - 1);
    const end = endCandidate.getTime() > to.getTime() ? to : endCandidate;
    return { start, end };
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Cast SDK responses to plain `Record<string, unknown>` shape.
 *
 * The Binance SDK ships strongly-typed return interfaces, but RawPayload is
 * intentionally an opaque JSONB blob. Forcing the cast through `unknown`
 * silences TS without losing the structural-typing guard everywhere else.
 */
function toRecord(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
}

function toRecords(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value as Array<Record<string, unknown>>;
}

// Binance internal codes that mean "back off, you're being rate-limited"
const BINANCE_RATE_LIMIT_CODES = new Set([
  -1003, // TOO_MANY_REQUESTS
  -1015, // TOO_MANY_NEW_ORDERS
]);

function mapBinanceError(error: unknown): BinanceClientError {
  const status = extractStatus(error);
  const binanceCode = extractBinanceCode(error);

  if (status === 401 || status === 403) {
    return new BinanceClientError(API_ERROR.CRYPTO.INVALID_SIGNATURE, status, error, binanceCode);
  }
  if (status === 429 || status === 418 || (binanceCode != null && BINANCE_RATE_LIMIT_CODES.has(binanceCode))) {
    return new BinanceClientError(API_ERROR.CRYPTO.RATE_LIMITED, status, error, binanceCode);
  }

  // Surface Binance-domain validation errors (-1121 invalid symbol, etc.) so
  // the caller can decide whether to swallow them silently or propagate.
  return new BinanceClientError(API_ERROR.CRYPTO.EXCHANGE_UNAVAILABLE, status, error, binanceCode);
}

function extractStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const obj = error as Record<string, unknown>;
  const candidates = [
    obj.statusCode,
    obj.status,
    obj.code,
    (obj.response as Record<string, unknown> | undefined)?.status,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && candidate >= 100 && candidate < 600) return candidate;
  }
  return undefined;
}

/**
 * Extract Binance's internal error code (e.g. -1121 = "Invalid symbol",
 * -2010 = "no permission to access symbol"). The SDK puts this either at the
 * top level (`error.code`) or inside `error.body.code`.
 */
function extractBinanceCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const obj = error as Record<string, unknown>;
  const direct = obj.code;
  // We also need to distinguish HTTP status from Binance code. Binance codes
  // are negative; HTTP statuses are 100-599.
  if (typeof direct === 'number' && direct < 0) return direct;

  const body = obj.body as Record<string, unknown> | undefined;
  if (body && typeof body.code === 'number') return body.code;

  const response = obj.response as Record<string, unknown> | undefined;
  const responseData = response?.data as Record<string, unknown> | undefined;
  if (responseData && typeof responseData.code === 'number') return responseData.code;

  return undefined;
}

export function isInvalidSymbolError(error: unknown): boolean {
  if (!(error instanceof BinanceClientError)) return false;
  return (
    error.binanceCode === BINANCE_INVALID_SYMBOL_CODE ||
    error.binanceCode === BINANCE_INVALID_PARAM_CODE ||
    error.binanceCode === BINANCE_NO_TRADING_PERMISSION_CODE
  );
}

// Re-export for tests/consumers
export type { CryptoEventType };
