/**
 * Integration Tests: the unlinked asset, and the movement that would fix it
 *
 * `FixedAssets."TransactionID"` is what makes getAssetTransactionIds() pull the purchase out of the
 * IRPF models (§ Amortización del inmovilizado). Without it the purchase stays a period expense
 * **and** the dotación is deducted on top — the same asset twice, silently, for as long as the
 * schedule runs, because both figures are individually correct and nothing reconciles them.
 *
 * Two halves are pinned here:
 *   getUnlinkedFixedAssets()      — which assets are in that state at all.
 *   getAssetPurchaseCandidates()  — which movements look like the missing purchase.
 *
 * The second one is the dangerous half. A **wrong** link is strictly worse than no candidate: it
 * stops a real purchase from being deducted while the impostor keeps being deducted, and it is
 * silent in both directions. So most of what follows asserts that something is *not* offered.
 *
 * The regression test is the live data: the Lenovo Yoga Slim 7 Gen 9 (tx 3489) IS linked, so a
 * correct implementation says nothing at all about it. Every other asset here is **HYPOTHETICAL** —
 * no real asset of this taxpayer is unlinked, and without invented ones the detection could not be
 * exercised at all. Do not read them as data about this taxpayer.
 */

import { ASSET_PURCHASE_MATCH, MODELO_100_CASILLA, TRANSACTION_TYPE } from '@/constants/finance';

// ── Fixtures: assets ──

interface FixedAssetRow {
  UserID: number;
  AssetID: number;
  Description: string;
  InServiceDate: string;
  BaseCents: number;
  /** NUMERIC(5,2) arrives from the driver as a string; the fixture keeps that shape honest */
  CoefficientPercent: string;
  AmortizationGroup: number | null;
  Modelo100CasillaCode: string;
  TransactionID: number | null;
  Notes: string | null;
  CreatedAt: string;
  UpdatedAt: string;
}

const USER_ID = 2;

/** The real asset: linked to its purchase, and therefore never a finding. */
const LENOVO: FixedAssetRow = {
  UserID: USER_ID,
  AssetID: 1,
  Description: 'Lenovo Yoga Slim 7 Gen 9',
  InServiceDate: '2025-11-28',
  BaseCents: 71818,
  CoefficientPercent: '52.00',
  AmortizationGroup: 5,
  Modelo100CasillaCode: MODELO_100_CASILLA.C0208,
  TransactionID: 3489,
  Notes: null,
  CreatedAt: '2026-08-19T00:00:00.000Z',
  UpdatedAt: '2026-08-19T00:00:00.000Z',
};

/** HYPOTHETICAL. 1.200,00 € of base, in service 10-mar-2026, with no purchase linked. */
const DESK: FixedAssetRow = {
  ...LENOVO,
  AssetID: 2,
  Description: 'Mesa elevable',
  InServiceDate: '2026-03-10',
  BaseCents: 120_000,
  CoefficientPercent: '10.00',
  AmortizationGroup: 2,
  TransactionID: null,
};

/**
 * HYPOTHETICAL. Same in-service date as the desk, but its base is the **full** 1.452,00 € because
 * none of its input VAT was deductible: what was never recovered from the Treasury is cost.
 */
const NON_DEDUCTIBLE_VAT_ASSET: FixedAssetRow = {
  ...DESK,
  AssetID: 3,
  Description: 'Instalación de aire acondicionado',
  BaseCents: 145_200,
};

/** HYPOTHETICAL. Exhausted long ago: bought and fully amortised in 2020, so no 2026 dotación. */
const EXHAUSTED: FixedAssetRow = {
  ...DESK,
  AssetID: 4,
  Description: 'Impresora',
  InServiceDate: '2020-01-01',
  BaseCents: 30_000,
  CoefficientPercent: '100.00',
};

// ── Fixtures: movements, as "vw_FiscalQuarterly" hands them over ──

interface FiscalRow {
  UserID: number;
  Type: string;
  TransactionID: number;
  TransactionDate: string;
  Description: string | null;
  VendorName: string | null;
  CategoryName: string;
  /** COALESCE("OriginalAmountCents", "AmountCents"): the view has already un-halved a shared expense */
  FullAmountCents: number;
  VatPercent: number;
  DeductionPercent: number;
  /** Already resolved against "DeductionPercent" by the view: never NULL here */
  VatDeductionPercent: number;
}

