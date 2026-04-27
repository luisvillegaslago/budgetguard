/**
 * Repository for encrypted exchange API credentials.
 *
 * All queries are user-scoped via getUserIdOrThrow(). Plaintext API keys/secrets
 * never cross this boundary in either direction except via the dedicated
 * `getDecryptedActive` helper, whose return value MUST NOT be persisted, logged,
 * or returned to the client.
 *
 * Each encrypted blob is stored as "<iv>.<authTag>.<cipher>" (all base64) so a
 * single TEXT column carries the ciphertext plus its per-encryption GCM
 * metadata. AES-GCM forbids IV reuse with the same key, and `encryptSecret`
 * generates a fresh IV per call, so the API key and the API secret carry
 * distinct IVs even though they belong to the same row.
 */

import { CRYPTO_EXCHANGE, type CryptoExchange } from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import { decryptSecret, type EncryptedSecret, encryptSecret, maskApiKey } from '@/utils/cryptoSecrets';
import { query } from './connection';

// ============================================================
// Row & domain types
// ============================================================

interface ExchangeCredentialRow {
  CredentialID: number;
  Exchange: string;
  ApiKeyEncrypted: string;
  ApiSecretEncrypted: string;
  EncryptionKeyVersion: string;
  Permissions: Record<string, unknown>;
  ApiKeyLast4: string;
  LastValidatedAt: string | null;
  IsActive: boolean;
  CreatedAt: string;
}

export interface ExchangeCredentialPublic {
  credentialId: number;
  exchange: CryptoExchange;
  apiKeyLast4: string;
  permissions: Record<string, unknown>;
  lastValidatedAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface DecryptedCredentials {
  credentialId: number;
  exchange: CryptoExchange;
  apiKey: string;
  apiSecret: string;
}

export interface UpsertCredentialInput {
  exchange: CryptoExchange;
  apiKey: string;
  apiSecret: string;
  permissions: Record<string, unknown>;
}

// ============================================================
// Packing helpers (single-column ciphertext + metadata)
// ============================================================

function packSecret(input: EncryptedSecret): string {
  return `${input.iv}.${input.authTag}.${input.cipher}`;
}

function unpackSecret(blob: string, keyVersion: EncryptedSecret['keyVersion']): EncryptedSecret {
  const parts = blob.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid packed secret');
  }
  const [iv, authTag, cipher] = parts as [string, string, string];
  return { iv, authTag, cipher, keyVersion };
}

// ============================================================
// Transformer
// ============================================================

function rowToPublic(row: ExchangeCredentialRow): ExchangeCredentialPublic {
  return {
    credentialId: row.CredentialID,
    exchange: row.Exchange as CryptoExchange,
    apiKeyLast4: row.ApiKeyLast4,
    permissions: row.Permissions,
    lastValidatedAt: row.LastValidatedAt,
    isActive: row.IsActive,
    createdAt: row.CreatedAt,
  };
}

// ============================================================
// Queries
// ============================================================

const SELECT_COLUMNS = `"CredentialID", "Exchange", "ApiKeyEncrypted", "ApiSecretEncrypted",
   "EncryptionKeyVersion", "Permissions", "ApiKeyLast4", "LastValidatedAt", "IsActive", "CreatedAt"`;

export async function getActiveCredential(exchange: CryptoExchange): Promise<ExchangeCredentialPublic | null> {
  const userId = await getUserIdOrThrow();
  const rows = await query<ExchangeCredentialRow>(
    `SELECT ${SELECT_COLUMNS} FROM "ExchangeCredentials"
     WHERE "UserID" = $1 AND "Exchange" = $2 AND "IsActive" = TRUE`,
    [userId, exchange],
  );
  return rows[0] ? rowToPublic(rows[0]) : null;
}

/**
 * Returns the plaintext apiKey/apiSecret for the active credential. The caller
 * MUST NOT persist or log the result. Used exclusively to instantiate
 * BinanceClient just-in-time for an outgoing API call.
 */
