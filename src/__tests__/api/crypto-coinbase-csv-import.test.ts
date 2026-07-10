/**
 * Unit tests: Coinbase retail CSV importer.
 *
 * Mirrors the contract exercised by crypto-csv-import.test.ts but targets the
 * importer directly (no route/DB mocks needed — the registry/route wiring is a
 * later integration phase). We assert:
 *  - each Transaction Type maps to the right EventType + payload shape
 *  - assets/quantities are parsed (incl. thousands separators in quoted fields)
 *  - every event is stamped with source 'coinbase'
 *  - non-income / unsupported rows are skipped and counted
 *  - re-importing the same content yields byte-identical externalIds (idempotent)
 */

import { CRYPTO_EVENT_TYPE, CRYPTO_EXCHANGE } from '@/constants/finance';
import { coinbaseCsvImporter } from '@/services/exchanges/coinbase/CsvImporter';
import type { RawEventInput } from '@/services/exchanges/shared/types';

// Realistic export: two preamble lines precede the real header, Convert's
// target side lives in Notes, and a "Withdrawal" row exercises the skip path.
const COINBASE_CSV = [
  'You can use this transaction report to inform your likely tax obligations.',
  'Transactions',
  'Timestamp,Transaction Type,Asset,Quantity Transacted,Spot Price Currency,Spot Price at Transaction,Subtotal,Total (inclusive of fees and/or spread),Fees and/or Spread,Notes',
  '2024-03-15T08:12:45Z,Buy,BTC,0.05,EUR,60000.00,3000.00,"3,015.00",15.00,Bought 0.05 BTC for €3015.00 EUR',
  '2024-04-02 09:30:00 UTC,Sell,ETH,1.5,EUR,3200.00,"4,800.00","4,776.00",24.00,Sold 1.5 ETH',
  '2024-05-10T14:00:00Z,Convert,ETH,0.5,EUR,3100.00,1550.00,1550.00,0.00,"Converted 0.5 ETH to 1,500.00 USDC"',
  '2024-06-01T10:00:00Z,Receive,SOL,12.0,EUR,,,,,Received from external wallet',
  '2024-06-15T00:00:00Z,Staking Income,ETH,0.012,EUR,3300.00,39.60,39.60,0.00,Staking reward',
  '2024-07-01T00:00:00Z,Withdrawal,USDC,500.0,EUR,1.00,500.00,500.00,0.00,Internal balance adjustment',
].join('\n');

function byType(events: RawEventInput[], type: string): RawEventInput[] {
  return events.filter((e) => e.eventType === type);
}

