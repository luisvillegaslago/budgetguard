/**
 * BinanceSyncService — Phase 2 orchestrator.
 *
 * Iterates the 13 Binance endpoints respecting per-endpoint window limits,
 * persists raw events idempotently and updates job progress so the UI can
 * render a real-time progress bar.
 *
 * Concurrency: p-limit(BINANCE_SYNC_CONCURRENCY) caps in-flight HTTP calls.
 * Errors:      the BinanceClient's retry loop absorbs 429/418. A task that
 *              still fails, or whose events cannot be stored, does not stop
 *              the other tasks. classifyTaskFailure decides the outcome: a
 *              transient failure ends the job failed, because the next
 *              incremental sync anchors on the last completed job and so
 *              fetches the missing windows again. A permanent one would fail
 *              the same way on every run and freeze that anchor, so a job whose
 *              only failures are permanent or resumable completes and records
 *              them instead.
 * Spot trades: an incremental sync resumes each pair right after the newest
 *              fill an earlier API sync stored, instead of walking its history
 *              from the first fill. A walk that runs out of pages still hands
 *              over the fills it walked; they are stored like any others, so
 *              the next run resumes after them.
 * Dedup:       API events whose operation a CSV import already stored are
 *              dropped with the same cross-source filter the CSV upload uses,
 *              as are rewards stored under their earlier position-based id.
 *              How many were dropped is kept in each endpoint's progress.
 * Rounds:      a job runs in rounds of one function invocation each. A round
 *              starts no task once its budget is spent, lets the running ones
 *              finish until the cutoff (a task still waiting on Binance then is
 *              abandoned and left open), saves what the next round needs
 *              (ResumeState) and asks the continue route to run it. The next
 *              round rebuilds the task list from the spot pairs discovery
 *              listed and skips every task key already completed, so the job
 *              ends with the Progress, EventsIngested and status one
 *              uninterrupted run would have given it. Normalisation runs after
 *              the last fetch under the same budget.
 * Cron queue:  the round that ends a job the weekly cron queued starts the
 *              next one waiting, so the users' syncs run one at a time.
 */
import pLimit from 'p-limit';
import {
  API_ERROR,
  BINANCE_GENESIS_DATE,
  BINANCE_SYNC_CONCURRENCY,
  BINANCE_WINDOW_DAYS,
  CRYPTO_EVENT_TYPE,
  CRYPTO_SYNC_COMPLETED_WITH_GAPS,
  CRYPTO_SYNC_FAILURE_KIND,
  CRYPTO_SYNC_HANDOFF_OUTCOME,
  CRYPTO_SYNC_MAX_ROUNDS,
  CRYPTO_SYNC_MODE,
  CRYPTO_SYNC_PHASE,
  CRYPTO_SYNC_STATUS,
  CRYPTO_SYNC_TASK_FAILURE,
  type CryptoEventType,
  type CryptoExchange,
  type CryptoSyncMode,
} from '@/constants/finance';
import { type SyncResumeState, SyncResumeStateSchema, type SyncTaskFailure } from '@/schemas/crypto';
import {
  bulkInsertRawEventsForUser,
  dropCrossSourceDuplicates,
  exportCrossSourceCarryOver,
  listInteractedAssetsForUser,
  loadCrossSourceIndex,
  loadLastApiTradeIds,
  type RawEventInput,
  restoreCrossSourceCarryOver,
} from '@/services/database/CryptoRawEventsRepository';
import {
  type EndpointProgress,
  failUnclaimedSyncRound,
  getJobStatus,
  handOffSyncRound,
  isJobCancelled,
  markJobCompleted,
  markJobFailed,
  markJobRunning,
  type TaskFailureSummary,
  updateJobProgress,
} from '@/services/database/CryptoSyncJobsRepository';
import {
  type DecryptedCredentials,
  getDecryptedActiveForUser,
} from '@/services/database/ExchangeCredentialsRepository';
import { countUnnormalisedRawEventsForUser } from '@/services/database/TaxableEventsRepository';
import {
  cutoffOf,
  isBudgetSpent,
  type SyncBudget,
  SyncCutoffError,
  startSyncBudget,
} from '@/services/exchanges/shared/syncBudget';
import { isActiveSyncStatus } from '@/utils/crypto/syncStatus';
import {
  BinanceClient,
  BinanceClientError,
  candidateSymbolsFor,
  classifyTaskFailure,
  defaultSyncBaseAssets,
  eventsFetchedBeforeFailure,
  generateWindows,
  SpotHistoryTruncatedError,
  type TaskFailureClass,
} from './BinanceClient';
import { normalizeForUser } from './NormalizationService';
import { syncDebug } from './syncDebug';
import { eventTypeOfTaskKey, startNextQueuedSyncJob, startSyncRound, taskKey } from './syncRounds';

export interface RunSyncInput {
  userId: number;
  jobId: number;
  exchange: CryptoExchange;
  mode: CryptoSyncMode;
  scopeFrom: Date;
  scopeTo: Date;
  // When this round stops starting work. Defaults to a full budget from now;
  // a route passes the one it started when its invocation began.
  budget?: SyncBudget;
  // Where the previous round stopped. Absent on a job's first round.
  resume?: SyncResumePoint;
}

export interface SyncResumePoint {
  state: SyncResumeState;
  progress: Record<string, EndpointProgress>;
}

interface ProgressMap {
  [eventType: string]: EndpointProgress;
}

/** A task that failed without stopping the job (fatal failures are kept apart). */
type TaskFailure = SyncTaskFailure;

/** What storing one task's events came to, after the cross-source dedup. */
interface StoreOutcome {
  // Rows the insert added: duplicates dropped by the dedup or absorbed by the
  // UNIQUE key are not counted.
  inserted: number;
  // What the database threw when it refused the insert, as a message.
  insertFailure: string | null;
}

