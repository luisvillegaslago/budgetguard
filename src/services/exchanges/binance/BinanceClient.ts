/**
 * Wrapper around the `binance` SDK (tiagosiebler) used by Phase 1+2 of the
 * crypto module.
 *
 * Provides:
 *  - validatePermissions()         — Phase 1: rejects keys with write access
 *  - WeightTracker                 — Phase 2: per-instance budget
 *  - withRetry()                   — Phase 2: exponential backoff for 429/418,
 *                                    bounded by a sync round's cutoff
 *  - fetch{X}()                    — Phase 2: thin wrappers around the 13 sync
 *                                    endpoints, returning RawEventInput[] with
 *                                    derived externalId + occurredAt
 *
 * Each fetch helper consumes one Binance API window (caller decides bounds and
 * iterates). They never throw on empty responses.
 */

import { EventEmitter } from 'node:events';
import { MainClient } from 'binance';

// Bump Node's default max listener cap. The Binance SDK + price service
// fan out many concurrent HTTPS calls during a sync, each adding a
// transient `error` listener to the shared TLSSocket. Default is 10 →
// emits "MaxListenersExceededWarning" without breaking anything; bumping
// to 50 covers our largest backfills cleanly.
EventEmitter.defaultMaxListeners = 50;

import {
  API_ERROR,
  BINANCE_RETRY_BASE_MS,
  BINANCE_RETRY_MAX_ATTEMPTS,
  BINANCE_RETRY_MAX_MS,
  BINANCE_WEIGHT_LIMIT,
  BINANCE_WEIGHT_THRESHOLD,
  CRYPTO_EVENT_TYPE,
  CRYPTO_SYNC_FAILURE_KIND,
  CRYPTO_SYNC_TASK_FAILURE,
  type CryptoEventType,
  type CryptoSyncFailureKind,
} from '@/constants/finance';
import type { RawEventInput } from '@/services/database/CryptoRawEventsRepository';
import { rewardExternalId } from '@/services/exchanges/shared/rewardExternalId';
import {
  assertBeforeCutoff,
  raceCutoff,
  type SyncCutoff,
  SyncCutoffError,
} from '@/services/exchanges/shared/syncBudget';

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
 * A spot-trade walk that ran out of pages. It carries the fills walked so far:
 * every fill of the pair from the walk's start id up to its last page, in id
 * order, with no hole. Storing them lets the next incremental sync resume after
 * the newest one; dropping them left the pair walking the same pages into the
 * same cap on every run. `newestWalkedId` is the trade id of the last of them.
 */
export class SpotHistoryTruncatedError extends BinanceClientError {
  constructor(
    public readonly walkedEvents: RawEventInput[],
    public readonly newestWalkedId: number,
  ) {
    super(CRYPTO_SYNC_TASK_FAILURE.HISTORY_TRUNCATED);
    this.name = 'SpotHistoryTruncatedError';
  }
}

