/**
 * Integration test: recomputeAllYearsForUser over a history where the user
 * withdraws BTC to their own wallet and deposits it back later. Runs the real
 * repository and the real FIFO matcher; only the database connection is faked,
 * so the assertions read the exact rows the recompute would write to
 * CryptoDisposals (the rows behind 1804/1806/1807/1809).
 *
 * The round trip must not open a second lot at market value: the coins keep
 * their original lot, so a later sale of a new purchase at cost is a 0 € result,
 * not a phantom loss in 1807.
 */

import { CRYPTO_CONTRAPRESTACION, CRYPTO_PRICE_SOURCE, CRYPTO_TAXABLE_KIND } from '@/constants/finance';

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
}

function row(id: number, kind: string, occurredAt: string, grossCents: number, contraprestacion: string | null = null) {
  return {
    EventID: String(id),
    Kind: kind,
    OccurredAt: occurredAt,
    Asset: 'BTC',
    QuantityNative: '1',
    UnitPriceEurCents: String(grossCents),
    GrossValueEurCents: String(grossCents),
    FeeEurCents: '0',
    PriceSource: CRYPTO_PRICE_SOURCE.BINANCE_EUR,
    Contraprestacion: contraprestacion,
  } satisfies EventRow;
}

const TAXABLE_EVENTS: EventRow[] = [
  row(1, CRYPTO_TAXABLE_KIND.ACQUISITION, '2023-03-01T10:00:00.000Z', 10_000_00),
  row(2, CRYPTO_TAXABLE_KIND.TRANSFER_OUT, '2023-06-01T10:00:00.000Z', 20_000_00),
  row(3, CRYPTO_TAXABLE_KIND.TRANSFER_IN, '2024-02-01T10:00:00.000Z', 40_000_00),
  row(4, CRYPTO_TAXABLE_KIND.DISPOSAL, '2025-01-10T10:00:00.000Z', 90_000_00, CRYPTO_CONTRAPRESTACION.FIAT),
  row(5, CRYPTO_TAXABLE_KIND.ACQUISITION, '2025-02-01T10:00:00.000Z', 20_000_00),
  row(6, CRYPTO_TAXABLE_KIND.DISPOSAL, '2025-03-01T10:00:00.000Z', 20_000_00, CRYPTO_CONTRAPRESTACION.FIAT),
];

const clientCalls: Array<{ text: string; params?: unknown[] }> = [];

jest.mock('@/services/database/connection', () => ({
  query: jest.fn(async () => TAXABLE_EVENTS),
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
const COL = { TAXABLE_EVENT_ID: 1, ACQUISITION_VALUE: 9, GAIN_LOSS: 11, INCOMPLETE: 14, NEEDS_REVIEW: 15 } as const;

function insertedRows(): unknown[][] {
  const insert = clientCalls.find((c) => c.text.includes('INSERT INTO "CryptoDisposals"'));
  const params = insert?.params ?? [];
  return Array.from({ length: params.length / COLS_PER_DISPOSAL }, (_, i) =>
    params.slice(i * COLS_PER_DISPOSAL, (i + 1) * COLS_PER_DISPOSAL),
  );
}

describe('recomputeAllYearsForUser — BTC withdrawn to an own wallet and deposited back', () => {
  beforeEach(() => {
    clientCalls.length = 0;
  });

  it('writes the second 2025 sale at its real cost, with no loss and no review flag', async () => {
    const result = await recomputeAllYearsForUser(1);

    expect(result.totalDisposalsInserted).toBe(2);
    const rows = insertedRows();
    const secondSale = rows.find((r) => r[COL.TAXABLE_EVENT_ID] === '6');
    expect(secondSale?.[COL.ACQUISITION_VALUE]).toBe(20_000_00);
    expect(secondSale?.[COL.GAIN_LOSS]).toBe(0);
    expect(secondSale?.[COL.NEEDS_REVIEW]).toBe(false);
    expect(secondSale?.[COL.INCOMPLETE]).toBe(false);

    const firstSale = rows.find((r) => r[COL.TAXABLE_EVENT_ID] === '4');
    expect(firstSale?.[COL.GAIN_LOSS]).toBe(80_000_00);
  });
});
