/**
 * Integration Tests: Deferrals API + import service
 * POST /api/fiscal/deferrals — import a confirmed AEAT resolution
 *
 * The route, the schema and DeferralImportService run for real; only the database layer is mocked,
 * so what is asserted here is the thing that costs money: which movements a resolution becomes.
 *
 * The fixture is letter 282640560363H (Modelo 130, 2T 2026), transcribed from its ANEXO I —
 * including the detail that AEAT does NOT keep the principal constant: 781,66 five times and then
 * 781,69, with the rounding remainder loaded onto the last fracción.
 */

import { API_ERROR, DEFERRAL_PART, MODELO_TYPE, VALIDATION_KEY } from '@/constants/finance';
import type { DeferralMovementDraft } from '@/services/database/DeferralRepository';
import type { Deferral } from '@/types/finance';

const INTEREST_CATEGORY_ID = 501;
const TAX_CATEGORY_ID = 502;

const storedDeferral: Deferral = {
  deferralId: 11,
  expedienteNumber: '282640560363H',
  modeloType: MODELO_TYPE.M130,
  fiscalYear: 2026,
  fiscalQuarter: 2,
  liquidacionNumber: null,
  interestStartDate: '2026-07-20',
  interestRatePercent: 4.062,
  principalCents: 468999,
  surchargeCents: 0,
  interestCents: 7212,
  fiscalDocumentId: null,
  createdAt: '2026-08-18T09:00:00.000Z',
  updatedAt: '2026-08-18T09:00:00.000Z',
};

let categoriesMissing = false;
let expedienteAlreadyImported = false;
let bookedMovements: DeferralMovementDraft[] = [];

jest.mock('@/services/database/DeferralRepository', () => {
  // Required inside the factory: jest.mock() is hoisted above the module body
  const { ConflictError } = require('@/utils/apiErrors');

  return {
    getDeferrals: jest.fn(async () => []),
    getDeferralCategoryIds: jest.fn(async () =>
      categoriesMissing ? null : { interestCategoryId: INTEREST_CATEGORY_ID, taxCategoryId: TAX_CATEGORY_ID },
    ),
    createDeferralWithMovements: jest.fn(async (_input: unknown, movements: DeferralMovementDraft[]) => {
      if (expedienteAlreadyImported) throw new ConflictError(API_ERROR.CONFLICT.DEFERRAL_EXPEDIENTE_EXISTS);
      bookedMovements = [...movements];
      return { deferral: storedDeferral, movementCount: movements.length };
    }),
  };
});

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, options?: { status?: number }) => ({
      status: options?.status ?? 200,
      json: async () => data,
    }),
  },
}));

import { POST } from '@/app/api/fiscal/deferrals/route';

interface FraccionPayload {
  fraccionNumber: number;
  principalCents: number;
  surchargeCents: number;
  interestCents: number;
  totalCents: number;
  dueDate: string;
}

/** ANEXO I of 282640560363H, row by row. No recargo de apremio on this resolution. */
const REAL_FRACCIONES: FraccionPayload[] = [
  {
    fraccionNumber: 1,
    principalCents: 78166,
    surchargeCents: 0,
    interestCents: 539,
    totalCents: 78705,
    dueDate: '2026-09-21',
  },
  {
    fraccionNumber: 2,
    principalCents: 78166,
    surchargeCents: 0,
    interestCents: 800,
    totalCents: 78966,
    dueDate: '2026-10-20',
  },
  {
    fraccionNumber: 3,
    principalCents: 78166,
    surchargeCents: 0,
    interestCents: 1070,
    totalCents: 79236,
    dueDate: '2026-11-20',
  },
  {
    fraccionNumber: 4,
    principalCents: 78166,
    surchargeCents: 0,
    interestCents: 1331,
    totalCents: 79497,
    dueDate: '2026-12-21',
  },
  {
    fraccionNumber: 5,
    principalCents: 78166,
    surchargeCents: 0,
    interestCents: 1601,
    totalCents: 79767,
    dueDate: '2027-01-20',
  },
  // The remainder rides on the last fracción: 781,69, not 781,66
  {
    fraccionNumber: 6,
    principalCents: 78169,
    surchargeCents: 0,
    interestCents: 1871,
    totalCents: 80040,
    dueDate: '2027-02-22',
  },
];

function realLetter(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    expedienteNumber: '282640560363H',
    modeloType: MODELO_TYPE.M130,
    fiscalYear: 2026,
    fiscalQuarter: 2,
    interestStartDate: '2026-07-20',
    interestRatePercent: 4.062,
    principalCents: 468999,
    surchargeCents: 0,
    interestCents: 7212,
    fracciones: REAL_FRACCIONES,
    ...overrides,
  };
}

function createMockRequest(body: Record<string, unknown>): {
  url: string;
  json: () => Promise<Record<string, unknown>>;
} {
  return { url: 'http://localhost:3000/api/fiscal/deferrals', json: async () => body };
}

async function importLetter(body: Record<string, unknown>) {
  // `as never`, as in the other route tests: the request is mocked down to url + json()
  const response = await POST(createMockRequest(body) as never, { params: Promise.resolve({}) });
  return { status: response.status, body: await response.json() };
}

