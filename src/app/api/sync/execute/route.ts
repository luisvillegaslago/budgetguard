/**
 * BudgetGuard Sync Execute API
 * POST /api/sync/execute - Execute database sync with SSE progress streaming
 * Dev-only: Returns 403 in production
 */

import { API_ERROR } from '@/constants/finance';
import { SyncExecuteSchema } from '@/schemas/sync';
import { executeSync } from '@/services/database/SyncService';
import type { SyncProgressEvent } from '@/types/sync';

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

  const { direction, includeDeletes } = parsed.data;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: SyncProgressEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      executeSync(direction, includeDeletes, send)
        .then((result) => {
          send({ phase: 'done', message: JSON.stringify(result) });
          controller.close();
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : 'Unknown error';
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