/** One round of a job: its input, budget, and the state and progress it carries on. */
interface SyncRound {
  input: RunSyncInput;
  budget: SyncBudget;
  state: SyncResumeState;
  progress: ProgressMap;
  // The round a hand-off announced, set before the write that announces it:
  // from then on the next round may be claimed and running.
  announcedRound: number | null;
  // Whether the continue route accepted the next round, which then ends the
  // job or hands it on in turn.
  passedOn: boolean;
}

const PROGRESS_FLUSH_EVERY = 5; // flush to DB every N completed windows

export async function runSync(input: RunSyncInput): Promise<void> {
  const round: SyncRound = {
    input,
    budget: input.budget ?? startSyncBudget(),
    // Parsing copies the state, so the round never mutates its caller's object.
    state: SyncResumeStateSchema.parse(input.resume?.state ?? {}),
    progress: Object.fromEntries(
      Object.entries(input.resume?.progress ?? {}).map(([endpoint, entry]): [string, EndpointProgress] => [
        endpoint,
        { ...entry },
      ]),
    ),
    announcedRound: null,
    passedOn: false,
  };

  try {
    if (round.state.phase === CRYPTO_SYNC_PHASE.FETCH && !(await runFetchPhase(round))) return;
    await runNormalizePhase(round);
  } catch (error) {
    await failAfterThrow(round, error);
    throw error;
  } finally {
    await moveCronQueueOn(round);
  }
}

/**
 * Fails the job over a throw nothing else caught ("buildTasks" failure or an
 * unexpected one). Once a hand-off has announced the next round, that round
 * may already be claimed and running, and failing the job would stop it under
 * its worker: the job is then failed only while the round is still unclaimed
 * (failUnclaimedSyncRound), with our own code, and what was thrown goes to the
 * server log only.
 */
async function failAfterThrow(round: SyncRound, error: unknown): Promise<void> {
  const { input, announcedRound } = round;
  if (announcedRound !== null) {
    // biome-ignore lint/suspicious/noConsole: a hand-off that threw must show in the server log, not only on the job
    console.error(`Sync job ${input.jobId}: handing off to round ${announcedRound} threw:`, error);
    const failed = await failUnclaimedSyncRound(
      input.jobId,
      announcedRound,
      API_ERROR.CRYPTO.SYNC_HANDOFF_FAILED,
      `Round ${announcedRound} could not be started.`,
    );
    if (!failed) {
      // biome-ignore lint/suspicious/noConsole: a job left to its next round must show in the server log
      console.warn(
        `Sync job ${input.jobId} was not failed: round ${announcedRound} was claimed, or the job had already ended.`,
      );
    }
    return;
  }
  const code = error instanceof BinanceClientError ? error.code : 'sync_failed';
  const message = error instanceof Error ? error.message : String(error);
  await markJobFailed(input.jobId, code, message);
}

/**
 * The round that ends a job of the cron's queue starts the next job waiting
 * there, whatever the end: completed, with gaps or not, failed, or cancelled.
 * A round whose next round was accepted leaves that to the round that ends
 * the job. Any other round reads the job, since a hand-off call that timed out
 * may still have started the next round, and then the job is still running.
 * A manual sync is not in the queue and starts nothing. Never throws: the
 * job's own outcome is already recorded.
 */
async function moveCronQueueOn(round: SyncRound): Promise<void> {
  const { input, state, budget } = round;
  if (!state.inCronQueue || round.passedOn) return;
  try {
    const status = await getJobStatus(input.jobId);
    if (status === null || isActiveSyncStatus(status)) return;
    await startNextQueuedSyncJob(budget);
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: a queue that did not move on must show in the server log
    console.error(`Sync job ${input.jobId}: the next job of the cron's queue could not be started:`, error);
  }
}

/**
 * Runs the fetch tasks this round has time for. Returns true once every task
 * of the job has run, with the failures confirmed and the gaps attached, so
 * normalisation can start; false when the job ended here (fatal, cancelled,
 * no credentials, no longer pending at its first round) or the round handed
 * the rest to the next one.
 */
