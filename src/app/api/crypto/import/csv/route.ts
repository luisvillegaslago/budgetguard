/**
 * POST /api/crypto/import/csv
 *
 * Multipart upload of an exchange transaction-history CSV (Binance, Kraken and
 * Coinbase via the shared importer registry). The originating exchange comes
 * from an optional `exchange` form field; when omitted it is auto-detected from
 * the file header. The file is parsed in-memory (no Vercel Blob storage — raw
 * rows are persisted into CryptoRawEvents instead, which is the source of truth).
 *
 * Idempotent: re-uploading the same file inserts 0 duplicates thanks to the
 * UNIQUE(UserID, EventType, ExternalID) constraint and the per-row hash.
 *
 * Returns 202 with the synthetic job id as soon as the raw rows are
 * persisted. Normalization (which fetches EUR prices and can take minutes
 * for a large backfill) runs in background via `after()` and updates the
 * job progress as it goes — same UX pattern as POST /api/crypto/sync.
 */

import { after, NextResponse } from 'next/server';
import { API_ERROR, CRYPTO_CSV_IMPORT_PROGRESS_KEY } from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import { CSV_MAX_BYTES, CsvImportExchangeSchema } from '@/schemas/crypto';
import { bulkInsertRawEventsForUser, filterCrossSourceDuplicates } from '@/services/database/CryptoRawEventsRepository';
import {
  createSyncJob,
  findActiveJob,
  markJobCompleted,
  markJobFailed,
  markJobRunning,
  updateJobProgress,
} from '@/services/database/CryptoSyncJobsRepository';
import { CsvParseError } from '@/services/exchanges/binance/CsvImporter';
import { normalizeForUser } from '@/services/exchanges/binance/NormalizationService';
import { detectImporter, getImporterFor } from '@/services/exchanges/shared';
import type { CsvImportResult, ExchangeCsvImporter } from '@/services/exchanges/shared/types';
import { conflict, validationError, withApiHandler } from '@/utils/apiHandler';

