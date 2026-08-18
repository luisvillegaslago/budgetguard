/**
 * Integration Tests: cancelling a resolución de aplazamiento — service + route
 * GET  /api/fiscal/deferrals/[id]/cancel — what cancelling would do
 * POST /api/fiscal/deferrals/[id]/cancel — do it
 *
 * The route and DeferralCancellationService run for real; only the persistence layer is faked, by
 * an in-memory set of "Transactions" rows that applies the pending-only guard the repository's
 * UPDATE applies in SQL. The guard itself is asserted against the real statement in
 * services/deferral-cancellation.test.ts — what is asserted here is the layer above it: what the
 * user is shown before confirming, what they are told afterwards, and that the two agree.
 *
 * THE FIXTURE is letter 282640432002C (Modelo 130, 1T 2026): 1.956,71 € of principal and 23,24 €
 * of intereses de demora split into four fracciones, with the rounding remainder loaded onto the
 * last one (489,17 ×3 then 489,20) and no recargo de apremio — so each instalment books two
 * movements, not three, because a 0,00 € part books nothing.
 *
 * WHAT THESE TESTS EXIST FOR: an instalment already paid is never rewritten. That money left the
 * account and its interés is a deductible expense of the year it was paid in; making a screen tidy
 * is not a reason to restate a Modelo 130 that has already been filed.
 */

import { API_ERROR, DEFERRAL_PART, DEFERRAL_STATUS, MODELO_TYPE, TRANSACTION_STATUS } from '@/constants/finance';
import type { DeferralMovementRecord } from '@/services/database/DeferralRepository';
import type { Deferral, DeferralCancellationPreview, DeferralCancellationResult } from '@/types/finance';

const DEFERRAL_ID = 31;
/** No resolution with this id belongs to the caller — the 404 path */
const UNKNOWN_DEFERRAL_ID = 404;

const storedDeferral: Deferral = {
  deferralId: DEFERRAL_ID,
  expedienteNumber: '282640432002C',
  modeloType: MODELO_TYPE.M130,
  fiscalYear: 2026,
  fiscalQuarter: 1,
  liquidacionNumber: 'A2861626530066513',
  interestStartDate: '2026-04-20',
  interestRatePercent: 4.062,
  principalCents: 195671,
  surchargeCents: 0,
  interestCents: 2324,
  fiscalDocumentId: null,
  createdAt: '2026-05-02T08:00:00.000Z',
  updatedAt: '2026-05-02T08:00:00.000Z',
};

/** The two parts one instalment books: principal and intereses. The recargo is 0,00 € here. */
function fraccion(
  fraccionNumber: number,
  firstTransactionId: number,
  dueDate: string,
  principalCents: number,
  interestCents: number,
  status: DeferralMovementRecord['status'],
): DeferralMovementRecord[] {
  return [
    {
      transactionId: firstTransactionId,
      fraccionNumber,
      part: DEFERRAL_PART.PRINCIPAL,
      amountCents: principalCents,
      dueDate,
      status,
    },
    {
      transactionId: firstTransactionId + 1,
      fraccionNumber,
      part: DEFERRAL_PART.INTEREST,
      amountCents: interestCents,
      dueDate,
      status,
    },
  ];
}

/** ANEXO I of 282640432002C, half-way through: two instalments paid, two still to fall due. */
function baseMovements(): DeferralMovementRecord[] {
  return [
    ...fraccion(1, 101, '2026-06-22', 48917, 332, TRANSACTION_STATUS.PAID),
    ...fraccion(2, 103, '2026-07-20', 48917, 543, TRANSACTION_STATUS.PAID),
    ...fraccion(3, 105, '2026-08-20', 48917, 725, TRANSACTION_STATUS.PENDING),
    ...fraccion(4, 107, '2026-09-21', 48920, 724, TRANSACTION_STATUS.PENDING),
  ];
}

let movements: DeferralMovementRecord[] = [];
/** False simulates a resolution that is not the caller's: every read must come back empty */
let deferralExists = true;

jest.mock('@/services/database/DeferralRepository', () => ({
  getDeferralById: jest.fn(async () => (deferralExists ? storedDeferral : null)),
  getDeferralMovements: jest.fn(async () => (deferralExists ? movements.map((movement) => ({ ...movement })) : [])),
  cancelDeferralPendingMovements: jest.fn(async () => {
    if (!deferralExists) return { deferral: null, cancelled: [], movements: [] };

    // The repository's guard, as SQL applies it: only rows still pending are matched, so a part
    // marked paid in the meantime is not rewritten
    const cancelled = movements
      .filter((movement) => movement.status === TRANSACTION_STATUS.PENDING)
      .map((movement) => ({ ...movement, status: TRANSACTION_STATUS.CANCELLED }));

    const cancelledIds = new Set(cancelled.map((movement) => movement.transactionId));
    movements = movements.map((movement) =>
      cancelledIds.has(movement.transactionId) ? { ...movement, status: TRANSACTION_STATUS.CANCELLED } : movement,
    );

    return { deferral: storedDeferral, cancelled, movements: movements.map((movement) => ({ ...movement })) };
  }),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, options?: { status?: number }) => ({
      status: options?.status ?? 200,
      json: async () => data,
    }),
  },
}));

