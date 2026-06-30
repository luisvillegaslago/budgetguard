/**
 * Repository deriving the user's spot positions per CANONICAL trading pair.
 *
 * Binance stores one row per partial fill and sometimes the inverted side of a
 * pair (e.g. `USDCBTC` instead of `BTCUSDC`). We collapse fills into one logical
 * order in SQL — grouping by symbol + COALESCE(orderId, EventID) + isBuyer and
 * summing qty/quoteQty — exactly like `listRawEvents` does for the movements
 * table. Canonicalization then happens in TS via `canonicalizePair`: inverted
 * orders are flipped so quantities, totals and side are all expressed in the
 * canonical pair's orientation.
 *
 * Native crypto amounts stay as NUMERIC strings end-to-end (parsed only for the
 * netQty/open arithmetic) to avoid floating-point precision loss.
 */

import { getUserIdOrThrow } from '@/libs/auth';
import { computeGrossEurCents, getPriceEurCents } from '@/services/exchanges/binance/PriceService';
import { type PairSummary, type PairTrade, TRADE_SIDE, type TradeSide } from '@/types/cryptoChart';
import { canonicalizePair } from '@/utils/cryptoSymbol';
import { query } from './connection';

// Net quantity below this (in base units) is treated as fully closed / dust.
const DUST_THRESHOLD = 1e-12;

// Pairs whose total traded volume is worth less than this are hidden from the
// selector as noise (mostly one-off airdrops). 100 € expressed in cents.
const MIN_PAIR_VALUE_EUR_CENTS = 10_000;

interface SpotOrderRow {
  rawSymbol: string;
  isBuyer: boolean;
  occurredAt: string;
  qtyBaseRaw: string;
  quoteRaw: string;
}

/**
 * One spot order already expressed in its CANONICAL pair orientation.
 * `qtyBase`/`quoteTotal` are NUMERIC strings; `side` reflects the canonical pair
 * (an inverted buy becomes a canonical sell and vice versa).
 */
interface CanonicalOrder {
  symbol: string;
  base: string;
  quote: string;
  side: TradeSide;
  occurredAt: string;
  qtyBase: string;
  quoteTotal: string;
  avgPrice: string;
}

// Fills collapsed into one logical order per symbol + orderId + side, mirroring
// the grouping used by listRawEvents. occurredAt is the latest fill of the order.
const SPOT_ORDERS_SQL = `
  SELECT
    "RawPayload"->>'symbol' AS "rawSymbol",
    ("RawPayload"->>'isBuyer')::boolean AS "isBuyer",
    MAX("OccurredAt") AS "occurredAt",
    SUM(("RawPayload"->>'qty')::numeric)::text AS "qtyBaseRaw",
    SUM(("RawPayload"->>'quoteQty')::numeric)::text AS "quoteRaw"
  FROM "BinanceRawEvents"
  WHERE "UserID" = $1 AND "EventType" = 'spot_trade'
  GROUP BY
    "RawPayload"->>'symbol',
    COALESCE("RawPayload"->>'orderId', "EventID"::text),
    ("RawPayload"->>'isBuyer')::boolean
`;

/**
 * Convert a raw spot order into its canonical-pair orientation, or null if the
 * symbol cannot be split into a known quote suffix.
 *
 * When the symbol is inverted, the base/quote roles swap: the raw quoteQty
 * becomes the canonical base quantity, the raw qty becomes the canonical quote
 * total, and the side inverts (buying the inverted symbol == selling the
 * canonical pair).
 */
function toCanonicalOrder(row: SpotOrderRow): CanonicalOrder | null {
  const canon = canonicalizePair(row.rawSymbol);
  if (canon === null) return null;

  const qtyBase = canon.inverted ? row.quoteRaw : row.qtyBaseRaw;
  const quoteTotal = canon.inverted ? row.qtyBaseRaw : row.quoteRaw;
  const rawSide: TradeSide = row.isBuyer ? TRADE_SIDE.BUY : TRADE_SIDE.SELL;
  const side: TradeSide = canon.inverted ? (rawSide === TRADE_SIDE.BUY ? TRADE_SIDE.SELL : TRADE_SIDE.BUY) : rawSide;

  const qtyNum = Number(qtyBase);
  const avgPrice = qtyNum !== 0 ? String(Number(quoteTotal) / qtyNum) : '0';

  return {
    symbol: canon.symbol,
    base: canon.base,
    quote: canon.quote,
    side,
    occurredAt: row.occurredAt,
    qtyBase,
    quoteTotal,
    avgPrice,
  };
}

