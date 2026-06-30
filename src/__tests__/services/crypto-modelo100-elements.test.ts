/**
 * Integration test: getModelo100Summary now returns one element per
 * (Asset, Contraprestacion) and the F/N buckets are the fold of those
 * elements. Mocks the connection query layer so no real DB is touched.
 */

import { CRYPTO_CONTRAPRESTACION, CRYPTO_TAXABLE_KIND } from '@/constants/finance';

const elementRows = [
  {
    Asset: 'BTC',
    Contraprestacion: CRYPTO_CONTRAPRESTACION.FIAT,
    TransmissionValueCents: '5000000',
    TransmissionFeeCents: '1000',
    AcquisitionValueCents: '3000000',
    AcquisitionFeeCents: '500',
    GainLossCents: '1998500',
    RowCount: '2',
    IncompleteCount: '0',
  },
  {
    Asset: 'ETH',
    Contraprestacion: CRYPTO_CONTRAPRESTACION.NON_FIAT,
    TransmissionValueCents: '1000000',
    TransmissionFeeCents: '0',
    AcquisitionValueCents: '800000',
    AcquisitionFeeCents: '0',
    GainLossCents: '200000',
    RowCount: '1',
    IncompleteCount: '1',
  },
];

const airdropStakingRows = [
  { Kind: CRYPTO_TAXABLE_KIND.AIRDROP, TotalCents: '7500' },
  { Kind: CRYPTO_TAXABLE_KIND.STAKING_REWARD, TotalCents: '300' },
];

jest.mock('@/services/database/connection', () => ({
  getPool: jest.fn(),
  query: jest.fn(async (sql: string) => {
    if (sql.includes('"CryptoDisposals"')) return elementRows;
    if (sql.includes('"TaxableEvents"')) return airdropStakingRows;
    return [];
  }),
}));

jest.mock('@/libs/auth', () => ({
  getUserIdOrThrow: jest.fn(async () => 1),
  AuthError: class AuthError extends Error {},
}));

import { getModelo100Summary } from '@/services/database/CryptoFiscalRepository';

describe('getModelo100Summary — per-element breakdown', () => {
  it('returns one element per (asset, contraprestacion)', async () => {
    const summary = await getModelo100Summary(2025);
    expect(summary.elements).toHaveLength(2);
    const btc = summary.elements.find((e) => e.asset === 'BTC');
    const eth = summary.elements.find((e) => e.asset === 'ETH');
    expect(btc?.contraprestacion).toBe(CRYPTO_CONTRAPRESTACION.FIAT);
    expect(btc?.transmissionValueCents).toBe(5000000);
    expect(btc?.transmissionFeeCents).toBe(1000);
    expect(eth?.contraprestacion).toBe(CRYPTO_CONTRAPRESTACION.NON_FIAT);
    expect(eth?.gainLossCents).toBe(200000);
  });

  it('folds the elements into the F/N buckets (totals == sum of breakdown)', async () => {
    const summary = await getModelo100Summary(2025);
    expect(summary.casilla1804F.transmissionValueCents).toBe(5000000);
    expect(summary.casilla1804F.acquisitionFeeCents).toBe(500);
    expect(summary.casilla1804F.gainLossCents).toBe(1998500);
    expect(summary.casilla1804F.rowCount).toBe(2);
    expect(summary.casilla1804N.transmissionValueCents).toBe(1000000);
    expect(summary.casilla1804N.rowCount).toBe(1);
  });

  it('sums incompleteCoverageCount across elements and keeps 0304/0033', async () => {
    const summary = await getModelo100Summary(2025);
    expect(summary.incompleteCoverageCount).toBe(1);
    expect(summary.casilla0304Cents).toBe(7500);
    expect(summary.casilla0033Cents).toBe(300);
  });
});
