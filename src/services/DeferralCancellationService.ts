/**
 * Deferral Cancellation Service
 *
 * A resolución de aplazamiento does not always run to the end of its calendar: AEAT can declare it
 * incumplido, the user can pay the remaining debt off in one go, or the deferral can simply be
 * revoked. Until now the instalments that never came to be paid would have sat in Movimientos as
 * pending expenses for ever, dragging a debt that no longer exists across every list.
 *
 * WHAT CANCELLING MEANS HERE. Every fracción movement still pending becomes
 * TRANSACTION_STATUS.CANCELLED — the mechanism the app already has, filtered out of every summary
 * view and every fiscal view — so the cancelled instalments leave the 130 and the 100 exactly as if
 * they had never been booked. No new flag is written anywhere: not on "Transactions", not on
 * "Deferrals".
 *
 * WHAT IT MUST NEVER DO. A movement already marked paid is left untouched, down to its date and its
 * DeductionPercent. That charge really did leave the account, its intereses de demora are a
 * deductible expense of the year they were paid in, and a Modelo 130 has very likely already been
 * filed on them. Rewriting history to make a screen tidier is the one thing this module cannot do.
 * The guard is the repository's UPDATE predicate, not a check here.
 *
 * PREVIEW AND WRITE ARE THE SAME TWO HALVES. {@link previewDeferralCancellation} answers "what
 * would go and what would stay", {@link cancelDeferral} answers "what went and what stayed", and
 * both fold the movements into fracciones through the same helpers — so the confirmation the user
 * accepts and the report they get back cannot describe the resolution in two different ways.
 */

import {
  API_ERROR,
  DEFERRAL_CANCELLABLE_MOVEMENT_STATUS,
  DEFERRAL_PART_AMOUNT_FIELD,
  DEFERRAL_STATUS,
  TRANSACTION_STATUS,
} from '@/constants/finance';
import {
  cancelDeferralPendingMovements,
  type DeferralMovementRecord,
  getDeferralById,
  getDeferralMovements,
} from '@/services/database/DeferralRepository';
import type {
  DeferralCancellationPreview,
  DeferralCancellationResult,
  DeferralFraccionMovements,
  DeferralStatus,
  DeferralTotals,
  TransactionStatus,
} from '@/types/finance';
import { ConflictError, NotFoundError } from '@/utils/apiErrors';

/** Nothing booked yet: the seed of every fold below, and what an empty set is worth. */
const EMPTY_TOTALS: DeferralTotals = { principalCents: 0, surchargeCents: 0, interestCents: 0, totalCents: 0 };

/**
 * What a set of movements is worth, part by part.
 *
 * Which column a movement belongs to is read from DEFERRAL_PART_AMOUNT_FIELD, the same table the
 * import uses to book it — so a fracción is added back up exactly the way it was taken apart.
 * `totalCents` is the sum of the movements themselves rather than of the three columns: they are
 * the same figure, and summing what is actually there survives a part this module has never seen.
 */
function movementTotals(movements: readonly DeferralMovementRecord[]): DeferralTotals {
  // A local accumulator rather than a spread inside reduce: the object never escapes this function,
  // and rebuilding it once per movement is the O(n²) Biome rightly complains about
  const totals: DeferralTotals = { ...EMPTY_TOTALS };

  movements.forEach((movement) => {
    totals[DEFERRAL_PART_AMOUNT_FIELD[movement.part]] += movement.amountCents;
    totals.totalCents += movement.amountCents;
  });

  return totals;
}

/**
 * Where a set of movements stands, as a single status.
 *
 * The three parts of an instalment are three independent "Transactions" rows and really can
 * disagree — a recargo marked paid by hand while the principal is still pending — so the answer is
 * resolved by precedence rather than read off any one row: **pending** wins (there is still
 * something to cancel), then **paid** (money moved), and only a set where nothing is pending and
 * nothing was paid is **cancelled**.
 */
function resolveStatus(movements: readonly DeferralMovementRecord[]): TransactionStatus {
  if (movements.some((movement) => movement.status === TRANSACTION_STATUS.PENDING)) return TRANSACTION_STATUS.PENDING;
  if (movements.some((movement) => movement.status === TRANSACTION_STATUS.PAID)) return TRANSACTION_STATUS.PAID;
  return TRANSACTION_STATUS.CANCELLED;
}

/**
 * Fold movements into the fracciones they belong to, in printed order.
 *
 * Called on a SUBSET as often as on the whole set: the preview folds the pending movements and the
 * kept ones separately, so a fracción whose recargo was already paid appears in both halves, each
 * carrying only its own amounts. Showing it whole on either side would overstate what the
 * cancellation touches — and that number is the one the user is about to approve.
 *
 * The vencimiento is the earliest of the parts' dates. They are the same day at import and only
 * diverge if a movement was moved by hand, where the earliest is the honest answer — the same rule
 * getDeferralFracciones applies when it rebuilds ANEXO I.
 */
function groupByFraccion(movements: readonly DeferralMovementRecord[]): DeferralFraccionMovements[] {
  const byNumber = movements.reduce((acc, movement) => {
    const parts = acc.get(movement.fraccionNumber);
    if (parts) parts.push(movement);
    else acc.set(movement.fraccionNumber, [movement]);
    return acc;
  }, new Map<number, DeferralMovementRecord[]>());

  return [...byNumber.entries()]
    .sort(([a], [b]) => a - b)
    .map(([fraccionNumber, parts]) => ({
      fraccionNumber,
      dueDate: [...parts].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]!.dueDate,
      totals: movementTotals(parts),
      status: resolveStatus(parts),
      movementIds: parts.map((part) => part.transactionId).sort((a, b) => a - b),
    }));
}

