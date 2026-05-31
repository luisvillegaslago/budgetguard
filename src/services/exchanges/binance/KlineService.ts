/**
 * OHLC candle + live-price service for the crypto price chart ("Cotizaciones").
 *
 * Reuses the unauthenticated `publicClient` from PriceService (Binance public
 * market-data endpoints require no API key) so we never construct a second
 * MainClient. All amounts come straight off Binance as strings; we parse them
 * to numbers because lightweight-charts requires numeric OHLC values.
 */

import type { KlineInterval } from '@/constants/finance';
import type { Candle } from '@/types/cryptoChart';
import { publicClient } from './PriceService';

// ============================================================
// Constants
// ============================================================

/** Binance hard cap on klines returned per request. */
const KLINES_PAGE_LIMIT = 1000;

/** Default look-back when no explicit range is supplied. */
const DEFAULT_RANGE_DAYS = 365;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Binance kline tuple indices we care about.
const IDX_OPEN_TIME = 0;
const IDX_OPEN = 1;
const IDX_HIGH = 2;
const IDX_LOW = 3;
const IDX_CLOSE = 4;

// ============================================================
// Public API
// ============================================================

/**
 * Fetch OHLC candles for `symbol` at `interval`, mapped to the shared `Candle`
 * shape (time in UTC seconds). When the requested range spans more than
 * KLINES_PAGE_LIMIT candles, pages forward by advancing `startTime` past the
 * last open time until `toMs` is reached or Binance returns an empty page.
 *
 * If no range is given, defaults to the last DEFAULT_RANGE_DAYS days computed
 * from the runtime clock. Returns [] for an invalid/unknown symbol.
 */
export async function fetchKlines(
  symbol: string,
  interval: KlineInterval,
  fromMs?: number,
  toMs?: number,
): Promise<Candle[]> {
  const endTime = toMs ?? Date.now();
  const startTime = fromMs ?? endTime - DEFAULT_RANGE_DAYS * MS_PER_DAY;

  const candles: Candle[] = [];
  let cursor = startTime;
  let keepPaging = true;

  while (keepPaging) {
    let page: unknown[];
    try {
      page = await publicClient.getKlines({
        symbol,
        interval,
        startTime: cursor,
        endTime,
        limit: KLINES_PAGE_LIMIT,
      });
    } catch (error) {
      // Unknown symbol → no data. Other failures also yield an empty result
      // rather than crashing the chart; the route surfaces empty as "no data".
      if (isInvalidSymbolError(error)) return [];
      return candles;
    }

    if (!Array.isArray(page) || page.length === 0) break;

    const mapped = page.map(toCandle).filter(isCandle);
    mapped.forEach((candle) => {
      candles.push(candle);
    });

    // Advance the cursor past the last open time. If Binance returned fewer
    // than a full page, there is nothing more to fetch.
    const lastRow = page[page.length - 1];
    const lastOpenMs = toOpenTimeMs(lastRow);
    if (page.length < KLINES_PAGE_LIMIT || lastOpenMs == null) {
      keepPaging = false;
    } else {
      const nextCursor = lastOpenMs + 1;
      if (nextCursor <= cursor || nextCursor > endTime) keepPaging = false;
      else cursor = nextCursor;
    }
  }

  return candles;
}

/**
 * Fetch the current spot price for `symbol` from the public ticker endpoint.
 * Returns null for an invalid/unknown symbol or an unparseable price.
 */
export async function fetchLivePrice(symbol: string): Promise<number | null> {
  try {
    const ticker = await publicClient.getSymbolPriceTicker({ symbol });
    // With a single `symbol`, the SDK returns one { symbol, price } object.
    const single = Array.isArray(ticker) ? ticker[0] : ticker;
    const price = Number(single?.price);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch (error) {
    if (isInvalidSymbolError(error)) return null;
    return null;
  }
}

// ============================================================
// Helpers
// ============================================================

/** Map a raw Binance kline row to a Candle, or null if malformed. */
function toCandle(row: unknown): Candle | null {
  if (!Array.isArray(row)) return null;
  const openTimeMs = Number(row[IDX_OPEN_TIME]);
  const open = Number(row[IDX_OPEN]);
  const high = Number(row[IDX_HIGH]);
  const low = Number(row[IDX_LOW]);
  const close = Number(row[IDX_CLOSE]);
  if (![openTimeMs, open, high, low, close].every(Number.isFinite)) return null;
  return {
    time: Math.floor(openTimeMs / 1000), // ms → UTC seconds for lightweight-charts
    open,
    high,
    low,
    close,
  };
}

function isCandle(candle: Candle | null): candle is Candle {
  return candle !== null;
}

/** Extract the open-time (ms) from a raw kline row, or null if malformed. */
function toOpenTimeMs(row: unknown): number | null {
  if (!Array.isArray(row)) return null;
  const openTimeMs = Number(row[IDX_OPEN_TIME]);
  return Number.isFinite(openTimeMs) ? openTimeMs : null;
}

/** Detects Binance's "invalid symbol" error (-1121) across error shapes. */
function isInvalidSymbolError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const obj = error as Record<string, unknown>;
  if (typeof obj.code === 'number' && obj.code === -1121) return true;
  const body = obj.body as Record<string, unknown> | undefined;
  if (body && typeof body.code === 'number' && body.code === -1121) return true;
  return false;
}
