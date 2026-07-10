/**
 * Integration tests: Kraken ledgers.csv importer.
 *
 * Mirrors crypto-csv-import.test.ts but exercises the importer object directly:
 * the registry wiring (shared/index.ts) and upload route are owned by a later
 * integration phase, so here we assert the importer contract itself —
 *  - detect() recognises the Kraken ledger header (and rejects others)
 *  - a two-row trade is grouped by refid into one SPOT_TRADE
 *  - deposit / withdrawal (with network fee) / staking reward map correctly
 *  - every asset is normalised and every event carries source 'kraken'
 *  - re-importing the same file yields identical externalIds (idempotency)
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CRYPTO_EVENT_TYPE, CRYPTO_EXCHANGE } from '@/constants/finance';
import { krakenCsvImporter } from '@/services/exchanges/kraken/CsvImporter';
import type { RawEventInput } from '@/services/exchanges/shared/types';

const FIXTURE = readFileSync(join(__dirname, '../fixtures/kraken-ledgers-sample.csv'), 'utf8');
const HEADER = 'txid,refid,time,type,subtype,aclass,asset,amount,fee,balance';

function findByType(events: RawEventInput[], type: string): RawEventInput[] {
  return events.filter((e) => e.eventType === type);
}

describe('krakenCsvImporter.detect', () => {
  it('recognises the Kraken ledger header (quoted or bare)', () => {
    expect(krakenCsvImporter.detect(HEADER, 'ledgers.csv')).toBe(true);
    expect(
      krakenCsvImporter.detect(
        `"txid","refid","time","type","subtype","aclass","asset","amount","fee","balance"`,
        'ledgers.csv',
      ),
    ).toBe(true);
  });

  it('rejects a Binance header', () => {
    expect(krakenCsvImporter.detect('User_ID,UTC_Time,Account,Operation,Coin,Change,Remark', 'binance.csv')).toBe(
      false,
    );
  });

  it('exposes the kraken exchange id', () => {
    expect(krakenCsvImporter.exchange).toBe(CRYPTO_EXCHANGE.KRAKEN);
  });
});

describe('krakenCsvImporter.import', () => {
  it('groups a two-row trade (by refid) into one normalised SPOT_TRADE', () => {
    const { events } = krakenCsvImporter.import(FIXTURE, 'ledgers.csv');
    const trades = findByType(events, CRYPTO_EVENT_TYPE.SPOT_TRADE);

    expect(trades).toHaveLength(1);
    const payload = trades[0]?.rawPayload as Record<string, unknown>;
    // Positive amount (XXBT) = base/acquired, negative (ZEUR) = quote/disposed,
    // both asset-normalised and exposed explicitly so no symbol-splitting runs.
    expect(payload.baseAsset).toBe('BTC');
    expect(payload.quoteAsset).toBe('EUR');
    expect(payload.symbol).toBe('BTCEUR');
    expect(payload.isBuyer).toBe(true);
    expect(payload.qty).toBe('0.0125');
    expect(payload.quoteQty).toBe('500');
    // Fee booked on the quote (ZEUR) row surfaces as the commission.
    expect(payload.commission).toBe('1.3');
    expect(payload.commissionAsset).toBe('EUR');
  });

  it('maps a deposit row to a DEPOSIT event with the normalised coin', () => {
    const { events } = krakenCsvImporter.import(FIXTURE, 'ledgers.csv');
    const deposits = findByType(events, CRYPTO_EVENT_TYPE.DEPOSIT);

    expect(deposits).toHaveLength(1);
    const payload = deposits[0]?.rawPayload as Record<string, unknown>;
    expect(payload.coin).toBe('EUR');
    expect(payload.amount).toBe('1000');
  });

  it('maps a withdrawal row to a WITHDRAW event carrying the network fee', () => {
    const { events } = krakenCsvImporter.import(FIXTURE, 'ledgers.csv');
    const withdrawals = findByType(events, CRYPTO_EVENT_TYPE.WITHDRAW);

    expect(withdrawals).toHaveLength(1);
    const payload = withdrawals[0]?.rawPayload as Record<string, unknown>;
    expect(payload.coin).toBe('ETH');
    expect(payload.amount).toBe('2');
    expect(payload.transactionFee).toBe('0.0021');
  });

  it('maps a staking reward to a DIVIDEND event with the "Earn rewards:" hint', () => {
    const { events } = krakenCsvImporter.import(FIXTURE, 'ledgers.csv');
    const dividends = findByType(events, CRYPTO_EVENT_TYPE.DIVIDEND);

    expect(dividends).toHaveLength(1);
    const payload = dividends[0]?.rawPayload as Record<string, unknown>;
    expect(payload.asset).toBe('ADA'); // ADA.S staking suffix stripped
    expect(payload.amount).toBe('12.5');
    expect(String(payload.enInfo).toLowerCase().startsWith('earn rewards:')).toBe(true);
  });

  it('stamps source "kraken" on every event and counts the ignored transfer row', () => {
    const { events, summary } = krakenCsvImporter.import(FIXTURE, 'ledgers.csv');

    expect(events.every((e) => e.source === CRYPTO_EXCHANGE.KRAKEN)).toBe(true);
    // 6 data rows: 2 trade rows → 1 event, deposit, withdrawal, staking → 3
    // events, transfer row ignored.
    expect(summary.rowsRead).toBe(6);
    expect(summary.rowsMapped).toBe(5);
    expect(summary.rowsSkipped).toBe(1);
    expect(summary.skippedOperations.transfer).toBe(1);
    expect(events).toHaveLength(4);
  });

  it('is idempotent: re-importing the same ledger yields identical externalIds', () => {
    const first = krakenCsvImporter.import(FIXTURE, 'ledgers.csv');
    const second = krakenCsvImporter.import(FIXTURE, 'ledgers.csv');

    const ids = (r: typeof first) => r.events.map((e) => e.externalId).sort();
    expect(ids(second)).toEqual(ids(first));
    // ExternalIDs are namespaced so they never collide with Binance CSV ids.
    expect(first.events.every((e) => e.externalId.startsWith('kraken-'))).toBe(true);
  });
});
