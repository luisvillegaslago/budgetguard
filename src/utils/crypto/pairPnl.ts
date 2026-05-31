/**
 * Pure per-pair position / P&L calculator for the "Cotizaciones" feature.
 *
 * Operates entirely in the PAIR'S NATIVE QUOTE ASSET (e.g. BNBBTC → BTC,
 * BTCEUR → EUR). No DB, no network, no EUR conversion here — the EUR
 * equivalence is layered on top by the repository/service.
 *
 * Money convention: trade amounts arrive as NUMERIC strings to avoid
 * precision loss in transport. Aggregates are computed with parseFloat
 * (float64 precision is well within tolerance for crypto quantities under
 * ~10^9 units) and serialised back to strings via String(value).
 *
 * Realized P&L uses a simple FIFO of the pair: buys open lots, sells consume
 * the oldest lots first. For a consumed slice of base quantity `q` sold at
 * unit price `ps` against a lot acquired at unit price `pl`:
 *   realizedPnlQuote += q * (ps - pl)
 *   realizedCostQuote += q * pl   (matched acquisition cost, for realizedPct)
 * If a sell exceeds the available lots (data gap) we match what exists and
 * ignore the excess rather than throwing.
 */

import { type ClosedTrade, type PairPosition, type PairTrade, TRADE_SIDE } from '@/types/cryptoChart';

/** Below this base quantity a position is considered closed (float dust). */
const DUST_THRESHOLD = 1e-12;

interface PairPositionInput {
  base: string;
  quote: string;
  symbol: string;
  trades: PairTrade[];
}

interface OpenLot {
  /** Base quantity still available in this lot. */
  qtyRemaining: number;
  /** Acquisition unit price (quote per 1 base). */
  unitPrice: number;
  /** When the lot was bought (ISO) — carried through for the per-lot band. */
  occurredAt: string;
}

/**
 * Compute the full position for a single pair from its chronological trades.
 * Caller guarantees `trades` is sorted oldest → newest.
 */
export function computePairPosition(input: PairPositionInput): PairPosition {
  const { base, quote, symbol, trades } = input;

  const buys = trades.filter((trade) => trade.side === TRADE_SIDE.BUY);

  const totalBuyQty = buys.reduce((sum, trade) => sum + Number.parseFloat(trade.qtyBase), 0);
  const totalBuyQuote = buys.reduce((sum, trade) => sum + Number.parseFloat(trade.quoteTotal), 0);
  const totalSellQty = trades
    .filter((trade) => trade.side === TRADE_SIDE.SELL)
    .reduce((sum, trade) => sum + Number.parseFloat(trade.qtyBase), 0);

  const netQtyBase = totalBuyQty - totalSellQty;
  const avgEntryPrice = totalBuyQty > 0 ? totalBuyQuote / totalBuyQty : null;

  const { realizedPnlQuote, realizedCostQuote, openLots, closedTrades } = computeRealizedFifo(trades);

  return {
    symbol,
    base,
    quote,
    trades,
    netQtyBase: String(netQtyBase),
    avgEntryPrice: avgEntryPrice === null ? null : String(avgEntryPrice),
    realizedPnlQuote: String(realizedPnlQuote),
    realizedCostQuote: String(realizedCostQuote),
    isOpen: netQtyBase > DUST_THRESHOLD,
    openLots: openLots.map((lot) => ({
      occurredAt: lot.occurredAt,
      entryPrice: String(lot.unitPrice),
      qtyOpen: String(lot.qtyRemaining),
    })),
    closedTrades,
  };
}

/**
 * Walk trades in chronological order matching sells against the oldest open
 * buy lots (FIFO). Returns realized P&L and the matched acquisition cost (both
 * in the quote asset), the buy lots still open afterwards (each one becomes an
 * open "position tool" band), and one closed round-trip per sell (a band from
 * the weighted entry of the consumed lots to the sell price).
 */
function computeRealizedFifo(trades: PairTrade[]): {
  realizedPnlQuote: number;
  realizedCostQuote: number;
  openLots: OpenLot[];
  closedTrades: ClosedTrade[];
} {
  const lots: OpenLot[] = [];
  const closedTrades: ClosedTrade[] = [];
  let realizedPnlQuote = 0;
  let realizedCostQuote = 0;

  trades.forEach((trade) => {
    if (trade.side === TRADE_SIDE.BUY) {
      const qty = Number.parseFloat(trade.qtyBase);
      if (Number.isFinite(qty) && qty > 0) {
        lots.push({ qtyRemaining: qty, unitPrice: Number.parseFloat(trade.avgPrice), occurredAt: trade.occurredAt });
      }
      return;
    }

    // Sell: consume oldest lots FIFO, accumulating the matched cost/qty and the
    // oldest lot date to describe the closed round-trip.
    let remaining = Number.parseFloat(trade.qtyBase);
    const sellPrice = Number.parseFloat(trade.avgPrice);
    let matchedQty = 0;
    let matchedCost = 0;
    let entryOccurredAt: string | null = null;

    while (remaining > DUST_THRESHOLD && lots.length > 0) {
      const lot = lots[0];
      if (!lot) break;

      const take = Math.min(lot.qtyRemaining, remaining);
      realizedPnlQuote += take * (sellPrice - lot.unitPrice);
      realizedCostQuote += take * lot.unitPrice;
      matchedQty += take;
      matchedCost += take * lot.unitPrice;
      if (entryOccurredAt === null) entryOccurredAt = lot.occurredAt;

      lot.qtyRemaining -= take;
      remaining -= take;

      if (lot.qtyRemaining <= DUST_THRESHOLD) lots.shift();
    }
    // Any `remaining` beyond available lots is ignored (data gap, not an error).

    if (matchedQty > DUST_THRESHOLD && entryOccurredAt !== null) {
      closedTrades.push({
        entryPrice: String(matchedCost / matchedQty),
        entryOccurredAt,
        exitPrice: String(sellPrice),
        exitOccurredAt: trade.occurredAt,
        qtyBase: String(matchedQty),
      });
    }
  });

  return { realizedPnlQuote, realizedCostQuote, openLots: lots, closedTrades };
}
