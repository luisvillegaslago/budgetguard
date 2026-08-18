/**
 * Integration Tests: cancelling a resolución de aplazamiento
 *
 * A deferral can be paid off early or be cancelled outright, and until now its pending fracciones
 * would have sat in Movimientos for ever. Cancelling moves every movement still pending to
 * TRANSACTION_STATUS.CANCELLED — the mechanism the app already has, filtered out of every summary
 * and every fiscal view — and leaves everything else exactly where it is.
 *
 * THE INVARIANT THIS FILE EXISTS FOR: a movement already paid is never touched. That money really
 * did leave the account, its intereses de demora are a deductible expense of the year they were
 * paid in, and rewriting it would silently restate a Modelo 130 that has already been filed. The
 * guard lives in the UPDATE's own WHERE clause rather than in a check before it, so the fake
 * client below reads the status predicate off the statement: an implementation that dropped
 * `AND "Status" = $4` would flip the paid rows here and fail, which a pre-check assertion could
 * not detect.
 *
 * The "Deferrals" row itself deliberately survives untouched — "UQ_Deferrals_UserExpediente" is
 * what stops the same letter being re-imported, and DEFERRAL_STATUS is derived from the movements
 * rather than stored, so a resolution whose fracciones are all cancelled already reads as
 * cancelled.
 */

import {
  DEFERRAL_CANCELLABLE_MOVEMENT_STATUS,
  DEFERRAL_CANCELLED_MOVEMENT_STATUS,
  DEFERRAL_PART,
  MODELO_TYPE,
  TRANSACTION_STATUS,
} from '@/constants/finance';
import type { DeferralPart, TransactionStatus } from '@/types/finance';

const USER_ID = 7;
const DEFERRAL_ID = 31;
/** Belongs to another user, so every user-scoped predicate must reject it */
const FOREIGN_DEFERRAL_ID = 99;

interface MovementFixture {
  TransactionID: number;
  DeferralID: number;
  UserID: number;
  DeferralFraccionNumber: number;
  DeferralPart: DeferralPart;
  AmountCents: number;
  TransactionDate: string;
  Status: TransactionStatus;
}

/** The three parts of one instalment, as the import books them: principal, recargo, intereses. */
function fraccion(
  fraccionNumber: number,
  firstTransactionId: number,
  dueDate: string,
  status: TransactionStatus,
): MovementFixture[] {
  const base = {
    DeferralID: DEFERRAL_ID,
    UserID: USER_ID,
    DeferralFraccionNumber: fraccionNumber,
    TransactionDate: dueDate,
    Status: status,
  };

  return [
    { ...base, TransactionID: firstTransactionId, DeferralPart: DEFERRAL_PART.PRINCIPAL, AmountCents: 48917 },
    { ...base, TransactionID: firstTransactionId + 1, DeferralPart: DEFERRAL_PART.SURCHARGE, AmountCents: 0 },
    { ...base, TransactionID: firstTransactionId + 2, DeferralPart: DEFERRAL_PART.INTEREST, AmountCents: 332 },
  ];
}

/**
 * The live 1T 2026 letter, half-way through: two instalments paid, two still to fall due.
 *
 * Fracción 3 carries a hand-marked paid part alongside two pending ones. The three parts of an
 * instalment are three independent "Transactions" rows and really can disagree, and the guard is
 * per movement rather than per fracción — so this is the row that proves it.
 */
function baseMovements(): MovementFixture[] {
  return [
    ...fraccion(1, 101, '2026-06-22', TRANSACTION_STATUS.PAID),
    ...fraccion(2, 104, '2026-07-20', TRANSACTION_STATUS.PAID),
    ...fraccion(3, 107, '2026-08-20', TRANSACTION_STATUS.PENDING),
    ...fraccion(4, 110, '2026-09-21', TRANSACTION_STATUS.PENDING),
  ];
}

let movements: MovementFixture[] = [];
/** Empty simulates a resolution that does not belong to the current user: the 404 path */
let deferralRows: Record<string, unknown>[] = [];
let statements: { sql: string; params: unknown[] }[] = [];

function deferralRow() {
  return {
    DeferralID: DEFERRAL_ID,
    ExpedienteNumber: '282640432002C',
    ModeloType: MODELO_TYPE.M130,
    FiscalYear: 2026,
    FiscalQuarter: 1,
    LiquidacionNumber: 'A2861626530066513',
    InterestStartDate: '2026-04-20',
    InterestRatePercent: '4.062',
    PrincipalCents: '195671',
    SurchargeCents: '0',
    InterestCents: '2324',
    FiscalDocumentID: null,
    CreatedAt: new Date('2026-05-02'),
    UpdatedAt: new Date('2026-05-02'),
  };
}