import { GET, POST } from '@/app/api/fiscal/deferrals/[id]/cancel/route';

interface ApiEnvelope<TData> {
  success?: boolean;
  data?: TData;
  error?: string;
}

function context(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

async function preview(id: number = DEFERRAL_ID) {
  const response = await GET(undefined, context(String(id)));
  return { status: response.status, body: (await response.json()) as ApiEnvelope<DeferralCancellationPreview> };
}

async function cancel(id: number = DEFERRAL_ID) {
  const response = await POST(undefined, context(String(id)));
  return { status: response.status, body: (await response.json()) as ApiEnvelope<DeferralCancellationResult> };
}

/** The rows as the fake table holds them now — the truth the assertions compare against. */
function statusOf(transactionId: number) {
  return movements.find((movement) => movement.transactionId === transactionId)?.status;
}

beforeEach(() => {
  movements = baseMovements();
  deferralExists = true;
  jest.clearAllMocks();
});

describe('GET /api/fiscal/deferrals/[id]/cancel — what cancelling would do', () => {
  it('splits the resolution into what goes and what stays', async () => {
    const { status, body } = await preview();

    expect(status).toBe(200);
    expect(body.data?.expedienteNumber).toBe('282640432002C');
    // Two instalments paid, two pending: the deferral is still running
    expect(body.data?.status).toBe(DEFERRAL_STATUS.ACTIVE);
    expect(body.data?.toCancel.map((f) => f.fraccionNumber)).toEqual([3, 4]);
    expect(body.data?.toKeep.map((f) => f.fraccionNumber)).toEqual([1, 2]);
  });

  it('adds each half up part by part, so the confirmation states real money', async () => {
    const { body } = await preview();

    // Fracciones 3 and 4: 489,17 + 489,20 of principal, 7,25 + 7,24 of intereses
    expect(body.data?.toCancelTotals).toEqual({
      principalCents: 97837,
      surchargeCents: 0,
      interestCents: 1449,
      totalCents: 99286,
    });
    // Fracciones 1 and 2, already paid: this money is not coming back
    expect(body.data?.toKeepTotals).toEqual({
      principalCents: 97834,
      surchargeCents: 0,
      interestCents: 875,
      totalCents: 98709,
    });
    // Both halves together are the whole letter — 1.956,71 € + 23,24 €
    expect((body.data?.toCancelTotals.totalCents ?? 0) + (body.data?.toKeepTotals.totalCents ?? 0)).toBe(
      storedDeferral.principalCents + storedDeferral.interestCents,
    );
  });

  it('carries the vencimiento and the movements of each fracción', async () => {
    const { body } = await preview();

    const fraccion3 = body.data?.toCancel.find((f) => f.fraccionNumber === 3);
    expect(fraccion3?.dueDate).toBe('2026-08-20');
    expect(fraccion3?.status).toBe(TRANSACTION_STATUS.PENDING);
    // Two movements, not three: a 0,00 € recargo books nothing
    expect(fraccion3?.movementIds).toEqual([105, 106]);
  });

  it('shows a half-paid fracción on both sides, each with its own amounts', async () => {
    // The parts of an instalment are independent rows: the intereses of fracción 3 were marked
    // paid by hand while its principal is still pending
    const interest = movements.find((movement) => movement.transactionId === 106);
    if (!interest) throw new Error('fixture lost the interest part of fracción 3');
    interest.status = TRANSACTION_STATUS.PAID;

    const { body } = await preview();

    expect(body.data?.toCancel.find((f) => f.fraccionNumber === 3)?.totals).toEqual({
      principalCents: 48917,
      surchargeCents: 0,
      interestCents: 0,
      totalCents: 48917,
    });
    // Showing the fracción whole on either side would overstate what the cancellation touches
    expect(body.data?.toKeep.find((f) => f.fraccionNumber === 3)?.totals).toEqual({
      principalCents: 0,
      surchargeCents: 0,
      interestCents: 725,
      totalCents: 725,
    });
  });

  it('reports a fully paid resolution as settled with nothing to cancel', async () => {
    movements = movements.map((movement) => ({ ...movement, status: TRANSACTION_STATUS.PAID }));

    const { body } = await preview();

    // Paying ahead of the calendar cancels nothing: the money moved
    expect(body.data?.status).toBe(DEFERRAL_STATUS.SETTLED);
    expect(body.data?.toCancel).toEqual([]);
    expect(body.data?.toCancelTotals.totalCents).toBe(0);
    expect(body.data?.toKeep).toHaveLength(4);
  });

  it('answers 404 for a resolution that is not the caller’s', async () => {
    deferralExists = false;

    const { status, body } = await preview(UNKNOWN_DEFERRAL_ID);

    expect(status).toBe(404);
    expect(body.error).toBe(API_ERROR.NOT_FOUND.DEFERRAL);
  });

  it('answers 400 for an id that is not a number', async () => {
    const response = await GET(undefined, context('abc'));

    expect(response.status).toBe(400);
  });
});

describe('POST /api/fiscal/deferrals/[id]/cancel — what it writes', () => {
  it('cancels every pending fracción and reports both halves', async () => {
    const { status, body } = await cancel();

    expect(status).toBe(200);
    expect(body.data?.status).toBe(DEFERRAL_STATUS.CANCELLED);
    expect(body.data?.cancelledFraccionNumbers).toEqual([3, 4]);
    expect(body.data?.cancelledMovementCount).toBe(4);
    expect(body.data?.cancelledTotals.totalCents).toBe(99286);
    expect(body.data?.keptMovementCount).toBe(4);
    expect(body.data?.keptTotals.totalCents).toBe(98709);
  });

  it('leaves every already-paid movement exactly as it stands', async () => {
    const paidBefore = movements.filter((movement) => movement.status === TRANSACTION_STATUS.PAID);

    await cancel();

    // Same rows, same amounts, same dates, same status: that charge really did leave the account
    expect(movements.filter((movement) => movement.status === TRANSACTION_STATUS.PAID)).toEqual(paidBefore);
    expect(statusOf(101)).toBe(TRANSACTION_STATUS.PAID);
    expect(statusOf(104)).toBe(TRANSACTION_STATUS.PAID);
  });

  it('spares a paid part sitting inside an otherwise pending fracción', async () => {
    const interest = movements.find((movement) => movement.transactionId === 106);
    if (!interest) throw new Error('fixture lost the interest part of fracción 3');
    interest.status = TRANSACTION_STATUS.PAID;

    const { body } = await cancel();

    expect(statusOf(106)).toBe(TRANSACTION_STATUS.PAID);
    expect(statusOf(105)).toBe(TRANSACTION_STATUS.CANCELLED);
    expect(body.data?.cancelledMovementCount).toBe(3);
    // 7,25 € of interés already paid ride with the two instalments that were paid in full
    expect(body.data?.keptTotals.interestCents).toBe(875 + 725);
  });

  it('reports the state the write left behind, not the one it intended', async () => {
    const { body } = await cancel();

    expect(movements.filter((movement) => movement.status === TRANSACTION_STATUS.PENDING)).toEqual([]);
    expect(body.data?.deferralId).toBe(DEFERRAL_ID);
    expect(body.data?.cancelledMovementCount ?? 0).toBe(
      movements.filter((movement) => movement.status === TRANSACTION_STATUS.CANCELLED).length,
    );
  });

  it('is a 409, not a silent success, when cancelled a second time', async () => {
    const first = await cancel();
    expect(first.status).toBe(200);

    const second = await cancel();

    // The repository writes nothing the second time; claiming "aplazamiento cancelado" for a call
    // that touched zero movements would report an effect that did not happen
    expect(second.status).toBe(409);
    expect(second.body.error).toBe(API_ERROR.CONFLICT.DEFERRAL_NOTHING_TO_CANCEL);
    // And nothing moved: the paid instalments are still paid, the cancelled ones still cancelled
    expect(statusOf(101)).toBe(TRANSACTION_STATUS.PAID);
    expect(statusOf(105)).toBe(TRANSACTION_STATUS.CANCELLED);
  });

  it('answers the same 409 for a resolution that was paid off in full', async () => {
    movements = movements.map((movement) => ({ ...movement, status: TRANSACTION_STATUS.PAID }));

    const { status, body } = await cancel();

    expect(status).toBe(409);
    expect(body.error).toBe(API_ERROR.CONFLICT.DEFERRAL_NOTHING_TO_CANCEL);
    expect(movements.every((movement) => movement.status === TRANSACTION_STATUS.PAID)).toBe(true);
  });

  it('cancels a resolution none of whose instalments has been paid', async () => {
    movements = movements.map((movement) => ({ ...movement, status: TRANSACTION_STATUS.PENDING }));

    const { status, body } = await cancel();

    expect(status).toBe(200);
    expect(body.data?.status).toBe(DEFERRAL_STATUS.CANCELLED);
    expect(body.data?.cancelledFraccionNumbers).toEqual([1, 2, 3, 4]);
    expect(body.data?.cancelledMovementCount).toBe(8);
    // The whole letter: 1.956,71 € of principal and 23,24 € of intereses
    expect(body.data?.cancelledTotals).toEqual({
      principalCents: storedDeferral.principalCents,
      surchargeCents: 0,
      interestCents: storedDeferral.interestCents,
      totalCents: storedDeferral.principalCents + storedDeferral.interestCents,
    });
    expect(body.data?.keptMovementCount).toBe(0);
    expect(body.data?.keptTotals.totalCents).toBe(0);
  });

  it('answers 404 for a resolution that is not the caller’s, writing nothing', async () => {
    deferralExists = false;

    const { status, body } = await cancel(UNKNOWN_DEFERRAL_ID);

    expect(status).toBe(404);
    expect(body.error).toBe(API_ERROR.NOT_FOUND.DEFERRAL);
    expect(movements.filter((movement) => movement.status === TRANSACTION_STATUS.PENDING)).toHaveLength(4);
  });

  it('answers 400 for an id that is not a number', async () => {
    const response = await POST(undefined, context('0'));

    expect(response.status).toBe(400);
  });
});
