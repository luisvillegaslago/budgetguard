/**
 * Repository for crypto sync job lifecycle.
 *
 * Status transitions: pending -> running -> (completed | failed). Progress is
 * a JSONB map keyed by EventType so the UI can render per-endpoint progress
 * bars without polling row counts.
 */

import {
  CRYPTO_SYNC_STATUS,
  type CryptoExchange,
  type CryptoSyncMode,
  type CryptoSyncStatus,
} from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
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
}

export interface EndpointProgress {
  fetched: number;
  totalWindows: number;
  completedWindows: number;
  lastWindowEnd: string | null;
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
  };
}

const COLUMNS = `"JobID", "UserID", "Exchange", "Mode", "Status", "ScopeFrom", "ScopeTo",
  "Progress", "ErrorCode", "ErrorMessage", "EventsIngested",
  "StartedAt", "FinishedAt", "CreatedAt", "UpdatedAt"`;

export interface CreateSyncJobInput {
  exchange: CryptoExchange;
  mode: CryptoSyncMode;
  scopeFrom: Date;
  scopeTo: Date;
}

export async function createSyncJob(input: CreateSyncJobInput): Promise<CryptoSyncJob> {
  const userId = await getUserIdOrThrow();
  return createSyncJobForUser(userId, input);
}

export async function createSyncJobForUser(userId: number, input: CreateSyncJobInput): Promise<CryptoSyncJob> {
  const rows = await query<SyncJobRow>(
    `INSERT INTO "CryptoSyncJobs"
       ("UserID", "Exchange", "Mode", "Status", "ScopeFrom", "ScopeTo")
     VALUES ($1, $2, $3, 'pending', $4, $5)
     RETURNING ${COLUMNS}`,
    [userId, input.exchange, input.mode, input.scopeFrom.toISOString(), input.scopeTo.toISOString()],
  );
  return rowToJob(rows[0]!);
}

/**
 * Mark a job as running. Sets StartedAt to now. Does NOT enforce
 * exclusivity at the DB level — caller (BinanceSyncService) is expected to
 * have checked findActiveJob() beforehand.
 */
export async function markJobRunning(jobId: number): Promise<void> {
  await query(
    `UPDATE "CryptoSyncJobs"
     SET "Status" = 'running', "StartedAt" = CURRENT_TIMESTAMP
     WHERE "JobID" = $1`,
    [jobId],
  );
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

export async function markJobCompleted(jobId: number): Promise<void> {
  await query(
    `UPDATE "CryptoSyncJobs"
     SET "Status" = 'completed', "FinishedAt" = CURRENT_TIMESTAMP
     WHERE "JobID" = $1`,
    [jobId],
  );
}

export async function markJobFailed(jobId: number, errorCode: string, errorMessage: string): Promise<void> {
  await query(
    `UPDATE "CryptoSyncJobs"
     SET "Status" = 'failed', "FinishedAt" = CURRENT_TIMESTAMP,
         "ErrorCode" = $1, "ErrorMessage" = $2
     WHERE "JobID" = $3`,
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
     SET "Status" = 'cancelled', "FinishedAt" = CURRENT_TIMESTAMP,
         "ErrorCode" = 'cancelled', "ErrorMessage" = 'Cancelled by user'
     WHERE "JobID" = $1 AND "UserID" = $2 AND "Status" IN ('pending', 'running')
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
  const rows = await query<{ Status: string }>(`SELECT "Status" FROM "CryptoSyncJobs" WHERE "JobID" = $1`, [jobId]);
  return rows[0]?.Status === CRYPTO_SYNC_STATUS.CANCELLED;
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
 * Returns the currently running or pending job for the user × exchange, if
 * any. Used to prevent two concurrent syncs from racing.
 */
export async function findActiveJob(exchange: CryptoExchange): Promise<CryptoSyncJob | null> {
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
 * Last successfully completed sync for incremental scope calculation.
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
     ORDER BY "FinishedAt" DESC
     LIMIT 1`,
    [userId, exchange],
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
