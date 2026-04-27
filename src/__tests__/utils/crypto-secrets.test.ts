/**
 * Unit Tests: cryptoSecrets (AES-256-GCM)
 * - Round-trip encrypt/decrypt
 * - Tamper-detect on cipher, IV and authTag (GCM authentication failure)
 * - Master key absent / wrong length → CryptoSecretError
 * - Distinct IVs across two encryptions of the same plaintext
 */

import { randomBytes } from 'node:crypto';
import { API_ERROR } from '@/constants/finance';
import { CryptoSecretError, decryptSecret, encryptSecret, maskApiKey } from '@/utils/cryptoSecrets';

const ORIGINAL_KEY = process.env.CRYPTO_MASTER_KEY;

function setMasterKey(): void {
  process.env.CRYPTO_MASTER_KEY = randomBytes(32).toString('base64');
  // Reset cached key inside cryptoSecrets module by reloading it. Since we
  // can't easily re-import inside a single test file, we accept that the
  // cached key persists across tests within this file — all using the same
  // master key. Tests that need a different key reload via jest.resetModules.
}

describe('cryptoSecrets', () => {
  beforeAll(() => {
    setMasterKey();
  });

  afterAll(() => {
    if (ORIGINAL_KEY === undefined) {
      delete process.env.CRYPTO_MASTER_KEY;
    } else {
      process.env.CRYPTO_MASTER_KEY = ORIGINAL_KEY;
    }
  });

  describe('round-trip', () => {
    it('encrypts and decrypts back to the original UTF-8 plaintext', () => {
      const plaintext = 'sk-binance-1234567890abcdefghijklmnopqrstuv';
      const encrypted = encryptSecret(plaintext);
      expect(decryptSecret(encrypted)).toBe(plaintext);
    });

    it('handles unicode and long secrets', () => {
      const plaintext = '€_Ω_秘密_'.repeat(200);
      const encrypted = encryptSecret(plaintext);
      expect(decryptSecret(encrypted)).toBe(plaintext);
    });

    it('uses a fresh IV per encryption (no IV reuse with same key)', () => {
      const a = encryptSecret('the same secret');
      const b = encryptSecret('the same secret');
      expect(a.iv).not.toBe(b.iv);
      expect(a.cipher).not.toBe(b.cipher);
      expect(a.authTag).not.toBe(b.authTag);
    });

    it('emits a known key version', () => {
      expect(encryptSecret('x').keyVersion).toBe('v1');
    });
  });

  describe('tamper-detection', () => {
    it('throws when authTag is mutated', () => {
      const encrypted = encryptSecret('the secret');
      const tampered = { ...encrypted, authTag: flipFirstByte(encrypted.authTag) };
      expect(() => decryptSecret(tampered)).toThrow(CryptoSecretError);
    });

    it('throws when ciphertext is mutated', () => {
      const encrypted = encryptSecret('the secret');
      const tampered = { ...encrypted, cipher: flipFirstByte(encrypted.cipher) };
      expect(() => decryptSecret(tampered)).toThrow(CryptoSecretError);
    });

    it('throws when IV is mutated', () => {
      const encrypted = encryptSecret('the secret');
      const tampered = { ...encrypted, iv: flipFirstByte(encrypted.iv) };
      expect(() => decryptSecret(tampered)).toThrow(CryptoSecretError);
    });

    it('throws when key version is unknown', () => {
      const encrypted = encryptSecret('the secret');
      const wrongVersion = { ...encrypted, keyVersion: 'v999' as 'v1' };
      expect(() => decryptSecret(wrongVersion)).toThrow(CryptoSecretError);
    });
  });
});

describe('cryptoSecrets — master key validation', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) {
      delete process.env.CRYPTO_MASTER_KEY;
    } else {
      process.env.CRYPTO_MASTER_KEY = ORIGINAL_KEY;
    }
  });

  it('throws MASTER_KEY_MISSING when env var is absent', async () => {
    delete process.env.CRYPTO_MASTER_KEY;
    const { encryptSecret: encryptFresh, CryptoSecretError: CryptoSecretErrorFresh } = await import(
      '@/utils/cryptoSecrets'
    );
    expect(() => encryptFresh('x')).toThrow(CryptoSecretErrorFresh);
    try {
      encryptFresh('x');
    } catch (err) {
      expect((err as Error).message).toBe(API_ERROR.CRYPTO.MASTER_KEY_MISSING);
    }
  });

  it('throws MASTER_KEY_MISSING when env var is the wrong length', async () => {
    process.env.CRYPTO_MASTER_KEY = Buffer.from('too-short').toString('base64');
    const { encryptSecret: encryptFresh, CryptoSecretError: CryptoSecretErrorFresh } = await import(
      '@/utils/cryptoSecrets'
    );
    expect(() => encryptFresh('x')).toThrow(CryptoSecretErrorFresh);
  });
});

describe('maskApiKey', () => {
  it('returns last 4 characters', () => {
    expect(maskApiKey('abcdefghijklmnop')).toBe('mnop');
  });
  it('returns the whole string if shorter than 4', () => {
    expect(maskApiKey('xy')).toBe('xy');
  });
});

// ============================================================
// Helpers
// ============================================================

function flipFirstByte(base64: string): string {
  const buf = Buffer.from(base64, 'base64');
  buf[0] = (buf[0] ?? 0) ^ 0xff;
  return buf.toString('base64');
}
