/**
 * Component Tests: FixedAssetsCard — the asset with no linked purchase
 *
 * `FixedAssets."TransactionID"` is what makes the IRPF models drop the purchase from the period
 * expenses (docs/FISCAL_DOMAIN.md § Amortización del inmovilizado). An asset without it is deducted
 * twice — the purchase whole in its own year, the dotación on top, every year the schedule runs —
 * and nothing else in the app notices.
 *
 * **The first test is the regression test.** The live asset, the Lenovo Yoga Slim 7 linked to
 * transaction 3489, is correct, so the card must say nothing at all about it: no warning, no
 * candidate search, not even a request. A warning on the current data means the detection or the
 * wiring is wrong, and a false alarm on a fiscal screen costs more than the silence it replaced.
 *
 * The rest pin the other half: the warning appears only for a null `transactionId`, the ledger is
 * not scanned until somebody asks, no candidate is preselected, and linking takes a second,
 * deliberate click before it writes anything.
 *
 * The translator is the real es.json dictionary, so a renamed key breaks these tests.
 *
 * Both layouts are always mounted (the table is `hidden lg:block`, the list `lg:hidden`), so the
 * always-visible copy appears twice and only CSS hides one of them. The candidate panel is opened
 * per notice, so once opened it belongs to a single layout.
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { createTranslator } from '@/libs/i18n';
import es from '@/messages/es.json';
import type { AssetPurchaseCandidate, FixedAsset } from '@/types/finance';
import { formatCurrency } from '@/utils/money';

const translate = createTranslator(es as unknown as Record<string, unknown>);

const mockUseFixedAssets = jest.fn();
const mockUseAssetPurchaseCandidates = jest.fn();
const mockLinkPurchase = jest.fn();

jest.mock('@/hooks/useFixedAssets', () => ({
  useFixedAssets: (year?: number) => mockUseFixedAssets(year),
  useAssetPurchaseCandidates: (assetId: number | null) => mockUseAssetPurchaseCandidates(assetId),
  useUpdateFixedAsset: () => ({ mutate: mockLinkPurchase, isPending: false, errorMessage: null }),
  useCreateFixedAsset: () => ({ mutateAsync: jest.fn(), isPending: false, errorMessage: null }),
  useDeleteFixedAsset: () => ({ mutate: jest.fn(), isSuccess: false, errorMessage: null }),
}));

jest.mock('@/hooks/useTranslations', () => ({
  useTranslate: () => ({
    t: (key: string, values?: Record<string, string | number | boolean>) => translate(key, values),
    locale: 'es',
    setLocale: jest.fn(),
  }),
}));

import { FixedAssetsCard } from '@/components/fiscal/FixedAssetsCard';

const TEST_YEAR = 2026;

/** The live asset: 869,00 € con IVA → base 718,18 €, grupo 5 al 52% (ERD), en servicio 28-nov-2025 */
const LENOVO: FixedAsset = {
  assetId: 1,
  description: 'Portátil Lenovo Yoga Slim 7',
  inServiceDate: '2025-11-28',
  baseCents: 71818,
  coefficientPercent: 52,
  amortizationGroup: 5,
  modelo100CasillaCode: '0208',
  transactionId: 3489,
  notes: null,
  createdAt: '2026-08-17T00:00:00.000Z',
  updatedAt: '2026-08-17T00:00:00.000Z',
};

/** The same asset with the link missing — the only difference that matters here */
const UNLINKED_LENOVO: FixedAsset = { ...LENOVO, assetId: 2, transactionId: null };

const PURCHASE: AssetPurchaseCandidate = {
  transactionId: 3489,
  transactionDate: '2025-11-28',
  description: 'Portátil Lenovo Yoga Slim 7 Gen 9',
  vendorName: 'PcComponentes',
  categoryName: 'Equipamiento',
  fullAmountCents: 86900,
  amortizableCostCents: 71818,
  amountDeltaCents: 0,
  daysBeforeInService: 0,
};

const OTHER_CANDIDATE: AssetPurchaseCandidate = {
  transactionId: 3501,
  transactionDate: '2025-12-02',
  description: null,
  vendorName: null,
  categoryName: 'Material de oficina',
  fullAmountCents: 86850,
  amortizableCostCents: 71777,
  amountDeltaCents: 41,
  daysBeforeInService: -4,
};

const t = (key: string, values?: Record<string, string | number | boolean>) => translate(key, values);

const UNLINKED = 'fiscal.fixed-assets.unlinked-purchase';

function renderCard(assets: FixedAsset[]) {
  mockUseFixedAssets.mockReturnValue({ data: assets, isLoading: false, isError: false });
  return render(<FixedAssetsCard year={TEST_YEAR} />);
}

/** Both layouts render the same notice, so the toggles come in pairs; the first one is enough */
function openCandidates() {
  fireEvent.click(screen.getAllByRole('button', { name: t(`${UNLINKED}.candidates-title`) })[0]!);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAssetPurchaseCandidates.mockReturnValue({ data: undefined, isLoading: false, isError: false });
});

