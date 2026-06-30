/**
 * GET /api/crypto/fiscal/modelo100?year=YYYY
 *
 * Returns the four Modelo 100 boxes for the requested fiscal year:
 *   - 1804-F (disposals against fiat)
 *   - 1804-N (disposals against crypto)
 *   - 0304   (airdrops, sum of GrossValueEurCents)
 *   - 0033   (staking/Earn, sum of GrossValueEurCents)
 *
 * Plus `summary.elements`: one row per (Asset, Contraprestacion) so the user
 * can transcribe each "Elemento patrimonial" (1802/1803/1804/1806/1807/1809)
 * into Renta Web. 1804 is net of transmission fees, 1806 includes the
 * acquisition fee. The route returns the repository summary verbatim.
 *
 * Pure aggregation — no FIFO recompute is triggered. Call POST
 * /api/crypto/fiscal/recompute first if disposals are stale.
 */

import { z } from 'zod';
import { validateRequest } from '@/schemas/transaction';
import { getModelo100Summary, listFiscalYearsWithData } from '@/services/database/CryptoFiscalRepository';
import { validationError, withApiHandler } from '@/utils/apiHandler';

const QuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
});

export const GET = withApiHandler(async (request) => {
  const url = new URL(request.url);
  const params: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    params[k] = v;
  });

  const validation = validateRequest(QuerySchema, params);
  if (!validation.success) return validationError(validation.errors);

  const [summary, years] = await Promise.all([getModelo100Summary(validation.data.year), listFiscalYearsWithData()]);

  return { data: { summary, availableYears: years } };
}, 'GET /api/crypto/fiscal/modelo100');