async function runFetchPhase(round: SyncRound): Promise<boolean> {
  const { input, state, progress, budget } = round;
  const credentials = await getDecryptedActiveForUser(input.userId, input.exchange);
  if (!credentials) {
    await markJobFailed(input.jobId, 'no_credentials', 'No active credentials for this exchange');
    return false;
  }

  if (state.round === 1) {
    if (!(await markJobRunning(input.jobId))) {
      // No longer pending: cancelled before this worker began, or failed by
      // failStuckJobs. Running it would fetch for a job that is over.
      redactCredentials(credentials);
      return false;
    }
    syncDebug.jobStart(input.jobId, input.mode, { from: input.scopeFrom, to: input.scopeTo });
  }

  // Every call the client makes is bounded by the round's cutoff, so a slow
  // Binance answer or a rate-limit wait cannot hold the round past the time
  // it needs to hand off.
  const client = new BinanceClient({ apiKey: credentials.apiKey, apiSecret: credentials.apiSecret }, cutoffOf(budget));
  const limit = pLimit(BINANCE_SYNC_CONCURRENCY);
  const completedKeys = new Set(state.completedTaskKeys);
  let totalIngested = state.rawEventsIngested;

  // Aggregate per-endpoint failures so we can surface them in the job's
  // ErrorMessage without aborting the whole sync over a single bad symbol.
  const taskFailures: TaskFailure[] = [...state.taskFailures];
  let fatalError: BinanceClientError | null = null;
  let cancelled = false;

  // Cheap cancellation poll: every 30 tasks check the DB once. Avoids
  // bombarding the DB with one query per task while still aborting within a
  // few seconds of the user pressing "Stop".
  const CANCEL_CHECK_EVERY = 30;
  let tasksSinceCancelCheck = 0;

  try {
    const { tasks: allTasks, spotCandidates } = await buildTasks(client, input, state);
    state.spotCandidates = spotCandidates;
    const tasks = allTasks.filter((task) => !completedKeys.has(task.key));
    // Loaded once per round: it scans every stored row of the user. Events this
    // job inserts are deliberately not added, see dropCrossSourceDuplicates;
    // the decisions of earlier rounds are applied on top.
    const crossSourceIndex = await loadCrossSourceIndex(input.userId);
    restoreCrossSourceCarryOver(crossSourceIndex, state.crossSource);

    initializeProgress(progress, allTasks, completedKeys);
    await updateJobProgress(input.jobId, progress, totalIngested);

    let completedSinceFlush = 0;

    await Promise.all(
      tasks.map((task) =>
        limit(async () => {
          if (fatalError || cancelled) return;
          // Read before a task starts, never during one: a task already running
          // (a spot walk of many pages) always finishes and is stored.
          if (isBudgetSpent(budget)) return;

          tasksSinceCancelCheck++;
          if (tasksSinceCancelCheck >= CANCEL_CHECK_EVERY) {
            tasksSinceCancelCheck = 0;
            if (await isJobCancelled(input.jobId)) {
              cancelled = true;
              return;
            }
          }

          let events: RawEventInput[] = [];
          let taskError: { error: unknown; failure: TaskFailureClass } | null = null;
          try {
            events = await task.execute();
          } catch (error) {
            // Abandoned at the round's cutoff: nothing of it is stored or
            // counted and its key stays open, so the next round runs it from
            // the start, as if this round had never begun it. A spot walk
            // keeps none of its pages either: a full sync would walk them
            // again from the first fill anyway, and storing them would move an
            // incremental walk's resume point, so the job would no longer end
            // as one uninterrupted run.
            if (error instanceof SyncCutoffError) return;
            // A spot walk that ran out of pages hands over the fills it walked.
            // They go through the same dedup and insert as any other events,
            // so the next incremental sync resumes after the newest of them.
            events = eventsFetchedBeforeFailure(error);
            const failure = classifyTaskFailure(error);
            if (failure.kind === CRYPTO_SYNC_FAILURE_KIND.FATAL) {
              reportTaskFailure(task.eventType, failure, error);
              // Only a BinanceClientError is ever classified FATAL.
              fatalError = error instanceof BinanceClientError ? error : null;
              return;
            }
            taskError = { error, failure };
          }

          const { kept, skipped } = dropCrossSourceDuplicates(crossSourceIndex, events);
          const stored: StoreOutcome = { inserted: 0, insertFailure: null };
          if (kept.length > 0) {
            try {
              stored.inserted = await bulkInsertRawEventsForUser(input.userId, kept, input.jobId);
              totalIngested += stored.inserted;
            } catch (insertError) {
              stored.insertFailure = insertError instanceof Error ? insertError.message : String(insertError);
            }
          }

          // Classified once the walked fills went through the dedup and the
          // insert, since whether the next run continues depends on what was
          // actually stored.
          if (taskError !== null) {
            const failure = confirmResumableWalk(taskError.failure, taskError.error, task.storedTradeId, stored);
            reportTaskFailure(task.eventType, failure, taskError.error);
            taskFailures.push({
              eventType: task.eventType,
              kind: failure.kind,
              code: failure.code,
              binanceCode: taskError.error instanceof BinanceClientError ? taskError.error.binanceCode : undefined,
              symbol: task.symbol ?? null,
              message: taskError.error instanceof Error ? taskError.error.message : String(taskError.error),
            });
          }
          if (stored.insertFailure !== null) {
            // The database refused them, not Binance: a later run stores them.
            taskFailures.push({
              eventType: task.eventType,
              kind: CRYPTO_SYNC_FAILURE_KIND.TRANSIENT,
              code: CRYPTO_SYNC_TASK_FAILURE.INSERT_FAILED,
              binanceCode: undefined,
              symbol: task.symbol ?? null,
              message: stored.insertFailure,
            });
          }

          const endpointProgress = progress[task.eventType] ?? emptyProgress();
          endpointProgress.fetched += events.length;
          if (skipped > 0) endpointProgress.duplicatesSkipped = (endpointProgress.duplicatesSkipped ?? 0) + skipped;
          endpointProgress.completedWindows += 1;
          endpointProgress.lastWindowEnd = task.windowEnd.toISOString();
          progress[task.eventType] = endpointProgress;
          completedKeys.add(task.key);

          completedSinceFlush++;
          if (completedSinceFlush >= PROGRESS_FLUSH_EVERY) {
            completedSinceFlush = 0;
            await updateJobProgress(input.jobId, progress, totalIngested);
          }
        }),
      ),
    );

    await updateJobProgress(input.jobId, progress, totalIngested);

    // Per-endpoint summary for the debug log (no-op when CRYPTO_SYNC_DEBUG=0).
    const failuresByEndpoint = countFailuresByEndpoint(taskFailures);
    Object.entries(progress).forEach(([endpoint, p]) => {
      syncDebug.endpointSummary(
        endpoint,
        p.fetched,
        failuresByEndpoint[endpoint] ?? 0,
        p.totalWindows,
        p.duplicatesSkipped ?? 0,
      );
    });

    if (cancelled) {
      // The cancel endpoint already moved the row to status='cancelled'. We
      // only persist the final progress so the UI shows what was ingested
      // before the abort.
      syncDebug.jobEnd(input.jobId, CRYPTO_SYNC_STATUS.CANCELLED, totalIngested, taskFailures.length);
      return false;
    }

    if (fatalError) {
      const err = fatalError as BinanceClientError;
      await markJobFailed(input.jobId, err.code, err.message);
      syncDebug.jobEnd(input.jobId, CRYPTO_SYNC_STATUS.FAILED, totalIngested, taskFailures.length);
      return false;
    }

    state.completedTaskKeys = Array.from(completedKeys);
    state.taskFailures = taskFailures;
    state.rawEventsIngested = totalIngested;
    state.crossSource = exportCrossSourceCarryOver(crossSourceIndex);

    const remaining = tasks.filter((task) => !completedKeys.has(task.key)).length;
    if (remaining > 0) {
      await handOff(round, totalIngested, `${remaining} fetch tasks`);
      return false;
    }

    // Every task has run: the -2015 refusals are confirmed and the gaps
    // attached once, by the round that ran the last task.
    state.taskFailures = await confirmEndpointRefusals(client, taskFailures);
    attachGaps(progress, gapFailuresOf(state.taskFailures));
    await updateJobProgress(input.jobId, progress, totalIngested);

    state.phase = CRYPTO_SYNC_PHASE.NORMALIZE;
    // Only the fetch needs these; a normalising round would carry them for nothing.
    state.completedTaskKeys = [];
    state.spotCandidates = [];
    state.crossSource = { dropped: [], consumed: [] };
    return true;
  } catch (error) {
    if (!(error instanceof SyncCutoffError)) throw error;
    // Discovery, or the -2015 confirmation after the last task, was still
    // waiting on Binance at the cutoff. The state holds what this round
    // finished, so the next round repeats only that call.
    await handOff(round, state.rawEventsIngested, 'Binance calls cut off at the round cutoff');
    return false;
  } finally {
    redactCredentials(credentials);
  }
}

