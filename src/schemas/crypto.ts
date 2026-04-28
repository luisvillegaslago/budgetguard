/**
 * Zod schemas for the Crypto module.
 *
 * Phase 1 covers credential creation only. Subsequent phases will add
 * sync request/response and CSV import schemas in this file.
 */

import { z } from 'zod';
import { CRYPTO_EVENT_TYPE, CRYPTO_EXCHANGE, CRYPTO_SYNC_MODE } from '@/constants/finance';

// Binance API key format: 64 alphanumeric characters.
// Binance API secret format: 64 alphanumeric characters.
// We are tolerant on length (50–80) so SDK changes don't lock us out, but we
// still reject obvious garbage and any whitespace.
const BINANCE_KEY_PATTERN = /^[A-Za-z0-9]+$/;

export const CreateCryptoCredentialSchema = z.object({
  exchange: z.enum([CRYPTO_EXCHANGE.BINANCE]),
  apiKey: z.string().trim().min(50).max(80).regex(BINANCE_KEY_PATTERN),
  apiSecret: z.string().trim().min(50).max(80).regex(BINANCE_KEY_PATTERN),
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
  page: z.coerce.number().int().positive().default(1),
});

export type ListEventsQuery = z.infer<typeof ListEventsQuerySchema>;

// 10 MB cap on CSV uploads — Binance exports ~1KB per row, so 10MB
// covers ~10k rows which is well above any realistic single-export size.
export const CSV_MAX_BYTES = 10 * 1024 * 1024;
