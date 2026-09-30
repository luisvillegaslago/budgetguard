/**
 * Repository for crypto sync job lifecycle.
 *
 * Status transitions: pending -> running -> (completed | failed), and pending
 * or running -> cancelled. Every transition names the statuses it leaves from,
 * so a job that already ended (cancelled by the user while its worker finished
 * a task, failed by failStuckJobs) is never revived or overwritten. Progress is
 * a JSONB map keyed by EventType so the UI can render per-endpoint progress
 * bars without polling row counts. A job longer than one function invocation
 * runs in rounds; ResumeState carries what the next round needs.
 */

import {
  API_ERROR,
  CRYPTO_CSV_IMPORT_PROGRESS_KEY,
  CRYPTO_SYNC_STATUS,
  type CryptoExchange,
  type CryptoSyncMode,
  type CryptoSyncStatus,
} from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import { type SyncResumeState, SyncResumeStateSchema } from '@/schemas/crypto';
import { query } from './connection';

interface SyncJobRow {
  JobID: number;
  UserID: number;
  Exchange: string;
  Mode: string;
  Status: string;
  ScopeFrom: string;
  ScopeTo: string;
  Progress: Record<string, EndpointProgress>;
  ErrorCode: string | null;
  ErrorMessage: string | null;
  EventsIngested: number;
  StartedAt: string | null;
  FinishedAt: string | null;
  CreatedAt: string;
  UpdatedAt: string;
  Round: number;
}

export interface EndpointProgress {
  fetched: number;
  totalWindows: number;
  completedWindows: number;
  lastWindowEnd: string | null;
  // Tasks of this endpoint that failed in a way the next run would repeat.
  // Absent when there were none.
  permanentFailures?: TaskFailureSummary[];
  // Tasks that stored part of their data and that the next incremental sync
  // continues. Absent when there were none.
  resumableFailures?: TaskFailureSummary[];
  // Fetched events dropped because a CSV import already stored the same
  // operation. Recorded so a wrongly dropped event is not silent. Absent when
  // there were none.
  duplicatesSkipped?: number;
}

export interface TaskFailureSummary {
  code: string; // a CRYPTO_SYNC_TASK_FAILURE value
  count: number; // tasks (windows, or spot pairs) that ended with it
  symbols: string[]; // spot pairs affected; empty for windowed endpoints
}

/** Why a completed job still carries an ErrorCode/ErrorMessage. */
export interface JobCompletionWarning {
  code: string;
  message: string;
}

export interface CryptoSyncJob {
  jobId: number;
  exchange: CryptoExchange;
  mode: CryptoSyncMode;
  status: CryptoSyncStatus;
  scopeFrom: string;
  scopeTo: string;
  progress: Record<string, EndpointProgress>;
  errorCode: string | null;
  errorMessage: string | null;
  eventsIngested: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // The round running, or the next one while a hand-off is in flight; 1 for a
  // job that never needed more.
  round: number;
}

function rowToJob(row: SyncJobRow): CryptoSyncJob {
  return {
    jobId: row.JobID,
    exchange: row.Exchange as CryptoExchange,
    mode: row.Mode as CryptoSyncMode,
    status: row.Status as CryptoSyncStatus,
    scopeFrom: row.ScopeFrom,
    scopeTo: row.ScopeTo,
    progress: row.Progress,
    errorCode: row.ErrorCode,
    errorMessage: row.ErrorMessage,
    eventsIngested: row.EventsIngested,
    startedAt: row.StartedAt,
    finishedAt: row.FinishedAt,
    createdAt: row.CreatedAt,
    updatedAt: row.UpdatedAt,
    round: row.Round,
  };
}

// ResumeState itself stays out: it can hold thousands of task keys, and only
// the round is of use outside the worker.
const COLUMNS = `"JobID", "UserID", "Exchange", "Mode", "Status", "ScopeFrom", "ScopeTo",
  "Progress", "ErrorCode", "ErrorMessage", "EventsIngested",
  "StartedAt", "FinishedAt", "CreatedAt", "UpdatedAt",
  COALESCE(("ResumeState"->>'round')::int, 1) AS "Round"`;