export const POST = withApiHandler(async (request) => {
  const userId = await getUserIdOrThrow();
  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) return validationError({ file: [API_ERROR.CRYPTO.CSV_FILE_REQUIRED] });
  if (file.size > CSV_MAX_BYTES) return validationError({ file: [API_ERROR.CRYPTO.CSV_TOO_LARGE] });

  const text = await file.text();

  // Resolve the importer either from an explicit `exchange` form field (the UI
  // sends the user's selection) or, when absent, by auto-detecting from the file
  // header. Each importer handles its own timezone/format quirks (e.g. Binance
  // bakes the user's TZ into the filename) inside import().
  const exchangeField = formData.get('exchange');
  let importer: ExchangeCsvImporter | null;
  if (typeof exchangeField === 'string' && exchangeField.length > 0) {
    const parsedExchange = CsvImportExchangeSchema.safeParse(exchangeField);
    if (!parsedExchange.success) {
      return validationError({ exchange: [API_ERROR.CRYPTO.CSV_UNSUPPORTED_EXCHANGE] });
    }
    importer = getImporterFor(parsedExchange.data);
  } else {
    importer = detectImporter(text, file.name);
  }
  if (!importer) return validationError({ file: [API_ERROR.CRYPTO.CSV_UNRECOGNIZED] });

  // An API sync loads its duplicate index once, when it starts: rows this upload
  // inserts meanwhile are invisible to it, and its rows to this upload's check,
  // so the same operation could be stored from both sources.
  const active = await findActiveJob(importer.exchange);
  if (active) return conflict(API_ERROR.CRYPTO.SYNC_ALREADY_RUNNING, { jobId: active.jobId });

  let mapResult: CsvImportResult;
  try {
    mapResult = importer.import(text, file.name);
  } catch (error) {
    if (error instanceof CsvParseError) {
      return validationError({ file: [API_ERROR.CRYPTO.CSV_INVALID_FORMAT] });
    }
    throw error;
  }

  // Scope window from the imported events (raw payloads are unsorted, so take
  // the min/max OccurredAt). Falls back to "now" for an empty import.
  const occurredTimes = mapResult.events.map((event) => event.occurredAt.getTime());
  const scopeFrom = occurredTimes.length > 0 ? new Date(Math.min(...occurredTimes)) : new Date();
  const scopeTo = occurredTimes.length > 0 ? new Date(Math.max(...occurredTimes)) : new Date();

  // Wrap the import in a synthetic sync job so the user sees it in the
  // history alongside API-driven syncs.
  const job = await createSyncJob({
    exchange: importer.exchange,
    mode: 'full',
    scopeFrom,
    scopeTo,
  });
  await markJobRunning(job.jobId);

  // Until the job leaves "running" every other upload and API sync of this
  // exchange answers 409, so a failure here must close it before it propagates.
  let inserted = 0;
  let keptCount = 0;
  let crossSourceSkipped = 0;
  try {
    // Drop rows whose operation already exists from a different source (e.g. the
    // API sync already covered this period) — they carry a different ExternalID
    // so the UNIQUE constraint wouldn't catch them, and would double-count.
    const filtered = await filterCrossSourceDuplicates(userId, mapResult.events);
    crossSourceSkipped = filtered.skipped;
    keptCount = filtered.kept.length;

    // Insert raw rows synchronously — this is fast (a few hundred ms even
    // for 10k rows) so the user gets the count back in the response.
    // The repository chunks below the bind-parameter limit, one chunk at a time.
    inserted = filtered.kept.length > 0 ? await bulkInsertRawEventsForUser(userId, filtered.kept, job.jobId) : 0;

    // Stamp progress now so the UI can show "X rows ingested, normalizing…"
    // immediately. The completedWindows stays at 0 (of 2) until normalize
    // finishes — see sync orchestrator for the same pattern.
    await updateJobProgress(
      job.jobId,
      {
        [CRYPTO_CSV_IMPORT_PROGRESS_KEY]: {
          fetched: mapResult.summary.rowsRead,
          totalWindows: 2,
          completedWindows: 1,
          lastWindowEnd: new Date().toISOString(),
        },
      },
      inserted,
    );
  } catch (error) {
    await markJobFailed(
      job.jobId,
      API_ERROR.CRYPTO.SYNC_FAILED,
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }

  // Hand off normalization to the background. Doing it here would block
  // the response for minutes on a large backfill (4-10k rows × price
  // lookups → easily past Vercel's function timeout).
  after(async () => {
    try {
      const normalizeResult = await normalizeForUser(userId);
      await updateJobProgress(
        job.jobId,
        {
          [CRYPTO_CSV_IMPORT_PROGRESS_KEY]: {
            fetched: mapResult.summary.rowsRead,
            totalWindows: 2,
            completedWindows: 2,
            lastWindowEnd: new Date().toISOString(),
          },
          normalize: {
            fetched: normalizeResult.inserted,
            totalWindows: 1,
            completedWindows: 1,
            lastWindowEnd: new Date().toISOString(),
          },
        },
        inserted,
      );
      await markJobCompleted(job.jobId);
    } catch (error) {
      await markJobFailed(job.jobId, 'normalize-failed', error instanceof Error ? error.message : String(error));
      // biome-ignore lint/suspicious/noConsole: background worker error logging
      console.error(`CSV import job ${job.jobId} normalize failed:`, error);
    }
  });

  return NextResponse.json(
    {
      success: true,
      data: {
        jobId: job.jobId,
        rowsRead: mapResult.summary.rowsRead,
        rowsMapped: mapResult.summary.rowsMapped,
        rowsSkipped: mapResult.summary.rowsSkipped,
        skippedOperations: mapResult.summary.skippedOperations,
        eventsInserted: inserted,
        eventsDuplicate: keptCount - inserted,
        eventsCrossSourceSkipped: crossSourceSkipped,
        // The taxable count is filled by the background normalize — clients
        // poll GET /api/crypto/sync/:jobId for the final state.
        normalizing: true,
      },
    },
    { status: 202 },
  );
}, 'POST /api/crypto/import/csv');
