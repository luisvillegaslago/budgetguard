/**
 * GET /api/crypto/fiscal/disposals?year=YYYY[&asset=][&contraprestacion=F|N][&page=]
 *
 * Paginated list of FIFO disposals (one per `disposal` taxable event)
 * for the audit table in the UI. Each row carries its full
 * AcquisitionLotsJson breakdown so the user can verify the cost basis.
 */

import { z } from 'zod';
import { CRYPTO_CONTRAPRESTACION } from '@/constants/finance';
import { validateRequest } from '@/schemas/transaction';
import { listDisposals } from '@/services/database/CryptoFiscalRepository';
import { validationError, withApiHandler } from '@/utils/apiHandler';

const PAGE_SIZE = 20;

const QuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  asset: z.string().optional(),
  contraprestacion: z.enum([CRYPTO_CONTRAPRESTACION.FIAT, CRYPTO_CONTRAPRESTACION.NON_FIAT]).optional(),
  page: z.coerce.number().int().positive().default(1),
});

export const GET = withApiHandler(async (request) => {
  const url = new URL(request.url);
  const params: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    params[k] = v;
  });

  const validation = validateRequest(QuerySchema, params);
  if (!validation.success) return validationError(validation.errors);

  const { year, asset, contraprestacion } = validation.data;
  const page = validation.data.page ?? 1;
  const offset = (page - 1) * PAGE_SIZE;

  const { disposals, total } = await listDisposals({
    year,
    asset,
    contraprestacion,
    limit: PAGE_SIZE,
    offset,
  });

  return {
    data: disposals,
    meta: { total, page, pageSize: PAGE_SIZE, totalPages: Math.ceil(total / PAGE_SIZE) },
  };
}, 'GET /api/crypto/fiscal/disposals');
