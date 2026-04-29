/**
 * POST /api/crypto/import/csv
 *
 * Multipart upload of a Binance "Export Transaction History" CSV. The file
 * is parsed in-memory (no Vercel Blob storage — raw rows are persisted into
 * BinanceRawEvents instead, which is the source of truth).
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
import { API_ERROR } from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import { CSV_MAX_BYTES } from '@/schemas/crypto';
import { bulkInsertRawEventsForUser, type RawEventInput } from '@/services/database/BinanceRawEventsRepository';
import {
  createSyncJob,
  markJobCompleted,
  markJobFailed,
  markJobRunning,
  updateJobProgress,
} from '@/services/database/CryptoSyncJobsRepository';
import {
  type BinanceCsvRow,
  type CsvImportSummary,
  CsvParseError,
  detectOffsetFromFilename,
  mapRowsToRawEvents,
  parseCsv,
  rowsToBinanceCsvRows,
} from '@/services/exchanges/binance/CsvImporter';
import { normalizeForUser } from '@/services/exchanges/binance/NormalizationService';
import { validationError, withApiHandler } from '@/utils/apiHandler';

export const POST = withApiHandler(async (request) => {
  const userId = await getUserIdOrThrow();
  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) return validationError({ file: [API_ERROR.CRYPTO.CSV_FILE_REQUIRED] });
  if (file.size > CSV_MAX_BYTES) return validationError({ file: [API_ERROR.CRYPTO.CSV_TOO_LARGE] });

  const text = await file.text();

  // Binance bakes the user's TZ into the export filename — sniff the
  // offset so we can shift the timestamps back to UTC before storing.
  const tzOffsetMinutes = detectOffsetFromFilename(file.name);

  let csvRows: BinanceCsvRow[];
  let mapResult: { events: RawEventInput[]; summary: CsvImportSummary };
  try {
    const rawRows = parseCsv(text);
    csvRows = rowsToBinanceCsvRows(rawRows, tzOffsetMinutes);
    mapResult = mapRowsToRawEvents(csvRows);
  } catch (error) {
    if (error instanceof CsvParseError) {
      return validationError({ file: [API_ERROR.CRYPTO.CSV_INVALID_FORMAT] });
    }
    throw error;
  }

  // Wrap the import in a synthetic sync job so the user sees it in the
  // history alongside API-driven syncs.
  const job = await createSyncJob({
    exchange: 'binance',
    mode: 'full',
    scopeFrom: csvRows[0]?.utcTime ?? new Date(),
    scopeTo: csvRows[csvRows.length - 1]?.utcTime ?? new Date(),
  });
  await markJobRunning(job.jobId);

  // Insert raw rows synchronously — this is fast (a few hundred ms even
  // for 10k rows) so the user gets the count back in the response.
  let inserted = 0;
  if (mapResult.events.length > 0) {
    const CHUNK_SIZE = 500;
    const chunkCount = Math.ceil(mapResult.events.length / CHUNK_SIZE);
    const chunkInserts = await Promise.all(
      Array.from({ length: chunkCount }, (_, i) => {
        const chunk = mapResult.events.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        return bulkInsertRawEventsForUser(userId, chunk, job.jobId);
      }),
    );
    inserted = chunkInserts.reduce((acc, n) => acc + n, 0);
  }

  // Stamp progress now so the UI can show "X rows ingested, normalizing…"
  // immediately. The completedWindows stays at 0 (of 2) until normalize
  // finishes — see sync orchestrator for the same pattern.
  await updateJobProgress(
    job.jobId,
    {
      'csv-import': {
        fetched: mapResult.summary.rowsRead,
        totalWindows: 2,
        completedWindows: 1,
        lastWindowEnd: new Date().toISOString(),
      },
    },
    inserted,
  );

  // Hand off normalization to the background. Doing it here would block
  // the response for minutes on a large backfill (4-10k rows × price
  // lookups → easily past Vercel's function timeout).
  after(async () => {
    try {
      const normalizeResult = await normalizeForUser(userId);
      await updateJobProgress(
        job.jobId,
        {
          'csv-import': {
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
        eventsDuplicate: mapResult.events.length - inserted,
        // The taxable count is filled by the background normalize — clients
        // poll GET /api/crypto/sync/:jobId for the final state.
        normalizing: true,
      },
    },
    { status: 202 },
  );
}, 'POST /api/crypto/import/csv');
