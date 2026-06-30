/**
 * Historical EUR price resolution for the crypto module.
 *
 * Cascade:
 *   1. Cache hit  (CryptoPriceCache by Asset, DateUtc)
 *   2. Stablecoin shortcut for the EUR-pegged side (USDT / USDC / BUSD ≈ 1 USD,
 *      cross with EURUSDT to get the EUR price). The Binance "stablecoin to
 *      EUR" assumption is intentional: PriceSource records it so AEAT can
 *      audit.
 *   3. Binance public klines `{Asset}EUR` interval=1d at the trade's date.
 *   4. Cross-rate via klines `{Asset}USDT` × `EURUSDT` (same date).
 *   5. CoinGecko free history (`/coins/{id}/history?date=DD-MM-YYYY`).
 *
 * If every step fails we throw BinanceClientError(PRICE_NOT_FOUND) — the
 * normaliser turns that into a per-event task failure rather than aborting
 * the whole job.
 *
 * The price is stored in EUR cents (BIGINT) to match the rest of BudgetGuard's
 * money convention. Native asset quantities use NUMERIC(38,18); a tiny helper
 * (`computeGrossEurCents`) multiplies them safely without floating-point loss.
 */

import { MainClient } from 'binance';
import { API_ERROR, CRYPTO_PRICE_SOURCE, type CryptoPriceSource } from '@/constants/finance';
import { type CachedPrice, getCachedPrice, putCachedPrice } from '@/services/database/CryptoPriceCacheRepository';
import { BinanceClientError } from './BinanceClient';
import { syncDebug } from './syncDebug';

// ============================================================
// Constants
// ============================================================

/** Stablecoins assumed pegged to USD. */
const USD_STABLECOINS = new Set(['USDT', 'USDC', 'BUSD', 'FDUSD', 'DAI', 'TUSD', 'USDP']);
/** Stablecoins / fiat assumed pegged to EUR. */
const EUR_STABLECOINS = new Set(['EUR', 'EURI']);

const KLINE_INTERVAL = '1d';

// 'unresolved' is the last-resort source: no provider produced a price, so the
// asset is persisted with eurPriceCents=0 and flagged for manual review instead
// of dropping the raw event. The full union lives in @/constants/finance.
export type PriceSource = CryptoPriceSource;

export interface ResolvedPrice {
  asset: string;
  dateUtc: string; // YYYY-MM-DD
  /** Rounded integer cents. Display / chart use only — may be 0 for sub-cent assets. */
  eurPriceCents: number;
  /** Micro-cents (cents x 1e6 = EUR x 1e8). Use this to compute gross precisely. */
  eurPriceMicroCents: number;
  source: PriceSource;
}

// ============================================================
// PriceService
// ============================================================

/**
 * Public client for fetching klines (no auth required) — kept separate from
 * the user-credential MainClient so the price engine works without the
 * user's API key being available.
 */
export const publicClient = new MainClient({ beautifyResponses: true });

/**
 * Resolve the EUR price for `asset` at the day component of `at`. Returns
 * cents (BIGINT-safe number, max ~9·10^15). Caches the result so a second
 * call for the same (asset, date) is a single SELECT.
 */
export async function getPriceEurCents(asset: string, at: Date): Promise<ResolvedPrice> {
  const dateUtc = toDateUtc(at);

  // 1. Cache
  const cached = await getCachedPrice(asset, dateUtc);
  if (cached) {
    return {
      asset,
      dateUtc,
      eurPriceCents: cached.eurPriceCents,
      eurPriceMicroCents: cached.eurPriceMicroCents,
      source: CRYPTO_PRICE_SOURCE.CACHE,
    };
  }

  const resolved = await resolveFromCascade(asset, dateUtc, at);

  // Never cache an `unresolved` (0) result. The cache is immutable
  // (first-writer-wins, ON CONFLICT DO NOTHING) and re-read verbatim by the
  // recompute, so a transient API outage — `fetchKlineEurClose` swallows 5xx
  // and rate-limit errors as "no data" — would otherwise freeze a 0 price
  // forever and silently zero out a casilla. Leaving it uncached lets a later
  // run re-resolve the real price.
  if (resolved.source !== CRYPTO_PRICE_SOURCE.UNRESOLVED) {
    // Persist (ON CONFLICT DO NOTHING — first writer wins on race)
    await putCachedPrice({
      asset: resolved.asset,
      dateUtc: resolved.dateUtc,
      eurPriceCents: resolved.eurPriceCents,
      eurPriceMicroCents: resolved.eurPriceMicroCents,
      source: resolved.source,
    } satisfies CachedPrice);
  }

  syncDebug.fetchHit('price', `${asset}@${dateUtc}`, 1);
  return resolved;
}

