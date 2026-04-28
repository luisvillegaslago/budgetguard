/**
 * GET /api/crypto/events
 *
 * Paginated list of raw Binance events for the authenticated user. Optional
 * filters: ?type, ?from, ?to, ?page. Page size is fixed at 20 to match the
 * UI table convention (PAGE_SIZE in src/components/skydiving/JumpLogTable).
 */

import { ListEventsQuerySchema } from '@/schemas/crypto';
import { validateRequest } from '@/schemas/transaction';
import { listRawEvents } from '@/services/database/BinanceRawEventsRepository';
import { validationError, withApiHandler } from '@/utils/apiHandler';

const PAGE_SIZE = 20;

export const GET = withApiHandler(async (request) => {
  const url = new URL(request.url);
  const queryObj: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    queryObj[key] = value;
  });

  const validation = validateRequest(ListEventsQuerySchema, queryObj);
  if (!validation.success) return validationError(validation.errors);

  const { type, from, to } = validation.data;
  const page = validation.data.page ?? 1;
  const offset = (page - 1) * PAGE_SIZE;

  const { events, total } = await listRawEvents({
    eventType: type,
    from,
    to,
    limit: PAGE_SIZE,
    offset,
  });

  return {
    data: events,
    meta: { total, page, pageSize: PAGE_SIZE, totalPages: Math.ceil(total / PAGE_SIZE) },
  };
}, 'GET /api/crypto/events');
