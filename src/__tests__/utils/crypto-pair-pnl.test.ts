/**
 * Unit tests for the pure per-pair P&L calculator (src/utils/crypto/pairPnl.ts).
 *
 * Pure function, no DB. Covers: weighted avg entry, FIFO realized P&L /
 * matched cost in the quote asset, net quantity, and the open/closed flag.
 */

import type { PairTrade } from '@/types/cryptoChart';
import { TRADE_SIDE } from '@/types/cryptoChart';
import { computePairPosition } from '@/utils/crypto/pairPnl';

function trade(partial: Partial<PairTrade>): PairTrade {
  return {
    side: TRADE_SIDE.BUY,
    occurredAt: '2025-01-01T00:00:00Z',
    qtyBase: '0',
    quoteTotal: '0',
    avgPrice: '0',
    ...partial,
  };
}

describe('computePairPosition', () => {
  it('(a) open BNBBTC single buy: avgEntry = avgPrice, no realized P&L, isOpen', () => {
    const result = computePairPosition({
      base: 'BNB',
      quote: 'BTC',
      symbol: 'BNBBTC',
      trades: [
        trade({
          side: TRADE_SIDE.BUY,
          qtyBase: '0.2335701',
          quoteTotal: String(0.2335701 * 0.009737),
          avgPrice: '0.009737',
        }),
      ],
    });

    expect(Number(result.avgEntryPrice)).toBeCloseTo(0.009737, 9);
    expect(Number(result.realizedPnlQuote)).toBeCloseTo(0, 12);
    expect(Number(result.realizedCostQuote)).toBeCloseTo(0, 12);
    expect(Number(result.netQtyBase)).toBeCloseTo(0.2335701, 9);
    expect(result.isOpen).toBe(true);
    expect(result.openLots).toHaveLength(1);
    expect(Number(result.openLots[0]?.entryPrice)).toBeCloseTo(0.009737, 9);
    expect(Number(result.openLots[0]?.qtyOpen)).toBeCloseTo(0.2335701, 9);
  });

  it('open lots: two buys, a partial sell consumes the oldest (FIFO) → one full + one partial lot', () => {
    const result = computePairPosition({
      base: 'BNB',
      quote: 'BTC',
      symbol: 'BNBBTC',
      trades: [
        trade({ side: TRADE_SIDE.BUY, occurredAt: '2021-09-15T00:00:00Z', qtyBase: '2', avgPrice: '0.008' }),
        trade({ side: TRADE_SIDE.BUY, occurredAt: '2025-12-05T00:00:00Z', qtyBase: '3', avgPrice: '0.0098' }),
        trade({ side: TRADE_SIDE.SELL, occurredAt: '2026-01-01T00:00:00Z', qtyBase: '1', avgPrice: '0.01' }),
      ],
    });

    // The sell consumes 1 of the first (2021) lot: it has 1 left, the 2025 lot is untouched.
    expect(result.openLots).toHaveLength(2);
    expect(result.openLots[0]?.occurredAt).toBe('2021-09-15T00:00:00Z');
    expect(Number(result.openLots[0]?.qtyOpen)).toBeCloseTo(1, 9);
    expect(Number(result.openLots[1]?.qtyOpen)).toBeCloseTo(3, 9);
  });

  it('(b) buy then higher partial sell: realized P&L and matched cost in quote', () => {
    const result = computePairPosition({
      base: 'BTC',
      quote: 'USDC',
      symbol: 'BTCUSDC',
      trades: [
        trade({ side: TRADE_SIDE.BUY, qtyBase: '0.04', quoteTotal: '2400', avgPrice: '60000' }),
        trade({
          side: TRADE_SIDE.SELL,
          qtyBase: '0.03',
          quoteTotal: '2100',
          avgPrice: '70000',
          occurredAt: '2025-02-01T00:00:00Z',
        }),
      ],
    });

    // 0.03 * (70000 - 60000) = 300
    expect(Number(result.realizedPnlQuote)).toBeCloseTo(300, 6);
    // 0.03 * 60000 = 1800
    expect(Number(result.realizedCostQuote)).toBeCloseTo(1800, 6);
    expect(Number(result.netQtyBase)).toBeCloseTo(0.01, 9);
    expect(Number(result.avgEntryPrice)).toBeCloseTo(60000, 6);
    expect(result.isOpen).toBe(true);

    // One closed round-trip: 0.03 BTC entered @ 60000, exited @ 70000.
    expect(result.closedTrades).toHaveLength(1);
    const closed = result.closedTrades[0];
    expect(Number(closed?.qtyBase)).toBeCloseTo(0.03, 9);
    expect(Number(closed?.entryPrice)).toBeCloseTo(60000, 6);
    expect(Number(closed?.exitPrice)).toBeCloseTo(70000, 6);
    expect(closed?.exitOccurredAt).toBe('2025-02-01T00:00:00Z');
  });

  it('(c) full close at a loss: realized P&L negative, isOpen false', () => {
    const result = computePairPosition({
      base: 'BTC',
      quote: 'USDC',
      symbol: 'BTCUSDC',
      trades: [
        trade({ side: TRADE_SIDE.BUY, qtyBase: '1', quoteTotal: '100', avgPrice: '100' }),
        trade({
          side: TRADE_SIDE.SELL,
          qtyBase: '1',
          quoteTotal: '90',
          avgPrice: '90',
          occurredAt: '2025-02-01T00:00:00Z',
        }),
      ],
    });

    expect(Number(result.realizedPnlQuote)).toBeCloseTo(-10, 6);
    expect(Number(result.realizedCostQuote)).toBeCloseTo(100, 6);
    expect(Number(result.netQtyBase)).toBeCloseTo(0, 12);
    expect(result.isOpen).toBe(false);
  });

  it('matches sells across multiple buy lots FIFO and ignores oversell excess', () => {
    const result = computePairPosition({
      base: 'BTC',
      quote: 'USDC',
      symbol: 'BTCUSDC',
      trades: [
        trade({ side: TRADE_SIDE.BUY, qtyBase: '0.5', quoteTotal: '25000', avgPrice: '50000' }),
        trade({ side: TRADE_SIDE.BUY, qtyBase: '0.5', quoteTotal: '30000', avgPrice: '60000' }),
        // Sell 1.2 but only 1.0 exists → match 1.0, ignore 0.2 excess.
        trade({
          side: TRADE_SIDE.SELL,
          qtyBase: '1.2',
          quoteTotal: '84000',
          avgPrice: '70000',
          occurredAt: '2025-03-01T00:00:00Z',
        }),
      ],
    });

    // Matched: 0.5*(70000-50000) + 0.5*(70000-60000) = 10000 + 5000 = 15000
    expect(Number(result.realizedPnlQuote)).toBeCloseTo(15000, 4);
    // Cost: 0.5*50000 + 0.5*60000 = 55000
    expect(Number(result.realizedCostQuote)).toBeCloseTo(55000, 4);
    // Net = 1.0 buys - 1.2 sells = -0.2 → not open.
    expect(Number(result.netQtyBase)).toBeCloseTo(-0.2, 9);
    expect(result.isOpen).toBe(false);
  });

  it('returns null avgEntryPrice when there are no buys', () => {
    const result = computePairPosition({
      base: 'BTC',
      quote: 'USDC',
      symbol: 'BTCUSDC',
      trades: [trade({ side: TRADE_SIDE.SELL, qtyBase: '1', quoteTotal: '90', avgPrice: '90' })],
    });

    expect(result.avgEntryPrice).toBeNull();
    expect(Number(result.realizedPnlQuote)).toBeCloseTo(0, 12);
    expect(result.isOpen).toBe(false);
  });

  it('passes trades through unchanged', () => {
    const trades = [trade({ side: TRADE_SIDE.BUY, qtyBase: '1', quoteTotal: '100', avgPrice: '100' })];
    const result = computePairPosition({ base: 'BTC', quote: 'USDC', symbol: 'BTCUSDC', trades });
    expect(result.trades).toBe(trades);
  });
});
