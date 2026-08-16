/**
 * Component Tests: IrpfProvisionCard
 *
 * The card owns its own query, so the only way the annual billing override reaches the
 * backend is through the arguments it passes to useIrpfProjection. These tests pin that
 * contract (euros typed in, CENTS handed to the hook) plus the conditional blocks that
 * decide what the user actually sees: empty state, retenciones row and early-year warning.
 *
 * The pension contributions go the other way round: they are a saved setting, so the tests pin
 * that the form seeds itself from the stored profile, persists euros as cents per bucket, and
 * that the card reports every euro the caps kept out of the estimate.
 *
 * The translator is the real es.json dictionary rather than a stub map, so the assertions
 * read against the shipped Spanish copy and a renamed key breaks the test.
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_IRPF_REGION } from '@/constants/finance';
import { createTranslator } from '@/libs/i18n';
import es from '@/messages/es.json';
import type { FiscalProfile, IrpfProjection } from '@/types/finance';
import { formatCurrency } from '@/utils/money';

const translate = createTranslator(es as unknown as Record<string, unknown>);

const mockUseIrpfProjection = jest.fn();
const mockUseFiscalProfile = jest.fn();
const mockSaveProfile = jest.fn();
const mockSaveState = { isPending: false, isSuccess: false, errorMessage: null as string | null };

jest.mock('@/hooks/useIrpfProjection', () => ({
  useIrpfProjection: (year: number, projectedIncomeCents: number | null) =>
    mockUseIrpfProjection(year, projectedIncomeCents),
}));

jest.mock('@/hooks/useFiscalProfile', () => ({
  useFiscalProfile: (year: number) => mockUseFiscalProfile(year),
  useUpsertFiscalProfile: () => ({ mutate: mockSaveProfile, ...mockSaveState }),
}));

jest.mock('@/hooks/useTranslations', () => ({
  useTranslate: () => ({
    t: (key: string, values?: Record<string, string | number | boolean>) => translate(key, values),
    locale: 'es',
    setLocale: jest.fn(),
  }),
}));

import { IrpfProvisionCard } from '@/components/fiscal/IrpfProvisionCard';

const TEST_YEAR = 2026;

/** 90.000 € billed, 16.000 € of expenses: gap = estimatedIrpf (20.665,65 €) - modelo130 total (14.400 €). */
const BASE_PROJECTION: IrpfProjection = {
  fiscalYear: TEST_YEAR,
  region: DEFAULT_IRPF_REGION,
  ytdIncomeCents: 4_500_000,
  ytdExpensesCents: 800_000,
  projectedIncomeCents: 9_000_000,
  projectedExpensesCents: 1_600_000,
  gastosDificilCents: 200_000,
  projectedNetIncomeCents: 7_200_000,
  pensionIndividualCents: 0,
  pensionEmploymentCents: 0,
  pensionReductionCents: 0,
  baseLiquidableCents: 7_200_000,
  modelo130PaidCents: 720_000,
  modelo130PaidIsEstimated: false,
  modelo130RemainingCents: 720_000,
  modelo130TotalCents: 1_440_000,
  retencionesCents: 0,
  estimatedIrpfCents: 2_066_565,
  provisionGapCents: 626_565,
  marginalRate: 0.37,
  monthlyProvisionCents: 172_213,
  effectiveRate: 0.287,
  isProjectionReliable: true,
};

/** The stored profile the pension form seeds itself from — independent of what the projection applied. */
const STORED_PROFILE: FiscalProfile = {
  fiscalYear: TEST_YEAR,
  pensionIndividualCents: 0,
  pensionEmploymentCents: 0,
};

function renderCard(overrides: Partial<IrpfProjection> = {}, profile: Partial<FiscalProfile> = {}) {
  mockUseIrpfProjection.mockReturnValue({
    data: { ...BASE_PROJECTION, ...overrides },
    isLoading: false,
    isError: false,
  });
  mockUseFiscalProfile.mockReturnValue({ data: { ...STORED_PROFILE, ...profile }, isLoading: false, isError: false });
  return render(<IrpfProvisionCard year={TEST_YEAR} />);
}