/** The events a failed task fetched before failing, to be stored like any others. */
export function eventsFetchedBeforeFailure(error: unknown): RawEventInput[] {
  return error instanceof SpotHistoryTruncatedError ? error.walkedEvents : [];
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

/**
 * "Invalid API-key, IP, or permissions for action." The SDK names this code
 * in its own error enum (WS_ERROR_CODE.INVALID_API_KEY_OR_IP_OR_PERMISSIONS in
 * binance/lib/util/websockets/enum.js). It covers three causes, so on its own
 * it does not say the endpoint is off-limits: see classifyTaskFailure and
 * isKeyAccepted for how the sync rules out the key and the IP.
 */
export const BINANCE_KEY_OR_PERMISSION_REJECTED_CODE = -2015;

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
   * after the per-minute window ends. A wait that would reach the round's
   * cutoff is not started: it could only end in a request that may not be sent.
   */
  async throttle(cutoff?: SyncCutoff): Promise<void> {
    const now = Date.now();
    if (now - this.windowStart >= 60_000) {
      this.windowStart = now;
      this.used = 0;
      return;
    }
    if (this.used < BINANCE_WEIGHT_THRESHOLD) return;

    const waitMs = 60_000 - (now - this.windowStart);
    assertBeforeCutoff(cutoff, waitMs);
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

  /**
   * `cutoff`, given by a sync round, bounds every call this client makes: no
   * request is sent and no wait started once it would be reached, and a
   * request still running then is abandoned with SyncCutoffError. Without it
   * (credential validation) calls run to the SDK's own five-minute timeout.
   */
  constructor(
    credentials: BinanceCredentials,
    private readonly cutoff?: SyncCutoff,
  ) {
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

  /**
   * True while Binance accepts this key from this IP on a signed read-only
   * call (GET /api/v3/account, the same call spot discovery makes before any
   * task runs). A -2015 on another endpoint while this still succeeds is about
   * that endpoint; once this fails too, the -2015 may be a revoked key or a new
   * IP whitelist, which a later run can recover from. A call abandoned at the
   * round's cutoff says nothing about the key, so it is passed on for the next
   * round to ask again.
   */
  async isKeyAccepted(): Promise<boolean> {
    try {
      await this.withRetry(() => this.client.getAccountInformation({}));
      return true;
    } catch (error) {
      if (error instanceof SyncCutoffError) throw error;
      return false;
    }
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
   * `GET /api/v3/myTrades` — every fill of `symbol` within [scopeFromMs, scopeToMs].
   *
   * Binance semantics: without `fromId` the endpoint returns the most recent
   * page; with `fromId` it returns fills with id >= fromId in ascending order.
   * The id is the symbol's global trade sequence, so one user's fills are not
   * consecutive and the history cannot be stepped backwards by subtracting a
   * page size. startTime/endTime are capped at 24h per call, which would cost
   * one call per day per candidate symbol.
   *
   * Strategy without a stored fill:
   *  1. One call without `fromId`. A short page is the whole history, which is
   *     the usual answer for the hundreds of candidate symbols never traded.
   *  2. A full page whose oldest fill is still inside the scope means older
   *     fills may be in scope too: walk forward from fromId=0 with lastId+1
   *     until reaching that page.
   *  3. Deduplicate by trade id and keep only the fills inside the scope.
   *
   * With `lastStoredId` (the newest fill an earlier API sync stored for this
   * symbol) every older fill is already stored, so the walk starts right after
   * it: a busy pair costs the pages of its new fills, not its whole history,
   * which would otherwise reach the page cap on every incremental run. Every
   * fill after it up to `scopeToMs` is kept, including those older than
   * `scopeFromMs`: they were never stored, and dropping them would leave a hole
   * the next run starts after.
   *
   * A walk that runs out of pages throws SpotHistoryTruncatedError with the
   * fills it walked (see walkTradesForward).
   */
  async fetchSpotTrades(
    symbol: string,
    scopeFromMs: number,
    scopeToMs: number,
    lastStoredId?: number,
  ): Promise<RawEventInput[]> {
    if (lastStoredId != null) return this.fetchSpotTradesAfter(symbol, lastStoredId, scopeToMs);

    let recent: Array<Record<string, unknown>>;
    try {
      recent = await this.requestTradePage(symbol);
    } catch (error) {
      if (isInvalidSymbolError(error)) return [];
      throw error;
    }

    const byId = new Map<number, Record<string, unknown>>();
    addTradesById(byId, recent);

    const oldestRecent = recent.length >= MY_TRADES_PAGE_SIZE ? oldestTrade(recent) : null;
    if (oldestRecent && oldestRecent.time >= scopeFromMs) {
      const walked = await this.walkTradesForward(symbol, 0, oldestRecent.id, scopeToMs);
      walked.forEach((trade, id) => {
        byId.set(id, trade);
      });
    }

    return spotTradeEvents(symbol, byId, (time) => time >= scopeFromMs && time <= scopeToMs);
  }

  private async fetchSpotTradesAfter(
    symbol: string,
    lastStoredId: number,
    scopeToMs: number,
  ): Promise<RawEventInput[]> {
    let walked: Map<number, Record<string, unknown>>;
    try {
      walked = await this.walkTradesForward(symbol, lastStoredId + 1, Number.POSITIVE_INFINITY, scopeToMs);
    } catch (error) {
      // A delisted pair. Nothing was stored past lastStoredId, so a pair that
      // comes back resumes from the same fill.
      if (isInvalidSymbolError(error)) return [];
      throw error;
    }
    return spotTradeEvents(symbol, walked, (time) => time <= scopeToMs);
  }

  private async requestTradePage(symbol: string, fromId?: number): Promise<Array<Record<string, unknown>>> {
    const params: { symbol: string; limit: number; fromId?: number } = { symbol, limit: MY_TRADES_PAGE_SIZE };
    if (fromId != null) params.fromId = fromId;
    return toRecords(await this.withRetry(() => this.client.getAccountTradeList(params)));
  }

  /**
   * Pages forward from `startId` until a short page, the page that reaches
   * `stopBeforeId` (the oldest fill already fetched) or the page that passes
   * `scopeToMs`, and returns the fills walked, by id.
   *
   * Running out of pages throws, so the task still reports the gap; returning
   * normally would let the sync end as completed with part of the history
   * missing. The error carries every fill walked, all of them and nothing
   * else: each page starts right after the newest fill of the previous one, so
   * they are the pair's fills from `startId` on with no hole, and the next
   * incremental sync can resume after the newest. The fills fetched before the
   * walk (the recent page) are left out, since storing them would move that
   * resume point past the fills in between.
   */
  private async walkTradesForward(
    symbol: string,
    startId: number,
    stopBeforeId: number,
    scopeToMs: number,
  ): Promise<Map<number, Record<string, unknown>>> {
    const walked = new Map<number, Record<string, unknown>>();
    let fromId = startId;
    for (let page = 0; page < MY_TRADES_MAX_FORWARD_PAGES; page++) {
      const trades = await this.requestTradePage(symbol, fromId);
      addTradesById(walked, trades);
      if (trades.length < MY_TRADES_PAGE_SIZE) return walked;
      const newest = newestTrade(trades);
      if (newest.id + 1 >= stopBeforeId || newest.time > scopeToMs) return walked;
      fromId = newest.id + 1;
    }
    // fromId is one past the newest fill of the last full page.
    throw new SpotHistoryTruncatedError(
      spotTradeEvents(symbol, walked, () => true),
      fromId - 1,
    );
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
    return list.map((reward) => ({
      eventType: CRYPTO_EVENT_TYPE.EARN_FLEX,
      externalId: rewardExternalId(CRYPTO_EVENT_TYPE.EARN_FLEX, reward),
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
    return list.map((reward) => ({
      eventType: CRYPTO_EVENT_TYPE.EARN_LOCKED,
      externalId: rewardExternalId(CRYPTO_EVENT_TYPE.EARN_LOCKED, reward),
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
    return list.map((reward) => ({
      eventType: CRYPTO_EVENT_TYPE.ETH_STAKING,
      externalId: rewardExternalId(CRYPTO_EVENT_TYPE.ETH_STAKING, reward),
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
    return list.map((row) => ({
      eventType: CRYPTO_EVENT_TYPE.STAKING_INTEREST,
      externalId: rewardExternalId(CRYPTO_EVENT_TYPE.STAKING_INTEREST, row),
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
    await this.weight.throttle(this.cutoff);

    let attempt = 0;
    let lastError: BinanceClientError | undefined;

    while (attempt < BINANCE_RETRY_MAX_ATTEMPTS) {
      // Nothing is sent once the round's cutoff has passed, and a request
      // still unanswered then is abandoned rather than awaited.
      assertBeforeCutoff(this.cutoff);
      try {
        const result = await raceCutoff(fn(), this.cutoff);
        this.weight.observe(BINANCE_WEIGHT_LIMIT / BINANCE_RETRY_MAX_ATTEMPTS);
        return result;
      } catch (error) {
        if (error instanceof SyncCutoffError) throw error;
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
        assertBeforeCutoff(this.cutoff, delay);
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

// myTrades returns at most 1000 fills per call.
const MY_TRADES_PAGE_SIZE = 1000;
// Forward pages allowed per symbol and run (100k fills). Reaching the cap fails
// the task, handing over only the fills walked, which have no hole in them.
const MY_TRADES_MAX_FORWARD_PAGES = 100;

function addTradesById(byId: Map<number, Record<string, unknown>>, trades: Array<Record<string, unknown>>): void {
  trades.forEach((trade) => {
    byId.set(Number(trade.id), trade);
  });
}

/** The collected fills whose time passes `keep`, in trade-id order, as raw events. */
function spotTradeEvents(
  symbol: string,
  byId: Map<number, Record<string, unknown>>,
  keep: (timeMs: number) => boolean,
): RawEventInput[] {
  return Array.from(byId.entries())
    .filter(([, trade]) => keep(Number(trade.time)))
    .sort(([a], [b]) => a - b)
    .map(([id, trade]) => ({
      eventType: CRYPTO_EVENT_TYPE.SPOT_TRADE,
      externalId: `${symbol}-${String(id)}`,
      occurredAt: new Date(Number(trade.time)),
      rawPayload: { symbol, ...trade },
    }));
}

interface TradeEdge {
  id: number;
  time: number;
}

/**
 * Oldest or newest fill of a page by trade id, without trusting the order the
 * page came in. A fill without a numeric id cannot anchor the next request, so
 * it fails the task rather than ending the walk early with fills missing. It
 * is a malformed answer, not a history too long to walk, so it has its own
 * code and classifyTaskFailure leaves it transient.
 */
function tradeAtEdge(trades: Array<Record<string, unknown>>, isBetter: (a: number, b: number) => boolean): TradeEdge {
  const edges = trades.map((trade) => ({ id: Number(trade.id), time: Number(trade.time) }));
  if (edges.some((edge) => !Number.isFinite(edge.id))) {
    throw new BinanceClientError(CRYPTO_SYNC_TASK_FAILURE.TRADE_WITHOUT_ID);
  }
  return edges.reduce((best, edge) => (isBetter(edge.id, best.id) ? edge : best));
}

function oldestTrade(trades: Array<Record<string, unknown>>): TradeEdge {
  return tradeAtEdge(trades, (a, b) => a < b);
}

function newestTrade(trades: Array<Record<string, unknown>>): TradeEdge {
  return tradeAtEdge(trades, (a, b) => a > b);
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

export interface TaskFailureClass {
  kind: CryptoSyncFailureKind;
  code: string;
}

/**
 * What one failed sync task does to its job. PERMANENT only for failures the
 * next run would repeat identically, because those let the job complete and the
 * incremental anchor move past the gap:
 *  - HISTORY_TRUNCATED with no fill walked: nothing is stored, so the next run
 *    walks the same pages to the same cap.
 *  - Binance -2015 on a task. On its own the code also means a bad key or an
 *    IP outside the whitelist, but tasks only run after GET /api/v3/account
 *    has accepted this key from this IP, and the sync asks again at the end
 *    (isKeyAccepted) before trusting it. What is left is this endpoint being
 *    closed to this key.
 * RESUMABLE when the task stored part of its data and the next run continues
 * after it: HISTORY_TRUNCATED with fills walked, reported as
 * HISTORY_RESUMES_NEXT_RUN. The job completes as well, but the gap is not
 * called permanent, because the next incremental sync walks on from there.
 * Whether it really does depends on the fills already stored for the pair,
 * which only the sync knows (confirmResumableWalk in BinanceSyncService).
 * INVALID_SIGNATURE stays FATAL. Everything else is TRANSIENT: network errors,
 * 5xx, 429/418 still limited after the retries, any other Binance code, a
 * malformed answer (TRADE_WITHOUT_ID) and any non-Binance error, such as the
 * database refusing an insert. The HTTP status is no help here: the SDK
 * rethrows Binance errors as `{ code, message, body }` without it, so only the
 * Binance code in the body tells them apart. A call abandoned at the round's
 * cutoff keeps its own code (ROUND_CUTOFF); the sync reruns that task in the
 * next round instead of recording it, so it only gets here from elsewhere.
 */
export function classifyTaskFailure(error: unknown): TaskFailureClass {
  if (error instanceof SyncCutoffError) {
    return { kind: CRYPTO_SYNC_FAILURE_KIND.TRANSIENT, code: CRYPTO_SYNC_TASK_FAILURE.ROUND_CUTOFF };
  }
  if (!(error instanceof BinanceClientError)) {
    return { kind: CRYPTO_SYNC_FAILURE_KIND.TRANSIENT, code: CRYPTO_SYNC_TASK_FAILURE.TASK_FAILED };
  }
  if (error.code === API_ERROR.CRYPTO.INVALID_SIGNATURE) {
    return { kind: CRYPTO_SYNC_FAILURE_KIND.FATAL, code: error.code };
  }
  if (error.code === CRYPTO_SYNC_TASK_FAILURE.HISTORY_TRUNCATED) {
    return eventsFetchedBeforeFailure(error).length > 0
      ? { kind: CRYPTO_SYNC_FAILURE_KIND.RESUMABLE, code: CRYPTO_SYNC_TASK_FAILURE.HISTORY_RESUMES_NEXT_RUN }
      : { kind: CRYPTO_SYNC_FAILURE_KIND.PERMANENT, code: error.code };
  }
  if (error.binanceCode === BINANCE_KEY_OR_PERMISSION_REJECTED_CODE) {
    return { kind: CRYPTO_SYNC_FAILURE_KIND.PERMANENT, code: CRYPTO_SYNC_TASK_FAILURE.ENDPOINT_NOT_PERMITTED };
  }
  return { kind: CRYPTO_SYNC_FAILURE_KIND.TRANSIENT, code: error.code };
}

// Re-export for tests/consumers
export type { CryptoEventType };
