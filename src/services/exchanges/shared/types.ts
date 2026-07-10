/**
 * Shared types for the multi-exchange CSV import pipeline.
 *
 * Every exchange importer (Binance, Kraken, Coinbase, …) implements
 * `ExchangeCsvImporter`: it sniffs whether an uploaded file belongs to it and,
 * if so, turns the file text into a list of `RawEventInput` ready for
 * `bulkInsertRawEventsForUser` plus a `CsvImportSummary` for the UI.
 */
import type { CryptoExchange } from '@/constants/finance';
import type { RawEventInput } from '@/services/database/CryptoRawEventsRepository';

export type { RawEventInput };

/** Per-import counters surfaced to the user after an upload. */
export interface CsvImportSummary {
  rowsRead: number;
  rowsMapped: number;
  rowsSkipped: number;
  skippedOperations: Record<string, number>;
}

/** Result of running an importer over a file's text. */
export interface CsvImportResult {
  events: RawEventInput[];
  summary: CsvImportSummary;
}

/**
 * Contract every exchange CSV importer fulfils. Register the implementation in
 * `shared/index.ts` so the upload route can auto-detect the exchange.
 */
export interface ExchangeCsvImporter {
  readonly exchange: CryptoExchange;
  /** Sniff whether an uploaded file belongs to this exchange. */
  detect(headerLine: string, filename: string): boolean;
  /** Parse the file text into raw events (each stamped with `source`). */
  import(text: string, filename: string): CsvImportResult;
}