export async function getDecryptedActive(exchange: CryptoExchange): Promise<DecryptedCredentials | null> {
  const userId = await getUserIdOrThrow();
  const rows = await query<ExchangeCredentialRow>(
    `SELECT ${SELECT_COLUMNS} FROM "ExchangeCredentials"
     WHERE "UserID" = $1 AND "Exchange" = $2 AND "IsActive" = TRUE`,
    [userId, exchange],
  );
  const row = rows[0];
  if (!row) return null;

  const keyVersion = row.EncryptionKeyVersion as EncryptedSecret['keyVersion'];
  const apiKey = decryptSecret(unpackSecret(row.ApiKeyEncrypted, keyVersion));
  const apiSecret = decryptSecret(unpackSecret(row.ApiSecretEncrypted, keyVersion));

  return {
    credentialId: row.CredentialID,
    exchange: row.Exchange as CryptoExchange,
    apiKey,
    apiSecret,
  };
}

// ============================================================
// Mutations
// ============================================================

export async function upsertCredential(input: UpsertCredentialInput): Promise<ExchangeCredentialPublic> {
  const userId = await getUserIdOrThrow();

  const encryptedKey = encryptSecret(input.apiKey);
  const encryptedSecret = encryptSecret(input.apiSecret);

  const rows = await query<ExchangeCredentialRow>(
    `INSERT INTO "ExchangeCredentials" (
        "UserID", "Exchange", "ApiKeyEncrypted", "ApiSecretEncrypted",
        "EncryptionKeyVersion", "Permissions", "ApiKeyLast4",
        "LastValidatedAt", "IsActive"
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, TRUE)
     ON CONFLICT ("UserID", "Exchange") DO UPDATE SET
        "ApiKeyEncrypted" = EXCLUDED."ApiKeyEncrypted",
        "ApiSecretEncrypted" = EXCLUDED."ApiSecretEncrypted",
        "EncryptionKeyVersion" = EXCLUDED."EncryptionKeyVersion",
        "Permissions" = EXCLUDED."Permissions",
        "ApiKeyLast4" = EXCLUDED."ApiKeyLast4",
        "LastValidatedAt" = CURRENT_TIMESTAMP,
        "IsActive" = TRUE
     RETURNING ${SELECT_COLUMNS}`,
    [
      userId,
      input.exchange,
      packSecret(encryptedKey),
      packSecret(encryptedSecret),
      encryptedKey.keyVersion,
      JSON.stringify(input.permissions),
      maskApiKey(input.apiKey),
    ],
  );

  return rowToPublic(rows[0]!);
}

/**
 * Soft-delete: marks the credential inactive but keeps the row for audit.
 * The user can re-add a credential and a new row UPSERTs over this one.
 */
export async function deactivateCredential(exchange: CryptoExchange): Promise<boolean> {
  const userId = await getUserIdOrThrow();
  const rows = await query<{ CredentialID: number }>(
    `UPDATE "ExchangeCredentials" SET "IsActive" = FALSE
     WHERE "UserID" = $1 AND "Exchange" = $2 AND "IsActive" = TRUE
     RETURNING "CredentialID"`,
    [userId, exchange],
  );
  return rows.length > 0;
}

// ============================================================
// Convenience: list active credentials across all exchanges
// (Phase 2 cron iterates this.)
// ============================================================

export async function listActiveCredentialsForUser(userId: number): Promise<ExchangeCredentialPublic[]> {
  const rows = await query<ExchangeCredentialRow>(
    `SELECT ${SELECT_COLUMNS} FROM "ExchangeCredentials"
     WHERE "UserID" = $1 AND "IsActive" = TRUE`,
    [userId],
  );
  return rows.map(rowToPublic);
}

// Re-export for tests/consumers
export { CRYPTO_EXCHANGE };