describe('FixedAssetsCard — unlinked purchase', () => {
  describe('an asset whose purchase is linked', () => {
    it('says nothing at all about it', () => {
      renderCard([LENOVO]);

      // The asset itself is on screen, so this is silence and not an empty card
      expect(screen.getAllByText(LENOVO.description).length).toBeGreaterThan(0);
      expect(screen.queryByText(t(`${UNLINKED}.label`))).not.toBeInTheDocument();
      expect(screen.queryByText(t(`${UNLINKED}.warning`))).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: t(`${UNLINKED}.candidates-title`) })).not.toBeInTheDocument();
    });

    it('never asks for candidates', () => {
      renderCard([LENOVO]);

      expect(mockUseAssetPurchaseCandidates).not.toHaveBeenCalled();
    });
  });

  describe('an asset with no linked purchase', () => {
    it('says so, and says what it costs', () => {
      renderCard([UNLINKED_LENOVO]);

      expect(screen.getAllByText(t(`${UNLINKED}.label`)).length).toBeGreaterThan(0);
      expect(screen.getAllByText(t(`${UNLINKED}.warning`)).length).toBeGreaterThan(0);
      expect(screen.getAllByText(t(`${UNLINKED}.context`)).length).toBeGreaterThan(0);
    });

    it('does not scan the ledger until the user asks', () => {
      renderCard([UNLINKED_LENOVO]);

      // The hook is mounted, but with no asset to search for: the request never leaves
      expect(mockUseAssetPurchaseCandidates).toHaveBeenCalledWith(null);
      expect(mockUseAssetPurchaseCandidates).not.toHaveBeenCalledWith(UNLINKED_LENOVO.assetId);

      openCandidates();
      expect(mockUseAssetPurchaseCandidates).toHaveBeenCalledWith(UNLINKED_LENOVO.assetId);
    });

    it('leaves the linked asset of the same list alone', () => {
      renderCard([LENOVO, UNLINKED_LENOVO]);

      // One notice per layout, for the unlinked asset only — never two
      expect(screen.getAllByText(t(`${UNLINKED}.warning`))).toHaveLength(2);
    });
  });

  describe('the candidates', () => {
    beforeEach(() => {
      mockUseAssetPurchaseCandidates.mockReturnValue({
        data: [PURCHASE, OTHER_CANDIDATE],
        isLoading: false,
        isError: false,
      });
    });

    it('shows enough of each movement to recognise it', () => {
      renderCard([UNLINKED_LENOVO]);
      openCandidates();

      expect(screen.getAllByText(PURCHASE.description as string).length).toBeGreaterThan(0);
      expect(screen.getAllByText(formatCurrency(PURCHASE.fullAmountCents)).length).toBeGreaterThan(0);
      // Date, category and vendor travel together on the meta line
      expect(screen.getAllByText(/28\/11\/2025/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(new RegExp(PURCHASE.vendorName as string)).length).toBeGreaterThan(0);
      // And the figure that made it a match, next to the base it was compared against
      expect(screen.getAllByText(new RegExp(formatCurrency(PURCHASE.amortizableCostCents))).length).toBeGreaterThan(0);
    });

    it('falls back to the category when the movement has no description', () => {
      renderCard([UNLINKED_LENOVO]);
      openCandidates();

      expect(screen.getAllByText(OTHER_CANDIDATE.categoryName).length).toBeGreaterThan(0);
    });

    it('preselects none of them', () => {
      renderCard([UNLINKED_LENOVO]);
      openCandidates();

      // One offer per candidate in the layout that was opened, and not one of them already chosen
      expect(screen.getAllByRole('button', { name: t(`${UNLINKED}.link`) })).toHaveLength(2);
      expect(screen.queryByRole('button', { name: t('common.buttons.confirm') })).not.toBeInTheDocument();
    });

    it('takes a second, deliberate click before it links anything', () => {
      renderCard([UNLINKED_LENOVO]);
      openCandidates();

      const offer = screen.getAllByRole('button', { name: t(`${UNLINKED}.link`) })[0]!;
      fireEvent.click(offer);

      // A single click has written nothing — it only asked
      expect(mockLinkPurchase).not.toHaveBeenCalled();
      expect(screen.getAllByRole('button', { name: t('common.buttons.confirm') }).length).toBeGreaterThan(0);

      fireEvent.click(screen.getAllByRole('button', { name: t('common.buttons.confirm') })[0]!);

      expect(mockLinkPurchase).toHaveBeenCalledTimes(1);
      expect(mockLinkPurchase.mock.calls[0]![0]).toEqual({
        id: UNLINKED_LENOVO.assetId,
        data: { transactionId: PURCHASE.transactionId },
      });
    });

    it('confirms the link once the notice that offered it is gone', () => {
      // The real mutation invalidates the asset list, which unmounts the notice; the confirmation
      // therefore has to live on the card, not inside it
      mockLinkPurchase.mockImplementation(
        (_variables: unknown, options?: { onSuccess?: () => void; onSettled?: () => void }) => {
          options?.onSuccess?.();
          options?.onSettled?.();
        },
      );

      renderCard([UNLINKED_LENOVO]);
      openCandidates();

      fireEvent.click(screen.getAllByRole('button', { name: t(`${UNLINKED}.link`) })[0]!);
      fireEvent.click(screen.getAllByRole('button', { name: t('common.buttons.confirm') })[0]!);

      expect(screen.getByText(t(`${UNLINKED}.linked`))).toBeInTheDocument();
    });
  });

  describe('when no movement fits', () => {
    it('says the empty result is normal, not a failure', () => {
      mockUseAssetPurchaseCandidates.mockReturnValue({ data: [], isLoading: false, isError: false });

      renderCard([UNLINKED_LENOVO]);
      openCandidates();

      expect(screen.getAllByText(t(`${UNLINKED}.candidates-empty`)).length).toBeGreaterThan(0);
      expect(screen.queryByRole('button', { name: t(`${UNLINKED}.link`) })).not.toBeInTheDocument();
    });

    it('keeps the warning up when the search itself fails', () => {
      mockUseAssetPurchaseCandidates.mockReturnValue({ data: undefined, isLoading: false, isError: true });

      renderCard([UNLINKED_LENOVO]);
      openCandidates();

      expect(screen.getAllByText(t('api-error.load.asset-purchase-candidates')).length).toBeGreaterThan(0);
      expect(screen.getAllByText(t(`${UNLINKED}.warning`)).length).toBeGreaterThan(0);
    });
  });
});
