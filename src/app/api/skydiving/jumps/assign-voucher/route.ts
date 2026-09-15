/**
 * BudgetGuard Skydiving Jump Voucher Assignment API
 * POST /api/skydiving/jumps/assign-voucher - Pay several jumps from a voucher at once
 */

import { AssignVoucherSchema } from '@/schemas/skydive';
import { validateRequest } from '@/schemas/transaction';
import { assignJumpsToVoucher } from '@/services/database/SkydiveRepository';
import { validationError, withApiHandler } from '@/utils/apiHandler';

export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const validation = validateRequest(AssignVoucherSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const result = await assignJumpsToVoucher(validation.data.ids, validation.data.voucherId);

  return { data: result };
}, 'POST /api/skydiving/jumps/assign-voucher');
