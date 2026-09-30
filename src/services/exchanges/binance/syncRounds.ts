/**
 * What lets a sync job outlive one function invocation: stable task keys and
 * the call that starts the next round.
 *
 * A round that runs out of time saves its state and asks its own deployment,
 * through POST /api/crypto/sync/[jobId]/continue, to run the next round in a
 * fresh invocation. It waits only for the route to claim the round (202), and
 * never past what is left of its own invocation. The same call starts the
 * first round of each job the weekly cron queued, one job after another.
 */
import {
  API_ENDPOINT,
  API_ERROR,
  CRYPTO_SYNC_HANDOFF_MIN_TIMEOUT_MS,
  CRYPTO_SYNC_HANDOFF_OUTCOME,
  CRYPTO_SYNC_HANDOFF_RESERVE_MS,
  CRYPTO_SYNC_HANDOFF_TIMEOUT_MS,
  type CryptoEventType,
  type CryptoSyncHandoffOutcome,
} from '@/constants/finance';
import {
  failUnclaimedSyncRound,
  findNextQueuedSyncJob,
  type QueuedSyncJob,
} from '@/services/database/CryptoSyncJobsRepository';
import { msUntilInvocationEnd, type SyncBudget } from '@/services/exchanges/shared/syncBudget';
import { trustedAppOrigin } from '@/utils/appOrigin';
import { cronAuthorization } from '@/utils/cronAuth';

// Vercel's header for "Protection Bypass for Automation". Without it a
// deployment behind Vercel Authentication (a preview, by default) answers the
// worker's call with its login wall instead of the route.
const PROTECTION_BYPASS_HEADER = 'x-vercel-protection-bypass';

const TASK_KEY_SEPARATOR = ':';

/**
 * The key a task keeps across rounds: the endpoint plus what tells its task
 * apart from the endpoint's others (the spot pair, or the window start and, for
 * endpoints fetched twice per window, the variant). A round rebuilds its task
 * list and skips the keys an earlier round completed.
 */
export function taskKey(eventType: CryptoEventType, ...discriminators: string[]): string {
  return [eventType, ...discriminators].join(TASK_KEY_SEPARATOR);
}

/** The endpoint a task key belongs to. Event types contain no separator. */
export function eventTypeOfTaskKey(key: string): string {
  return key.slice(0, key.indexOf(TASK_KEY_SEPARATOR));
}

