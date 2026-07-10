/**
 * Registry of exchange CSV importers.
 *
 * To add a new exchange: implement `ExchangeCsvImporter` in its own module and
 * append the instance to `IMPORTERS` below. The upload route resolves an
 * importer either by explicit exchange (`getImporterFor`) or by sniffing the
 * file content (`detectImporter`). No other wiring is required.
 */
import type { CryptoExchange } from '@/constants/finance';
import { binanceCsvImporter } from '@/services/exchanges/binance/CsvImporter';
import { coinbaseCsvImporter } from '@/services/exchanges/coinbase/CsvImporter';
import { krakenCsvImporter } from '@/services/exchanges/kraken/CsvImporter';
import type { ExchangeCsvImporter } from '@/services/exchanges/shared/types';

// Order matters for detection: the first importer whose `detect()` returns true
// wins. Keep more specific header signatures before broader ones. Binance,
// Kraken and Coinbase use disjoint header signatures, so their relative order is
// not sensitive — Coinbase is last because its `detect()` is the broadest
// (it also matches on a /coinbase/i filename for preamble-prefixed exports).
const IMPORTERS: readonly ExchangeCsvImporter[] = [binanceCsvImporter, krakenCsvImporter, coinbaseCsvImporter];

/** Look up an importer by its exchange identifier, or null if unregistered. */
export function getImporterFor(exchange: CryptoExchange): ExchangeCsvImporter | null {
  return IMPORTERS.find((importer) => importer.exchange === exchange) ?? null;
}

/**
 * Auto-detect which registered importer owns an uploaded file. Returns null
 * when no importer recognises the header — the caller should treat that as an
 * unsupported / malformed file.
 */
export function detectImporter(text: string, filename: string): ExchangeCsvImporter | null {
  const headerLine = firstNonEmptyLine(text);
  return IMPORTERS.find((importer) => importer.detect(headerLine, filename)) ?? null;
}

/** First non-empty line of a file, with a leading UTF-8 BOM stripped. */
function firstNonEmptyLine(text: string): string {
  const sanitized = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = sanitized.split(/\r?\n/);
  return lines.find((line) => line.trim().length > 0) ?? '';
}
