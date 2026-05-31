/**
 * GET /api/crypto/pairs
 *
 * One summary per canonical spot pair the user has traded (symbol, base/quote,
 * trade count, net base quantity, open flag) — used to populate the pair
 * selector on the "Cotizaciones" tab.
 */

import { listSpotPairs } from '@/services/database/CryptoPositionsRepository';
import { withApiHandler } from '@/utils/apiHandler';

export const GET = withApiHandler(async () => {
  return { data: await listSpotPairs() };
}, 'GET /api/crypto/pairs');