export interface CreateSyncJobInput {
  exchange: CryptoExchange;
  mode: CryptoSyncMode;
  scopeFrom: Date;
  scopeTo: Date;
  // The job joins the cron's queue: it waits with round 1 unclaimed until the
  // cron, or the round that ends the queued job before it, starts that round
  // through the continue route (startNextQueuedSyncJob).
  awaitsContinuation?: boolean;
}

// ResumeState of a job waiting in the cron's queue for its first round.
const FIRST_ROUND_UNCLAIMED = JSON.stringify({ round: 1, claimed: false, inCronQueue: true });

// A job of the cron's queue still waiting for its turn, as a jsonb containment
// test on "ResumeState". The column is NOT NULL, so the test is never NULL: a
// manual job's '{}' simply does not contain it.
const WAITING_IN_CRON_QUEUE = `'${FIRST_ROUND_UNCLAIMED}'::jsonb`;

// Whether a job of the cron's queue is under way: running, or pending with its
// first round claimed and about to run. The round that ends it starts the next
// job waiting, so while one is under way no other is started, and none waiting
// behind it counts as stuck. A job's queue marker goes with the rest of its
// state when it ends (ENDED_RESUME_STATE), so an ended job never matches.
const CRON_QUEUE_JOB_UNDER_WAY = `EXISTS (
       SELECT 1 FROM "CryptoSyncJobs" going
        WHERE going."ResumeState" @> '{"inCronQueue": true}'::jsonb
          AND (going."Status" = '${CRYPTO_SYNC_STATUS.RUNNING}'
               OR (going."Status" = '${CRYPTO_SYNC_STATUS.PENDING}'
                   AND going."ResumeState" @> '{"claimed": true}'::jsonb)))`;

// What a job keeps of its ResumeState once it ends: the round it ended in, which
// the panel shows, and claimed, so no continue call can take it. The rest (task
// keys, failures, dedup decisions) can run to thousands of entries nothing reads
// after the end, and every job query, the panel's poll among them, reads the
// round out of this column.
const ENDED_RESUME_STATE = `"ResumeState" = jsonb_build_object('round', COALESCE(("ResumeState"->>'round')::int, 1), 'claimed', true)`;

export async function createSyncJob(input: CreateSyncJobInput): Promise<CryptoSyncJob> {
  const userId = await getUserIdOrThrow();
  return createSyncJobForUser(userId, input);
}

export async function createSyncJobForUser(userId: number, input: CreateSyncJobInput): Promise<CryptoSyncJob> {
  const rows = await query<SyncJobRow>(
    `INSERT INTO "CryptoSyncJobs"
       ("UserID", "Exchange", "Mode", "Status", "ScopeFrom", "ScopeTo", "ResumeState")
     VALUES ($1, $2, $3, '${CRYPTO_SYNC_STATUS.PENDING}', $4, $5, $6::jsonb)
     RETURNING ${COLUMNS}`,
    [
      userId,
      input.exchange,
      input.mode,
      input.scopeFrom.toISOString(),
      input.scopeTo.toISOString(),
      input.awaitsContinuation ? FIRST_ROUND_UNCLAIMED : '{}',
    ],
  );
  return rowToJob(rows[0]!);
}

export interface ClaimedSyncRound {
  job: CryptoSyncJob;
  userId: number;
  resume: SyncResumeState;
}

/**
 * Takes a round for the one worker that will run it. Only a round announced
 * and not yet taken matches: the next round of a running job, as a hand-off
 * left it, or the first round of a job the cron created. So a second call with
 * the same round, a call with an older one, or a call for a job cancelled or
 * finished meanwhile changes nothing and returns null. The check and the claim
 * are one statement, so two calls at once cannot both win.
 *
 * System context: the caller authenticates with CRON_SECRET, and the round
 * runs as the job's owner.
 *
 * The state is read only after the claim is saved, so a state that does not
 * parse would leave a claimed round nobody runs. The job is failed on the spot
 * with its own code instead, and null tells the caller nothing will run. The
 * zod issues quote the stored JSON and zod's own wording, so they go to the
 * server log only: the job's ErrorMessage, which the panel shows, names the
 * round and nothing else.
 */
