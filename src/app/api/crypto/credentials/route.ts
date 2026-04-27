/**
 * Crypto exchange credentials API.
 *
 * POST   /api/crypto/credentials  → validate + persist (encrypted)
 * DELETE /api/crypto/credentials  → soft-delete (?exchange=binance)
 *
 * The POST handler ALWAYS calls Binance to verify the key is read-only before
 * writing anything to the DB. Keys with withdrawal/trading permissions are
 * rejected with 400 + UNSAFE_PERMISSIONS.
 *
 * Plaintext secrets never leave the request handler; cryptoSecrets.ts encrypts
 * them before they hit the repository.
 */

import { NextResponse } from 'next/server';
import { API_ERROR } from '@/constants/finance';
import { CreateCryptoCredentialSchema } from '@/schemas/crypto';
import { validateRequest } from '@/schemas/transaction';
import {
  deactivateCredential,
  type ExchangeCredentialPublic,
  upsertCredential,
} from '@/services/database/ExchangeCredentialsRepository';
import {
  BinanceClient,
  BinanceClientError,
  type BinanceKeyPermissions,
} from '@/services/exchanges/binance/BinanceClient';
import { conflict, validationError, withApiHandler } from '@/utils/apiHandler';
import { CryptoSecretError } from '@/utils/cryptoSecrets';

export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const validation = validateRequest(CreateCryptoCredentialSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const { exchange, apiKey, apiSecret } = validation.data;

  let permissions: BinanceKeyPermissions;
  try {
    const client = new BinanceClient({ apiKey, apiSecret });
    permissions = await client.validatePermissions();
  } catch (error) {
    if (error instanceof BinanceClientError) {
      // 400 for any user-actionable error (unsafe permissions, bad signature),
      // 503 for transient exchange issues.
      const status = error.code === API_ERROR.CRYPTO.EXCHANGE_UNAVAILABLE ? 503 : 400;
      return NextResponse.json({ success: false, error: error.code }, { status });
    }
    throw error;
  }

  let credential: ExchangeCredentialPublic;
  try {
    credential = await upsertCredential({
      exchange,
      apiKey,
      apiSecret,
      permissions: permissions as unknown as Record<string, unknown>,
    });
  } catch (error) {
    if (error instanceof CryptoSecretError) {
      return NextResponse.json({ success: false, error: error.code }, { status: 500 });
    }
    throw error;
  }

  return { data: toResponse(credential), status: 201 };
}, 'POST /api/crypto/credentials');

export const DELETE = withApiHandler(async (request) => {
  const url = new URL(request.url);
  const exchange = url.searchParams.get('exchange');
  if (!exchange) return validationError({ exchange: ['exchange query param is required'] });

  const validation = validateRequest(CreateCryptoCredentialSchema.pick({ exchange: true }), { exchange });
  if (!validation.success) return validationError(validation.errors);

  const removed = await deactivateCredential(validation.data.exchange);
  if (!removed) return conflict(API_ERROR.NOT_FOUND.CRYPTO_CREDENTIALS);

  return { data: { exchange: validation.data.exchange } };
}, 'DELETE /api/crypto/credentials');

// ============================================================
// Helpers
// ============================================================

function toResponse(credential: ExchangeCredentialPublic) {
  // Public DTO mirrors ExchangeCredentialPublic but is explicit so we don't
  // accidentally leak future internal fields.
  return {
    credentialId: credential.credentialId,
    exchange: credential.exchange,
    apiKeyLast4: credential.apiKeyLast4,
    permissions: credential.permissions,
    lastValidatedAt: credential.lastValidatedAt,
    isActive: credential.isActive,
    createdAt: credential.createdAt,
  };
}
