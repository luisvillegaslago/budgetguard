/**
 * Integration test: recomputeAllYearsForUser over a history that still holds a
 * transfer_out leg normalised from a withdrawal Binance cancelled. Legs like
 * this were stored before the normaliser learned to drop failed records, and
 * recompute only replays stored TaxableEvents.
 *
 * FIFO treats a deposit after a transfer_out as the same coins coming back, so
 * the cancelled withdrawal would absorb a later real deposit, open no lot for
 * it, and leave the next sale without cost basis. The recompute must skip the
 * leg by the status in its raw payload.
 */

import {
  CRYPTO_CONTRAPRESTACION,
  CRYPTO_EVENT_TYPE,
  CRYPTO_PRICE_SOURCE,
  CRYPTO_TAXABLE_KIND,
} from '@/constants/finance';

interface EventRow {
  EventID: string;
  Kind: string;
  OccurredAt: string;
  Asset: string;
  QuantityNative: string;
  UnitPriceEurCents: string;
  GrossValueEurCents: string;
  FeeEurCents: string;
  PriceSource: string;
  Contraprestacion: string | null;
  EventType: string;
  RawPayload: Record<string, unknown> | null;
}

function row(
  id: number,
  kind: string,
  occurredAt: string,
  quantity: number,
  grossCents: number,
  raw: { eventType: string; payload: Record<string, unknown> | null },
  contraprestacion: string | null = null,
): EventRow {
  return {
    EventID: String(id),
    Kind: kind,
    OccurredAt: occurredAt,
    Asset: 'BTC',
    QuantityNative: String(quantity),
    UnitPriceEurCents: String(grossCents / quantity),
    GrossValueEurCents: String(grossCents),
    FeeEurCents: '0',
    PriceSource: CRYPTO_PRICE_SOURCE.BINANCE_EUR,
    Contraprestacion: contraprestacion,
    EventType: raw.eventType,
    RawPayload: raw.payload,
  };
}

const TRADE = { eventType: CRYPTO_EVENT_TYPE.SPOT_TRADE, payload: null };

// Binance withdraw history status 1 = cancelled: the coins never left.
const CANCELLED_WITHDRAWAL = {
  eventType: CRYPTO_EVENT_TYPE.WITHDRAW,
  payload: { status: 1, coin: 'BTC', amount: '1' },
};
const COMPLETED_DEPOSIT = { eventType: CRYPTO_EVENT_TYPE.DEPOSIT, payload: { status: 1, coin: 'BTC', amount: '1' } };

const TAXABLE_EVENTS: EventRow[] = [
  row(1, CRYPTO_TAXABLE_KIND.ACQUISITION, '2023-03-01T10:00:00.000Z', 1, 10_000_00, TRADE),
  row(2, CRYPTO_TAXABLE_KIND.TRANSFER_OUT, '2023-06-01T10:00:00.000Z', 1, 20_000_00, CANCELLED_WITHDRAWAL),
  row(3, CRYPTO_TAXABLE_KIND.TRANSFER_IN, '2024-02-01T10:00:00.000Z', 1, 40_000_00, COMPLETED_DEPOSIT),
  row(4, CRYPTO_TAXABLE_KIND.DISPOSAL, '2025-01-10T10:00:00.000Z', 2, 100_000_00, TRADE, CRYPTO_CONTRAPRESTACION.FIAT),
];

const queryCalls: Array<{ text: string; params?: unknown[] }> = [];
const clientCalls: Array<{ text: string; params?: unknown[] }> = [];

jest.mock('@/services/database/connection', () => ({
  query: jest.fn(async (text: string, params?: unknown[]) => {
    queryCalls.push({ text, params });
    return TAXABLE_EVENTS;
  }),
  getPool: jest.fn(() => ({
    connect: jest.fn(async () => ({
      query: jest.fn(async (text: string, params?: unknown[]) => {
        clientCalls.push({ text, params });
        return { rows: [] };
      }),
      release: jest.fn(),
    })),
  })),
}));

jest.mock('@/libs/auth', () => ({
  getUserIdOrThrow: jest.fn(async () => 1),
  AuthError: class AuthError extends Error {},
}));

import { recomputeAllYearsForUser } from '@/services/database/CryptoFiscalRepository';

/** Column order of the CryptoDisposals INSERT in CryptoFiscalRepository. */
const COLS_PER_DISPOSAL = 16;
const COL = { TAXABLE_EVENT_ID: 1, ACQUISITION_VALUE: 9, GAIN_LOSS: 11, INCOMPLETE: 14 } as const;

function insertedRows(): unknown[][] {
  const insert = clientCalls.find((c) => c.text.includes('INSERT INTO "CryptoDisposals"'));
  const params = insert?.params ?? [];
  return Array.from({ length: params.length / COLS_PER_DISPOSAL }, (_, i) =>
    params.slice(i * COLS_PER_DISPOSAL, (i + 1) * COLS_PER_DISPOSAL),
  );
}

describe('recomputeAllYearsForUser — a cancelled withdrawal stored as transfer_out', () => {
  beforeEach(() => {
    queryCalls.length = 0;
    clientCalls.length = 0;
  });

  it('keeps the later deposit as a lot, so the sale of both coins is fully covered', async () => {
    await recomputeAllYearsForUser(1);

    const sale = insertedRows().find((r) => r[COL.TAXABLE_EVENT_ID] === '4');
    expect(sale?.[COL.INCOMPLETE]).toBe(false);
    expect(sale?.[COL.ACQUISITION_VALUE]).toBe(50_000_00);
    expect(sale?.[COL.GAIN_LOSS]).toBe(50_000_00);
  });

  it('asks the database only for the payloads of event types that can fail', async () => {
    await recomputeAllYearsForUser(1);

    const load = queryCalls.find((c) => c.text.includes('FROM "TaxableEvents"'));
    expect(load?.params?.[2]).toEqual(expect.arrayContaining([CRYPTO_EVENT_TYPE.WITHDRAW, CRYPTO_EVENT_TYPE.DEPOSIT]));
    expect(load?.params?.[2]).not.toContain(CRYPTO_EVENT_TYPE.SPOT_TRADE);
  });
});