/** 1.452,00 € con IVA 21% → base 1.200,00 €, exactly the desk's stored base. Five days before it. */
const DESK_PURCHASE: FiscalRow = {
  UserID: USER_ID,
  Type: TRANSACTION_TYPE.EXPENSE,
  TransactionID: 4001,
  TransactionDate: '2026-03-05',
  Description: 'Mesa elevable eléctrica',
  VendorName: 'Muebles Nórdicos',
  CategoryName: 'Mobiliario',
  FullAmountCents: 145_200,
  VatPercent: 21,
  DeductionPercent: 100,
  VatDeductionPercent: 100,
};

/** 1.462,00 € → base 1.208,26 €, 8,26 € off the desk. Inside the 1% band, but a worse match. */
const NEAR_MISS: FiscalRow = {
  ...DESK_PURCHASE,
  TransactionID: 4002,
  TransactionDate: '2026-02-20',
  Description: 'Mesa de reuniones',
  FullAmountCents: 146_200,
};

/** 1.500,00 € → base 1.239,67 €, 39,67 € off. Outside the band: close is not the same as near. */
const AMOUNT_TOO_FAR: FiscalRow = {
  ...DESK_PURCHASE,
  TransactionID: 4003,
  TransactionDate: '2026-03-08',
  FullAmountCents: 150_000,
};

/** The exact amount, one year earlier. Nothing but the figure connects it to the asset. */
const A_YEAR_AWAY: FiscalRow = {
  ...DESK_PURCHASE,
  TransactionID: 4004,
  TransactionDate: '2025-03-05',
};

/** The exact amount, the exact day — and income. Money arriving never bought anything. */
const INCOME_SAME_AMOUNT: FiscalRow = {
  ...DESK_PURCHASE,
  TransactionID: 4005,
  Type: TRANSACTION_TYPE.INCOME,
  Description: 'Cobro factura CREST-02',
  CategoryName: 'Facturas',
};

/** The exact amount, and already the purchase of another asset. Linking it would duplicate a cost. */
const ALREADY_ANOTHER_ASSETS_PURCHASE: FiscalRow = {
  ...DESK_PURCHASE,
  TransactionID: 4006,
  TransactionDate: '2026-03-06',
};

const OWNER_OF_4006: FixedAssetRow = { ...DESK, AssetID: 9, Description: 'Otro activo', TransactionID: 4006 };

/**
 * A shared expense: 726,00 € left this account, the view reports the whole 1.452,00 €. The halved
 * figure is what a naive comparison would use, and it matches nothing.
 */
const SHARED_PURCHASE: FiscalRow = {
  ...DESK_PURCHASE,
  TransactionID: 4007,
  Description: 'Mesa elevable (gasto compartido)',
  FullAmountCents: 145_200,
};

/** Same 1.452,00 €, but art. 95 LIVA denies the input VAT: the whole amount is cost. */
const NO_VAT_DEDUCTION_PURCHASE: FiscalRow = {
  ...DESK_PURCHASE,
  TransactionID: 4008,
  Description: 'Instalación de aire acondicionado',
  VatDeductionPercent: 0,
};

// ── Fake Postgres ──

let assetRows: FixedAssetRow[] = [];
let fiscalRows: FiscalRow[] = [];

const mockQuery = jest.fn(async (sql: string, params: unknown[]) => {
  // getAssetPurchaseCandidates(): the WHERE of the real query, clause by clause
  if (sql.includes('vw_FiscalQuarterly')) {
    const [userId, type, from, to] = params as [number, string, string, string];
    const alreadyLinked = new Set(
      assetRows.filter((asset) => asset.UserID === userId).map((asset) => asset.TransactionID),
    );

    return fiscalRows.filter(
      (row) =>
        row.UserID === userId &&
        row.Type === type &&
        row.TransactionDate >= from &&
        row.TransactionDate <= to &&
        !alreadyLinked.has(row.TransactionID),
    );
  }

  // getFixedAssetById()
  if (sql.includes('WHERE "AssetID" = $1')) {
    const [assetId, userId] = params as [number, number];
    return assetRows.filter((asset) => asset.AssetID === assetId && asset.UserID === userId);
  }

  // loadAssets(): [userId] or [userId, upToDay]
  if (sql.includes('FROM "FixedAssets"')) {
    const [userId, upToDay] = params as [number, string | undefined];
    return assetRows.filter(
      (asset) => asset.UserID === userId && (upToDay === undefined || asset.InServiceDate <= upToDay),
    );
  }

  // updateFixedAsset(): only the single-field link the tests exercise, applied to the fixture so the
  // detection can be re-run against the state the fix leaves behind
  if (sql.includes('UPDATE "FixedAssets"')) {
    const [transactionId, assetId, userId] = params as [number, number, number];
    const target = assetRows.find((asset) => asset.AssetID === assetId && asset.UserID === userId);
    if (!target) return [];

    target.TransactionID = transactionId;
    return [target];
  }

  return [];
});