export async function claimSyncRound(jobId: number, round: number): Promise<ClaimedSyncRound | null> {
  const rows = await query<SyncJobRow & { ResumeState: unknown }>(
    `UPDATE "CryptoSyncJobs"
        SET "ResumeState" = jsonb_set("ResumeState", '{claimed}', 'true'::jsonb)
      WHERE "JobID" = $1
        AND ("ResumeState"->>'round')::int = $2
        AND "ResumeState"->>'claimed' = 'false'
        AND ("Status" = '${CRYPTO_SYNC_STATUS.RUNNING}'
             OR ("Status" = '${CRYPTO_SYNC_STATUS.PENDING}' AND $2 = 1))
      RETURNING ${COLUMNS}, "ResumeState"`,
    [jobId, round],
  );
  const row = rows[0];
  if (!row) return null;
  const resume = SyncResumeStateSchema.safeParse(row.ResumeState);
  if (!resume.success) {
    const issues = resume.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    // biome-ignore lint/suspicious/noConsole: a state the worker cannot read must show in the server log
    console.error(`Sync job ${jobId}: the ResumeState of round ${round} does not parse: ${issues}`);
    await markJobFailed(
      jobId,
      API_ERROR.CRYPTO.SYNC_RESUME_STATE_INVALID,
      `Round ${round} could not start: its saved state could not be read.`,
    );
    return null;
  }
  return { job: rowToJob(row), userId: row.UserID, resume: resume.data };
}

/**
 * Saves what a round leaves for the next one and announces it, in one
 * statement, so a claim never reads a state older than the progress. Writing
 * the row also moves UpdatedAt, which keeps failStuckJobs away while the next
 * round starts. Returns false when the job is no longer running (cancelled
 * while the round finished its last tasks): there is no next round to start.
 */
export async function handOffSyncRound(
  jobId: number,
  progress: Record<string, EndpointProgress>,
  eventsIngested: number,
  state: SyncResumeState,
): Promise<boolean> {
  const rows = await query<{ JobID: number }>(
    `UPDATE "CryptoSyncJobs"
        SET "Progress" = $2::jsonb, "EventsIngested" = $3, "ResumeState" = $4::jsonb
      WHERE "JobID" = $1 AND "Status" = '${CRYPTO_SYNC_STATUS.RUNNING}'
      RETURNING "JobID"`,
    [jobId, JSON.stringify(progress), eventsIngested, JSON.stringify(state)],
  );
  return rows.length > 0;
}

/**
 * Fails a job whose announced round could not be started, but only while
 * nobody has claimed that round: a request that timed out may still have
 * reached the continue route, and then the round is running and must not be
 * marked failed under it.
 */
export async function failUnclaimedSyncRound(
  jobId: number,
  round: number,
  errorCode: string,
  errorMessage: string,
): Promise<boolean> {
  const rows = await query<{ JobID: number }>(
    `UPDATE "CryptoSyncJobs"
        SET "Status" = '${CRYPTO_SYNC_STATUS.FAILED}', "FinishedAt" = CURRENT_TIMESTAMP,
            "ErrorCode" = $3, "ErrorMessage" = $4, ${ENDED_RESUME_STATE}
      WHERE "JobID" = $1
        AND ("ResumeState"->>'round')::int = $2
        AND "ResumeState"->>'claimed' = 'false'
        AND "Status" IN ('${CRYPTO_SYNC_STATUS.PENDING}', '${CRYPTO_SYNC_STATUS.RUNNING}')
      RETURNING "JobID"`,
    [jobId, round, errorCode, errorMessage],
  );
  return rows.length > 0;
}

/**
 * Mark a queued job as running and set StartedAt. Returns false when the job
 * is no longer pending (cancelled before its worker began, or failed by
 * failStuckJobs): it must not be revived, and the worker should stop. Does
 * NOT enforce exclusivity between jobs — the caller is expected to have
 * checked findActiveJob() beforehand.
 */
