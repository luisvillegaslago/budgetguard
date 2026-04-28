/**
 * Centralised debug logging for the Binance sync worker.
 *
 * Activated by `CRYPTO_SYNC_DEBUG=1` (or any truthy value) in the environment.
 * When inactive, every helper is a no-op so production stays silent.
 *
 * Server-only — never import from a client component. Logs go to stdout via
 * console.log/.warn/.error and are namespaced with `[crypto-sync]` so they're
 * easy to grep.
 */

const isDebugEnabled = (() => {
  const raw = process.env.CRYPTO_SYNC_DEBUG;
  if (!raw) return false;
  return raw !== '' && raw !== '0' && raw.toLowerCase() !== 'false';
})();

const TAG = '[crypto-sync]';

function log(level: 'info' | 'warn' | 'error', message: string, payload?: Record<string, unknown>): void {
  if (!isDebugEnabled) return;
  // biome-ignore lint/suspicious/noConsole: opt-in debug logger
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (payload && Object.keys(payload).length > 0) {
    fn(`${TAG} ${message}`, payload);
  } else {
    fn(`${TAG} ${message}`);
  }
}

// ============================================================
// Public API
// ============================================================

export const syncDebug = {
  enabled: isDebugEnabled,

  /** Beginning of a sync job. */
  jobStart(jobId: number, mode: string, scope: { from: Date; to: Date }): void {
    log('info', `job ${jobId} START — mode=${mode} scope=${scope.from.toISOString()} → ${scope.to.toISOString()}`);
  },

  /** Discovery sources — counts + first 30 assets of each list. */
  discovery(sources: { allCoins: string[]; dbAssets: string[]; heldAssets: string[]; merged: string[] }): void {
    log('info', 'discovery summary', {
      held: sources.heldAssets.length,
      allCoins: sources.allCoins.length,
      dbAssets: sources.dbAssets.length,
      mergedTotal: sources.merged.length,
    });
    log(
      'info',
      `discovery.held: [${sources.heldAssets.slice(0, 30).join(', ')}${sources.heldAssets.length > 30 ? ', …' : ''}]`,
    );
    log(
      'info',
      `discovery.allCoins: [${sources.allCoins.slice(0, 30).join(', ')}${sources.allCoins.length > 30 ? ', …' : ''}]`,
    );
    log(
      'info',
      `discovery.dbAssets: [${sources.dbAssets.slice(0, 30).join(', ')}${sources.dbAssets.length > 30 ? ', …' : ''}]`,
    );
  },

  /** Per-endpoint task summary — logs all endpoints (including zeroes) so
   * the operator can see the full picture: which endpoints returned data,
   * which were silent, and which failed. */
  endpointSummary(eventType: string, fetchedCount: number, failureCount: number, totalWindows: number): void {
    log(
      failureCount > 0 ? 'warn' : 'info',
      `endpoint=${eventType} fetched=${fetchedCount} failures=${failureCount} windows=${totalWindows}`,
    );
  },

  /** Verbose: a single fetch call returned data. Use sparingly. */
  fetchHit(eventType: string, label: string, count: number): void {
    if (count === 0) return;
    log('info', `fetch ${eventType}/${label} → ${count} events`);
  },

  /** Task failure with full diagnostic detail. */
  taskFailure(
    eventType: string,
    error: { code: string; binanceCode?: number; statusCode?: number; cause?: unknown },
  ): void {
    log('error', `task failed eventType=${eventType}`, {
      code: error.code,
      binanceCode: error.binanceCode,
      statusCode: error.statusCode,
      cause: serialiseCause(error.cause),
    });
  },

  /** End of a sync job. */
  jobEnd(jobId: number, status: string, eventsIngested: number, taskFailures: number): void {
    log('info', `job ${jobId} END — status=${status} ingested=${eventsIngested} taskFailures=${taskFailures}`);
  },
};

// ============================================================
// Helpers
// ============================================================

/**
 * The SDK error objects often have circular references / huge nested objects
 * (axios instances, sockets). Trim them down to the few fields we care about.
 */
function serialiseCause(cause: unknown): unknown {
  if (cause == null) return undefined;
  if (typeof cause !== 'object') return cause;
  const obj = cause as Record<string, unknown>;
  return {
    code: obj.code,
    msg: obj.msg ?? obj.message,
    body: obj.body,
    statusCode: obj.statusCode ?? obj.status,
    url: (obj.config as Record<string, unknown> | undefined)?.url,
  };
}
