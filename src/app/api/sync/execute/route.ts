/**
 * BudgetGuard Backup Execute API
 * POST /api/sync/execute - Execute database backup (primary → backup) with SSE progress streaming
 * Dev-only: Returns 403 in production
 */

import { API_ERROR } from '@/constants/finance';
import { SyncExecuteSchema } from '@/schemas/sync';
import { executeBackup } from '@/services/database/SyncService';
import type { SyncProgressEvent } from '@/types/sync';

/**
 * Build an actionable error message from a (possibly PostgreSQL) error.
 * node-postgres errors expose `table`, `constraint`, `detail` and `code` fields
 * that pinpoint the failing row — without them the client only sees a generic
 * message and the user "has no feedback".
 */
function formatSyncError(error: unknown): string {
  if (!(error instanceof Error)) return 'Unknown error';

  const pg = error as Error & {
    table?: string;
    constraint?: string;
    detail?: string;
    code?: string;
  };

  const parts = [error.message];
  if (pg.table) parts.push(`Tabla: ${pg.table}`);
  if (pg.constraint) parts.push(`Restricción: ${pg.constraint}`);
  if (pg.detail) parts.push(pg.detail);
  if (pg.code) parts.push(`Código: ${pg.code}`);

  return parts.join('\n');
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return new Response(JSON.stringify({ error: API_ERROR.VALIDATION.NOT_AVAILABLE_IN_PROD }), { status: 403 });
  }

  const body: unknown = await request.json();
  const parsed = SyncExecuteSchema.safeParse(body);

  if (!parsed.success) {
    return new Response(JSON.stringify({ success: false, errors: parsed.error.flatten().fieldErrors }), {
      status: 400,
    });
  }

  const { includeDeletes } = parsed.data;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: SyncProgressEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      executeBackup(includeDeletes, send)
        .then((result) => {
          send({ phase: 'done', message: JSON.stringify(result) });
          controller.close();
        })
        .catch((error) => {
          const message = formatSyncError(error);
          // biome-ignore lint/suspicious/noConsole: Error logging for debugging
          console.error('POST /api/sync/execute error:', error);
          send({ phase: 'error', message });
          controller.close();
        });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
