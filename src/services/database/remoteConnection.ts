/**
 * BudgetGuard Remote Database Connection
 * Connects to the remote Neon PostgreSQL for sync operations.
 * Only available in development mode.
 */

import { Pool as NeonPool } from '@neondatabase/serverless';
import { Pool as PgPool } from 'pg';

type PoolInstance = NeonPool | PgPool;

function getRemoteDatabaseUrl(): string {
  const url = process.env.REMOTE_DATABASE_URL;
  if (!url) {
    throw new Error('REMOTE_DATABASE_URL environment variable is not set');
  }
  return url;
}

function isNeonUrl(url: string): boolean {
  return url.includes('neon.tech');
}

function isNeonPoolerUrl(url: string): boolean {
  return url.includes('-pooler.');
}

// ============================================================
// Remote Connection Pool (single instance)
// ============================================================

let remotePool: PoolInstance | null = null;

export function getRemotePool(): PoolInstance {
  if (!remotePool) {
    const url = getRemoteDatabaseUrl();
    const config = {
      connectionString: url,
      max: 5,
      idleTimeoutMillis: 30000,
      // Neon pooler does not support search_path in startup params — only set for unpooled
      ...(isNeonUrl(url) && !isNeonPoolerUrl(url) && { options: '-c search_path=public' }),
    };

    remotePool = isNeonUrl(url) ? new NeonPool(config) : new PgPool(config);

    remotePool.on('error', (err: Error) => {
      // biome-ignore lint/suspicious/noConsole: Error logging needed for debugging
      console.error('Remote database pool error:', err);
      remotePool = null;
    });
  }
  return remotePool;
}

/**
 * Execute a parameterized SQL query on the remote database
 */
export async function remoteQuery<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const p = getRemotePool();
  const result = await p.query(text, params);
  return result.rows as T[];
}

/**
 * Close the remote connection pool
 */
export async function closeRemoteConnection(): Promise<void> {
  if (remotePool) {
    await remotePool.end();
    remotePool = null;
  }
}
