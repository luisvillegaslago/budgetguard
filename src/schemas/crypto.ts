/**
 * Zod schemas for the Crypto module.
 *
 * Phase 1 covers credential creation only. Subsequent phases will add
 * sync request/response and CSV import schemas in this file.
 */

import { z } from 'zod';
import {
  CRYPTO_EVENT_TYPE,
  CRYPTO_EXCHANGE,
  CRYPTO_SYNC_FAILURE_KIND,
  CRYPTO_SYNC_MODE,
  CRYPTO_SYNC_PHASE,
  KLINE_INTERVAL,
  VALIDATION_KEY,
} from '@/constants/finance';

// Binance API key format: 64 alphanumeric characters.
// Binance API secret format: 64 alphanumeric characters.
// We are tolerant on length (50–80) so SDK changes don't lock us out, but we
// still reject obvious garbage and any whitespace.
const BINANCE_KEY_PATTERN = /^[A-Za-z0-9]+$/;

// Validation messages use i18n keys (VALIDATION_KEY) so the UI renders them
// translated via t(errors.field.message) instead of Zod's English defaults.
export const CreateCryptoCredentialSchema = z.object({
  exchange: z.enum([CRYPTO_EXCHANGE.BINANCE]),
  apiKey: z
    .string()
    .trim()
    .min(50, VALIDATION_KEY.API_KEY_LENGTH)
    .max(80, VALIDATION_KEY.API_KEY_LENGTH)
    .regex(BINANCE_KEY_PATTERN, VALIDATION_KEY.API_KEY_FORMAT),
  apiSecret: z
    .string()
    .trim()
    .min(50, VALIDATION_KEY.API_SECRET_LENGTH)
    .max(80, VALIDATION_KEY.API_SECRET_LENGTH)
    .regex(BINANCE_KEY_PATTERN, VALIDATION_KEY.API_SECRET_FORMAT),
});

export type CreateCryptoCredentialInput = z.infer<typeof CreateCryptoCredentialSchema>;

export const StartSyncSchema = z.object({
  exchange: z.enum([CRYPTO_EXCHANGE.BINANCE]),
  mode: z.enum([CRYPTO_SYNC_MODE.FULL, CRYPTO_SYNC_MODE.INCREMENTAL]),
  // Optional caller-provided scope start. When omitted, computeSyncScope
  // falls back to BINANCE_GENESIS_DATE (full) or the last completed job
  // (incremental).
  scopeFrom: z.coerce.date().optional(),
});

export type StartSyncInput = z.infer<typeof StartSyncSchema>;

const EVENT_TYPE_VALUES = Object.values(CRYPTO_EVENT_TYPE) as [
  (typeof CRYPTO_EVENT_TYPE)[keyof typeof CRYPTO_EVENT_TYPE],
  ...(typeof CRYPTO_EVENT_TYPE)[keyof typeof CRYPTO_EVENT_TYPE][],
];

export const ListEventsQuerySchema = z.object({
  type: z.enum(EVENT_TYPE_VALUES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  // Asset/coin code to filter by (alphanumeric, e.g. BTC, USDC). Bounded to
  // keep the LIKE-based symbol match cheap and safe.
  asset: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]+$/)
    .max(20)
    .optional(),
  page: z.coerce.number().int().positive().default(1),
});

export type ListEventsQuery = z.infer<typeof ListEventsQuerySchema>;

const KLINE_INTERVAL_VALUES = Object.values(KLINE_INTERVAL) as [
  (typeof KLINE_INTERVAL)[keyof typeof KLINE_INTERVAL],
  ...(typeof KLINE_INTERVAL)[keyof typeof KLINE_INTERVAL][],
];

export const ListKlinesQuerySchema = z.object({
  // Canonical Binance symbol (e.g. BTCUSDC). Alphanumeric, bounded to keep the
  // upstream request safe.
  symbol: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]+$/)
    .min(1)
    .max(20),
  interval: z.enum(KLINE_INTERVAL_VALUES),
  // Optional time window in epoch milliseconds.
  from: z.coerce.number().int().optional(),
  to: z.coerce.number().int().optional(),
});

export type ListKlinesQuery = z.infer<typeof ListKlinesQuerySchema>;

