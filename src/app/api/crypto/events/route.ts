/**
 * GET /api/crypto/events
 *
 * Paginated list of Binance movements for the authenticated user. Optional
 * filters: ?type, ?from, ?to, ?asset, ?page. Spot trades are collapsed per
 * order in the repository. Page size is fixed at 20 to match the UI table
 * convention (PAGE_SIZE in src/components/skydiving/JumpLogTable).
 */

import { ListEventsQuerySchema } from '@/schemas/crypto';
import { validateRequest } from '@/schemas/transaction';
import { listRawEvents } from '@/services/database/CryptoRawEventsRepository';
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

  const { type, from, to, asset } = validation.data;
  const page = validation.data.page ?? 1;
  const offset = (page - 1) * PAGE_SIZE;

  const { events, total } = await listRawEvents({
    eventType: type,
    from,
    to,
    asset,
    limit: PAGE_SIZE,
    offset,
  });

  return {
    data: events,
    meta: { total, page, pageSize: PAGE_SIZE, totalPages: Math.ceil(total / PAGE_SIZE) },
  };
}, 'GET /api/crypto/events');
