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
 * After ingestion we kick the normalize pipeline so the imported rows show
 * up in /crypto/movimientos and the fiscal calculations immediately.
 */

import { API_ERROR } from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import { CSV_MAX_BYTES } from '@/schemas/crypto';
import { bulkInsertRawEventsForUser, type RawEventInput } from '@/services/database/BinanceRawEventsRepository';
import { createSyncJob, markJobCompleted, updateJobProgress } from '@/services/database/CryptoSyncJobsRepository';
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
  // history alongside API-driven syncs. Using mode='full' since the CSV
  // can carry events from any historical range.
  const job = await createSyncJob({
    exchange: 'binance',
    mode: 'full',
    scopeFrom: csvRows[0]?.utcTime ?? new Date(),
    scopeTo: csvRows[csvRows.length - 1]?.utcTime ?? new Date(),
  });

  let inserted = 0;
  if (mapResult.events.length > 0) {
    // Batch into 500-row chunks to stay under PostgreSQL's parameter limit.
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

  // Kick normalization so the imports show up in TaxableEvents immediately.
  // Run inline so the response can report the final counts.
  const normalizeResult = await normalizeForUser(userId);

  await updateJobProgress(
    job.jobId,
    {
      'csv-import': {
        fetched: mapResult.summary.rowsRead,
        totalWindows: 1,
        completedWindows: 1,
        lastWindowEnd: new Date().toISOString(),
      },
    },
    inserted,
  );
  await markJobCompleted(job.jobId);

  return {
    data: {
      jobId: job.jobId,
      rowsRead: mapResult.summary.rowsRead,
      rowsMapped: mapResult.summary.rowsMapped,
      rowsSkipped: mapResult.summary.rowsSkipped,
      skippedOperations: mapResult.summary.skippedOperations,
      eventsInserted: inserted,
      eventsDuplicate: mapResult.events.length - inserted,
      taxableEventsCreated: normalizeResult.inserted,
    },
    status: 201,
  };
}, 'POST /api/crypto/import/csv');
