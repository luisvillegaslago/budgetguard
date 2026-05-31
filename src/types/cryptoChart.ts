/**
 * Shared DTO contract for the crypto price chart ("Cotizaciones") feature.
 *
 * This is the single source of truth for the candle/pair/position shapes that
 * flow between the backend repositories/services, the API routes, the hooks and
 * the chart components. Import from here everywhere — do not duplicate.
 *
 * Money convention: native crypto amounts are kept as NUMERIC strings (never
 * parsed to JS numbers except for display/percentages) to avoid precision loss.
 * Candle OHLC values are plain numbers because lightweight-charts requires them.
 */

export interface Candle {
  // UTC seconds — matches lightweight-charts UTCTimestamp.
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type TradeSide = 'buy' | 'sell';

/** Single source of truth for the two trade sides (avoids string literals). */
export const TRADE_SIDE = {
  BUY: 'buy',
  SELL: 'sell',
} as const satisfies Record<string, TradeSide>;

export interface PairTrade {
  side: TradeSide;
  occurredAt: string; // ISO timestamp
  qtyBase: string; // numeric string, base asset quantity
  quoteTotal: string; // numeric string, quote asset total
  avgPrice: string; // numeric string = quoteTotal / qtyBase (quote per 1 base)
}

/**
 * An open buy lot left after the FIFO walk: a purchase (or the un-sold part of
 * one) still held. Each one is drawn as its own "position tool" band from its
 * entry date to today.
 */
export interface PositionLot {
  occurredAt: string; // ISO — when the lot was bought
  entryPrice: string; // numeric string, quote per base
  qtyOpen: string; // numeric string, base quantity still held
}

/**
 * A closed round-trip from the FIFO walk: a sell matched against the buy lot(s)
 * it consumed. Drawn as a band from the (weighted) entry price/date to the exit
 * price/date, coloured by the realized %.
 */
export interface ClosedTrade {
  entryPrice: string; // weighted-avg price of the lots consumed (quote per base)
  entryOccurredAt: string; // ISO — oldest lot consumed
  exitPrice: string; // sell price (quote per base)
  exitOccurredAt: string; // ISO — when sold
  qtyBase: string; // base quantity closed
}

export interface PairPosition {
  symbol: string; // canonical Binance symbol, e.g. "BTCUSDC"
  base: string; // e.g. "BTC"
  quote: string; // e.g. "USDC"
  trades: PairTrade[]; // chronological asc
  netQtyBase: string; // sum buys.qtyBase - sum sells.qtyBase (numeric string)
  avgEntryPrice: string | null; // weighted avg over buys, quote per base, null if no buys
  realizedPnlQuote: string; // realized P&L in quote asset (FIFO), numeric string
  realizedCostQuote: string; // matched acquisition cost for the realized part (for realizedPct)
  isOpen: boolean; // netQtyBase > dust threshold
  openLots: PositionLot[]; // un-sold buy lots (FIFO), one band each
  closedTrades: ClosedTrade[]; // realized round-trips (FIFO), one band each
}

export interface PairSummary {
  symbol: string;
  base: string;
  quote: string;
  tradeCount: number;
  netQtyBase: string;
  isOpen: boolean;
  valueEurCents: number; // total traded volume in EUR cents — for ranking/filtering
}
