/**
 * Encryption utility for exchange API credentials.
 *
 * Uses AES-256-GCM (authenticated encryption) with a master key supplied via the
 * CRYPTO_MASTER_KEY environment variable (32 raw bytes, base64-encoded → 44 chars).
 *
 * Key versioning is built in from day one (`v1`) so the master key can be rotated
 * later without forcing users to re-enter their API credentials.
 *
 * The encrypted secret, IV and auth tag are stored separately in the database;
 * passing them back to `decryptSecret` reconstructs the plaintext or throws if
 * any byte has been tampered with (GCM authentication failure).
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { API_ERROR } from '@/constants/finance';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 12; // GCM-recommended IV length
const AUTH_TAG_LENGTH_BYTES = 16;
const CURRENT_KEY_VERSION = 'v1' as const;

export type EncryptionKeyVersion = typeof CURRENT_KEY_VERSION;

export interface EncryptedSecret {
  cipher: string; // base64
  iv: string; // base64
  authTag: string; // base64
  keyVersion: EncryptionKeyVersion;
}

export class CryptoSecretError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'CryptoSecretError';
  }
}

let cachedKey: Buffer | null = null;

function getMasterKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.CRYPTO_MASTER_KEY;
  if (!raw) {
    throw new CryptoSecretError(API_ERROR.CRYPTO.MASTER_KEY_MISSING);
  }

  const decoded = Buffer.from(raw, 'base64');
  if (decoded.length !== KEY_LENGTH_BYTES) {
    throw new CryptoSecretError(API_ERROR.CRYPTO.MASTER_KEY_MISSING);
  }

  cachedKey = decoded;
  return cachedKey;
}

/**
 * Encrypt a UTF-8 string secret. Returns the cipher, IV and auth tag as
 * separate base64 strings so they can be persisted in distinct columns.
 */
export function encryptSecret(plaintext: string): EncryptedSecret {
  const key = getMasterKey();
  const iv = randomBytes(IV_LENGTH_BYTES);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    cipher: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    keyVersion: CURRENT_KEY_VERSION,
  };
}

/**
 * Decrypt a previously encrypted secret. Throws CryptoSecretError if the
 * inputs have been tampered with (GCM auth tag mismatch) or if the key
 * version is unknown.
 */
export function decryptSecret(input: EncryptedSecret): string {
  if (input.keyVersion !== CURRENT_KEY_VERSION) {
    throw new CryptoSecretError(API_ERROR.CRYPTO.DECRYPT_FAILED);
  }

  const key = getMasterKey();
  const iv = Buffer.from(input.iv, 'base64');
  const ciphertext = Buffer.from(input.cipher, 'base64');
  const authTag = Buffer.from(input.authTag, 'base64');

  if (iv.length !== IV_LENGTH_BYTES || authTag.length !== AUTH_TAG_LENGTH_BYTES) {
    throw new CryptoSecretError(API_ERROR.CRYPTO.DECRYPT_FAILED);
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  try {
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch {
    throw new CryptoSecretError(API_ERROR.CRYPTO.DECRYPT_FAILED);
  }
}

/**
 * Returns the last 4 characters of a Binance API key, used as a non-sensitive
 * identifier for "Connected as ****abcd" UI labels.
 */
export function maskApiKey(apiKey: string): string {
  return apiKey.slice(-4);
}

export const __TESTING__ = {
  KEY_LENGTH_BYTES,
  IV_LENGTH_BYTES,
  AUTH_TAG_LENGTH_BYTES,
  CURRENT_KEY_VERSION,
};
