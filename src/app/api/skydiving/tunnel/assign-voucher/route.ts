/**
 * BudgetGuard Tunnel Session Voucher Assignment API
 * POST /api/skydiving/tunnel/assign-voucher - Pay several tunnel sessions from a voucher at once
 */

import { AssignVoucherSchema } from '@/schemas/skydive';
import { validateRequest } from '@/schemas/transaction';
import { assignTunnelSessionsToVoucher } from '@/services/database/SkydiveRepository';
import { validationError, withApiHandler } from '@/utils/apiHandler';

export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const validation = validateRequest(AssignVoucherSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const result = await assignTunnelSessionsToVoucher(validation.data.ids, validation.data.voucherId);

  return { data: result };
}, 'POST /api/skydiving/tunnel/assign-voucher');
