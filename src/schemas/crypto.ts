/**
 * Zod schemas for the Crypto module.
 *
 * Phase 1 covers credential creation only. Subsequent phases will add
 * sync request/response and CSV import schemas in this file.
 */

import { z } from 'zod';
import { CRYPTO_EXCHANGE } from '@/constants/finance';

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