jest.mock('@/services/database/connection', () => ({
  query: (...args: [string, unknown[]]) => mockQuery(...args),
}));

jest.mock('@/libs/auth', () => ({
  getUserIdOrThrow: jest.fn(async () => USER_ID),
}));

import {
  getAssetPurchaseCandidates,
  getUnlinkedFixedAssets,
  updateFixedAsset,
} from '@/services/database/FixedAssetRepository';

beforeEach(() => {
  mockQuery.mockClear();
  assetRows = [{ ...LENOVO }, { ...DESK }];
  fiscalRows = [DESK_PURCHASE];
});

// ── The warning ──

describe('getUnlinkedFixedAssets — which assets are deducted twice', () => {
  it('should never report an asset whose purchase is linked', async () => {
    assetRows = [{ ...LENOVO }];

    const unlinked = await getUnlinkedFixedAssets();

    // The live data: the Lenovo is linked, so the correct answer is silence
    expect(unlinked).toEqual([]);
  });

  it('should report the asset with no linked purchase', async () => {
    const unlinked = await getUnlinkedFixedAssets();

    expect(unlinked).toHaveLength(1);
    expect(unlinked[0]?.assetId).toBe(DESK.AssetID);
    expect(unlinked[0]?.transactionId).toBeNull();
  });

  it('should keep the year semantics of getFixedAssets: no dotación in the year, no finding', async () => {
    assetRows = [{ ...DESK }, { ...EXHAUSTED }];

    const unlinked = await getUnlinkedFixedAssets(2026);

    // The printer is unlinked too, but its base ran out in 2020: nothing of it reaches a 2026 modelo
    expect(unlinked.map((asset) => asset.assetId)).toEqual([DESK.AssetID]);
  });
});

// ── The fix: which movement bought it ──