/**
 * FiscalAmountRow lays the label and its figure out as siblings of the row div, which is the
 * only ancestor with justify-between (the label itself sits in an inner wrapper).
 */
function amountRow(label: string): HTMLElement {
  const row = screen.getByText(label).closest<HTMLElement>('div.justify-between');
  if (!row) throw new Error(`No row rendered for "${label}"`);
  return row;
}

function amountFor(label: string): string {
  return (amountRow(label).textContent ?? '').replace(label, '').trim();
}

function applyOverride(euros: string) {
  fireEvent.change(screen.getByLabelText(translate('fiscal.irpf-projection.override.label')), {
    target: { value: euros },
  });
  fireEvent.click(screen.getByRole('button', { name: translate('fiscal.irpf-projection.override.apply') }));
}

describe('IrpfProvisionCard', () => {
  beforeEach(() => {
    mockUseIrpfProjection.mockReset();
    mockUseFiscalProfile.mockReset();
    mockSaveProfile.mockReset();
    mockSaveState.isPending = false;
    mockSaveState.isSuccess = false;
    mockSaveState.errorMessage = null;
  });

  it('renders the provision gap as the headline figure', () => {
    renderCard();

    // formatCurrency(626_565) in Spanish format, with the € in its own span.
    // es-ES groups thousands only from five integer digits up, hence "6265,65" and not "6.265,65".
    expect(amountFor(translate('fiscal.irpf-projection.gap'))).toBe('6265,65€');
    // A positive gap is money still owed, so the row is emphasised as a warning
    expect(amountRow(translate('fiscal.irpf-projection.gap')).className).toContain('bg-guard-warning/5');
  });

  it('shows the no-activity copy and hides the breakdown when nothing was booked this year', () => {
    renderCard({ ytdIncomeCents: 0, ytdExpensesCents: 0 });

    expect(screen.getByText(translate('fiscal.irpf-projection.no-activity'))).toBeInTheDocument();
    expect(screen.queryByText(translate('fiscal.irpf-projection.gap'))).not.toBeInTheDocument();
    expect(screen.queryByText(translate('fiscal.irpf-projection.estimated-irpf'))).not.toBeInTheDocument();
  });

  it('re-runs the projection with the typed billing converted to cents', async () => {
    renderCard();

    expect(mockUseIrpfProjection).toHaveBeenLastCalledWith(TEST_YEAR, null);

    applyOverride('100000');

    await waitFor(() => expect(mockUseIrpfProjection).toHaveBeenLastCalledWith(TEST_YEAR, 10_000_000));
  });

  it('offers the reset button only while an override is active and clears it back to the run-rate', async () => {
    renderCard();
    const resetLabel = translate('fiscal.irpf-projection.override.reset');

    expect(screen.queryByRole('button', { name: resetLabel })).not.toBeInTheDocument();

    applyOverride('100000');
    await waitFor(() => expect(mockUseIrpfProjection).toHaveBeenLastCalledWith(TEST_YEAR, 10_000_000));

    fireEvent.click(screen.getByRole('button', { name: resetLabel }));

    await waitFor(() => expect(mockUseIrpfProjection).toHaveBeenLastCalledWith(TEST_YEAR, null));
  });

  it('warns that the run-rate is not trustworthy yet when the projection is unreliable', () => {
    renderCard({ isProjectionReliable: false });

    expect(screen.getByText(translate('fiscal.irpf-projection.unreliable-projection'))).toBeInTheDocument();
  });

  it('hides the early-year warning once the projection is reliable', () => {
    renderCard({ isProjectionReliable: true });

    expect(screen.queryByText(translate('fiscal.irpf-projection.unreliable-projection'))).not.toBeInTheDocument();
  });

  it('renders the retenciones row when clients withheld IRPF', () => {
    renderCard({ retencionesCents: 150_000, modelo130RemainingCents: 570_000 });

    expect(amountFor(translate('fiscal.irpf-projection.retenciones'))).toBe('1500,00€');
  });

  it('omits the retenciones row when no client withheld anything', () => {
    renderCard({ retencionesCents: 0 });

    expect(screen.queryByText(translate('fiscal.irpf-projection.retenciones'))).not.toBeInTheDocument();
  });

  // ── Pension contributions ──

  describe('pension contributions', () => {
    const individualField = (): HTMLElement =>
      screen.getByLabelText(translate('fiscal.irpf-projection.pension.individual-label'));
    const employmentField = (): HTMLElement =>
      screen.getByLabelText(translate('fiscal.irpf-projection.pension.employment-label'));
    const saveButton = (): HTMLElement =>
      screen.getByRole('button', { name: translate('fiscal.irpf-projection.pension.save') });

    it('seeds both fields from the stored profile so the figures survive a reload', async () => {
      renderCard({}, { pensionIndividualCents: 150_000, pensionEmploymentCents: 100_000 });

      await waitFor(() => expect(individualField()).toHaveValue(1500));
      expect(employmentField()).toHaveValue(1000);
    });

    it('persists the typed euros as cents, one amount per bucket', async () => {
      renderCard();

      fireEvent.change(individualField(), { target: { value: '1500' } });
      fireEvent.change(employmentField(), { target: { value: '4250' } });
      fireEvent.click(saveButton());

      await waitFor(() =>
        expect(mockSaveProfile).toHaveBeenCalledWith({
          fiscalYear: TEST_YEAR,
          pensionIndividualCents: 150_000,
          pensionEmploymentCents: 425_000,
        }),
      );
    });

    it('blocks the save button while the mutation is in flight', () => {
      mockSaveState.isPending = true;
      renderCard();

      // The pending button swaps its label for the shared loading copy
      expect(screen.queryByRole('button', { name: translate('fiscal.irpf-projection.pension.save') })).toBeNull();
      expect(screen.getByRole('button', { name: translate('common.loading') })).toBeDisabled();
    });

    it('renders the applied reduction and the resulting base only when something was reduced', () => {
      renderCard({
        pensionIndividualCents: 150_000,
        pensionEmploymentCents: 425_000,
        pensionReductionCents: 575_000,
        baseLiquidableCents: 6_625_000,
      });

      expect(amountFor(translate('fiscal.irpf-projection.pension-reduction'))).toBe('5750,00€');
      expect(amountFor(translate('fiscal.irpf-projection.base-liquidable'))).toBe('66.250,00€');
    });

    it('omits both rows when nothing was contributed', () => {
      renderCard();

      expect(screen.queryByText(translate('fiscal.irpf-projection.pension-reduction'))).not.toBeInTheDocument();
      expect(screen.queryByText(translate('fiscal.irpf-projection.base-liquidable'))).not.toBeInTheDocument();
    });

    it('names the bucket that exceeded its own ceiling and the amount actually applied', () => {
      // 2.000 € in the individual plan: 500 € over the 1.500 € general limit
      renderCard({ pensionIndividualCents: 200_000, pensionReductionCents: 150_000 });

      expect(
        screen.getByText(
          translate('fiscal.irpf-projection.pension.cap-individual', {
            declared: formatCurrency(200_000),
            applied: formatCurrency(150_000),
          }),
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          translate('fiscal.irpf-projection.pension.cap-applied', {
            declared: formatCurrency(200_000),
            applied: formatCurrency(150_000),
          }),
        ),
      ).toBeInTheDocument();
    });

    it('reports the shortfall when the joint percentage-of-earnings cap trimmed the sum', () => {
      renderCard({ pensionIndividualCents: 150_000, pensionEmploymentCents: 425_000, pensionReductionCents: 300_000 });

      expect(
        screen.getByText(
          translate('fiscal.irpf-projection.pension.cap-applied', {
            declared: formatCurrency(575_000),
            applied: formatCurrency(300_000),
          }),
        ),
      ).toBeInTheDocument();
      // Neither bucket broke a ceiling of its own, so no bucket is named
      expect(screen.queryByText(/plan individual/)).not.toBeInTheDocument();
    });

    it('persists the cents of a contribution paid in an odd amount', () => {
      renderCard();

      // Money never travels as a decimal: 1.500,55 € leaves the card as 150.055 cents
      fireEvent.change(individualField(), { target: { value: '1500.55' } });
      fireEvent.click(saveButton());

      return waitFor(() =>
        expect(mockSaveProfile).toHaveBeenCalledWith({
          fiscalYear: TEST_YEAR,
          pensionIndividualCents: 150_055,
          pensionEmploymentCents: 0,
        }),
      );
    });

    it('confirms the save and hands the button back once the mutation settles', () => {
      mockSaveState.isSuccess = true;
      renderCard();

      expect(screen.getByText(translate('fiscal.irpf-projection.pension.saved'))).toBeInTheDocument();
      expect(saveButton()).toBeEnabled();
    });

    it('does not accuse the employment plan of a limit it does not have', () => {
      // 5.000 € in the plan de empleo is fully deductible: the general limit stacks with the
      // 4.250 € increment, so nothing was trimmed and no notice belongs on screen.
      renderCard({ pensionEmploymentCents: 500_000, pensionReductionCents: 500_000 });

      expect(screen.queryByText(/por encima de su límite/)).not.toBeInTheDocument();
      expect(screen.queryByText(/esta estimación aplica/)).not.toBeInTheDocument();
    });

    it('reports declared against applied when a ceiling did trim the total', () => {
      // 6.000 € in the plan de empleo: 250 € over the 1.500 + 4.250 the instrument can carry
      renderCard({ pensionEmploymentCents: 600_000, pensionReductionCents: 575_000 });

      expect(
        screen.getByText(
          translate('fiscal.irpf-projection.pension.cap-applied', {
            declared: formatCurrency(600_000),
            applied: formatCurrency(575_000),
          }),
        ),
      ).toBeInTheDocument();
      // The individual bucket is empty, so it is not accused of anything
      expect(screen.queryByText(/plan individual/)).not.toBeInTheDocument();
    });

    it('renders no cap notice at all when nothing was contributed', () => {
      renderCard();

      expect(screen.queryByText(/Reducción aplicada/)).not.toBeInTheDocument();
      expect(screen.queryByText(/por encima de su límite/)).not.toBeInTheDocument();
    });

    it('stays silent when every declared euro made it into the estimate', () => {
      renderCard({ pensionIndividualCents: 150_000, pensionEmploymentCents: 425_000, pensionReductionCents: 575_000 });

      expect(
        screen.queryByText(
          translate('fiscal.irpf-projection.pension.cap-applied', {
            declared: formatCurrency(575_000),
            applied: formatCurrency(575_000),
          }),
        ),
      ).not.toBeInTheDocument();
    });
  });

  // ── Collapsing ──

  describe('collapse toggle', () => {
    const toggle = (): HTMLElement =>
      screen.getByRole('button', { name: new RegExp(translate('fiscal.irpf-projection.title')) });

    /** The animated region collapses through grid-template-rows, so 0fr means closed. */
    const collapsibleRegion = (): HTMLElement => {
      const region = document.getElementById(toggle().getAttribute('aria-controls') ?? '');
      if (!region) throw new Error('The toggle does not point at a region');
      return region;
    };

    it('starts expanded', () => {
      renderCard();

      expect(toggle()).toHaveAttribute('aria-expanded', 'true');
      expect(collapsibleRegion().style.gridTemplateRows).toBe('1fr');
    });

    it('collapses the detail on click and keeps the headline gap visible', () => {
      renderCard();

      fireEvent.click(toggle());

      expect(toggle()).toHaveAttribute('aria-expanded', 'false');
      expect(collapsibleRegion().style.gridTemplateRows).toBe('0fr');
      expect(collapsibleRegion().className).toContain('animate-collapse-close');
      // The gap is rendered outside the collapsible region, so it survives the fold
      expect(collapsibleRegion()).not.toContainElement(screen.getByText(translate('fiscal.irpf-projection.gap')));
      expect(amountFor(translate('fiscal.irpf-projection.gap'))).toBe('6265,65€');
    });

    it('expands again on a second click', () => {
      renderCard();

      fireEvent.click(toggle());
      fireEvent.click(toggle());

      expect(toggle()).toHaveAttribute('aria-expanded', 'true');
      expect(collapsibleRegion().style.gridTemplateRows).toBe('1fr');
      expect(collapsibleRegion().className).toContain('animate-collapse-open');
    });
  });
});
