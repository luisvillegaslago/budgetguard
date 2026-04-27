/**
 * Thin wrapper around the `binance` SDK (tiagosiebler).
 *
 * Phase 1 only exposes `validatePermissions()` — used to verify a freshly
 * supplied API key/secret is read-only before persisting it.
 *
 * Phase 2 will extend this class with the WeightTracker, p-limit-controlled
 * concurrency and the 13 sync methods described in the plan.
 */

import { MainClient } from 'binance';
import { API_ERROR } from '@/constants/finance';

export interface BinanceCredentials {
  apiKey: string;
  apiSecret: string;
}

/**
 * Subset of the Binance APIPermissions response we care about for storage
 * and rendering. The SDK type carries more fields we don't use today.
 */
export interface BinanceKeyPermissions {
  ipRestrict: boolean;
  enableReading: boolean;
  enableWithdrawals: boolean;
  enableInternalTransfer: boolean;
  enableMargin: boolean;
  enableFutures: boolean;
  enableSpotAndMarginTrading: boolean;
  enableVanillaOptions: boolean;
  permitsUniversalTransfer: boolean;
  createTime: number;
}

export class BinanceClientError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode?: number,
  ) {
    super(code);
    this.name = 'BinanceClientError';
  }
}

export class BinanceClient {
  private readonly client: MainClient;

  constructor(credentials: BinanceCredentials) {
    this.client = new MainClient({
      api_key: credentials.apiKey,
      api_secret: credentials.apiSecret,
      beautifyResponses: true,
    });
  }

  /**
   * Verify the supplied API key has ONLY read permissions.
   *
   * Throws BinanceClientError(UNSAFE_PERMISSIONS) if any of these are enabled:
   * enableWithdrawals, enableSpotAndMarginTrading, enableFutures, enableMargin.
   *
   * Throws BinanceClientError(INVALID_SIGNATURE) if Binance rejects the key
   * (wrong secret, revoked key, IP whitelist mismatch).
   *
   * Throws BinanceClientError(EXCHANGE_UNAVAILABLE) on network/5xx errors.
   */
  async validatePermissions(): Promise<BinanceKeyPermissions> {
    const permissions = await this.fetchPermissions();

    if (
      permissions.enableWithdrawals ||
      permissions.enableSpotAndMarginTrading ||
      permissions.enableFutures ||
      permissions.enableMargin
    ) {
      throw new BinanceClientError(API_ERROR.CRYPTO.UNSAFE_PERMISSIONS);
    }

    if (!permissions.enableReading) {
      throw new BinanceClientError(API_ERROR.CRYPTO.UNSAFE_PERMISSIONS);
    }

    return permissions;
  }

  private async fetchPermissions(): Promise<BinanceKeyPermissions> {
    try {
      const raw = await this.client.getApiKeyPermissions();
      return {
        ipRestrict: Boolean(raw.ipRestrict),
        enableReading: Boolean(raw.enableReading),
        enableWithdrawals: Boolean(raw.enableWithdrawals),
        enableInternalTransfer: Boolean(raw.enableInternalTransfer),
        enableMargin: Boolean(raw.enableMargin),
        enableFutures: Boolean(raw.enableFutures),
        enableSpotAndMarginTrading: Boolean(raw.enableSpotAndMarginTrading),
        enableVanillaOptions: Boolean(raw.enableVanillaOptions),
        permitsUniversalTransfer: Boolean(raw.permitsUniversalTransfer),
        createTime: Number(raw.createTime ?? 0),
      };
    } catch (error) {
      throw mapBinanceError(error);
    }
  }
}

function mapBinanceError(error: unknown): BinanceClientError {
  const status = extractStatus(error);

  if (status === 401 || status === 403) {
    return new BinanceClientError(API_ERROR.CRYPTO.INVALID_SIGNATURE, status);
  }
  if (status === 429 || status === 418) {
    return new BinanceClientError(API_ERROR.CRYPTO.RATE_LIMITED, status);
  }
  return new BinanceClientError(API_ERROR.CRYPTO.EXCHANGE_UNAVAILABLE, status);
}

function extractStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const candidate =
    (error as { statusCode?: unknown; status?: unknown }).statusCode ?? (error as { status?: unknown }).status;
  return typeof candidate === 'number' ? candidate : undefined;
}