export async function markJobRunning(jobId: number): Promise<boolean> {
  const rows = await query<{ JobID: number }>(
    `UPDATE "CryptoSyncJobs"
     SET "Status" = '${CRYPTO_SYNC_STATUS.RUNNING}', "StartedAt" = CURRENT_TIMESTAMP
     WHERE "JobID" = $1 AND "Status" = '${CRYPTO_SYNC_STATUS.PENDING}'
     RETURNING "JobID"`,
    [jobId],
  );
  return rows.length > 0;
}

export async function updateJobProgress(
  jobId: number,
  progress: Record<string, EndpointProgress>,
  eventsIngested: number,
): Promise<void> {
  await query(
    `UPDATE "CryptoSyncJobs"
     SET "Progress" = $1::jsonb, "EventsIngested" = $2
     WHERE "JobID" = $3`,
    [JSON.stringify(progress), eventsIngested, jobId],
  );
}

/**
 * `warning` records gaps a completed job left behind (see
 * CRYPTO_SYNC_COMPLETED_WITH_GAPS). The status stays 'completed' so the next
 * incremental sync anchors on this job. Only a running job completes: one the
 * user cancelled while its worker finished must stay cancelled, or the next
 * incremental sync would anchor on a job that never fetched everything.
 */
export async function markJobCompleted(jobId: number, warning: JobCompletionWarning | null = null): Promise<void> {
  await query(
    `UPDATE "CryptoSyncJobs"
     SET "Status" = '${CRYPTO_SYNC_STATUS.COMPLETED}', "FinishedAt" = CURRENT_TIMESTAMP,
         "ErrorCode" = $2, "ErrorMessage" = $3, ${ENDED_RESUME_STATE}
     WHERE "JobID" = $1 AND "Status" = '${CRYPTO_SYNC_STATUS.RUNNING}'`,
    [jobId, warning?.code ?? null, warning?.message ?? null],
  );
}

/** Fails a job that has not ended; a cancelled, completed or failed one keeps its outcome. */
export async function markJobFailed(jobId: number, errorCode: string, errorMessage: string): Promise<void> {
  await query(
    `UPDATE "CryptoSyncJobs"
     SET "Status" = '${CRYPTO_SYNC_STATUS.FAILED}', "FinishedAt" = CURRENT_TIMESTAMP,
         "ErrorCode" = $1, "ErrorMessage" = $2, ${ENDED_RESUME_STATE}
     WHERE "JobID" = $3 AND "Status" IN ('${CRYPTO_SYNC_STATUS.PENDING}', '${CRYPTO_SYNC_STATUS.RUNNING}')`,
    [errorCode, errorMessage, jobId],
  );
}

/**
 * User-initiated cancel. The background worker polls `isJobCancelled` between
 * tasks and aborts cleanly when this is set. Idempotent — already-finished
 * jobs are not modified.
 */
export async function cancelJob(jobId: number): Promise<boolean> {
  const userId = await getUserIdOrThrow();
  const rows = await query<{ JobID: number }>(
    `UPDATE "CryptoSyncJobs"
     SET "Status" = '${CRYPTO_SYNC_STATUS.CANCELLED}', "FinishedAt" = CURRENT_TIMESTAMP,
         "ErrorCode" = 'cancelled', "ErrorMessage" = 'Cancelled by user', ${ENDED_RESUME_STATE}
     WHERE "JobID" = $1 AND "UserID" = $2
       AND "Status" IN ('${CRYPTO_SYNC_STATUS.PENDING}', '${CRYPTO_SYNC_STATUS.RUNNING}')
     RETURNING "JobID"`,
    [jobId, userId],
  );
  return rows.length > 0;
}

/**
 * Returns true if the job was cancelled (by the user or another process).
 * Cheap point-query polled by the sync worker between tasks.
 */
export async function isJobCancelled(jobId: number): Promise<boolean> {
  return (await getJobStatus(jobId)) === CRYPTO_SYNC_STATUS.CANCELLED;
}

/** The job's status, read in system context; null when there is no such job. */
export async function getJobStatus(jobId: number): Promise<CryptoSyncStatus | null> {
  const rows = await query<{ Status: string }>(`SELECT "Status" FROM "CryptoSyncJobs" WHERE "JobID" = $1`, [jobId]);
  return rows[0] ? (rows[0].Status as CryptoSyncStatus) : null;
}