const EXCHANGE_VALUES = Object.values(CRYPTO_EXCHANGE) as [
  (typeof CRYPTO_EXCHANGE)[keyof typeof CRYPTO_EXCHANGE],
  ...(typeof CRYPTO_EXCHANGE)[keyof typeof CRYPTO_EXCHANGE][],
];

// Optional exchange hint for the CSV upload. When omitted the route falls back
// to auto-detecting the originating exchange from the file header.
export const CsvImportExchangeSchema = z.enum(EXCHANGE_VALUES);

// 10 MB cap on CSV uploads — Binance exports ~1KB per row, so 10MB
// covers ~10k rows which is well above any realistic single-export size.
export const CSV_MAX_BYTES = 10 * 1024 * 1024;

const SYNC_FAILURE_KIND_VALUES = Object.values(CRYPTO_SYNC_FAILURE_KIND) as [
  (typeof CRYPTO_SYNC_FAILURE_KIND)[keyof typeof CRYPTO_SYNC_FAILURE_KIND],
  ...(typeof CRYPTO_SYNC_FAILURE_KIND)[keyof typeof CRYPTO_SYNC_FAILURE_KIND][],
];

const SYNC_PHASE_VALUES = Object.values(CRYPTO_SYNC_PHASE) as [
  (typeof CRYPTO_SYNC_PHASE)[keyof typeof CRYPTO_SYNC_PHASE],
  ...(typeof CRYPTO_SYNC_PHASE)[keyof typeof CRYPTO_SYNC_PHASE][],
];

/** A task of a sync job that failed without stopping it (see classifyTaskFailure). */
export const SyncTaskFailureSchema = z.object({
  eventType: z.enum(EVENT_TYPE_VALUES),
  kind: z.enum(SYNC_FAILURE_KIND_VALUES),
  code: z.string(),
  binanceCode: z.number().optional(),
  symbol: z.string().nullable(),
  message: z.string(),
});

export type SyncTaskFailure = z.infer<typeof SyncTaskFailureSchema>;

/**
 * What the next round of a sync job needs to end exactly as one uninterrupted
 * run would, stored in CryptoSyncJobs.ResumeState. A job created before the
 * column, or by the manual sync route, holds '{}': the defaults describe its
 * first round, already taken.
 */
export const SyncResumeStateSchema = z.object({
  // The round running, or announced by a hand-off and not yet started.
  round: z.number().int().positive().default(1),
  // Whether a worker took `round`. The continue route claims only a false one,
  // which is what keeps a duplicate call from starting a second worker.
  claimed: z.boolean().default(true),
  // Created by the weekly cron, whose jobs run one after another: Binance
  // counts request weight per IP, so the users' syncs must not run at once.
  // The round that ends such a job starts the next one waiting (see
  // startNextQueuedSyncJob). A manual sync is never part of that queue.
  inCronQueue: z.boolean().default(false),
  phase: z.enum(SYNC_PHASE_VALUES).default(CRYPTO_SYNC_PHASE.FETCH),
  // Task keys (see taskKey) that ran, failed or not. A round skips them.
  completedTaskKeys: z.array(z.string()).default([]),
  // Every spot pair the job's discovery listed. Empty until a round finishes
  // discovery; from then on the later rounds build their spot tasks from it
  // instead of discovering again, as one uninterrupted run would.
  spotCandidates: z.array(z.string()).default([]),
  // Failures of the tasks that ran, which decide the job's final status.
  taskFailures: z.array(SyncTaskFailureSchema).default([]),
  // Raw events inserted by every round so far.
  rawEventsIngested: z.number().int().nonnegative().default(0),
  // The cross-source filter's decisions so far (see exportCrossSourceCarryOver).
  crossSource: z
    .object({
      dropped: z.array(z.string()).default([]),
      consumed: z.array(z.string()).default([]),
    })
    .default({}),
  // Normalisation after the last fetch: the count it started from and what it
  // has done. Null until it starts.
  normalize: z
    .object({
      total: z.number().int().nonnegative(),
      processed: z.number().int().nonnegative(),
      inserted: z.number().int().nonnegative(),
    })
    .nullable()
    .default(null),
});

export type SyncResumeState = z.infer<typeof SyncResumeStateSchema>;

/** Body of POST /api/crypto/sync/[jobId]/continue: the round the caller announced. */
export const ContinueSyncSchema = z.object({
  round: z.number().int().positive(),
});
