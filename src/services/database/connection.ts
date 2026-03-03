/**
 * BudgetGuard Database Connection
 * Serverless-safe connection pool for MSSQL
 */

import sql from 'mssql';

const config: sql.config = {
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_NAME || 'BudgetGuard',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || '',
  pool: {
    max: 10, // Maximum connections
    min: 0, // Minimum (0 for serverless - allows complete idle)
    idleTimeoutMillis: 30000, // Close idle connections after 30s
  },
  options: {
    encrypt: true,
    trustServerCertificate: process.env.NODE_ENV === 'development',
  },
};

let pool: sql.ConnectionPool | null = null;
let poolPromise: Promise<sql.ConnectionPool> | null = null;

/**
 * Get a connection pool instance
 * Reuses existing pool if available and connected
 */
export async function getConnection(): Promise<sql.ConnectionPool> {
  // Return existing connected pool
  if (pool?.connected) {
    return pool;
  }

  // Return pending connection if one is in progress
  if (poolPromise) {
    return poolPromise;
  }

  // Create new connection
  poolPromise = sql.connect(config).then((newPool) => {
    pool = newPool;

    // Clean up references on pool close
    pool.on('close', () => {
      pool = null;
      poolPromise = null;
    });

    pool.on('error', (err) => {
      // biome-ignore lint/suspicious/noConsole: Error logging needed for debugging
      console.error('Database pool error:', err);
      pool = null;
      poolPromise = null;
    });

    return newPool;
  });

  return poolPromise;
}

/**
 * Close the connection pool
 * Call this on application shutdown (for non-serverless environments)
 */
export async function closeConnection(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
    poolPromise = null;
  }
}

/**
 * Execute a query with automatic connection management
 * @param query - SQL query string
 * @param params - Query parameters as key-value pairs with optional type definition
 */
export async function executeQuery<T>(query: string, params?: Record<string, unknown>): Promise<sql.IResult<T>> {
  const connection = await getConnection();
  const request = connection.request();

  // Add parameters if provided
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (typeof value === 'object' && value !== null && 'type' in value && 'value' in value) {
        const typedValue = value as { type: sql.ISqlTypeFactoryWithNoParams; value: unknown };
        request.input(key, typedValue.type, typedValue.value);
      } else {
        request.input(key, value);
      }
    });
  }

  return request.query(query);
}