export interface QueuedSyncJob {
  jobId: number;
  userId: number;
  exchange: CryptoExchange;
}

/**
 * The job of the cron's queue to start next: the oldest one still waiting for
 * its first round. Null when none waits, and also while a job of the queue is
 * under way, since the round that ends that job starts the next one: the
 * users' syncs share one IP's Binance request weight and run one at a time.
 * System context: the cron and a finishing round call it, with no session.
 */
export async function findNextQueuedSyncJob(): Promise<QueuedSyncJob | null> {
  const rows = await query<{ JobID: number; UserID: number; Exchange: string }>(
    `SELECT "JobID", "UserID", "Exchange" FROM "CryptoSyncJobs"
      WHERE "Status" = '${CRYPTO_SYNC_STATUS.PENDING}'
        AND "ResumeState" @> ${WAITING_IN_CRON_QUEUE}
        AND NOT ${CRON_QUEUE_JOB_UNDER_WAY}
      ORDER BY "CreatedAt", "JobID"
      LIMIT 1`,
  );
  const row = rows[0];
  return row ? { jobId: row.JobID, userId: row.UserID, exchange: row.Exchange as CryptoExchange } : null;
}

export async function getJobById(jobId: number): Promise<CryptoSyncJob | null> {
  const userId = await getUserIdOrThrow();
  const rows = await query<SyncJobRow>(`SELECT ${COLUMNS} FROM "CryptoSyncJobs" WHERE "JobID" = $1 AND "UserID" = $2`, [
    jobId,
    userId,
  ]);
  return rows[0] ? rowToJob(rows[0]) : null;
}

/**
 * Auto-fail jobs that got stuck in `pending` (StartedAt still null) or
 * `running` (the row not updated for too long). These can happen on
 * `next dev` when an `after()` callback never fires (hot reload, crash)
 * or a Vercel function instance dies mid-sync.
 *
 * The two cases get their own code and message. A running job has usually
 * fetched a good part of its windows before it stopped (job 31 reached 1590 of
 * 2063 on 2026-09-29), so it must not be reported as one that never started.
 *
 * Called transparently from findActiveJob so the UI never sees a zombie
 * job and the user can launch a new sync without manual intervention, and
 * once at the start of the weekly cron, whose own lookup (findActiveJobForUser)
 * would otherwise skip that user every week behind a job nobody runs.
 *
 * Defaults are conservative: a real backfill batch never sits in `pending`
 * more than a few seconds, and a `running` job writes its row every few
 * windows, every normalisation batch and at every hand-off between rounds.
 * The exception is a job waiting in the cron's queue, which stays `pending`
 * until the queued job before it ends: it is left alone while a job of the
 * queue is under way, and counts as stuck once none is, since then nothing
 * will start it. The stalled jobs are failed first, so the jobs waiting behind
 * a stalled one are failed in the same call.
 */
export async function failStuckJobs(opts: { pendingMinutes?: number; runningMinutes?: number } = {}): Promise<number> {
  const pendingMinutes = opts.pendingMinutes ?? 5;
  const runningMinutes = opts.runningMinutes ?? 15;

  const stalled = await query<{ JobID: number }>(
    `UPDATE "CryptoSyncJobs"
     SET "Status" = '${CRYPTO_SYNC_STATUS.FAILED}', "FinishedAt" = CURRENT_TIMESTAMP,
         "ErrorCode" = $2, "ErrorMessage" = $3, ${ENDED_RESUME_STATE}
     WHERE "Status" = '${CRYPTO_SYNC_STATUS.RUNNING}'
       AND "UpdatedAt" < NOW() - ($1::int * INTERVAL '1 minute')
     RETURNING "JobID"`,
    [
      runningMinutes,
      API_ERROR.CRYPTO.SYNC_STALLED,
      `Job stopped reporting progress for ${runningMinutes} minutes: its background worker likely crashed or ` +
        'was stopped by the platform time limit. The progress and events it recorded before stopping are kept.',
    ],
  );
  const neverStarted = await query<{ JobID: number }>(
    `UPDATE "CryptoSyncJobs"
     SET "Status" = '${CRYPTO_SYNC_STATUS.FAILED}', "FinishedAt" = CURRENT_TIMESTAMP,
         "ErrorCode" = $2, "ErrorMessage" = $3, ${ENDED_RESUME_STATE}
     WHERE "Status" = '${CRYPTO_SYNC_STATUS.PENDING}' AND "StartedAt" IS NULL
       AND "CreatedAt" < NOW() - ($1::int * INTERVAL '1 minute')
       AND NOT ("ResumeState" @> ${WAITING_IN_CRON_QUEUE} AND ${CRON_QUEUE_JOB_UNDER_WAY})
     RETURNING "JobID"`,
    [
      pendingMinutes,
      API_ERROR.CRYPTO.SYNC_NEVER_STARTED,
      `Job stayed queued for ${pendingMinutes} minutes without starting: no background worker picked it up.`,
    ],
  );
  return neverStarted.length + stalled.length;
}

