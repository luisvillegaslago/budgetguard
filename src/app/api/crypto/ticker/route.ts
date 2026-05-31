/**
 * GET /api/crypto/ticker?symbol=
 *
 * Live spot price for a canonical pair (native quote) plus, when available, the
 * base asset's live EUR price ({base}EUR). Polled by the chart to refresh the
 * current-price line and the unrealized % without a full position recompute.
 *
 * `price` and `baseEurPrice` are independently null when Binance has no such
 * symbol — the front-end omits whatever is missing.
 */

import { ListKlinesQuerySchema } from '@/schemas/crypto';
import { validateRequest } from '@/schemas/transaction';
import { fetchLivePrice } from '@/services/exchanges/binance/KlineService';
import { validationError, withApiHandler } from '@/utils/apiHandler';
import { canonicalizePair } from '@/utils/cryptoSymbol';

// Reuse the symbol rule from the klines schema (alphanumeric, 1–20 chars).
const TickerQuerySchema = ListKlinesQuerySchema.pick({ symbol: true });

export const GET = withApiHandler(async (request) => {
  const url = new URL(request.url);
  const queryObj: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    queryObj[key] = value;
  });

  const validation = validateRequest(TickerQuerySchema, queryObj);
  if (!validation.success) return validationError(validation.errors);

  const { symbol } = validation.data;
  const price = await fetchLivePrice(symbol);

  // Best-effort live EUR price for the base asset (e.g. BTC → BTCEUR). When the
  // pair can't be canonicalized or no {base}EUR market exists, omit it.
  const canon = canonicalizePair(symbol);
  const baseEurPrice = canon ? await fetchLivePrice(`${canon.base}EUR`) : null;

  return { data: { symbol, price, baseEurPrice } };
}, 'GET /api/crypto/ticker');