function continueRoundUrl(origin: string, jobId: number): string {
  return `${origin}${API_ENDPOINT.CRYPTO_SYNC}/${jobId}/continue`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface HandoffAttempt {
  outcome: CryptoSyncHandoffOutcome;
  // What went wrong, in our own words only (an HTTP status, a timeout, a
  // missing setting), for the job's ErrorMessage, which the panel shows, and
  // for the server log. Never a header: the request carries CRON_SECRET.
  detail: string;
  // What fetch threw, for the server log only: a network error can quote the
  // host, address and port it tried.
  cause: string;
  // How many calls were made. A refusal of the first one means the route did
  // not find the round waiting, which nobody but this caller could have taken.
  calls: number;
}

/**
 * The calls a hand-off can afford, as the timeout of each. Two full ones while
 * both end CRYPTO_SYNC_HANDOFF_RESERVE_MS before the invocation does (a round
 * that stopped at its budget with nothing in flight); otherwise one, cut to the
 * time left; none when that would be under CRYPTO_SYNC_HANDOFF_MIN_TIMEOUT_MS.
 * Without a budget both full calls.
 */
export function handoffCallTimeouts(budget: SyncBudget | undefined): number[] {
  const full = CRYPTO_SYNC_HANDOFF_TIMEOUT_MS;
  if (budget === undefined) return [full, full];
  const usable = msUntilInvocationEnd(budget) - CRYPTO_SYNC_HANDOFF_RESERVE_MS;
  if (usable >= 2 * full) return [full, full];
  if (usable < CRYPTO_SYNC_HANDOFF_MIN_TIMEOUT_MS) return [];
  return [Math.min(full, usable)];
}

async function postContinue(
  url: string,
  headers: Record<string, string>,
  round: number,
  timeoutMs: number,
): Promise<Omit<HandoffAttempt, 'calls'>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ round }),
      signal: controller.signal,
      // A redirect is never followed: it would carry the Authorization header
      // to wherever it points. The route never redirects, so a 3xx is a
      // failed hand-off like any other unexpected answer.
      redirect: 'manual',
    });
    if (response.status === 202) return { outcome: CRYPTO_SYNC_HANDOFF_OUTCOME.ACCEPTED, detail: '', cause: '' };
    if (response.status === 409) return { outcome: CRYPTO_SYNC_HANDOFF_OUTCOME.REFUSED, detail: 'HTTP 409', cause: '' };
    return { outcome: CRYPTO_SYNC_HANDOFF_OUTCOME.FAILED, detail: `HTTP ${response.status}`, cause: '' };
  } catch (error) {
    if (controller.signal.aborted) {
      return { outcome: CRYPTO_SYNC_HANDOFF_OUTCOME.FAILED, detail: `no answer within ${timeoutMs} ms`, cause: '' };
    }
    return {
      outcome: CRYPTO_SYNC_HANDOFF_OUTCOME.FAILED,
      detail: 'the request failed without an answer',
      cause: errorText(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Asks the continue route at `origin` to run `round`, with one call per
 * timeout given. A failed call is repeated when a second timeout is given: a
 * duplicate is harmless, since the route claims a round only once and answers
 * the second call 409.
 */
async function requestContinuation(
  origin: string,
  jobId: number,
  round: number,
  timeouts: number[],
): Promise<HandoffAttempt> {
  const authorization = cronAuthorization();
  if (!authorization) {
    return {
      outcome: CRYPTO_SYNC_HANDOFF_OUTCOME.FAILED,
      detail: 'CRON_SECRET is not configured',
      cause: '',
      calls: 0,
    };
  }
  const [firstTimeout, retryTimeout] = timeouts;
  if (firstTimeout === undefined) {
    return {
      outcome: CRYPTO_SYNC_HANDOFF_OUTCOME.FAILED,
      detail: `under ${CRYPTO_SYNC_HANDOFF_MIN_TIMEOUT_MS} ms were left before the invocation ends, too little for the call`,
      cause: '',
      calls: 0,
    };
  }
  const headers: Record<string, string> = { Authorization: authorization, 'Content-Type': 'application/json' };
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) headers[PROTECTION_BYPASS_HEADER] = bypass;

  const url = continueRoundUrl(origin, jobId);
  const first = await postContinue(url, headers, round, firstTimeout);
  if (first.outcome !== CRYPTO_SYNC_HANDOFF_OUTCOME.FAILED || retryTimeout === undefined) {
    return { ...first, calls: 1 };
  }
  const retry = await postContinue(url, headers, round, retryTimeout);
  return {
    outcome: retry.outcome,
    detail: `${first.detail}; retry: ${retry.detail}`,
    cause: [first.cause, retry.cause].filter((cause) => cause !== '').join('; retry: '),
    calls: 2,
  };
}

/**
 * The first call was refused, yet this caller had just announced the round and
 * nobody else calls the route for it: the route did not find it waiting (a
 * deployment reading another database, a state it could not read). Left alone,
 * the job would sit with an unclaimed round until failStuckJobs fails it
 * fifteen minutes later. failUnclaimedSyncRound re-reads the job in the same
 * statement that fails it: only a job still pending or running with this round
 * unclaimed matches, so one cancelled meanwhile, or a round claimed after all,
 * is left as it is.
 */
async function failRefusedUnclaimedRound(jobId: number, round: number): Promise<void> {
  const failed = await failUnclaimedSyncRound(
    jobId,
    round,
    API_ERROR.CRYPTO.SYNC_HANDOFF_FAILED,
    `The continue route refused round ${round} (HTTP 409) while it was still waiting to be claimed.`,
  );
  if (!failed) return;
  // biome-ignore lint/suspicious/noConsole: a refusal that left the job unclaimed must show in the server log
  console.warn(
    `Sync job ${jobId}: the continue route refused round ${round} while it was still unclaimed; ` +
      `the job was failed with ${API_ERROR.CRYPTO.SYNC_HANDOFF_FAILED}.`,
  );
}

/**
 * Starts `round` through the continue route of the deployment named by the
 * server's own configuration (trustedAppOrigin), never by a request. When no
 * origin is configured nothing is sent, and when the request fails the job
 * fails at once, each with its own code, instead of waiting fifteen minutes
 * for failStuckJobs. `budget`, from a round handing off, keeps the calls inside
 * what is left of its invocation (handoffCallTimeouts).
 */
export async function startSyncRound(
  jobId: number,
  round: number,
  budget?: SyncBudget,
): Promise<CryptoSyncHandoffOutcome> {
  const origin = trustedAppOrigin();
  if (!origin) {
    const message =
      `Round ${round} was not started: no trusted origin is configured ` +
      '(NEXTAUTH_URL or VERCEL_PROJECT_PRODUCTION_URL, or VERCEL_URL on a preview deployment).';
    // biome-ignore lint/suspicious/noConsole: a missing server setting must show in the server log, not only on the job
    console.error(`Sync job ${jobId}: ${message}`);
    await failUnclaimedSyncRound(jobId, round, API_ERROR.CRYPTO.SYNC_ORIGIN_NOT_CONFIGURED, message);
    return CRYPTO_SYNC_HANDOFF_OUTCOME.FAILED;
  }

  const attempt = await requestContinuation(origin, jobId, round, handoffCallTimeouts(budget));
  if (attempt.outcome === CRYPTO_SYNC_HANDOFF_OUTCOME.FAILED) {
    // biome-ignore lint/suspicious/noConsole: a failed hand-off must show in the server log, not only on the job
    console.error(
      `Sync job ${jobId}: round ${round} could not be started (${API_ERROR.CRYPTO.SYNC_HANDOFF_FAILED}): ` +
        attempt.detail +
        (attempt.cause === '' ? '' : ` (${attempt.cause})`),
    );
    // Only our own detail: the job's ErrorMessage reaches the panel.
    await failUnclaimedSyncRound(
      jobId,
      round,
      API_ERROR.CRYPTO.SYNC_HANDOFF_FAILED,
      `Round ${round} could not be started through ${API_ENDPOINT.CRYPTO_SYNC}/${jobId}/continue: ${attempt.detail}`,
    );
  } else if (attempt.outcome === CRYPTO_SYNC_HANDOFF_OUTCOME.REFUSED && attempt.calls === 1) {
    await failRefusedUnclaimedRound(jobId, round);
  }
  // A refusal after a failed call needs nothing: that call may have reached
  // the route and claimed the round.
  return attempt.outcome;
}

/** One first round of a queued job that startNextQueuedSyncJob tried to start. */
export interface QueuedJobStart extends QueuedSyncJob {
  outcome: CryptoSyncHandoffOutcome;
}

/**
 * Starts the next job of the weekly cron's queue: the oldest one waiting, and
 * none while a job of the queue is under way (findNextQueuedSyncJob). The cron
 * calls it once it has created its jobs, and the round that ends a queued job
 * calls it again, so the users' syncs run one after another: Binance counts
 * request weight per IP, and each BinanceClient keeps only its own count.
 *
 * A job whose first round is not accepted does not stop the queue: it is
 * failed while that round is still unclaimed, and the next one is tried. A
 * round claimed after all (by a call that timed out) is left running, and the
 * queue then waits for it. `budget`, from a finishing round or the cron, keeps
 * each call inside what is left of its invocation; when no call fits, nothing
 * more is tried, rather than failing jobs for want of this invocation's time.
 * Returns each start tried, in order.
 */
export async function startNextQueuedSyncJob(budget?: SyncBudget): Promise<QueuedJobStart[]> {
  return startQueuedJobs([], budget);
}

async function startQueuedJobs(tried: QueuedJobStart[], budget: SyncBudget | undefined): Promise<QueuedJobStart[]> {
  const next = await findNextQueuedSyncJob();
  // The same job again means its failure could not be recorded: trying it
  // once more would loop. failStuckJobs fails it, and the ones behind it.
  if (!next || tried.some((start) => start.jobId === next.jobId)) return tried;
  if (handoffCallTimeouts(budget).length === 0) {
    // biome-ignore lint/suspicious/noConsole: a queue left waiting must show in the server log
    console.warn(`Sync job ${next.jobId} stays queued: this invocation has no time left to start its first round.`);
    return tried;
  }
  const outcome = await startQueuedRound(next.jobId, budget);
  const started = [...tried, { ...next, outcome }];
  if (outcome === CRYPTO_SYNC_HANDOFF_OUTCOME.ACCEPTED) return started;
  await failUnstartedQueuedJob(next.jobId);
  return startQueuedJobs(started, budget);
}

async function startQueuedRound(jobId: number, budget: SyncBudget | undefined): Promise<CryptoSyncHandoffOutcome> {
  try {
    return await startSyncRound(jobId, 1, budget);
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: a queued job that could not be started must show in the server log
    console.error(`Sync job ${jobId}: round 1 could not be started:`, error);
    return CRYPTO_SYNC_HANDOFF_OUTCOME.FAILED;
  }
}

/**
 * startSyncRound fails a job whose round it could not start, but not after a
 * refusal that followed a failed call, nor when recording the failure threw.
 * Left pending, the job would stay the oldest one waiting and hold up every
 * job queued behind it. The unclaimed-round guard leaves a round that a timed
 * out call did claim running.
 */
async function failUnstartedQueuedJob(jobId: number): Promise<void> {
  try {
    await failUnclaimedSyncRound(jobId, 1, API_ERROR.CRYPTO.SYNC_HANDOFF_FAILED, 'Round 1 could not be started.');
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: a failure that could not be recorded must show in the server log
    console.error(`Sync job ${jobId}: its unstarted first round could not be recorded as failed:`, error);
  }
}