/**
 * Returns the currently running or pending job for the user × exchange, if
 * any. Used to prevent two concurrent syncs from racing. Auto-fails stuck
 * jobs first so they don't block new runs forever.
 */
export async function findActiveJob(exchange: CryptoExchange): Promise<CryptoSyncJob | null> {
  await failStuckJobs();
  const userId = await getUserIdOrThrow();
  const rows = await query<SyncJobRow>(
    `SELECT ${COLUMNS} FROM "CryptoSyncJobs"
     WHERE "UserID" = $1 AND "Exchange" = $2
       AND "Status" IN ('${CRYPTO_SYNC_STATUS.PENDING}', '${CRYPTO_SYNC_STATUS.RUNNING}')
     ORDER BY "CreatedAt" DESC
     LIMIT 1`,
    [userId, exchange],
  );
  return rows[0] ? rowToJob(rows[0]) : null;
}

/**
 * Last successfully completed API sync, the anchor of an incremental sync.
 *
 * CSV uploads also create a completed job for the same exchange, but they only
 * cover what their file holds: anchoring on one would make the next API sync
 * skip every window between the previous API sync and the upload.
 */
export async function getLastCompletedJob(exchange: CryptoExchange): Promise<CryptoSyncJob | null> {
  const userId = await getUserIdOrThrow();
  return getLastCompletedJobForUser(userId, exchange);
}

export async function getLastCompletedJobForUser(
  userId: number,
  exchange: CryptoExchange,
): Promise<CryptoSyncJob | null> {
  const rows = await query<SyncJobRow>(
    `SELECT ${COLUMNS} FROM "CryptoSyncJobs"
     WHERE "UserID" = $1 AND "Exchange" = $2 AND "Status" = '${CRYPTO_SYNC_STATUS.COMPLETED}'
       AND NOT ("Progress" ? $3)
     ORDER BY "FinishedAt" DESC
     LIMIT 1`,
    [userId, exchange, CRYPTO_CSV_IMPORT_PROGRESS_KEY],
  );
  return rows[0] ? rowToJob(rows[0]) : null;
}

export async function findActiveJobForUser(userId: number, exchange: CryptoExchange): Promise<CryptoSyncJob | null> {
  const rows = await query<SyncJobRow>(
    `SELECT ${COLUMNS} FROM "CryptoSyncJobs"
     WHERE "UserID" = $1 AND "Exchange" = $2
       AND "Status" IN ('${CRYPTO_SYNC_STATUS.PENDING}', '${CRYPTO_SYNC_STATUS.RUNNING}')
     ORDER BY "CreatedAt" DESC
     LIMIT 1`,
    [userId, exchange],
  );
  return rows[0] ? rowToJob(rows[0]) : null;
}

export async function listRecentJobs(limit = 10): Promise<CryptoSyncJob[]> {
  const userId = await getUserIdOrThrow();
  const rows = await query<SyncJobRow>(
    `SELECT ${COLUMNS} FROM "CryptoSyncJobs"
     WHERE "UserID" = $1
     ORDER BY "CreatedAt" DESC LIMIT $2`,
    [userId, limit],
  );
  return rows.map(rowToJob);
}