describe('coinbaseCsvImporter', () => {
  it('detects a Coinbase header line', () => {
    const header =
      'Timestamp,Transaction Type,Asset,Quantity Transacted,Spot Price Currency,Spot Price at Transaction,Subtotal,Total (inclusive of fees and/or spread),Fees and/or Spread,Notes';
    expect(coinbaseCsvImporter.detect(header, 'report.csv')).toBe(true);
    expect(coinbaseCsvImporter.detect('User_ID,UTC_Time,Account,Operation,Coin,Change', 'binance.csv')).toBe(false);
    // Preamble-prefixed files still route via the filename hint.
    expect(coinbaseCsvImporter.detect('Transactions', 'coinbase-2024.csv')).toBe(true);
  });

  it('maps a Buy to a SPOT_TRADE acquisition (isBuyer: true) vs the fiat counter', () => {
    const { events } = coinbaseCsvImporter.import(COINBASE_CSV, 'coinbase.csv');
    const spots = byType(events, CRYPTO_EVENT_TYPE.SPOT_TRADE);
    const buy = spots.find((e) => e.rawPayload.baseAsset === 'BTC');

    expect(buy).toBeDefined();
    expect(buy?.rawPayload.isBuyer).toBe(true);
    expect(buy?.rawPayload.baseAsset).toBe('BTC');
    expect(buy?.rawPayload.quoteAsset).toBe('EUR');
    expect(buy?.rawPayload.qty).toBe('0.05');
    // Subtotal (excl. fees) is the counter quantity; the fee is carried apart.
    expect(buy?.rawPayload.quoteQty).toBe('3000.00');
    expect(buy?.rawPayload.commission).toBe('15.00');
    expect(buy?.source).toBe(CRYPTO_EXCHANGE.COINBASE);
  });

  it('maps a Sell to a SPOT_TRADE disposal (isBuyer: false), stripping thousands separators', () => {
    const { events } = coinbaseCsvImporter.import(COINBASE_CSV, 'coinbase.csv');
    const sell = byType(events, CRYPTO_EVENT_TYPE.SPOT_TRADE).find((e) => e.rawPayload.baseAsset === 'ETH');

    expect(sell).toBeDefined();
    expect(sell?.rawPayload.isBuyer).toBe(false);
    expect(sell?.rawPayload.qty).toBe('1.5');
    expect(sell?.rawPayload.quoteQty).toBe('4800.00'); // "4,800.00" → 4800.00
    expect(sell?.source).toBe(CRYPTO_EXCHANGE.COINBASE);
  });

  it('maps a Convert to a CONVERT event parsing both sides from Notes', () => {
    const { events } = coinbaseCsvImporter.import(COINBASE_CSV, 'coinbase.csv');
    const convert = byType(events, CRYPTO_EVENT_TYPE.CONVERT)[0];

    expect(convert).toBeDefined();
    expect(convert?.rawPayload.fromAsset).toBe('ETH');
    expect(convert?.rawPayload.fromAmount).toBe('0.5');
    expect(convert?.rawPayload.toAsset).toBe('USDC');
    expect(convert?.rawPayload.toAmount).toBe('1500.00'); // "1,500.00" → 1500.00
    expect(convert?.source).toBe(CRYPTO_EXCHANGE.COINBASE);
  });

  it('maps a Receive to a DEPOSIT and a Staking Income to a DIVIDEND (staking hint)', () => {
    const { events } = coinbaseCsvImporter.import(COINBASE_CSV, 'coinbase.csv');

    const deposit = byType(events, CRYPTO_EVENT_TYPE.DEPOSIT)[0];
    expect(deposit?.rawPayload.coin).toBe('SOL');
    expect(deposit?.rawPayload.amount).toBe('12.0');
    expect(deposit?.source).toBe(CRYPTO_EXCHANGE.COINBASE);

    const dividend = byType(events, CRYPTO_EVENT_TYPE.DIVIDEND)[0];
    expect(dividend?.rawPayload.asset).toBe('ETH');
    expect(dividend?.rawPayload.amount).toBe('0.012');
    expect(String(dividend?.rawPayload.enInfo).toLowerCase().startsWith('earn rewards:')).toBe(true);
    expect(dividend?.source).toBe(CRYPTO_EXCHANGE.COINBASE);
  });

  it('skips unsupported rows and reports them in the summary', () => {
    const { events, summary } = coinbaseCsvImporter.import(COINBASE_CSV, 'coinbase.csv');

    // 6 data rows: Buy, Sell, Convert, Receive, Staking Income mapped; Withdrawal skipped.
    expect(summary.rowsRead).toBe(6);
    expect(summary.rowsMapped).toBe(5);
    expect(summary.rowsSkipped).toBe(1);
    expect(summary.skippedOperations.Withdrawal).toBe(1);
    expect(events).toHaveLength(5);
  });

  it('produces idempotent externalIds namespaced with the coinbase- prefix', () => {
    const first = coinbaseCsvImporter.import(COINBASE_CSV, 'coinbase.csv').events;
    const second = coinbaseCsvImporter.import(COINBASE_CSV, 'coinbase.csv').events;

    expect(first.every((e) => e.externalId.startsWith('coinbase-'))).toBe(true);
    expect(first.map((e) => e.externalId)).toEqual(second.map((e) => e.externalId));
    // Ids are unique per row (no accidental collisions).
    expect(new Set(first.map((e) => e.externalId)).size).toBe(first.length);
  });
});
