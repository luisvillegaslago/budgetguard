/**
 * GET /api/crypto/assets
 *
 * Distinct list of coins the authenticated user has interacted with, used to
 * populate the asset filter on the /crypto movements table. Sorted alphabetically.
 */

import { listUserAssets } from '@/services/database/CryptoRawEventsRepository';
import { withApiHandler } from '@/utils/apiHandler';

export const GET = withApiHandler(async () => {
  const assets = await listUserAssets();
  return { data: assets };
}, 'GET /api/crypto/assets');