describe('getAssetPurchaseCandidates — the movement that looks like the purchase', () => {
  it('should offer nothing for an asset that already has its purchase linked', async () => {
    const candidates = await getAssetPurchaseCandidates(LENOVO.AssetID);

    // An asset with a link is not a problem to be fixed, whatever else the period contains
    expect(candidates).toEqual([]);
  });

  it('should offer nothing for an asset of another user', async () => {
    assetRows = [{ ...DESK, UserID: USER_ID + 1 }];

    expect(await getAssetPurchaseCandidates(DESK.AssetID)).toEqual([]);
  });

  it('should find the purchase and describe it well enough to be recognised', async () => {
    const candidates = await getAssetPurchaseCandidates(DESK.AssetID);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual({
      transactionId: DESK_PURCHASE.TransactionID,
      transactionDate: DESK_PURCHASE.TransactionDate,
      description: DESK_PURCHASE.Description,
      vendorName: DESK_PURCHASE.VendorName,
      categoryName: DESK_PURCHASE.CategoryName,
      fullAmountCents: 145_200,
      // 1.452,00 € con IVA 21% deducible → 1.200,00 € of amortizable cost, to the cent
      amortizableCostCents: DESK.BaseCents,
      amountDeltaCents: 0,
      daysBeforeInService: 5,
    });
  });

  it('should not offer a movement whose amount matches but which is a year away', async () => {
    fiscalRows = [A_YEAR_AWAY];

    // Only the figure connects them, and a figure alone is what invites the wrong link
    expect(await getAssetPurchaseCandidates(DESK.AssetID)).toEqual([]);
  });

  it('should not offer an income transaction, whatever it matches on', async () => {
    fiscalRows = [INCOME_SAME_AMOUNT];

    expect(await getAssetPurchaseCandidates(DESK.AssetID)).toEqual([]);
  });

  it('should not offer a movement that is already the purchase of another asset', async () => {
    assetRows = [{ ...DESK }, { ...OWNER_OF_4006 }];
    fiscalRows = [ALREADY_ANOTHER_ASSETS_PURCHASE];

    // Linking it here would amortize one cost as two assets
    expect(await getAssetPurchaseCandidates(DESK.AssetID)).toEqual([]);
  });

  it('should not offer a movement whose amount is merely in the neighbourhood', async () => {
    fiscalRows = [AMOUNT_TOO_FAR];

    // 39,67 € off 1.200,00 €: close enough to look plausible, which is exactly the trap
    expect(await getAssetPurchaseCandidates(DESK.AssetID)).toEqual([]);
  });

  it('should rank the exact amount above the one that only fits the band', async () => {
    fiscalRows = [NEAR_MISS, DESK_PURCHASE];

    const candidates = await getAssetPurchaseCandidates(DESK.AssetID);

    expect(candidates.map((candidate) => candidate.transactionId)).toEqual([
      DESK_PURCHASE.TransactionID,
      NEAR_MISS.TransactionID,
    ]);
    expect(candidates[1]?.amountDeltaCents).toBeGreaterThan(0);
  });

  it('should cut the list at MAX_CANDIDATES, closest amount first', async () => {
    fiscalRows = Array.from({ length: ASSET_PURCHASE_MATCH.MAX_CANDIDATES + 1 }, (_unused, index) => ({
      ...DESK_PURCHASE,
      TransactionID: 4100 + index,
      // Each one a little further from the base, all still inside the 1% band
      FullAmountCents: DESK_PURCHASE.FullAmountCents + index * 100,
    }));

    const candidates = await getAssetPurchaseCandidates(DESK.AssetID);

    expect(candidates).toHaveLength(ASSET_PURCHASE_MATCH.MAX_CANDIDATES);
    expect(candidates.map((candidate) => candidate.transactionId)).toEqual([4100, 4101, 4102, 4103, 4104]);
  });
});

// ── The two corrections that make the amounts comparable at all ──

describe('getAssetPurchaseCandidates — comparing a base with an amount that is not one', () => {
  it('should compare the un-halved amount of a shared expense, not the half that left the account', async () => {
    fiscalRows = [SHARED_PURCHASE];

    const [candidate] = await getAssetPurchaseCandidates(DESK.AssetID);

    // The view's "FullAmountCents" is the whole cost; the halved 726,00 € matches nothing
    expect(candidate?.fullAmountCents).toBe(145_200);
    expect(candidate?.amountDeltaCents).toBe(0);
  });

  it('should count non-deductible input VAT as cost, because it was never recovered', async () => {
    assetRows = [{ ...NON_DEDUCTIBLE_VAT_ASSET }];
    fiscalRows = [NO_VAT_DEDUCTION_PURCHASE];

    const [candidate] = await getAssetPurchaseCandidates(NON_DEDUCTIBLE_VAT_ASSET.AssetID);

    // With 0% of the IVA deductible the amortizable cost is the whole 1.452,00 €, not the base
    expect(candidate?.amortizableCostCents).toBe(145_200);
    expect(candidate?.amountDeltaCents).toBe(0);
  });

  it('should not match that same movement against a base net of a VAT that was never deducted', async () => {
    fiscalRows = [NO_VAT_DEDUCTION_PURCHASE];

    // The desk's base is 1.200,00 €; this movement cost 1.452,00 € because its IVA is not deductible
    expect(await getAssetPurchaseCandidates(DESK.AssetID)).toEqual([]);
  });
});

// ── Linking: the repository already has the door ──

describe('updateFixedAsset — the link is an ordinary field, and it closes the finding', () => {
  it('should write "TransactionID" and stop reporting the asset', async () => {
    const linked = await updateFixedAsset(DESK.AssetID, { transactionId: DESK_PURCHASE.TransactionID });

    expect(linked?.transactionId).toBe(DESK_PURCHASE.TransactionID);
    expect(await getUnlinkedFixedAssets()).toEqual([]);
    // And the asset stops offering candidates: there is nothing left to fix
    expect(await getAssetPurchaseCandidates(DESK.AssetID)).toEqual([]);
  });
});
