/**
 * GET /api/crypto/taxable-events
 *
 * Paginated list of normalised taxable events. Mirrors /api/crypto/events
 * (raw) but for the post-normalisation view: includes EUR price, kind,
 * contraprestación, etc.
 *
 * Filters: ?kind, ?from, ?to, ?page (PAGE_SIZE = 20)
 */

import { z } from 'zod';
import { CRYPTO_TAXABLE_KIND } from '@/constants/finance';
import { validateRequest } from '@/schemas/transaction';
import { listTaxableEvents } from '@/services/database/TaxableEventsRepository';
import { validationError, withApiHandler } from '@/utils/apiHandler';

const PAGE_SIZE = 20;

const TAXABLE_KIND_VALUES = Object.values(CRYPTO_TAXABLE_KIND) as [
  (typeof CRYPTO_TAXABLE_KIND)[keyof typeof CRYPTO_TAXABLE_KIND],
  ...(typeof CRYPTO_TAXABLE_KIND)[keyof typeof CRYPTO_TAXABLE_KIND][],
];

const QuerySchema = z.object({
  kind: z.enum(TAXABLE_KIND_VALUES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
});

export const GET = withApiHandler(async (request) => {
  const url = new URL(request.url);
  const queryObj: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    queryObj[key] = value;
  });

  const validation = validateRequest(QuerySchema, queryObj);
  if (!validation.success) return validationError(validation.errors);

  const { kind, from, to } = validation.data;
  const page = validation.data.page ?? 1;
  const offset = (page - 1) * PAGE_SIZE;

  const { events, total } = await listTaxableEvents({
    kind,
    from,
    to,
    limit: PAGE_SIZE,
    offset,
  });

  return {
    data: events,
    meta: { total, page, pageSize: PAGE_SIZE, totalPages: Math.ceil(total / PAGE_SIZE) },
  };
}, 'GET /api/crypto/taxable-events');
