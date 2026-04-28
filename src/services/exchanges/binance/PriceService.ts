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
import { API_ERROR } from '@/constants/finance';
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

export type PriceSource =
  | 'cache'
  | 'eur_self'
  | 'stablecoin_eur'
  | 'stablecoin_usd_cross'
  | 'binance_eur'
  | 'binance_usdt_cross'
  | 'coingecko'
  | 'unresolved'; // Last-resort: no source produced a price. Asset is persisted
// with eurPriceCents=0 so the user sees it in the taxable
// events list flagged for manual review, instead of having
// the whole raw event silently dropped.

export interface ResolvedPrice {
  asset: string;
  dateUtc: string; // YYYY-MM-DD
  eurPriceCents: number;
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
const publicClient = new MainClient({ beautifyResponses: true });

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
    return { asset, dateUtc, eurPriceCents: cached.eurPriceCents, source: 'cache' };
  }

  const resolved = await resolveFromCascade(asset, dateUtc, at);
  // Persist (ON CONFLICT DO NOTHING — first writer wins on race)
  await putCachedPrice({
    asset: resolved.asset,
    dateUtc: resolved.dateUtc,
    eurPriceCents: resolved.eurPriceCents,
    source: resolved.source,
  } satisfies CachedPrice);

  syncDebug.fetchHit('price', `${asset}@${dateUtc}`, 1);
  return resolved;
}

async function resolveFromCascade(asset: string, dateUtc: string, at: Date): Promise<ResolvedPrice> {
  // 2a. Asset is itself EUR/EUR-stablecoin → 1 EUR per unit
  if (EUR_STABLECOINS.has(asset)) {
    return { asset, dateUtc, eurPriceCents: 100, source: 'eur_self' };
  }

  // 2b. Asset is USD-pegged stablecoin → 1 USD per unit; convert via EURUSDT
  if (USD_STABLECOINS.has(asset)) {
    const eurUsdt = await fetchKlineEurClose('EURUSDT', at);
    if (eurUsdt != null) {
      // Price of 1 USDT in EUR = 1 / eurUsdt (since EURUSDT close is "USDT per EUR")
      const eurPerUsdt = 1 / eurUsdt;
      return { asset, dateUtc, eurPriceCents: toEurCents(eurPerUsdt), source: 'stablecoin_usd_cross' };
    }
  }

  // 3. Direct EUR pair on Binance
  const directEur = await fetchKlineEurClose(`${asset}EUR`, at);
  if (directEur != null) {
    return { asset, dateUtc, eurPriceCents: toEurCents(directEur), source: 'binance_eur' };
  }

  // 4. {Asset}USDT × EURUSDT cross-rate
  const usdtPrice = await fetchKlineEurClose(`${asset}USDT`, at);
  const eurUsdt = await fetchKlineEurClose('EURUSDT', at);
  if (usdtPrice != null && eurUsdt != null && eurUsdt > 0) {
    const eurPrice = usdtPrice / eurUsdt;
    return { asset, dateUtc, eurPriceCents: toEurCents(eurPrice), source: 'binance_usdt_cross' };
  }

  // 5. CoinGecko fallback
  const coingecko = await fetchCoinGeckoEur(asset, dateUtc);
  if (coingecko != null) {
    return { asset, dateUtc, eurPriceCents: toEurCents(coingecko), source: 'coingecko' };
  }

  // 6. Last resort: persist as unresolved (price=0). The taxable event still
  // gets stored so the user can see it flagged in the events table, instead
  // of the whole raw event being dropped at every normalization pass.
  return { asset, dateUtc, eurPriceCents: 0, source: 'unresolved' };
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
 * Multiply a native quantity (string from Binance, can be 0.00000001) by an
 * EUR/cent price to get gross value in cents. Goes via a string-based
 * decimal split to avoid floating-point drift on values like 0.1 + 0.2.
 *
 * Returns Math.round of (qty × price), so the final cent value is always
 * an integer.
 */
export function computeGrossEurCents(quantityNative: string | number, eurPriceCents: number): number {
  const qty = typeof quantityNative === 'string' ? Number(quantityNative) : quantityNative;
  if (!Number.isFinite(qty) || qty < 0) return 0;
  return Math.round(qty * eurPriceCents);
}
