/**
 * Component Tests: Modelo390Card — casillas 97/662 and the refund of the 4T 303
 *
 * Casillas 97 and 662 are only right when the fourth-quarter 303 carried the balance forward. The
 * app itself recommends asking for the refund there when the pool is stranded, and a refund moves
 * the whole balance to casilla 98 with 97 and 662 at zero. Nothing stored says whether the refund
 * was requested, so the card has to say that the two figures assume it was not — every time it
 * prints either of them, and never when it prints neither.
 *
 * The translator is the real es.json dictionary, so a renamed key breaks the test.
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createTranslator } from '@/libs/i18n';
import es from '@/messages/es.json';
import type { Modelo390Summary } from '@/types/finance';

const translate = createTranslator(es as unknown as Record<string, unknown>);

jest.mock('@/hooks/useTranslations', () => ({
  useTranslate: () => ({
    t: (key: string, values?: Record<string, string | number | boolean>) => translate(key, values),
    locale: 'es',
    setLocale: jest.fn(),
  }),
}));

// Radix needs a provider and a portal; the label is what the tests read, not the tooltip
jest.mock('@/components/ui/Tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

import { Modelo390Card } from '@/components/fiscal/Modelo390Card';

const REFUND_CAVEAT = translate('fiscal.modelo390.refund-caveat');

function makeSummary(overrides: Partial<Modelo390Summary> = {}): Modelo390Summary {
  return {
    fiscalYear: 2026,
    casilla47Cents: 0,
    casilla48Cents: 10_000,
    casilla49Cents: 2_100,
    casilla605Cents: 10_000,
    casilla606Cents: 2_100,
    casilla64Cents: 2_100,
    casilla65Cents: -2_100,
    casilla84Cents: -2_100,
    casilla86Cents: -2_100,
    casilla97Cents: 0,
    casilla662Cents: 0,
    casilla110Cents: 3_756_300,
    casilla108Cents: 3_756_300,
    ...overrides,
  };
}

describe('Modelo390Card — the refund caveat', () => {
  it('warns that casilla 97 assumes no refund was requested whenever it prints it', () => {
    render(<Modelo390Card data={makeSummary({ casilla97Cents: 2_100 })} />);

    expect(screen.getByText(REFUND_CAVEAT)).toBeInTheDocument();
  });

  it('warns as well when only casilla 662 is printed', () => {
    render(<Modelo390Card data={makeSummary({ casilla662Cents: 1_050 })} />);

    expect(screen.getByText(REFUND_CAVEAT)).toBeInTheDocument();
    // The figure is what is still pending, not what the other quarters generated
    expect(screen.getByText(/Pendiente de los demás trimestres/)).toBeInTheDocument();
  });

  it('says nothing when there is neither figure to qualify', () => {
    const payingYear = makeSummary({ casilla65Cents: 5_000, casilla84Cents: 5_000, casilla86Cents: 5_000 });

    render(<Modelo390Card data={payingYear} />);

    expect(screen.queryByText(REFUND_CAVEAT)).not.toBeInTheDocument();
  });
});
