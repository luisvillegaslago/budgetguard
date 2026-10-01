/**
 * Component Tests: the casilla 110 the user copies from AEAT once a year
 *
 * The whole year's IVA pool rolls forward from this figure, so the tests pin that the 303 card
 * offers it only in the first quarter, that it seeds itself from the stored profile, and that
 * what is typed in euros reaches the profile as cents — without touching the pension figures
 * stored on the same row.
 *
 * The translator is the real es.json dictionary, so the assertions read against the shipped copy.
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createTranslator } from '@/libs/i18n';
import es from '@/messages/es.json';
import type { FiscalProfile, Modelo303Summary } from '@/types/finance';

const translate = createTranslator(es as unknown as Record<string, unknown>);

const mockUseFiscalProfile = jest.fn();
const mockSaveProfile = jest.fn();

jest.mock('@/hooks/useFiscalProfile', () => ({
  useFiscalProfile: (year: number) => mockUseFiscalProfile(year),
  useUpsertFiscalProfile: () => ({ mutate: mockSaveProfile, isPending: false, isSuccess: false, errorMessage: null }),
}));

jest.mock('@/hooks/useTranslations', () => ({
  useTranslate: () => ({
    t: (key: string, values?: Record<string, string | number | boolean>) => translate(key, values),
    locale: 'es',
    setLocale: jest.fn(),
  }),
}));

import { Modelo303Card } from '@/components/fiscal/Modelo303Card';

const TEST_YEAR = 2026;

function makeProfile(vatPoolOpeningCents: number): FiscalProfile {
  return { fiscalYear: TEST_YEAR, pensionIndividualCents: 150_000, pensionEmploymentCents: 0, vatPoolOpeningCents };
}

function makeSummary(fiscalQuarter: number): Modelo303Summary {
  return {
    fiscalYear: TEST_YEAR,
    fiscalQuarter,
    casilla07Cents: 0,
    casilla09Cents: 0,
    casilla27Cents: 0,
    casilla28Cents: 0,
    casilla29Cents: 0,
    casilla45Cents: 0,
    casilla120Cents: 1_000_000,
    resultCents: 0,
    vatPoolOpeningCents: 98_765,
    vatPoolClosingCents: 98_765,
    vatPoolIsStranded: true,
    vatPoolExpiryUnknown: false,
  };
}

const fieldLabel = () => translate('fiscal.modelo303.opening.label');

describe('Modelo303Card — casilla 110 carried into the year', () => {
  beforeEach(() => {
    mockSaveProfile.mockClear();
    mockUseFiscalProfile.mockReturnValue({ data: makeProfile(98_765) });
  });

  it('asks for it in the first quarter, explaining when and where to find it', () => {
    render(<Modelo303Card data={makeSummary(1)} />);

    expect(screen.getByLabelText(fieldLabel())).toBeInTheDocument();
    expect(screen.getByText(translate('fiscal.modelo303.opening.when'))).toBeInTheDocument();
    expect(screen.getByText(translate('fiscal.modelo303.opening.refund'))).toBeInTheDocument();
  });

  it.each([2, 3, 4])('does not offer it in quarter %i, which rolls forward from it', (quarter) => {
    render(<Modelo303Card data={makeSummary(quarter)} />);

    expect(screen.queryByLabelText(fieldLabel())).toBeNull();
  });

  it('seeds the field with the stored figure', async () => {
    render(<Modelo303Card data={makeSummary(1)} />);

    await waitFor(() => expect(screen.getByLabelText(fieldLabel())).toHaveValue(987.65));
  });

  it('saves the euros typed as cents, sending only the IVA pool so the pensions stay untouched', async () => {
    render(<Modelo303Card data={makeSummary(1)} />);

    fireEvent.change(screen.getByLabelText(fieldLabel()), { target: { value: '950.40' } });
    fireEvent.click(screen.getByRole('button', { name: translate('fiscal.modelo303.opening.save') }));

    await waitFor(() =>
      expect(mockSaveProfile).toHaveBeenCalledWith({ fiscalYear: TEST_YEAR, vatPoolOpeningCents: 95_040 }),
    );
  });

  it('accepts zero, which is what AEAT prefills after a refund', async () => {
    render(<Modelo303Card data={makeSummary(1)} />);

    fireEvent.change(screen.getByLabelText(fieldLabel()), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: translate('fiscal.modelo303.opening.save') }));

    await waitFor(() =>
      expect(mockSaveProfile).toHaveBeenCalledWith({ fiscalYear: TEST_YEAR, vatPoolOpeningCents: 0 }),
    );
  });

  it('refuses a negative balance', async () => {
    render(<Modelo303Card data={makeSummary(1)} />);

    fireEvent.change(screen.getByLabelText(fieldLabel()), { target: { value: '-5' } });
    fireEvent.click(screen.getByRole('button', { name: translate('fiscal.modelo303.opening.save') }));

    // The field's min blocks the submit before the schema runs; either way nothing is saved
    await waitFor(() => expect(screen.getByLabelText(fieldLabel())).toBeInvalid());
    expect(mockSaveProfile).not.toHaveBeenCalled();
  });
});