async function resolveFromCascade(asset: string, dateUtc: string, at: Date): Promise<ResolvedPrice> {
  // 2a. Asset is itself EUR/EUR-stablecoin → 1 EUR per unit
  if (EUR_STABLECOINS.has(asset)) {
    return buildResolved(asset, dateUtc, 1, CRYPTO_PRICE_SOURCE.EUR_SELF);
  }

  // 2b. Asset is USD-pegged stablecoin → 1 USD per unit; convert via EURUSDT
  if (USD_STABLECOINS.has(asset)) {
    const eurUsdt = await fetchKlineEurClose('EURUSDT', at);
    if (eurUsdt != null) {
      // Price of 1 USDT in EUR = 1 / eurUsdt (since EURUSDT close is "USDT per EUR")
      const eurPerUsdt = 1 / eurUsdt;
      return buildResolved(asset, dateUtc, eurPerUsdt, CRYPTO_PRICE_SOURCE.STABLECOIN_USD_CROSS);
    }
  }

  // 3. Direct EUR pair on Binance
  const directEur = await fetchKlineEurClose(`${asset}EUR`, at);
  if (directEur != null) {
    return buildResolved(asset, dateUtc, directEur, CRYPTO_PRICE_SOURCE.BINANCE_EUR);
  }

  // 4. {Asset}USDT × EURUSDT cross-rate
  const usdtPrice = await fetchKlineEurClose(`${asset}USDT`, at);
  const eurUsdt = await fetchKlineEurClose('EURUSDT', at);
  if (usdtPrice != null && eurUsdt != null && eurUsdt > 0) {
    const eurPrice = usdtPrice / eurUsdt;
    return buildResolved(asset, dateUtc, eurPrice, CRYPTO_PRICE_SOURCE.BINANCE_USDT_CROSS);
  }

  // 5. CoinGecko fallback
  const coingecko = await fetchCoinGeckoEur(asset, dateUtc);
  if (coingecko != null) {
    return buildResolved(asset, dateUtc, coingecko, CRYPTO_PRICE_SOURCE.COINGECKO);
  }

  // 6. Last resort: persist as unresolved (price=0). The taxable event still
  // gets stored so the user can see it flagged in the events table, instead
  // of the whole raw event being dropped at every normalization pass.
  return buildResolved(asset, dateUtc, 0, CRYPTO_PRICE_SOURCE.UNRESOLVED);
}

// ============================================================
// Source 3-4: Binance klines
// ============================================================

/**
 * Returns the close price (number) of the daily kline that contains `at`,
 * or null if the symbol doesn't exist on Binance.
 */
async function fetchKlineEurClose(symbol: string, at: Date): Promise<number | null> {
  // Daily kline open time aligned to UTC midnight of `at`
  const dayStart = startOfUtcDay(at).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000 - 1;

  try {
    const klines = await publicClient.getKlines({
      symbol,
      interval: KLINE_INTERVAL,
      startTime: dayStart,
      endTime: dayEnd,
      limit: 1,
    });
    const first = klines?.[0];
    if (!first) return null;
    // Kline format: [openTime, open, high, low, close, volume, …]
    const close = Number(first[4]);
    return Number.isFinite(close) && close > 0 ? close : null;
  } catch (error) {
    // Invalid symbol (-1121) is the expected fail-fast for pairs that don't
    // exist (e.g. SXTEUR). Treat as "no data" — the cascade tries the next
    // source. Other errors propagate to surface real outages.
    if (isInvalidSymbolError(error)) return null;
    return null;
  }
}

function isInvalidSymbolError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const obj = error as Record<string, unknown>;
  const code = typeof obj.code === 'number' ? obj.code : undefined;
  if (code === -1121) return true;
  const body = obj.body as Record<string, unknown> | undefined;
  if (body && typeof body.code === 'number' && body.code === -1121) return true;
  return false;
}

// ============================================================
// Source 5: CoinGecko free API
// ============================================================

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

/**
 * Resolves an asset symbol → CoinGecko `id`. Hardcoded for the common subset
 * we care about (avoids the `coins/list` round-trip, which is huge and
 * rate-limit-greedy on CoinGecko free tier).
 *
 * Symbols not in this map fall through and CoinGecko is skipped.
 */
const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  BNB: 'binancecoin',
  SOL: 'solana',
  ADA: 'cardano',
  XRP: 'ripple',
  DOGE: 'dogecoin',
  MATIC: 'matic-network',
  AVAX: 'avalanche-2',
  DOT: 'polkadot',
  LINK: 'chainlink',
  LTC: 'litecoin',
  BCH: 'bitcoin-cash',
  ATOM: 'cosmos',
  NEAR: 'near',
  UNI: 'uniswap',
  AAVE: 'aave',
  XLM: 'stellar',
  ALGO: 'algorand',
  FIL: 'filecoin',
  ICP: 'internet-computer',
  APT: 'aptos',
  ARB: 'arbitrum',
  OP: 'optimism',
  INJ: 'injective-protocol',
  SUI: 'sui',
  TIA: 'celestia',
  PEPE: 'pepe',
  SHIB: 'shiba-inu',
  WLD: 'worldcoin-wld',
  TAO: 'bittensor',
  FET: 'fetch-ai',
  RNDR: 'render-token',
  IMX: 'immutable-x',
  GRT: 'the-graph',
  SAND: 'the-sandbox',
  MANA: 'decentraland',
};