describe('POST /api/fiscal/deferrals', () => {
  beforeEach(() => {
    categoriesMissing = false;
    expedienteAlreadyImported = false;
    bookedMovements = [];
  });

  it('books one movement per non-zero part of every fracción', async () => {
    const { status, body } = await importLetter(realLetter());

    expect(status).toBe(201);
    // Six fracciones x (principal + interés). The recargo column is zero, so it books nothing
    expect(body.data.movementCount).toBe(12);
    expect(bookedMovements).toHaveLength(12);
    expect(bookedMovements.some((movement) => movement.part === DEFERRAL_PART.SURCHARGE)).toBe(false);
    expect(bookedMovements.some((movement) => movement.amountCents === 0)).toBe(false);
  });

  it('books the principal as read, remainder included, and never as an even split', async () => {
    await importLetter(realLetter());

    const principals = bookedMovements
      .filter((movement) => movement.part === DEFERRAL_PART.PRINCIPAL)
      .map((movement) => movement.amountCents);

    expect(principals).toEqual([78166, 78166, 78166, 78166, 78166, 78169]);
    expect(principals.reduce((total, cents) => total + cents, 0)).toBe(468999);
  });

  it('deducts the interés in full and the other parts not at all', async () => {
    await importLetter(realLetter());

    const interest = bookedMovements.filter((movement) => movement.part === DEFERRAL_PART.INTEREST);
    const principal = bookedMovements.filter((movement) => movement.part === DEFERRAL_PART.PRINCIPAL);

    // Casilla 0203: the only deductible part, and deductible as a financial expense
    expect(interest.every((movement) => movement.deductionPercent === 100)).toBe(true);
    expect(interest.every((movement) => movement.categoryId === INTEREST_CATEGORY_ID)).toBe(true);
    // The tax itself is no expense at all
    expect(principal.every((movement) => movement.deductionPercent === 0)).toBe(true);
    expect(principal.every((movement) => movement.categoryId === TAX_CATEGORY_ID)).toBe(true);
  });

  it('dates every part of a fracción on its vencimiento and names it in the description', async () => {
    await importLetter(realLetter());

    const third = bookedMovements.filter((movement) => movement.fraccionNumber === 3);

    expect(third.map((movement) => movement.dueDate)).toEqual(['2026-11-20', '2026-11-20']);
    expect(third.map((movement) => movement.description)).toEqual([
      'Aplazamiento Modelo 130 2T 2026 - Fracción 3/6 - Principal',
      'Aplazamiento Modelo 130 2T 2026 - Fracción 3/6 - Intereses de demora',
    ]);
  });

  it('returns the verdict on a letter that reconciles with itself', async () => {
    const { body } = await importLetter(realLetter());

    expect(body.data.verdict.isValid).toBe(true);
    expect(body.data.verdict.computedTotals).toEqual({
      principalCents: 468999,
      surchargeCents: 0,
      interestCents: 7212,
      totalCents: 476211,
    });
  });

  it('books the recargo as its own movement, and skips a zero interés', async () => {
    // Shaped after 282540627253E, whose last fracción is essentially the recargo on its own:
    // 0,01 EUR of principal, 416,24 EUR of recargo and 0,00 EUR of interest over 272 days
    const withSurcharge = realLetter({
      expedienteNumber: '282540627253E',
      fiscalYear: 2025,
      interestStartDate: '2025-07-22',
      principalCents: 208121,
      surchargeCents: 41624,
      interestCents: 843,
      fracciones: [
        {
          fraccionNumber: 1,
          principalCents: 208120,
          surchargeCents: 0,
          interestCents: 843,
          totalCents: 208963,
          dueDate: '2026-01-05',
        },
        {
          fraccionNumber: 2,
          principalCents: 1,
          surchargeCents: 41624,
          interestCents: 0,
          totalCents: 41625,
          dueDate: '2026-02-05',
        },
      ],
    });

    const { status } = await importLetter(withSurcharge);

    expect(status).toBe(201);
    expect(bookedMovements.map((movement) => [movement.fraccionNumber, movement.part])).toEqual([
      [1, DEFERRAL_PART.PRINCIPAL],
      [1, DEFERRAL_PART.INTEREST],
      [2, DEFERRAL_PART.PRINCIPAL],
      [2, DEFERRAL_PART.SURCHARGE],
    ]);
    // Non-deductible like the principal, and never folded into it
    const surcharge = bookedMovements.find((movement) => movement.part === DEFERRAL_PART.SURCHARGE);
    expect(surcharge).toMatchObject({ amountCents: 41624, deductionPercent: 0, categoryId: TAX_CATEGORY_ID });
  });

  it('answers 409 and books nothing when the same expediente is imported twice', async () => {
    expedienteAlreadyImported = true;

    const { status, body } = await importLetter(realLetter());

    expect(status).toBe(409);
    expect(body.error).toBe(API_ERROR.CONFLICT.DEFERRAL_EXPEDIENTE_EXISTS);
    expect(bookedMovements).toHaveLength(0);
  });

  it('rejects a letter whose fracciones do not add up to its own totals row', async () => {
    // 8,00 EUR of interest misread as 9,00 EUR: the row no longer matches its printed total
    const misread = realLetter({
      fracciones: REAL_FRACCIONES.map((fraccion) =>
        fraccion.fraccionNumber === 2 ? { ...fraccion, interestCents: 900 } : fraccion,
      ),
    });

    const { status, body } = await importLetter(misread);

    expect(status).toBe(400);
    expect(JSON.stringify(body.errors)).toContain(VALIDATION_KEY.FRACCION_TOTAL_MISMATCH);
    expect(bookedMovements).toHaveLength(0);
  });

  it('books nothing when the category holding casilla 0203 is gone', async () => {
    categoriesMissing = true;

    const { status, body } = await importLetter(realLetter());

    expect(status).toBe(404);
    expect(body.error).toBe(API_ERROR.NOT_FOUND.CATEGORY);
    expect(bookedMovements).toHaveLength(0);
  });
});
