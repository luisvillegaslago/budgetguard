/**
 * BudgetGuard Tunnel Locations API
 * GET /api/skydiving/tunnel/locations - Get distinct tunnel location names for the current user
 */

import { getDistinctTunnelLocations } from '@/services/database/SkydiveRepository';
import { withApiHandler } from '@/utils/apiHandler';

export const GET = withApiHandler(async () => {
  const locations = await getDistinctTunnelLocations();

  return { data: locations };
}, 'GET /api/skydiving/tunnel/locations');