async function fetchCanonicalOrders(): Promise<CanonicalOrder[]> {
  const userId = await getUserIdOrThrow();
  const rows = await query<SpotOrderRow>(SPOT_ORDERS_SQL, [userId]);
  return rows.map(toCanonicalOrder).filter((order): order is CanonicalOrder => order !== null);
}

interface PairAggregate {
  symbol: string;
  base: string;
  quote: string;
  tradeCount: number;
  netQtyBaseNum: number;
  quoteVolumeNum: number;
}

/**
 * Consolidate all canonical spot orders into one summary per pair, ranked by the
 * EUR value of the traded volume (so the user's main pairs surface first) and
 * dropping pairs traded for less than MIN_PAIR_VALUE_EUR_CENTS (airdrop noise).
 * netQtyBase = Σbuys − Σsells (base units); isOpen when |net| exceeds dust.
 */
export async function listSpotPairs(): Promise<PairSummary[]> {
  const orders = await fetchCanonicalOrders();

  const bySymbol = orders.reduce((acc, order) => {
    const existing: PairAggregate = acc.get(order.symbol) ?? {
      symbol: order.symbol,
      base: order.base,
      quote: order.quote,
      tradeCount: 0,
      netQtyBaseNum: 0,
      quoteVolumeNum: 0,
    };
    const signedQty = order.side === TRADE_SIDE.BUY ? Number(order.qtyBase) : -Number(order.qtyBase);
    acc.set(order.symbol, {
      ...existing,
      tradeCount: existing.tradeCount + 1,
      netQtyBaseNum: existing.netQtyBaseNum + signedQty,
      quoteVolumeNum: existing.quoteVolumeNum + Number(order.quoteTotal),
    });
    return acc;
  }, new Map<string, PairAggregate>());

  const aggregates = Array.from(bySymbol.values());

  // Resolve the current EUR price of each distinct quote asset once, so each
  // pair's native traded volume can be compared/filtered in a single currency.
  // Keep the precise MICRO-cent price (not the display cents) so a sub-cent
  // quote asset doesn't collapse its whole pair value to 0.
  const quotes = Array.from(new Set(aggregates.map((agg) => agg.quote)));
  const today = new Date();
  const quotePrices = await Promise.all(
    quotes.map(async (quote): Promise<readonly [string, number]> => {
      try {
        const { eurPriceMicroCents } = await getPriceEurCents(quote, today);
        return [quote, eurPriceMicroCents];
      } catch {
        return [quote, 0];
      }
    }),
  );
  const quoteEurMicroCents = new Map<string, number>(quotePrices);

  return aggregates
    .map((agg) => ({
      symbol: agg.symbol,
      base: agg.base,
      quote: agg.quote,
      tradeCount: agg.tradeCount,
      netQtyBase: String(agg.netQtyBaseNum),
      isOpen: Math.abs(agg.netQtyBaseNum) > DUST_THRESHOLD,
      // quote volume (native units) × per-unit EUR price (micro-cents),
      // rounded once → EUR cents. The micro-cent path keeps sub-cent quote
      // assets from valuing the whole pair at 0.
      valueEurCents: computeGrossEurCents(agg.quoteVolumeNum, quoteEurMicroCents.get(agg.quote) ?? 0),
    }))
    .filter((pair) => pair.valueEurCents >= MIN_PAIR_VALUE_EUR_CENTS)
    .sort((a, b) => b.valueEurCents - a.valueEurCents);
}

/**
 * All canonical orders for a single pair as chronological PairTrade[] (ascending
 * by occurredAt). The caller passes the CANONICAL symbol (e.g. "BTCUSDC"); raw
 * inverted rows are folded in automatically via canonicalization.
 */
export async function getPairTrades(
  canonicalSymbol: string,
): Promise<{ base: string; quote: string; symbol: string; trades: PairTrade[] }> {
  const orders = await fetchCanonicalOrders();
  const matching = orders.filter((order) => order.symbol === canonicalSymbol);

  const trades: PairTrade[] = matching
    .map((order) => ({
      side: order.side,
      occurredAt: order.occurredAt,
      qtyBase: order.qtyBase,
      quoteTotal: order.quoteTotal,
      avgPrice: order.avgPrice,
    }))
    .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());

  const first = matching[0];
  const canon = canonicalizePair(canonicalSymbol);
  return {
    symbol: canonicalSymbol,
    base: first?.base ?? canon?.base ?? '',
    quote: first?.quote ?? canon?.quote ?? '',
    trades,
  };
}
