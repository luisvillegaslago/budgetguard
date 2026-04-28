/**
 * Unit tests for the Binance CSV importer (src/services/exchanges/binance/CsvImporter.ts).
 *
 * Pure function, no DB. Covers: CSV tokenizer (quotes, embedded commas),
 * header validation, row → raw event mapping for the supported operations,
 * spot-trade grouping by timestamp, and idempotent ExternalID hashing.
 */

import { CRYPTO_EVENT_TYPE } from '@/constants/finance';
import {
  type BinanceCsvRow,
  CsvParseError,
  detectOffsetFromFilename,
  mapRowsToRawEvents,
  parseCsv,
  rowsToBinanceCsvRows,
} from '@/services/exchanges/binance/CsvImporter';

const HEADER = 'User_ID,UTC_Time,Account,Operation,Coin,Change,Remark';

function buildCsv(...rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

function row(partial: Partial<BinanceCsvRow>): BinanceCsvRow {
  return {
    utcTime: new Date('2025-01-15T10:00:00Z'),
    account: 'Spot',
    operation: 'Deposit',
    coin: 'BTC',
    change: 0.5,
    remark: '',
    ...partial,
  };
}

describe('parseCsv', () => {
  it('parses a simple CSV with header + rows', () => {
    const result = parseCsv('a,b,c\n1,2,3\n4,5,6');
    expect(result).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
      ['4', '5', '6'],
    ]);
  });

  it('handles quoted fields with embedded commas', () => {
    const result = parseCsv('a,b\n"hello, world","foo"');
    expect(result[1]).toEqual(['hello, world', 'foo']);
  });

  it('handles escaped quotes inside quoted fields', () => {
    const result = parseCsv('a\n"she said ""hi"""');
    expect(result[1]).toEqual(['she said "hi"']);
  });

  it('skips fully empty trailing lines', () => {
    const result = parseCsv('a,b\n1,2\n\n');
    expect(result).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('rowsToBinanceCsvRows', () => {
  it('throws on missing required column', () => {
    const raw = parseCsv('UTC_Time,Account,Operation,Coin\n2025-01-15 10:00:00,Spot,Deposit,BTC');
    expect(() => rowsToBinanceCsvRows(raw)).toThrow(CsvParseError);
  });

  it('parses the legacy header (UTC_Time, User_ID)', () => {
    const csv = buildCsv('123,2025-01-15 10:00:00,Spot,Deposit,BTC,0.5,memo');
    const result = rowsToBinanceCsvRows(parseCsv(csv));
    expect(result).toHaveLength(1);
    expect(result[0]?.utcTime.toISOString()).toBe('2025-01-15T10:00:00.000Z');
    expect(result[0]?.coin).toBe('BTC');
    expect(result[0]?.change).toBe(0.5);
    expect(result[0]?.remark).toBe('memo');
  });

  it('parses the newer header (Time, User ID with space) in YY-MM-DD format', () => {
    // Newer Binance export — header uses `Time` instead of `UTC_Time`
    // and `User ID` (with space) instead of `User_ID`. Timestamps are
    // YY-MM-DD HH:MM:SS in the user's TZ; with offset 0 we treat as UTC.
    const csv =
      'User ID,Time,Account,Operation,Coin,Change,Remark\n65175532,21-01-21 18:52:34,Spot,Commission History,BTC,0.00000388,';
    const result = rowsToBinanceCsvRows(parseCsv(csv));
    expect(result).toHaveLength(1);
    expect(result[0]?.utcTime.toISOString()).toBe('2021-01-21T18:52:34.000Z');
    expect(result[0]?.operation).toBe('Commission History');
  });

  it('disambiguates YY-MM-DD vs DD-MM-YY using the leading year position', () => {
    // 25-01-03 must mean 2025-01-03 (Jan 3, 2025), not Jan 25, 2003.
    const csv = 'User ID,Time,Account,Operation,Coin,Change,Remark\n1,25-01-03 12:00:00,Spot,Deposit,BTC,1,';
    const result = rowsToBinanceCsvRows(parseCsv(csv));
    expect(result[0]?.utcTime.toISOString()).toBe('2025-01-03T12:00:00.000Z');
  });

  it('shifts YY-MM-DD timestamps back to UTC when given a positive offset', () => {
    // 18:52 in UTC+2 → 16:52 UTC
    const csv = 'User ID,Time,Account,Operation,Coin,Change,Remark\n1,21-01-21 18:52:34,Spot,Deposit,BTC,1,';
    const result = rowsToBinanceCsvRows(parseCsv(csv), 120);
    expect(result[0]?.utcTime.toISOString()).toBe('2021-01-21T16:52:34.000Z');
  });

  it('ignores the caller-provided offset for the legacy UTC_Time column', () => {
    // UTC_Time is always UTC by definition — the offset hint must be a no-op.
    const csv = buildCsv('1,2025-01-15 10:00:00,Spot,Deposit,BTC,0.5,');
    const result = rowsToBinanceCsvRows(parseCsv(csv), 120);
    expect(result[0]?.utcTime.toISOString()).toBe('2025-01-15T10:00:00.000Z');
  });

  it('strips a UTF-8 BOM at the start of the file', () => {
    const csv = '﻿User ID,Time,Account,Operation,Coin,Change,Remark\n1,21-01-21 18:52:34,Spot,Deposit,BTC,1,';
    const result = rowsToBinanceCsvRows(parseCsv(csv));
    expect(result).toHaveLength(1);
    expect(result[0]?.coin).toBe('BTC');
  });
});

describe('detectOffsetFromFilename', () => {
  it('extracts a positive integer offset', () => {
    expect(detectOffsetFromFilename('Binance-Transaction-History-202604281735(UTC+2).csv')).toBe(120);
  });

  it('extracts a negative integer offset', () => {
    expect(detectOffsetFromFilename('export-(UTC-5).csv')).toBe(-300);
  });

  it('extracts an offset with minutes (e.g. India UTC+5:30)', () => {
    expect(detectOffsetFromFilename('export-(UTC+5:30).csv')).toBe(330);
  });

  it('returns 0 when no marker is present', () => {
    expect(detectOffsetFromFilename('plain.csv')).toBe(0);
  });
});

describe('mapRowsToRawEvents — single-row mapping', () => {
  it('maps Deposit → DEPOSIT raw event', () => {
    const result = mapRowsToRawEvents([row({ operation: 'Deposit', coin: 'BTC', change: 0.5 })]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.eventType).toBe(CRYPTO_EVENT_TYPE.DEPOSIT);
    expect(result.events[0]?.rawPayload).toMatchObject({ coin: 'BTC', amount: '0.5' });
  });

  it('maps Withdraw → WITHDRAW raw event with absolute amount', () => {
    const result = mapRowsToRawEvents([row({ operation: 'Withdraw', coin: 'ETH', change: -2 })]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.eventType).toBe(CRYPTO_EVENT_TYPE.WITHDRAW);
    expect(result.events[0]?.rawPayload).toMatchObject({ coin: 'ETH', amount: '2' });
  });

  it('maps Distribution → DIVIDEND raw event tagged as airdrop', () => {
    const result = mapRowsToRawEvents([row({ operation: 'HODLer Airdrops Distribution', coin: 'XPL', change: 100 })]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.eventType).toBe(CRYPTO_EVENT_TYPE.DIVIDEND);
    expect(String(result.events[0]?.rawPayload.enInfo)).toMatch(/^Airdrop:/);
  });

  it('maps Simple Earn Flexible Interest → DIVIDEND tagged as Earn rewards', () => {
    const result = mapRowsToRawEvents([
      row({ operation: 'Simple Earn Flexible Interest', coin: 'USDT', change: 0.01 }),
    ]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.eventType).toBe(CRYPTO_EVENT_TYPE.DIVIDEND);
    expect(String(result.events[0]?.rawPayload.enInfo)).toMatch(/^Earn rewards:/);
  });

  it('skips Simple Earn Subscription/Redemption (capital movement, not income)', () => {
    const result = mapRowsToRawEvents([
      row({ operation: 'Simple Earn Flexible Subscription', coin: 'USDC', change: 1000 }),
      row({ operation: 'Simple Earn Flexible Redemption', coin: 'USDC', change: 1000 }),
      row({ operation: 'Simple Earn Locked Subscription', coin: 'BTC', change: 0.5 }),
    ]);
    expect(result.events).toHaveLength(0);
    expect(result.summary.skippedOperations).toMatchObject({
      'Simple Earn Flexible Subscription': 1,
      'Simple Earn Flexible Redemption': 1,
      'Simple Earn Locked Subscription': 1,
    });
  });

  it('skips Launchpool Subscription/Redemption (capital movement, not income)', () => {
    const result = mapRowsToRawEvents([
      row({ operation: 'Launchpool Subscription/Redemption', coin: 'BNB', change: 1 }),
    ]);
    expect(result.events).toHaveLength(0);
    expect(result.summary.skippedOperations).toMatchObject({ 'Launchpool Subscription/Redemption': 1 });
  });

  it('keeps Onchain Yields Distribution as staking but skips its Subscription', () => {
    const result = mapRowsToRawEvents([
      row({ operation: 'Onchain Yields Fixed - Distribution', coin: 'USDT', change: 0.5 }),
      row({ operation: 'Onchain Yields Fixed - Subscription', coin: 'USDT', change: 100 }),
    ]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.eventType).toBe(CRYPTO_EVENT_TYPE.DIVIDEND);
    expect(String(result.events[0]?.rawPayload.enInfo)).toMatch(/^Earn rewards:/);
    expect(result.summary.skippedOperations).toMatchObject({ 'Onchain Yields Fixed - Subscription': 1 });
  });

  it('maps C2C Buy → C2C raw event with tradeType=BUY', () => {
    const result = mapRowsToRawEvents([row({ operation: 'C2C Buy', coin: 'USDT', change: 50 })]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.eventType).toBe(CRYPTO_EVENT_TYPE.C2C);
    expect(result.events[0]?.rawPayload).toMatchObject({ tradeType: 'BUY', asset: 'USDT' });
  });

  it('skips unsupported operations and counts them by name', () => {
    const result = mapRowsToRawEvents([
      row({ operation: 'Margin Loan' }),
      row({ operation: 'Margin Loan' }),
      row({ operation: 'Futures Settlement' }),
    ]);
    expect(result.events).toHaveLength(0);
    expect(result.summary.skippedOperations).toEqual({ 'Margin Loan': 2, 'Futures Settlement': 1 });
  });
});

describe('mapRowsToRawEvents — Small Assets Exchange (Dust)', () => {
  it('groups two dust legs into a single DUST raw mirroring the API payload', () => {
    const t = new Date('2024-06-10T08:00:00Z');
    const result = mapRowsToRawEvents([
      row({ utcTime: t, operation: 'Small Assets Exchange BNB', coin: 'ALGO', change: -100 }),
      row({ utcTime: t, operation: 'Small Assets Exchange BNB', coin: 'BNB', change: 0.0005 }),
    ]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.eventType).toBe(CRYPTO_EVENT_TYPE.DUST);
    expect(result.events[0]?.rawPayload).toMatchObject({
      detail: {
        fromAsset: 'ALGO',
        targetAsset: 'BNB',
        amount: '100',
        transferedAmount: '0.0005',
        serviceChargeAmount: '0',
      },
    });
  });

  it('skips dust groups missing the BNB leg', () => {
    const t = new Date('2024-06-10T08:00:00Z');
    const result = mapRowsToRawEvents([
      row({ utcTime: t, operation: 'Small Assets Exchange BNB', coin: 'ALGO', change: -100 }),
    ]);
    expect(result.events).toHaveLength(0);
    expect(result.summary.skippedOperations).toMatchObject({ 'Small Assets Exchange BNB': 1 });
  });
});

describe('mapRowsToRawEvents — Binance Convert', () => {
  it('groups two convert legs into a single CONVERT raw', () => {
    const t = new Date('2025-02-14T10:00:00Z');
    const result = mapRowsToRawEvents([
      row({ utcTime: t, operation: 'Binance Convert', coin: 'BTC', change: -0.01 }),
      row({ utcTime: t, operation: 'Binance Convert', coin: 'ETH', change: 0.15 }),
    ]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.eventType).toBe(CRYPTO_EVENT_TYPE.CONVERT);
    expect(result.events[0]?.rawPayload).toMatchObject({
      fromAsset: 'BTC',
      toAsset: 'ETH',
      fromAmount: '0.01',
      toAmount: '0.15',
    });
  });

  it('skips convert groups missing one side', () => {
    const t = new Date('2025-02-14T10:00:00Z');
    const result = mapRowsToRawEvents([row({ utcTime: t, operation: 'Binance Convert', coin: 'BTC', change: -0.01 })]);
    expect(result.events).toHaveLength(0);
    expect(result.summary.skippedOperations).toMatchObject({ 'Binance Convert': 1 });
  });
});

describe('mapRowsToRawEvents — spot trade grouping', () => {
  it('groups Buy + Sell at the same timestamp into one SPOT_TRADE', () => {
    const t = new Date('2025-03-01T12:00:00Z');
    const result = mapRowsToRawEvents([
      row({ utcTime: t, operation: 'Buy', coin: 'BTC', change: 0.1 }),
      row({ utcTime: t, operation: 'Sell', coin: 'USDT', change: -3000 }),
    ]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.eventType).toBe(CRYPTO_EVENT_TYPE.SPOT_TRADE);
    expect(result.events[0]?.rawPayload).toMatchObject({
      symbol: 'BTCUSDT',
      qty: '0.1',
      quoteQty: '3000',
      commission: '0',
    });
  });

  it('groups Buy + Sell + Fee at the same timestamp', () => {
    const t = new Date('2025-03-01T12:00:00Z');
    const result = mapRowsToRawEvents([
      row({ utcTime: t, operation: 'Buy', coin: 'BTC', change: 0.1 }),
      row({ utcTime: t, operation: 'Sell', coin: 'USDT', change: -3000 }),
      row({ utcTime: t, operation: 'Fee', coin: 'BNB', change: -0.001 }),
    ]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.rawPayload).toMatchObject({
      symbol: 'BTCUSDT',
      commission: '0.001',
      commissionAsset: 'BNB',
    });
  });

  it('skips spot groups that are missing the buy or sell side', () => {
    const t = new Date('2025-03-01T12:00:00Z');
    const result = mapRowsToRawEvents([row({ utcTime: t, operation: 'Buy', coin: 'BTC', change: 0.1 })]);
    expect(result.events).toHaveLength(0);
    expect(result.summary.rowsSkipped).toBe(1);
  });
});

describe('idempotency', () => {
  it('produces the same ExternalID hash for the same row content', () => {
    const r = row({ operation: 'Deposit', coin: 'BTC', change: 0.5 });
    const first = mapRowsToRawEvents([r]).events[0]?.externalId;
    const second = mapRowsToRawEvents([r]).events[0]?.externalId;
    expect(first).toBeDefined();
    expect(first).toBe(second);
  });

  it('produces different ExternalIDs for different content', () => {
    const a = mapRowsToRawEvents([row({ change: 0.5 })]).events[0]?.externalId;
    const b = mapRowsToRawEvents([row({ change: 0.6 })]).events[0]?.externalId;
    expect(a).not.toBe(b);
  });
});