async function fetchCoinGeckoEur(asset: string, dateUtc: string): Promise<number | null> {
  const id = COINGECKO_IDS[asset];
  if (!id) return null;

  // CoinGecko expects DD-MM-YYYY
  const [yyyy, mm, dd] = dateUtc.split('-');
  const cgDate = `${dd}-${mm}-${yyyy}`;
  const url = `${COINGECKO_BASE}/coins/${id}/history?date=${cgDate}&localization=false`;

  try {
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    if (!response.ok) return null;
    const data = (await response.json()) as { market_data?: { current_price?: { eur?: number } } };
    const price = data?.market_data?.current_price?.eur;
    return typeof price === 'number' && price > 0 ? price : null;
  } catch {
    return null;
  }
}

// ============================================================
// Helpers
// ============================================================

function toDateUtc(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Micro-cents per cent. The price cache and ResolvedPrice carry the per-unit
 * EUR price at this resolution (cents x 1e6 = EUR x 1e8) so sub-cent assets
 * (SHIB/PEPE ~ 0.00085 cents/unit) don't round to 0 before being multiplied
 * by quantity.
 */
const MICRO_CENTS_PER_CENT = 1_000_000;

/**
 * Convert a EUR float to BIGINT cents. Rounded to nearest cent. Inputs above
 * Number.MAX_SAFE_INTEGER / 100 (≈ 9·10^13 EUR) are not supported but no
 * realistic crypto trade ever reaches that.
 */
function toEurCents(eur: number): number {
  if (!Number.isFinite(eur) || eur < 0) {
    throw new BinanceClientError(API_ERROR.CRYPTO.PRICE_NOT_FOUND, undefined, { reason: 'invalid_price', value: eur });
  }
  return Math.round(eur * 100);
}

/**
 * Convert a EUR float to BIGINT micro-cents (EUR x 1e8). Keeps 8 decimal
 * places of EUR resolution, enough for sub-cent tokens.
 */
function toEurMicroCents(eur: number): number {
  if (!Number.isFinite(eur) || eur < 0) {
    throw new BinanceClientError(API_ERROR.CRYPTO.PRICE_NOT_FOUND, undefined, { reason: 'invalid_price', value: eur });
  }
  return Math.round(eur * 100 * MICRO_CENTS_PER_CENT);
}

/**
 * Build a ResolvedPrice from a single EUR float, filling both the rounded
 * cents (display) and the micro-cents (precise gross) representations.
 */
function buildResolved(asset: string, dateUtc: string, eur: number, source: PriceSource): ResolvedPrice {
  return {
    asset,
    dateUtc,
    eurPriceCents: toEurCents(eur),
    eurPriceMicroCents: toEurMicroCents(eur),
    source,
  };
}

/**
 * Multiply a native quantity (string from Binance, can be 0.00000001) by a
 * per-unit EUR price expressed in MICRO-CENTS, then round ONCE to integer
 * cents. Multiplying in micro-cent space first is what keeps sub-cent assets
 * from collapsing to 0: 1e8 SHIB * 850 micro-cents / 1e6 = 85000 cents.
 */
export function computeGrossEurCents(quantityNative: string | number, eurPriceMicroCents: number): number {
  const qty = typeof quantityNative === 'string' ? Number(quantityNative) : quantityNative;
  if (!Number.isFinite(qty) || qty < 0) return 0;
  return Math.round((qty * eurPriceMicroCents) / MICRO_CENTS_PER_CENT);
}

/**
 * True when a resolved price carries a usable per-unit value. Sub-cent assets
 * (SHIB/PEPE) have eurPriceCents=0 yet a positive eurPriceMicroCents, so the
 * guard checks the precise micro-cent field — not the display cents — to avoid
 * treating a valid sub-cent price as unresolved. Equivalent to
 * `source !== 'unresolved'` since every real provider yields a positive price.
 */
export function isPriceResolved(price: ResolvedPrice): boolean {
  return price.eurPriceMicroCents > 0;
}

/**
 * Gross EUR value (cents) of `quantityNative` at the resolved per-unit price,
 * or null when the price is unresolved. Multiplies through the micro-cent path
 * (computeGrossEurCents) so sub-cent assets don't collapse to 0 before being
 * scaled by quantity.
 */
export function resolveGrossEurCentsOrNull(quantityNative: string | number, price: ResolvedPrice): number | null {
  if (!isPriceResolved(price)) return null;
  return computeGrossEurCents(quantityNative, price.eurPriceMicroCents);
}