/**
 * Normalise raw → taxable BEFORE marking the job as completed, so the UI
 * shows the work in progress. Tolerant: failures here are logged but never
 * demote the sync from 'completed' — the next sync picks up anything missed
 * thanks to the LEFT-JOIN-on-RawEventID query. When the round's budget runs
 * out first, the next round continues where this one stopped, and the job
 * completes only once the queue is empty.
 */
async function runNormalizePhase(round: SyncRound): Promise<void> {
  const { input, state, progress, budget } = round;
  let stoppedAtDeadline = false;
  try {
    const checkpoint = state.normalize ?? (await startNormalizing(round));
    state.normalize = checkpoint;
    if (checkpoint.total > 0) {
      // Counts of the rounds before this one, which the callback adds to.
      const before = { processed: checkpoint.processed, inserted: checkpoint.inserted };
      const normalizeResult = await normalizeForUser(
        input.userId,
        async (processed, inserted) => {
          progress.normalize = {
            fetched: before.inserted + inserted,
            totalWindows: checkpoint.total,
            completedWindows: Math.min(before.processed + processed, checkpoint.total),
            lastWindowEnd: new Date().toISOString(),
          };
          await updateJobProgress(input.jobId, progress, state.rawEventsIngested + before.inserted + inserted);
        },
        budget,
      );
      checkpoint.processed = before.processed + normalizeResult.processed;
      checkpoint.inserted = before.inserted + normalizeResult.inserted;
      stoppedAtDeadline = normalizeResult.stoppedAtDeadline;

      // biome-ignore lint/suspicious/noConsole: surface normalize summary in dev logs
      console.log(
        `Sync job ${input.jobId} normalized ${normalizeResult.inserted} taxable events ` +
          `(${normalizeResult.processed} processed, ${normalizeResult.skipped} skipped, ${normalizeResult.failed} failed)`,
      );
    }
  } catch (normError) {
    // biome-ignore lint/suspicious/noConsole: surface in dev logs
    console.error(`Sync job ${input.jobId} post-sync normalize threw:`, normError);
  }

  if (stoppedAtDeadline) {
    const pending = (state.normalize?.total ?? 0) - (state.normalize?.processed ?? 0);
    await handOff(round, state.rawEventsIngested + (state.normalize?.inserted ?? 0), `${pending} events to normalise`);
    return;
  }
  await finishJob(round);
}

/** Counts the queue once, when normalisation starts, and shows it as a synthetic endpoint. */
async function startNormalizing(round: SyncRound): Promise<NonNullable<SyncResumeState['normalize']>> {
  const { input, state, progress } = round;
  const total = await countUnnormalisedRawEventsForUser(input.userId);
  if (total > 0) {
    // Surface as a synthetic endpoint in the progress map so the
    // existing UI progress bar covers normalization automatically.
    progress.normalize = { fetched: 0, totalWindows: total, completedWindows: 0, lastWindowEnd: null };
    await updateJobProgress(input.jobId, progress, state.rawEventsIngested);
  }
  return { total, processed: 0, inserted: 0 };
}

/**
 * Gaps a retry of the same windows would not fill: permanent ones repeat on
 * every run, resumable ones are already stored as far as they got.
 */
function gapFailuresOf(failures: TaskFailure[]): TaskFailure[] {
  return failures.filter(
    (f) => f.kind === CRYPTO_SYNC_FAILURE_KIND.PERMANENT || f.kind === CRYPTO_SYNC_FAILURE_KIND.RESUMABLE,
  );
}