/**
 * Where the resolution stands, DERIVED from its fracciones and never stored.
 *
 * `ACTIVE` while any fracción still has something pending; `CANCELLED` once nothing is pending and
 * at least one fracción was cancelled; `SETTLED` when nothing is pending and nothing was cancelled
 * — an early payoff included, because paying ahead of the calendar cancels nothing.
 *
 * A resolution with no movements left at all reads as `SETTLED`: nothing is pending, which is what
 * that status says. It is unreachable through this module (a deferral always books its principal)
 * and only arises if the movements were deleted by hand.
 */
function deriveDeferralStatus(fracciones: readonly DeferralFraccionMovements[]): DeferralStatus {
  if (fracciones.some((fraccion) => fraccion.status === TRANSACTION_STATUS.PENDING)) return DEFERRAL_STATUS.ACTIVE;
  if (fracciones.some((fraccion) => fraccion.status === TRANSACTION_STATUS.CANCELLED)) return DEFERRAL_STATUS.CANCELLED;
  return DEFERRAL_STATUS.SETTLED;
}

/** The two halves a cancellation splits a resolution into: what it may touch, and what it may not. */
function splitByCancellable(movements: readonly DeferralMovementRecord[]): {
  cancellable: DeferralMovementRecord[];
  kept: DeferralMovementRecord[];
} {
  return {
    cancellable: movements.filter((movement) => movement.status === DEFERRAL_CANCELLABLE_MOVEMENT_STATUS),
    kept: movements.filter((movement) => movement.status !== DEFERRAL_CANCELLABLE_MOVEMENT_STATUS),
  };
}

/**
 * What cancelling a resolution would do, without writing anything.
 *
 * Both halves are returned because a deferral is cancelled in the middle of its calendar: what
 * stays — the instalments already paid, whose interés is already deducted — is as much a part of
 * the decision as what goes.
 *
 * This is a snapshot, not a lock. An instalment marked paid between this call and the confirmation
 * is simply not cancelled: the repository's UPDATE matches only rows still pending, so the write
 * can never act on a state older than itself.
 *
 * @throws NotFoundError when no resolution with that id belongs to the current user
 */
export async function previewDeferralCancellation(deferralId: number): Promise<DeferralCancellationPreview> {
  const deferral = await getDeferralById(deferralId);
  if (!deferral) throw new NotFoundError(API_ERROR.NOT_FOUND.DEFERRAL);

  const movements = await getDeferralMovements(deferralId);
  const { cancellable, kept } = splitByCancellable(movements);

  return {
    deferralId: deferral.deferralId,
    expedienteNumber: deferral.expedienteNumber,
    status: deriveDeferralStatus(groupByFraccion(movements)),
    toCancel: groupByFraccion(cancellable),
    toCancelTotals: movementTotals(cancellable),
    toKeep: groupByFraccion(kept),
    toKeepTotals: movementTotals(kept),
  };
}

/**
 * Cancel a resolution: every fracción movement still pending becomes cancelled, atomically.
 *
 * The "Deferrals" row survives untouched — its expediente is what stops the same letter being
 * imported again, and the cancelled movements keep pointing at it as the only thing that explains
 * what they were. The reasons are set out in full on `cancelDeferralPendingMovements`.
 *
 * **Cancelling twice is a 409, not a silent success.** The repository is idempotent by
 * construction: the second call matches no pending row and writes nothing. But a UI that showed
 * "aplazamiento cancelado" for a call that touched zero movements would be claiming an effect that
 * did not happen, and the same answer is owed to a resolution that was fully paid — there is
 * nothing left to cancel in either case, and API_ERROR.CONFLICT.DEFERRAL_NOTHING_TO_CANCEL says
 * exactly that. Nothing is written before the conflict is raised, so no state depends on it.
 *
 * @throws NotFoundError when no resolution with that id belongs to the current user
 * @throws ConflictError when the resolution has no pending fracción left
 *
 * @example
 * // Letter 282640432002C, two of four instalments paid
 * const result = await cancelDeferral(31);
 * // → { status: 'cancelled', cancelledFraccionNumbers: [3, 4], cancelledMovementCount: 4, ... }
 */
export async function cancelDeferral(deferralId: number): Promise<DeferralCancellationResult> {
  const { deferral, cancelled, movements } = await cancelDeferralPendingMovements(deferralId);
  if (!deferral) throw new NotFoundError(API_ERROR.NOT_FOUND.DEFERRAL);
  if (cancelled.length === 0) throw new ConflictError(API_ERROR.CONFLICT.DEFERRAL_NOTHING_TO_CANCEL);

  // `movements` is the state the COMMIT left behind, so what was NOT cancelled is read from it by
  // difference rather than from the pre-write snapshot: a row marked paid while the confirmation
  // was on screen is reported as kept, which is what it is.
  const cancelledIds = new Set(cancelled.map((movement) => movement.transactionId));
  const kept = movements.filter((movement) => !cancelledIds.has(movement.transactionId));

  return {
    deferralId: deferral.deferralId,
    status: deriveDeferralStatus(groupByFraccion(movements)),
    cancelledFraccionNumbers: [...new Set(cancelled.map((movement) => movement.fraccionNumber))].sort((a, b) => a - b),
    cancelledMovementCount: cancelled.length,
    cancelledTotals: movementTotals(cancelled),
    keptMovementCount: kept.length,
    keptTotals: movementTotals(kept),
  };
}
