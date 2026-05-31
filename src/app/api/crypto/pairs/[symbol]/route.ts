/**
 * GET /api/crypto/pairs/[symbol]
 *
 * Full position for a single canonical pair: chronological trades plus the
 * native-quote FIFO P&L (computePairPosition), enriched with EUR figures — the
 * base asset's historical EUR price at the earliest buy date (avgEntryEurCents)
 * for the summary panel, and each trade's EUR cost (valueEurCents) for the
 * chart tooltip.
 *
 * EUR resolution is best-effort: if it throws (network/price gap) the position
 * is still returned with the EUR fields null rather than failing the request.
 */

import { getPairTrades } from '@/services/database/CryptoPositionsRepository';
import { getPriceEurCents } from '@/services/exchanges/binance/PriceService';
import { type PairTrade, type PositionLot, TRADE_SIDE } from '@/types/cryptoChart';
import { validationError, withApiHandler } from '@/utils/apiHandler';
import { computePairPosition } from '@/utils/crypto/pairPnl';

// Canonical Binance symbols are alphanumeric (e.g. BTCUSDC). Anything else is
// rejected before we touch the DB.
const SYMBOL_PATTERN = /^[A-Za-z0-9]+$/;

export const GET = withApiHandler(async (_request, { params }) => {
  const { symbol } = await params;
  if (!symbol || !SYMBOL_PATTERN.test(symbol)) {
    return validationError({ symbol: ['invalid'] });
  }

  const { base, quote, symbol: canonicalSymbol, trades } = await getPairTrades(symbol);
  const position = computePairPosition({ base, quote, symbol: canonicalSymbol, trades });

  const [tradesWithEur, openLotsWithEur] = await Promise.all([
    enrichTradesWithEur(quote, position.trades),
    enrichLotsWithEur(base, position.openLots),
  ]);
  const avgEntryEurCents = computeAvgEntryEurCents(tradesWithEur);

  return { data: { ...position, trades: tradesWithEur, openLots: openLotsWithEur, avgEntryEurCents } };
}, 'GET /api/crypto/pairs/[symbol]');

/**
 * Attach the EUR price (cents) of one BASE unit at each lot's buy date, so the
 * chart can show the lot's unrealized P&L in euros. Null when unresolvable.
 */
async function enrichLotsWithEur(
  base: string,
  lots: PositionLot[],
): Promise<Array<PositionLot & { entryEurCents: number | null }>> {
  return Promise.all(
    lots.map(async (lot) => {
      try {
        const resolved = await getPriceEurCents(base, new Date(lot.occurredAt));
        return { ...lot, entryEurCents: resolved.eurPriceCents > 0 ? resolved.eurPriceCents : null };
      } catch {
        return { ...lot, entryEurCents: null };
      }
    }),
  );
}

/**
 * Attach each trade's EUR cost (quoteTotal × the quote asset's EUR price at the
 * trade date). getPriceEurCents caches per asset+day, so trades sharing a day
 * resolve once. Null when EUR can't be resolved for that date.
 */
async function enrichTradesWithEur(
  quote: string,
  trades: PairTrade[],
): Promise<Array<PairTrade & { valueEurCents: number | null }>> {
  return Promise.all(
    trades.map(async (trade) => ({ ...trade, valueEurCents: await resolveTradeValueEurCents(quote, trade) })),
  );
}

async function resolveTradeValueEurCents(quote: string, trade: PairTrade): Promise<number | null> {
  try {
    const resolved = await getPriceEurCents(quote, new Date(trade.occurredAt));
    if (resolved.eurPriceCents <= 0) return null;
    const value = Math.round(Number(trade.quoteTotal) * resolved.eurPriceCents);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Weighted-average entry price in EUR cents per base unit: total EUR cost of the
 * buys ÷ total base bought. Uses each buy's already-resolved EUR cost so it
 * reflects every purchase (not just the first). Null when no buy resolved.
 */
function computeAvgEntryEurCents(trades: Array<PairTrade & { valueEurCents: number | null }>): number | null {
  const buys = trades.filter((trade) => trade.side === TRADE_SIDE.BUY && trade.valueEurCents != null);
  const totalEurCents = buys.reduce((sum, trade) => sum + (trade.valueEurCents ?? 0), 0);
  const totalQty = buys.reduce((sum, trade) => sum + Number(trade.qtyBase), 0);
  return totalQty > 0 ? Math.round(totalEurCents / totalQty) : null;
}