/** The job's final status, from the failures of every round. */
async function finishJob(round: SyncRound): Promise<void> {
  const { input, state } = round;
  const failures = state.taskFailures;
  const totalIngested = state.rawEventsIngested;
  const transientFailures = failures.filter((f) => f.kind === CRYPTO_SYNC_FAILURE_KIND.TRANSIENT);
  const gapFailures = gapFailuresOf(failures);

  if (transientFailures.length > 0) {
    // Some windows were not fetched or not stored and a later run can fetch
    // them. Whatever did come in stays (every insert is idempotent), but the
    // job must not read as completed: the UI would show a green check over
    // missing disposals and rewards, and the next incremental sync would
    // start after the windows that failed.
    const summary = summariseFailures(failures);
    await markJobFailed(input.jobId, API_ERROR.CRYPTO.SYNC_FAILED, summary);
    // biome-ignore lint/suspicious/noConsole: surface the failing endpoints and their raw errors in the server log
    console.warn(
      `Sync job ${input.jobId} failed with ${failures.length} task failures:\n${summary}\n` +
        failures.map((f) => `  ${f.eventType}: ${f.message}`).join('\n'),
    );
    syncDebug.jobEnd(input.jobId, CRYPTO_SYNC_STATUS.FAILED, totalIngested, failures.length);
  } else if (gapFailures.length > 0) {
    // Failing the job would not bring these either: a permanent one fails the
    // same way on every run, and a resumable one continues from what it
    // stored, whatever the anchor. Failing would keep the incremental anchor
    // where it is and re-fetch every other window each week, so the job
    // completes and records the gaps for the panel.
    const summary = summariseFailures(gapFailures);
    await markJobCompleted(input.jobId, { code: CRYPTO_SYNC_COMPLETED_WITH_GAPS, message: summary });
    // biome-ignore lint/suspicious/noConsole: surface the gaps a retry of the same windows will not fill in the server log
    console.warn(`Sync job ${input.jobId} completed with ${gapFailures.length} gaps:\n${summary}`);
    syncDebug.jobEnd(input.jobId, CRYPTO_SYNC_STATUS.COMPLETED, totalIngested, gapFailures.length);
  } else {
    await markJobCompleted(input.jobId);
    syncDebug.jobEnd(input.jobId, CRYPTO_SYNC_STATUS.COMPLETED, totalIngested, 0);
  }
}

/**
 * Ends a round that ran out of time with work left. The job stays running:
 * the state and progress are saved in one write (which also moves UpdatedAt,
 * so failStuckJobs leaves the job alone) and the continue route is asked for
 * the next round, which runs in a fresh invocation with a fresh budget. A job
 * that would need more than CRYPTO_SYNC_MAX_ROUNDS fails instead: something
 * keeps it from advancing, and it must not hand itself on forever.
 */
async function handOff(round: SyncRound, eventsIngested: number, remaining: string): Promise<void> {
  const { input, state, progress } = round;
  const nextRound = state.round + 1;
  if (nextRound > CRYPTO_SYNC_MAX_ROUNDS) {
    await updateJobProgress(input.jobId, progress, eventsIngested);
    await markJobFailed(
      input.jobId,
      API_ERROR.CRYPTO.SYNC_ROUND_LIMIT,
      `The sync used all its ${CRYPTO_SYNC_MAX_ROUNDS} rounds with ${remaining} still to do.`,
    );
    syncDebug.jobEnd(input.jobId, CRYPTO_SYNC_STATUS.FAILED, state.rawEventsIngested, state.taskFailures.length);
    return;
  }

  // Before the write: a write that throws may still have been saved.
  round.announcedRound = nextRound;
  const stillRunning = await handOffSyncRound(input.jobId, progress, eventsIngested, {
    ...state,
    round: nextRound,
    claimed: false,
  });
  // Cancelled while this round finished its last tasks: nothing to continue.
  if (!stillRunning) return;

  // biome-ignore lint/suspicious/noConsole: a job that spans rounds should say so in the server log
  console.log(
    `Sync job ${input.jobId} round ${state.round} ran out of time with ${remaining} left; ` +
      `starting round ${nextRound}`,
  );
  // The budget tells the hand-off how much of this invocation is left for it.
  const outcome = await startSyncRound(input.jobId, nextRound, round.budget);
  round.passedOn = outcome === CRYPTO_SYNC_HANDOFF_OUTCOME.ACCEPTED;
}

function countFailuresByEndpoint(failures: TaskFailure[]): Record<string, number> {
  const counts: Record<string, number> = {};
  failures.forEach((f) => {
    counts[f.eventType] = (counts[f.eventType] ?? 0) + 1;
  });
  return counts;
}

/**
 * One line per endpoint, failure code and Binance code, with the spot pairs it
 * hit. The Binance code is what a new permanent failure would be recognised
 * by, so it is kept in the message the user and the log both see.
 */
function summariseFailures(failures: TaskFailure[]): string {
  const grouped = new Map<string, { count: number; symbols: string[] }>();
  failures.forEach((f) => {
    const binance = f.binanceCode == null ? '' : ` (binance ${f.binanceCode})`;
    const key = `${f.eventType}/${f.code}${binance}`;
    const entry = grouped.get(key) ?? { count: 0, symbols: [] };
    entry.count += 1;
    if (f.symbol !== null) entry.symbols.push(f.symbol);
    grouped.set(key, entry);
  });
  return Array.from(grouped.entries())
    .map(([key, { count, symbols }]) => `  ${key} ×${count}${symbols.length > 0 ? `: ${symbols.join(', ')}` : ''}`)
    .join('\n');
}

/**
 * classifyTaskFailure trusts a -2015 as "this endpoint is closed to this key"
 * because spot discovery got through GET /api/v3/account before any task ran.
 * A key revoked, or an IP whitelist changed, while the job was running gives
 * the same code, and completing the job would then move the incremental anchor
 * past data a later run could fetch. So the key is asked once more; if it is
 * no longer accepted, those failures count as transient.
 */
async function confirmEndpointRefusals(client: BinanceClient, failures: TaskFailure[]): Promise<TaskFailure[]> {
  const isRefusal = (f: TaskFailure) =>
    f.kind === CRYPTO_SYNC_FAILURE_KIND.PERMANENT && f.code === CRYPTO_SYNC_TASK_FAILURE.ENDPOINT_NOT_PERMITTED;
  if (!failures.some(isRefusal) || (await client.isKeyAccepted())) return failures;
  return failures.map((f) => (isRefusal(f) ? { ...f, kind: CRYPTO_SYNC_FAILURE_KIND.TRANSIENT } : f));
}

function reportTaskFailure(eventType: CryptoEventType, failure: TaskFailureClass, error: unknown): void {
  const binanceError = error instanceof BinanceClientError ? error : null;
  syncDebug.taskFailure(eventType, {
    code: failure.code,
    binanceCode: binanceError?.binanceCode,
    statusCode: binanceError?.statusCode,
    cause: binanceError ? binanceError.cause : error,
  });
}

