/**
 * The time one round of a sync job may keep starting work, and the limits
 * that keep what it already started from outliving the invocation.
 *
 * A round runs inside one function invocation, which the platform kills at its
 * duration limit whatever is in flight. The budget decides whether the next
 * task, or the next event to normalise, is started or left for the following
 * round. Work already started is let finish, but only until the cutoff: a
 * network call or a wait still running then is abandoned, so the round always
 * has the rest of the invocation to save its state and hand off.
 */
import {
  CRYPTO_SYNC_CUTOFF_GRACE_MS,
  CRYPTO_SYNC_INVOCATION_LIMIT_MS,
  CRYPTO_SYNC_ROUND_BUDGET_MS,
  CRYPTO_SYNC_TASK_FAILURE,
} from '@/constants/finance';

export interface SyncBudget {
  // Epoch ms from which no new work is started.
  readonly deadline: number;
  // The clock the deadline is read against. Injected so a test can move past
  // the deadline without waiting four minutes.
  readonly now: () => number;
}

/** A full budget measured from now: call it as early in the invocation as possible. */
export function startSyncBudget(now: () => number = () => Date.now()): SyncBudget {
  return { deadline: now() + CRYPTO_SYNC_ROUND_BUDGET_MS, now };
}

/** No budget means no limit: callers outside a sync job run to completion. */
export function isBudgetSpent(budget: SyncBudget | undefined): boolean {
  return budget !== undefined && budget.now() >= budget.deadline;
}

/**
 * The instant after which nothing that waits on the network may hold the
 * round any longer, on the budget's clock.
 */
export interface SyncCutoff {
  readonly at: number;
  readonly now: () => number;
}

export function cutoffOf(budget: SyncBudget): SyncCutoff {
  return { at: budget.deadline + CRYPTO_SYNC_CUTOFF_GRACE_MS, now: budget.now };
}

/**
 * Time left before the platform ends the invocation the budget was started in.
 * The budget starts with the invocation, so its deadline says when that was.
 */
export function msUntilInvocationEnd(budget: SyncBudget): number {
  return budget.deadline - CRYPTO_SYNC_ROUND_BUDGET_MS + CRYPTO_SYNC_INVOCATION_LIMIT_MS - budget.now();
}

/**
 * Work abandoned at the round's cutoff. It is not a failure of what it was
 * doing: the task or event it belonged to is left for the next round.
 */
export class SyncCutoffError extends Error {
  readonly code = CRYPTO_SYNC_TASK_FAILURE.ROUND_CUTOFF;

  constructor() {
    super(CRYPTO_SYNC_TASK_FAILURE.ROUND_CUTOFF);
    this.name = 'SyncCutoffError';
  }
}

/**
 * Throws SyncCutoffError when the cutoff has passed, or would pass during a
 * wait of `waitMs`: a wait that ends at or after the cutoff would only be
 * followed by a request that may not be sent, so it is not started at all.
 */
export function assertBeforeCutoff(cutoff: SyncCutoff | undefined, waitMs = 0): void {
  if (cutoff !== undefined && cutoff.now() + waitMs >= cutoff.at) throw new SyncCutoffError();
}

/**
 * Settles like `work`, or rejects with SyncCutoffError at the cutoff if `work`
 * is still pending then. The abandoned work carries on in the background with
 * nobody waiting for it; its outcome is ignored.
 */
export function raceCutoff<T>(work: Promise<T>, cutoff: SyncCutoff | undefined): Promise<T> {
  if (cutoff === undefined) return work;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new SyncCutoffError()), Math.max(0, cutoff.at - cutoff.now()));
  });
  return Promise.race([work, expired]).finally(() => clearTimeout(timer));
}