/** The columns MOVEMENT_READ_COLUMNS asks for — never the whole fixture row. */
function projectMovement(movement: MovementFixture) {
  return {
    TransactionID: movement.TransactionID,
    DeferralFraccionNumber: movement.DeferralFraccionNumber,
    DeferralPart: movement.DeferralPart,
    AmountCents: movement.AmountCents,
    TransactionDate: movement.TransactionDate,
    Status: movement.Status,
  };
}

function inPrintedOrder(rows: MovementFixture[]): MovementFixture[] {
  return [...rows].sort(
    (a, b) => a.DeferralFraccionNumber - b.DeferralFraccionNumber || a.TransactionID - b.TransactionID,
  );
}

/**
 * A "Transactions" table that answers the statement it is actually given.
 *
 * The UPDATE's status predicate is read off the SQL rather than assumed: when the statement stops
 * binding `"Status" = $4` the fake stops filtering, every movement of the resolution is rewritten,
 * and the paid-rows assertions below fail. That is the point — the guard has to be in the UPDATE.
 */
const client = {
  query: jest.fn(async (sql: string, params: unknown[] = []) => {
    statements.push({ sql, params });

    if (sql.includes('FROM "Deferrals"')) {
      const [deferralId, userId] = params as [number, number];
      return { rows: deferralRows.filter(() => deferralId === DEFERRAL_ID && userId === USER_ID) };
    }

    if (sql.includes('UPDATE "Transactions"')) {
      const [deferralId, userId, nextStatus, matchedStatus] = params as [
        number,
        number,
        TransactionStatus,
        TransactionStatus | undefined,
      ];
      const guarded = sql.includes('"Status" = $4');

      const updated = movements.filter(
        (movement) =>
          movement.DeferralID === deferralId &&
          movement.UserID === userId &&
          (!guarded || movement.Status === matchedStatus),
      );
      updated.forEach((movement) => {
        movement.Status = nextStatus;
      });
      return { rows: inPrintedOrder(updated).map(projectMovement) };
    }

    if (sql.includes('FROM "Transactions"')) {
      const [deferralId, userId] = params as [number, number];
      const selected = movements.filter((movement) => movement.DeferralID === deferralId && movement.UserID === userId);
      return { rows: inPrintedOrder(selected).map(projectMovement) };
    }

    return { rows: [] };
  }),
  release: jest.fn(),
};

jest.mock('@/services/database/connection', () => ({
  getPool: () => ({ connect: async () => client }),
  query: jest.fn(async () => []),
}));

jest.mock('@/libs/auth', () => ({ getUserIdOrThrow: jest.fn(async () => USER_ID) }));

import { cancelDeferralPendingMovements } from '@/services/database/DeferralRepository';

/** The statement keywords executed, in order — for asserting the transaction envelope. */
function executedKeywords(): string[] {
  return statements.flatMap(({ sql }) => {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return [sql];
    if (sql.includes('UPDATE "Transactions"')) return ['UPDATE'];
    if (sql.includes('FROM "Transactions"')) return ['SELECT_MOVEMENTS'];
    if (sql.includes('FROM "Deferrals"')) return ['SELECT_DEFERRAL'];
    return [];
  });
}

beforeEach(() => {
  movements = baseMovements();
  deferralRows = [deferralRow()];
  statements = [];
  client.query.mockClear();
  client.release.mockClear();
});

describe('cancelDeferralPendingMovements — what it must never touch', () => {
  it('leaves every already-paid movement exactly as it stands', async () => {
    const paidBefore = movements.filter((movement) => movement.Status === TRANSACTION_STATUS.PAID).map(projectMovement);

    await cancelDeferralPendingMovements(DEFERRAL_ID);

    const paidAfter = movements.filter((movement) => movement.Status === TRANSACTION_STATUS.PAID).map(projectMovement);
    // Same rows, same amounts, same dates, same status: that money really did move
    expect(paidAfter).toEqual(paidBefore);
  });

  it('never returns a paid movement among the cancelled ones', async () => {
    const result = await cancelDeferralPendingMovements(DEFERRAL_ID);

    expect(result.cancelled).not.toHaveLength(0);
    expect(result.cancelled.every((movement) => movement.status === DEFERRAL_CANCELLED_MOVEMENT_STATUS)).toBe(true);
    // Fracciones 1 and 2 were paid, so none of their six movements may appear
    expect(result.cancelled.map((movement) => movement.fraccionNumber)).toEqual([3, 3, 3, 4, 4, 4]);
  });

  it('spares a paid part sitting inside an otherwise pending fracción', async () => {
    // The three parts of an instalment are three rows: the recargo of fracción 3 was marked paid
    // by hand while its principal and its intereses are still pending.
    const paidPart = movements.find(
      (movement) => movement.DeferralFraccionNumber === 3 && movement.DeferralPart === DEFERRAL_PART.SURCHARGE,
    );
    if (!paidPart) throw new Error('fixture lost its surcharge part');
    paidPart.Status = TRANSACTION_STATUS.PAID;

    const result = await cancelDeferralPendingMovements(DEFERRAL_ID);

    expect(paidPart.Status).toBe(TRANSACTION_STATUS.PAID);
    expect(result.cancelled.map((movement) => movement.transactionId)).not.toContain(paidPart.TransactionID);
    const readBack = result.movements.find((movement) => movement.transactionId === paidPart.TransactionID);
    expect(readBack?.status).toBe(TRANSACTION_STATUS.PAID);
  });

  it('binds the pending status into the UPDATE instead of pre-checking it', async () => {
    await cancelDeferralPendingMovements(DEFERRAL_ID);

    const update = statements.find(({ sql }) => sql.includes('UPDATE "Transactions"'));
    expect(update).toBeDefined();
    expect(update?.sql).toContain('"Status" = $4');
    expect(update?.params).toContain(DEFERRAL_CANCELLABLE_MOVEMENT_STATUS);
    expect(update?.params).toContain(DEFERRAL_CANCELLED_MOVEMENT_STATUS);
    // Scoped to the owner as well: another user's rows are never reachable
    expect(update?.params).toContain(USER_ID);
  });
});