/**
 * classifyTaskFailure calls a walk that ran out of pages after walking fills
 * resumable: the next incremental sync resumes after the newest fill the API
 * stored for the pair. That continues this walk only if both hold:
 * - The walk reached the fills already stored. A full sync walks from the
 *   first fill, and on a pair whose newest fills an earlier run stored (every
 *   API sync before 2026-09-29 stored only the newest ~1000 per pair) it can
 *   stop below them. The next run then starts above those stored fills, and no
 *   run fetches the ones in between.
 * - The walk stored at least one fill. The walked fills go through the
 *   cross-source dedup first, and those a CSV import already holds are
 *   dropped; when that is every one of them, the resume point does not move
 *   and each run walks the same pages into the same cap.
 * Otherwise the gap is permanent, to be imported by CSV. When the insert
 * itself failed the walk stays resumable: that failure is transient, it fails
 * the job, and the next run stores the same fills.
 */
function confirmResumableWalk(
  failure: TaskFailureClass,
  error: unknown,
  storedTradeId: number | undefined,
  stored: StoreOutcome,
): TaskFailureClass {
  if (failure.kind !== CRYPTO_SYNC_FAILURE_KIND.RESUMABLE) return failure;
  const reachedStoredFills =
    storedTradeId == null || (error instanceof SpotHistoryTruncatedError && error.newestWalkedId >= storedTradeId);
  const advancesResumePoint = stored.inserted > 0 || stored.insertFailure !== null;
  if (reachedStoredFills && advancesResumePoint) return failure;
  return { kind: CRYPTO_SYNC_FAILURE_KIND.PERMANENT, code: CRYPTO_SYNC_TASK_FAILURE.HISTORY_TRUNCATED };
}

/**
 * Records each endpoint's gaps in its Progress entry, for the sync panel:
 * permanent ones in `permanentFailures`, resumable ones in `resumableFailures`,
 * because the panel tells the user to import a CSV for the first and to wait
 * for the next sync for the second.
 */
function attachGaps(progress: ProgressMap, failures: TaskFailure[]): void {
  failures.forEach((f) => {
    const endpoint = progress[f.eventType] ?? emptyProgress();
    const resumable = f.kind === CRYPTO_SYNC_FAILURE_KIND.RESUMABLE;
    const summaries: TaskFailureSummary[] = (resumable ? endpoint.resumableFailures : endpoint.permanentFailures) ?? [];
    const summary = summaries.find((s) => s.code === f.code);
    if (summary) {
      summary.count += 1;
      if (f.symbol !== null) summary.symbols.push(f.symbol);
    } else {
      summaries.push({ code: f.code, count: 1, symbols: f.symbol === null ? [] : [f.symbol] });
    }
    if (resumable) endpoint.resumableFailures = summaries;
    else endpoint.permanentFailures = summaries;
    progress[f.eventType] = endpoint;
  });
}

// ============================================================
// Task building
// ============================================================

interface SyncTask {
  eventType: CryptoEventType;
  // Stable across rounds (see taskKey): a later round skips the keys completed.
  key: string;
  windowEnd: Date;
  // The spot pair of a myTrades task, named in its failure so the user knows
  // which pair to import by CSV. Windowed endpoints leave it out.
  symbol?: string;
  // The newest fill an earlier API sync stored for that pair, in both modes,
  // which the next incremental sync resumes after (see confirmResumableWalk).
  storedTradeId?: number;
  execute: () => Promise<RawEventInput[]>;
}

/**
 * Every task of the job, rebuilt the same way each round, with the spot pairs
 * they cover. Only the round that runs discovery asks for the pairs; the ones
 * after it take the list it saved (see spotPairsOf).
 */
