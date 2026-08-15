/**
 * Component Tests: IrpfProvisionCard
 *
 * The card owns its own query, so the only way the annual billing override reaches the
 * backend is through the arguments it passes to useIrpfProjection. These tests pin that
 * contract (euros typed in, CENTS handed to the hook) plus the conditional blocks that
 * decide what the user actually sees: empty state, retenciones row and early-year warning.
 *
 * The translator is the real es.json dictionary rather than a stub map, so the assertions
 * read against the shipped Spanish copy and a renamed key breaks the test.
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_IRPF_REGION } from '@/constants/finance';
import { createTranslator } from '@/libs/i18n';
import es from '@/messages/es.json';
import type { IrpfProjection } from '@/types/finance';

const translate = createTranslator(es as unknown as Record<string, unknown>);

const mockUseIrpfProjection = jest.fn();

jest.mock('@/hooks/useIrpfProjection', () => ({
  useIrpfProjection: (year: number, projectedIncomeCents: number | null) =>
    mockUseIrpfProjection(year, projectedIncomeCents),
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

function renderCard(overrides: Partial<IrpfProjection> = {}) {
  mockUseIrpfProjection.mockReturnValue({
    data: { ...BASE_PROJECTION, ...overrides },
    isLoading: false,
    isError: false,
  });
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
