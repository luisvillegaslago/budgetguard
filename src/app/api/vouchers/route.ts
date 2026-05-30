/**
 * BudgetGuard Vouchers API
 * GET  /api/vouchers - List vouchers with balance for the current user
 * POST /api/vouchers - Create a new voucher ("bono")
 */

import { validateRequest } from '@/schemas/transaction';
import { CreateVoucherSchema } from '@/schemas/voucher';
import { createVoucher, getVouchers } from '@/services/database/VoucherRepository';
import { validationError, withApiHandler } from '@/utils/apiHandler';
import { eurosToCents } from '@/utils/money';

export const GET = withApiHandler(async () => {
  const vouchers = await getVouchers();
  return { data: vouchers, meta: { count: vouchers.length } };
}, 'GET /api/vouchers');

export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const validation = validateRequest(CreateVoucherSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const { totalAmount, description, ...rest } = validation.data;

  const voucher = await createVoucher({
    ...rest,
    description: description ?? null,
    totalAmountCents: eurosToCents(totalAmount),
    totalUnits: rest.totalUnits ?? null,
    unitLabel: rest.unitLabel ?? null,
    expiryDate: rest.expiryDate ?? null,
  });

  return { data: voucher, status: 201 };
}, 'POST /api/vouchers');