async function buildTasks(
  client: BinanceClient,
  input: RunSyncInput,
  state: SyncResumeState,
): Promise<{ tasks: SyncTask[]; spotCandidates: string[] }> {
  const { scopeFrom, scopeTo } = input;
  const tasks: SyncTask[] = [];

  // Spot trades — ONE task per candidate symbol. Internally fetchSpotTrades
  // paginates with `fromId` until the scope is covered (or returns empty
  // immediately for pairs the user never touched). An incremental sync hands
  // it the newest fill an earlier API sync stored for the pair, so the walk
  // resumes there instead of at the pair's first fill. A full sync keeps
  // walking from the first fill: it is how a hole below the newest stored fill
  // gets filled.
  const { pairs: candidatePairs, storedTradeIds } = await spotPairsOf(client, input, state);
  const resumeFrom = input.mode === CRYPTO_SYNC_MODE.INCREMENTAL ? storedTradeIds : new Map<string, number>();
  candidatePairs.forEach((symbol) => {
    tasks.push({
      eventType: CRYPTO_EVENT_TYPE.SPOT_TRADE,
      key: taskKey(CRYPTO_EVENT_TYPE.SPOT_TRADE, symbol),
      windowEnd: scopeTo,
      symbol,
      storedTradeId: storedTradeIds.get(symbol),
      execute: () => client.fetchSpotTrades(symbol, scopeFrom.getTime(), scopeTo.getTime(), resumeFrom.get(symbol)),
    });
  });

  // Convert
  generateWindows(scopeFrom, scopeTo, BINANCE_WINDOW_DAYS.CONVERT).forEach(({ start, end }) => {
    tasks.push({
      eventType: CRYPTO_EVENT_TYPE.CONVERT,
      key: taskKey(CRYPTO_EVENT_TYPE.CONVERT, start.toISOString()),
      windowEnd: end,
      execute: () => client.fetchConvertTrades(start.getTime(), end.getTime()),
    });
  });

  // Earn — flexible + locked
  generateWindows(scopeFrom, scopeTo, BINANCE_WINDOW_DAYS.EARN_REWARDS).forEach(({ start, end }) => {
    tasks.push({
      eventType: CRYPTO_EVENT_TYPE.EARN_FLEX,
      key: taskKey(CRYPTO_EVENT_TYPE.EARN_FLEX, start.toISOString()),
      windowEnd: end,
      execute: () => client.fetchFlexibleEarnRewards(start.getTime(), end.getTime()),
    });
    tasks.push({
      eventType: CRYPTO_EVENT_TYPE.EARN_LOCKED,
      key: taskKey(CRYPTO_EVENT_TYPE.EARN_LOCKED, start.toISOString()),
      windowEnd: end,
      execute: () => client.fetchLockedEarnRewards(start.getTime(), end.getTime()),
    });
  });

  // ETH staking
  generateWindows(scopeFrom, scopeTo, BINANCE_WINDOW_DAYS.ETH_STAKING).forEach(({ start, end }) => {
    tasks.push({
      eventType: CRYPTO_EVENT_TYPE.ETH_STAKING,
      key: taskKey(CRYPTO_EVENT_TYPE.ETH_STAKING, start.toISOString()),
      windowEnd: end,
      execute: () => client.fetchEthStakingRewards(start.getTime(), end.getTime()),
    });
  });

  // On-chain staking interest
  generateWindows(scopeFrom, scopeTo, BINANCE_WINDOW_DAYS.STAKING_INTEREST).forEach(({ start, end }) => {
    tasks.push({
      eventType: CRYPTO_EVENT_TYPE.STAKING_INTEREST,
      key: taskKey(CRYPTO_EVENT_TYPE.STAKING_INTEREST, start.toISOString()),
      windowEnd: end,
      execute: () => client.fetchStakingInterest(start.getTime(), end.getTime()),
    });
  });

  // Asset dividends (airdrops + distributions)
  generateWindows(scopeFrom, scopeTo, BINANCE_WINDOW_DAYS.DIVIDEND).forEach(({ start, end }) => {
    tasks.push({
      eventType: CRYPTO_EVENT_TYPE.DIVIDEND,
      key: taskKey(CRYPTO_EVENT_TYPE.DIVIDEND, start.toISOString()),
      windowEnd: end,
      execute: () => client.fetchAssetDividends(start.getTime(), end.getTime()),
    });
  });

  // Deposits / withdrawals
  generateWindows(scopeFrom, scopeTo, BINANCE_WINDOW_DAYS.DEPOSIT).forEach(({ start, end }) => {
    tasks.push({
      eventType: CRYPTO_EVENT_TYPE.DEPOSIT,
      key: taskKey(CRYPTO_EVENT_TYPE.DEPOSIT, start.toISOString()),
      windowEnd: end,
      execute: () => client.fetchDeposits(start.getTime(), end.getTime()),
    });
    tasks.push({
      eventType: CRYPTO_EVENT_TYPE.WITHDRAW,
      key: taskKey(CRYPTO_EVENT_TYPE.WITHDRAW, start.toISOString()),
      windowEnd: end,
      execute: () => client.fetchWithdrawals(start.getTime(), end.getTime()),
    });
  });

  // Fiat orders + payments (deposit transactionType=0, withdraw=1)
  generateWindows(scopeFrom, scopeTo, BINANCE_WINDOW_DAYS.FIAT_ORDER).forEach(({ start, end }) => {
    (['0', '1'] as const).forEach((tt) => {
      tasks.push({
        eventType: CRYPTO_EVENT_TYPE.FIAT_ORDER,
        key: taskKey(CRYPTO_EVENT_TYPE.FIAT_ORDER, start.toISOString(), tt),
        windowEnd: end,
        execute: () => client.fetchFiatOrders(start.getTime(), end.getTime(), tt),
      });
      tasks.push({
        eventType: CRYPTO_EVENT_TYPE.FIAT_PAYMENT,
        key: taskKey(CRYPTO_EVENT_TYPE.FIAT_PAYMENT, start.toISOString(), tt),
        windowEnd: end,
        execute: () => client.fetchFiatPayments(start.getTime(), end.getTime(), tt),
      });
    });
  });

  // Dust → BNB
  generateWindows(scopeFrom, scopeTo, BINANCE_WINDOW_DAYS.DUST).forEach(({ start, end }) => {
    tasks.push({
      eventType: CRYPTO_EVENT_TYPE.DUST,
      key: taskKey(CRYPTO_EVENT_TYPE.DUST, start.toISOString()),
      windowEnd: end,
      execute: () => client.fetchDust(start.getTime(), end.getTime()),
    });
  });

  // C2C — buy + sell legs (only last 6 months are returned by Binance regardless of scope)
  generateWindows(scopeFrom, scopeTo, BINANCE_WINDOW_DAYS.C2C).forEach(({ start, end }) => {
    (['BUY', 'SELL'] as const).forEach((tt) => {
      tasks.push({
        eventType: CRYPTO_EVENT_TYPE.C2C,
        key: taskKey(CRYPTO_EVENT_TYPE.C2C, start.toISOString(), tt),
        windowEnd: end,
        execute: () => client.fetchC2CTrades(start.getTime(), end.getTime(), tt),
      });
    });
  });

  return { tasks, spotCandidates: candidatePairs };
}

interface SpotPairs {
  pairs: string[];
  // The newest fill an earlier API sync stored, per pair.
  storedTradeIds: Map<string, number>;
}

