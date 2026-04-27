/**
 * GET /api/crypto/credentials/status
 *
 * Returns the connection state for the user's exchange credentials. Never
 * exposes the API secret nor the full API key — only the masked last-4 chars
 * and the cached permissions snapshot.
 *
 * Default exchange (and only one in Phase 1) is "binance" — overridable via
 * ?exchange query param when more exchanges are added later.
 */

import { CRYPTO_EXCHANGE, type CryptoExchange } from '@/constants/finance';
import { getActiveCredential } from '@/services/database/ExchangeCredentialsRepository';
import { withApiHandler } from '@/utils/apiHandler';

const SUPPORTED_EXCHANGES = new Set<CryptoExchange>([CRYPTO_EXCHANGE.BINANCE]);

export const GET = withApiHandler(async (request) => {
  const url = new URL(request.url);
  const requested = url.searchParams.get('exchange') ?? CRYPTO_EXCHANGE.BINANCE;
  const exchange: CryptoExchange = SUPPORTED_EXCHANGES.has(requested as CryptoExchange)
    ? (requested as CryptoExchange)
    : CRYPTO_EXCHANGE.BINANCE;

  const credential = await getActiveCredential(exchange);

  if (!credential) {
    return {
      data: {
        exchange,
        connected: false,
        apiKeyLast4: null,
        permissions: null,
        lastValidatedAt: null,
      },
    };
  }

  return {
    data: {
      exchange: credential.exchange,
      connected: true,
      apiKeyLast4: credential.apiKeyLast4,
      permissions: credential.permissions,
      lastValidatedAt: credential.lastValidatedAt,
    },
  };
}, 'GET /api/crypto/credentials/status');
