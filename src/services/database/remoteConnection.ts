/**
 * BudgetGuard Backup Database Connection
 * Connects to the backup PostgreSQL for backup operations.
 * Only available in development mode.
 */

import { Pool as NeonPool } from '@neondatabase/serverless';
import { Pool as PgPool } from 'pg';
import { DB_POOL } from '@/constants/finance';

type PoolInstance = NeonPool | PgPool;

function getBackupDatabaseUrl(): string {
  const url = process.env.BACKUP_DATABASE_URL;
  if (!url) {
    throw new Error('BACKUP_DATABASE_URL environment variable is not set');
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

let backupPool: PoolInstance | null = null;

export function getBackupPool(): PoolInstance {
  if (!backupPool) {
    const url = getBackupDatabaseUrl();
    const config = {
      connectionString: url,
      max: DB_POOL.MAX_CONNECTIONS_BACKUP,
      idleTimeoutMillis: DB_POOL.IDLE_TIMEOUT_MS,
      // Neon pooler does not support search_path in startup params — only set for unpooled
      ...(isNeonUrl(url) && !isNeonPoolerUrl(url) && { options: '-c search_path=public' }),
    };

    backupPool = isNeonUrl(url) ? new NeonPool(config) : new PgPool(config);

    backupPool.on('error', (err: Error) => {
      // biome-ignore lint/suspicious/noConsole: Error logging needed for debugging
      console.error('Backup database pool error:', err);
      backupPool = null;
    });
  }
  return backupPool;
}

/**
 * Execute a parameterized SQL query on the backup database
 */
export async function backupQuery<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const p = getBackupPool();
  const result = await p.query(text, params);
  return result.rows as T[];
}

/**
 * Close the backup connection pool
 */
export async function closeBackupConnection(): Promise<void> {
  if (backupPool) {
    await backupPool.end();
    backupPool = null;
  }
}