/**
 * The job's spot pairs. The round that runs discovery merges three sources
 * (in priority order):
 *   1. getBalances() — every coin the user currently has any balance in
 *      (free/locked/freeze/withdrawing/ipoable/ipoing/storage > 0). This
 *      catches assets parked in Earn/Vault/staking that don't show up in
 *      the spot-only getAccountInformation.
 *   2. listInteractedAssetsForUser() — assets seen in already-ingested
 *      events (dividend, dust, deposit, withdraw, earn_*, convert, etc.).
 *      Catches obscure airdrops and tokens the user has since fully
 *      withdrawn.
 *   3. defaultSyncBaseAssets() — held + top-40 fallback for users with
 *      empty wallets and no prior sync history.
 * Every pair an earlier API sync stored fills for is added on top, in both
 * modes: once its base asset is sold off it is in none of the three sources,
 * and its later fills (the sale among them) would never be fetched again.
 *
 * A later round takes the pairs that discovery listed (state.spotCandidates)
 * instead of asking Binance and the database again: one uninterrupted run
 * discovers once, and discovering again would spend request weight and could
 * list a pair that run would not have fetched. Discovery always lists at
 * least the top-40 fallback pairs, so an empty list means no round finished
 * it (the one before was cut off during it), and this round discovers. The
 * newest stored fills are read again only when a walk is still to run.
 */
async function spotPairsOf(client: BinanceClient, input: RunSyncInput, state: SyncResumeState): Promise<SpotPairs> {
  if (state.spotCandidates.length > 0) {
    const completed = new Set(state.completedTaskKeys);
    const walksLeft = state.spotCandidates.some(
      (symbol) => !completed.has(taskKey(CRYPTO_EVENT_TYPE.SPOT_TRADE, symbol)),
    );
    return {
      pairs: state.spotCandidates,
      storedTradeIds: walksLeft ? await loadLastApiTradeIds(input.userId) : new Map<string, number>(),
    };
  }

  const [allCoins, dbAssets, heldAssets, storedTradeIds] = await Promise.all([
    safeDiscoverAllCoins(client),
    listInteractedAssetsForUser(input.userId),
    client.discoverHeldAssets(),
    loadLastApiTradeIds(input.userId),
  ]);
  const baseAssets = unique([...allCoins, ...dbAssets, ...defaultSyncBaseAssets(heldAssets)]);
  syncDebug.discovery({ allCoins, dbAssets, heldAssets, merged: baseAssets });
  return {
    pairs: unique([...baseAssets.flatMap(candidateSymbolsFor), ...storedTradeIds.keys()]),
    storedTradeIds,
  };
}

// ============================================================
// Helpers
// ============================================================

function emptyProgress(): EndpointProgress {
  return { fetched: 0, totalWindows: 0, completedWindows: 0, lastWindowEnd: null };
}

/**
 * Sets each endpoint's totalWindows to its tasks: this round's list plus the
 * keys earlier rounds completed. Counting keys rather than adding to the
 * stored total keeps a rebuilt list from counting a task twice, and keeps a
 * task an earlier round ran even if discovery no longer lists it.
 */
function initializeProgress(progress: ProgressMap, tasks: SyncTask[], completedKeys: Set<string>): void {
  const keysByEndpoint = new Map<string, Set<string>>();
  const count = (eventType: string, key: string) => {
    const keys = keysByEndpoint.get(eventType) ?? new Set<string>();
    keys.add(key);
    keysByEndpoint.set(eventType, keys);
  };
  tasks.forEach((task) => {
    count(task.eventType, task.key);
  });
  completedKeys.forEach((key) => {
    count(eventTypeOfTaskKey(key), key);
  });
  keysByEndpoint.forEach((keys, eventType) => {
    const current = progress[eventType] ?? emptyProgress();
    current.totalWindows = keys.size;
    progress[eventType] = current;
  });
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

/**
 * Wrap discoverAllInteractedAssets() so a transient failure here doesn't
 * abort the whole sync — we still have the held + DB + fallback sources.
 * A call abandoned at the round's cutoff is not such a failure: it reaches
 * the round, which hands off before discovery ends, and the next round
 * discovers again. Answered as empty, it would save a pair list without this
 * source's pairs, and no later round discovers again to add them.
 */
async function safeDiscoverAllCoins(client: BinanceClient): Promise<string[]> {
  try {
    return await client.discoverAllInteractedAssets();
  } catch (error) {
    if (error instanceof SyncCutoffError) throw error;
    return [];
  }
}

/**
 * Best-effort: zero out the in-memory copy of the secret. JavaScript strings
 * are immutable so this is mostly symbolic, but it prevents the secret from
 * lingering in object inspection during a debugger pause.
 */
function redactCredentials(creds: DecryptedCredentials): void {
  // biome-ignore lint/suspicious/noExplicitAny: deliberate mutation to clear a sensitive field
  (creds as any).apiKey = '';
  // biome-ignore lint/suspicious/noExplicitAny: deliberate mutation to clear a sensitive field
  (creds as any).apiSecret = '';
}

// ============================================================
// Scope computation (called by the API handler / cron)
// ============================================================

/**
 * Compute (scopeFrom, scopeTo) for a sync request.
 *
 * Priority order:
 *  1. Explicit `requestedFrom` from the caller — UI lets the user pick a year
 *     to avoid scanning since 2017 unnecessarily.
 *  2. Mode='incremental' → last completed job's FinishedAt minus 24h overlap
 *     (to absorb out-of-order events Binance emits).
 *  3. Mode='full' → BINANCE_GENESIS_DATE (2017-07-14).
 *
 * Note: we deliberately ignore the API key's createTime — that's the key's
 * timestamp, NOT the account's, and using it would make a "full" backfill
 * miss everything older than the key.
 */
export function computeSyncScope(
  mode: CryptoSyncMode,
  lastCompletedAt: Date | null,
  requestedFrom: Date | null,
): { scopeFrom: Date; scopeTo: Date } {
  const now = new Date();

  if (requestedFrom) {
    return { scopeFrom: requestedFrom, scopeTo: now };
  }

  if (mode === CRYPTO_SYNC_MODE.INCREMENTAL && lastCompletedAt) {
    const overlap = new Date(lastCompletedAt.getTime() - 24 * 60 * 60 * 1000);
    return { scopeFrom: overlap, scopeTo: now };
  }

  return { scopeFrom: new Date(BINANCE_GENESIS_DATE), scopeTo: now };
}
