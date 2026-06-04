/**
 * TanStack Query hooks for the crypto price chart ("Cotizaciones") feature.
 *
 *  - useCryptoSpotPairs()           — GET /api/crypto/pairs              → PairSummary[]
 *  - useCryptoKlines(symbol, iv)    — GET /api/crypto/klines?symbol=&interval=
 *  - useCryptoPairPosition(symbol)  — GET /api/crypto/pairs/[symbol]     → PairPositionDetail
 *  - useCryptoTicker(symbol)        — GET /api/crypto/ticker?symbol=      (live, refetch 15s)
 *
 * All endpoints return the standard `{ success, data }` envelope, so we unwrap
 * `.data`. Mirrors the request/unwrap pattern of `useCryptoSync.ts`.
 */

import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINT, CACHE_TIME, type KlineInterval, QUERY_KEY } from '@/constants/finance';
import type { Candle, ClosedTrade, PairPosition, PairSummary, PairTrade, PositionLot } from '@/types/cryptoChart';
import type { ApiResponse } from '@/types/finance';
import { fetchApi } from '@/utils/fetchApi';

/** A trade enriched with its EUR cost (quoteTotal converted at the trade date). */
export type PairTradeWithEur = PairTrade & { valueEurCents: number | null };

/** An open lot enriched with its EUR entry price (cents per base unit at buy date). */
export type PositionLotWithEur = PositionLot & { entryEurCents: number | null };

/**
 * A closed round-trip enriched with the base asset's EUR price (cents per base
 * unit) at the entry and exit dates, so the tooltip can show the EUR invested
 * and the EUR realized P&L. Either side is null when its date can't be resolved.
 */
export type ClosedTradeWithEur = ClosedTrade & { entryEurCents: number | null; exitEurCents: number | null };

/** Pair detail = full position enriched with EUR figures for the panel + tooltip. */
export interface PairPositionDetail extends Omit<PairPosition, 'trades' | 'openLots' | 'closedTrades'> {
  trades: PairTradeWithEur[];
  openLots: PositionLotWithEur[];
  closedTrades: ClosedTradeWithEur[];
  avgEntryEurCents: number | null;
}

/** Live ticker payload: native quote price plus optional base→EUR price. */
export interface CryptoTicker {
  symbol: string;
  price: number | null;
  baseEurPrice: number | null;
}

const LIVE_REFETCH_MS = 15000;

async function unwrap<T>(response: Response, errorMessage: string): Promise<T> {
  if (!response.ok) throw new Error(errorMessage);
  const data: ApiResponse<T> = await response.json();
  if (!data.success || data.data == null) throw new Error(data.error ?? errorMessage);
  return data.data;
}

// ============================================================
// Spot pairs (selector)
// ============================================================

async function fetchSpotPairs(): Promise<PairSummary[]> {
  const response = await fetchApi(API_ENDPOINT.CRYPTO_PAIRS);
  return unwrap<PairSummary[]>(response, 'Error loading crypto pairs');
}

export function useCryptoSpotPairs() {
  return useQuery({
    queryKey: [QUERY_KEY.CRYPTO_PAIRS],
    queryFn: fetchSpotPairs,
    staleTime: CACHE_TIME.FIVE_MINUTES,
  });
}

// ============================================================
// Klines (candlestick OHLC)
// ============================================================

async function fetchKlines(symbol: string, interval: KlineInterval, fromMs?: number): Promise<Candle[]> {
  const params = new URLSearchParams({ symbol, interval });
  if (fromMs != null) params.set('from', String(fromMs));
  const response = await fetchApi(`${API_ENDPOINT.CRYPTO_KLINES}?${params}`);
  return unwrap<Candle[]>(response, 'Error loading klines');
}

/**
 * `fromMs` (optional) starts the candles at the user's first trade in the pair
 * so old positions stay on-screen instead of falling outside the default range.
 */
export function useCryptoKlines(symbol: string | null, interval: KlineInterval, fromMs?: number) {
  return useQuery({
    queryKey: [QUERY_KEY.CRYPTO_KLINES, symbol, interval, fromMs ?? null],
    queryFn: () => fetchKlines(symbol ?? '', interval, fromMs),
    enabled: Boolean(symbol),
    staleTime: CACHE_TIME.ONE_MINUTE,
  });
}

// ============================================================
// Pair position detail
// ============================================================

async function fetchPairPosition(symbol: string): Promise<PairPositionDetail> {
  const response = await fetchApi(`${API_ENDPOINT.CRYPTO_PAIRS}/${symbol}`);
  return unwrap<PairPositionDetail>(response, 'Error loading pair position');
}

export function useCryptoPairPosition(symbol: string | null) {
  return useQuery({
    queryKey: [QUERY_KEY.CRYPTO_PAIR, symbol],
    queryFn: () => fetchPairPosition(symbol ?? ''),
    enabled: Boolean(symbol),
    staleTime: CACHE_TIME.ONE_MINUTE,
  });
}

// ============================================================
// Live ticker
// ============================================================

async function fetchTicker(symbol: string): Promise<CryptoTicker> {
  const params = new URLSearchParams({ symbol });
  const response = await fetchApi(`${API_ENDPOINT.CRYPTO_TICKER}?${params}`);
  return unwrap<CryptoTicker>(response, 'Error loading ticker');
}

export function useCryptoTicker(symbol: string | null) {
  return useQuery({
    queryKey: [QUERY_KEY.CRYPTO_TICKER, symbol],
    queryFn: () => fetchTicker(symbol ?? ''),
    enabled: Boolean(symbol),
    refetchInterval: LIVE_REFETCH_MS,
    staleTime: CACHE_TIME.NO_CACHE,
  });
}
