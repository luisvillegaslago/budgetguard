/**
 * Component tests: the Modelo 100 crypto card and the AEAT guide warn when
 * casilla 0304 (airdrops) or 0033 (staking rewards) includes receipts whose
 * price was never resolved and were summed at 0 €. Without the warning the
 * guide hands an understated amount to copy into Renta Web.
 *
 * The translator is the real es.json dictionary, so the assertions read the
 * shipped Spanish copy and a renamed key breaks the test.
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { CRYPTO_CONTRAPRESTACION } from '@/constants/finance';
import type { Modelo100CryptoResponse } from '@/hooks/useCryptoFiscal';
import { createTranslator } from '@/libs/i18n';
import es from '@/messages/es.json';

const translate = createTranslator(es as unknown as Record<string, unknown>);

const mockUseSummary = jest.fn();

jest.mock('@/hooks/useCryptoFiscal', () => ({
  useCryptoModelo100Summary: (year: number) => mockUseSummary(year),
  useRecomputeCryptoFiscal: () => ({ mutateAsync: jest.fn(), isPending: false, errorMessage: null }),
}));

jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn() }),
}));

jest.mock('@/hooks/useTranslations', () => ({
  useTranslate: () => ({
    t: (key: string, values?: Record<string, string | number | boolean>) => translate(key, values),
    locale: 'es',
    setLocale: jest.fn(),
  }),
}));

import { CryptoAeatGuide } from '@/components/crypto/CryptoAeatGuide';
import { CryptoModelo100Section } from '@/components/crypto/CryptoModelo100Section';

const EMPTY_BUCKET = {
  transmissionValueCents: 0,
  transmissionFeeCents: 0,
  acquisitionValueCents: 0,
  acquisitionFeeCents: 0,
  gainLossCents: 0,
  rowCount: 0,
};

function response(unresolved: { airdrop: number; staking: number }): Modelo100CryptoResponse {
  return {
    summary: {
      fiscalYear: 2025,
      casilla1804F: { ...EMPTY_BUCKET },
      casilla1804N: { ...EMPTY_BUCKET },
      elements: [{ ...EMPTY_BUCKET, asset: 'BTC', contraprestacion: CRYPTO_CONTRAPRESTACION.FIAT, rowCount: 1 }],
      casilla0304Cents: 7500,
      casilla0304UnresolvedCount: unresolved.airdrop,
      casilla0033Cents: 300,
      casilla0033UnresolvedCount: unresolved.staking,
      incompleteCoverageCount: 0,
      needsReviewCount: 0,
      computedAt: '2026-01-01T00:00:00.000Z',
    },
    availableYears: [2025],
  };
}

function mockSummary(data: Modelo100CryptoResponse) {
  mockUseSummary.mockReturnValue({ isLoading: false, isError: false, data, refetch: jest.fn() });
}

/** The casilla card whose label paragraph reads `label` (label → header div → card). */
function cardFor(label: string): HTMLElement {
  const card = screen.getByText(label).parentElement?.parentElement;
  if (!card) throw new Error(`card for ${label} not found`);
  return card;
}

describe('CryptoModelo100Section — unresolved airdrops and staking rewards', () => {
  it('warns inside the 0033 card with the number of rewards summed at 0 €', () => {
    mockSummary(response({ airdrop: 0, staking: 4 }));
    render(<CryptoModelo100Section year={2025} onYearChange={jest.fn()} />);

    const warning = translate('crypto.fiscal.unresolved-income-warning', { count: 4 });
    expect(within(cardFor('Casilla 0033')).getByText(warning)).toBeInTheDocument();
    expect(within(cardFor('Casilla 0304')).queryByText(/sin precio de mercado/)).not.toBeInTheDocument();
  });

  it('warns inside the 0304 card for airdrops without a price', () => {
    mockSummary(response({ airdrop: 2, staking: 0 }));
    render(<CryptoModelo100Section year={2025} onYearChange={jest.fn()} />);

    const warning = translate('crypto.fiscal.unresolved-income-warning', { count: 2 });
    expect(within(cardFor('Casilla 0304')).getByText(warning)).toBeInTheDocument();
    expect(within(cardFor('Casilla 0033')).queryByText(/sin precio de mercado/)).not.toBeInTheDocument();
  });

  it('shows no warning when every airdrop and reward has a price', () => {
    mockSummary(response({ airdrop: 0, staking: 0 }));
    render(<CryptoModelo100Section year={2025} onYearChange={jest.fn()} />);

    expect(screen.queryByText(/sin precio de mercado/)).not.toBeInTheDocument();
  });
});

describe('CryptoAeatGuide — unresolved airdrops and staking rewards', () => {
  it('flags the 0033 amount in the collapsed header and explains it once opened', () => {
    mockSummary(response({ airdrop: 0, staking: 4 }));
    render(<CryptoAeatGuide year={2025} />);

    const header = screen.getByRole('button', { name: /Casilla 0033/ });
    expect(within(header).getByText(translate('crypto.aeat.unresolved-badge'))).toBeInTheDocument();
    expect(
      within(screen.getByRole('button', { name: /Casilla 0304/ })).queryByText(
        translate('crypto.aeat.unresolved-badge'),
      ),
    ).not.toBeInTheDocument();

    fireEvent.click(header);
    expect(screen.getByText(translate('crypto.aeat.unresolved-warning', { count: 4 }))).toBeInTheDocument();
  });

  it('does not flag any box when every airdrop and reward has a price', () => {
    mockSummary(response({ airdrop: 0, staking: 0 }));
    render(<CryptoAeatGuide year={2025} />);

    expect(screen.queryByText(translate('crypto.aeat.unresolved-badge'))).not.toBeInTheDocument();
  });
});
