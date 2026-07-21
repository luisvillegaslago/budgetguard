/**
 * BudgetGuard Skydiving Voucher Reconciliation API
 * POST /api/skydiving/reconcile-voucher - Link (or create) a skydiving activity
 * for a voucher consumption transaction that has none (Option A, link-or-create).
 */

import { API_ERROR } from '@/constants/finance';
import { reconcileConsumptionToActivity } from '@/services/database/SkydiveRepository';
import { validationError, withApiHandler } from '@/utils/apiHandler';

export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const transactionId = (body as { transactionId?: unknown }).transactionId;

  if (typeof transactionId !== 'number' || !Number.isInteger(transactionId) || transactionId <= 0) {
    return validationError({ transactionId: [API_ERROR.INVALID_ID] });
  }

  const result = await reconcileConsumptionToActivity(transactionId);

  return { data: result };
}, 'POST /api/skydiving/reconcile-voucher');
