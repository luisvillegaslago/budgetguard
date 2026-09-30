/**
 * The shared secret that authenticates calls no user session makes: Vercel Cron,
 * and a sync round asking the continue route for the next one. Both sides read
 * the same CRON_SECRET, so the routes that accept it and the code that sends it
 * cannot drift apart. The routes answer through verifyCronSecret (apiHandler).
 */
import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';

/** `Bearer <secret>`, or null when the server has no secret configured. */
export function cronAuthorization(): string | null {
  const secret = process.env.CRON_SECRET;
  return secret ? `Bearer ${secret}` : null;
}

/**
 * Whether an Authorization header is exactly `expected`, compared in constant
 * time so the time a refusal takes says nothing about how much of the secret a
 * guess got right. timingSafeEqual throws on buffers of different lengths, and
 * a different length is already a mismatch.
 */
export function carriesCronSecret(authorizationHeader: string | null, expected: string): boolean {
  const receivedBytes = Buffer.from(authorizationHeader ?? '');
  const expectedBytes = Buffer.from(expected);
  return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes);
}