describe('cancelDeferralPendingMovements — what it writes', () => {
  it('moves every pending movement to cancelled', async () => {
    const result = await cancelDeferralPendingMovements(DEFERRAL_ID);

    expect(movements.some((movement) => movement.Status === TRANSACTION_STATUS.PENDING)).toBe(false);
    expect(result.cancelled).toHaveLength(6);
    expect(result.movements.filter((movement) => movement.status === TRANSACTION_STATUS.CANCELLED)).toHaveLength(6);
  });

  it('reports the resolution unchanged, so the letter stays on record', async () => {
    const result = await cancelDeferralPendingMovements(DEFERRAL_ID);

    // No status column to set: DEFERRAL_STATUS is derived from the movements on every read, and
    // the "Deferrals" row has to survive or "UQ_Deferrals_UserExpediente" would free the
    // expediente and let the very same PDF be imported again.
    expect(result.deferral?.deferralId).toBe(DEFERRAL_ID);
    expect(result.deferral?.expedienteNumber).toBe('282640432002C');
    expect(statements.some(({ sql }) => sql.includes('DELETE FROM "Deferrals"'))).toBe(false);
    expect(statements.some(({ sql }) => sql.includes('UPDATE "Deferrals"'))).toBe(false);
  });

  it('reads the movements back inside the same transaction it wrote them in', async () => {
    await cancelDeferralPendingMovements(DEFERRAL_ID);

    // The caller derives the resolution's state from `movements`, so it must be the state the
    // COMMIT leaves behind and not the one the UPDATE intended.
    expect(executedKeywords()).toEqual(['BEGIN', 'SELECT_DEFERRAL', 'UPDATE', 'SELECT_MOVEMENTS', 'COMMIT']);
  });

  it('is idempotent: a second cancellation finds nothing left to cancel', async () => {
    await cancelDeferralPendingMovements(DEFERRAL_ID);
    const paidAfterFirst = movements.filter((movement) => movement.Status === TRANSACTION_STATUS.PAID).length;

    const second = await cancelDeferralPendingMovements(DEFERRAL_ID);

    // Empty `cancelled` is what tells the caller there was nothing to do — never a pre-check
    expect(second.cancelled).toEqual([]);
    expect(second.movements).toHaveLength(12);
    expect(movements.filter((movement) => movement.Status === TRANSACTION_STATUS.PAID)).toHaveLength(paidAfterFirst);
  });

  it('touches nothing when the resolution has no pending fracción at all', async () => {
    movements.forEach((movement) => {
      movement.Status = TRANSACTION_STATUS.PAID;
    });

    const result = await cancelDeferralPendingMovements(DEFERRAL_ID);

    expect(result.cancelled).toEqual([]);
    expect(result.movements.every((movement) => movement.status === TRANSACTION_STATUS.PAID)).toBe(true);
  });
});

describe('cancelDeferralPendingMovements — a resolution that is not the caller’s', () => {
  it('returns a null deferral and writes nothing', async () => {
    deferralRows = [];

    const result = await cancelDeferralPendingMovements(FOREIGN_DEFERRAL_ID);

    expect(result).toEqual({ deferral: null, cancelled: [], movements: [] });
    expect(executedKeywords()).toEqual(['BEGIN', 'SELECT_DEFERRAL', 'ROLLBACK']);
    expect(movements.filter((movement) => movement.Status === TRANSACTION_STATUS.PENDING)).toHaveLength(6);
  });

  it('releases the connection even on the 404 path', async () => {
    deferralRows = [];

    await cancelDeferralPendingMovements(FOREIGN_DEFERRAL_ID);

    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
