/**
 * BudgetGuard Database Connection
 * Uses @neondatabase/serverless for Neon (production) and pg for local PostgreSQL
 */

import { Pool as NeonPool } from '@neondatabase/serverless';
import { Pool as PgPool } from 'pg';
import { DB_POOL } from '@/constants/finance';

type PoolInstance = NeonPool | PgPool;

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  return url;
}

function isNeonUrl(url: string): boolean {
  return url.includes('neon.tech');
}

// ============================================================
// Connection Pool (single instance)
// ============================================================

let pool: PoolInstance | null = null;

export function getPool(): PoolInstance {
  if (!pool) {
    const url = getDatabaseUrl();
    const config = {
      connectionString: url,
      max: DB_POOL.MAX_CONNECTIONS,
      idleTimeoutMillis: DB_POOL.IDLE_TIMEOUT_MS,
    };

    pool = isNeonUrl(url) ? new NeonPool(config) : new PgPool(config);

    pool.on('error', (err: Error) => {
      // biome-ignore lint/suspicious/noConsole: Error logging needed for debugging
      console.error('Database pool error:', err);
      pool = null;
    });
  }
  return pool;
}

/**
 * Execute a parameterized SQL query
 * @param text - SQL with $1, $2, ... positional parameters
 * @param params - Array of parameter values in order
 * @returns Array of rows
 */
export async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const p = getPool();
  const result = await p.query(text, params);
  return result.rows as T[];
}

/**
 * Close the connection pool
 * Call this on application shutdown (for non-serverless environments)
 */
export async function closeConnection(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
