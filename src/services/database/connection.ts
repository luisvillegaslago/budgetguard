/**
 * BudgetGuard Database Connection
 * Serverless-safe PostgreSQL connection using @neondatabase/serverless
 * Works with both local PostgreSQL and Neon in production
 */

import { Pool } from '@neondatabase/serverless';

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  return url;
}

// ============================================================
// Connection Pool (single instance, serverless-safe)
// ============================================================

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getDatabaseUrl(),
      max: 10,
      idleTimeoutMillis: 30000,
    });

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
