/**
 * GET /api/crypto/klines
 *
 * OHLC candles for a single canonical Binance symbol, fed straight into the
 * lightweight-charts candlestick series on the "Cotizaciones" tab. Query is
 * validated with ListKlinesQuerySchema (symbol/interval required, optional
 * from/to in epoch ms). Data comes from the unauthenticated public Binance
 * market-data endpoint, so this route needs no user credentials.
 */

import { ListKlinesQuerySchema } from '@/schemas/crypto';
import { validateRequest } from '@/schemas/transaction';
import { fetchKlines } from '@/services/exchanges/binance/KlineService';
import { validationError, withApiHandler } from '@/utils/apiHandler';

export const GET = withApiHandler(async (request) => {
  const url = new URL(request.url);
  const queryObj: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    queryObj[key] = value;
  });

  const validation = validateRequest(ListKlinesQuerySchema, queryObj);
  if (!validation.success) return validationError(validation.errors);

  const { symbol, interval, from, to } = validation.data;
  const candles = await fetchKlines(symbol, interval, from, to);

  return { data: candles };
}, 'GET /api/crypto/klines');
