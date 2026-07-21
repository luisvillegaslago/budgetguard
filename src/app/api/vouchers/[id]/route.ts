/**
 * BudgetGuard Voucher API - Single Resource
 * GET    /api/vouchers/[id] - Get a voucher with its linked consumptions
 * PUT    /api/vouchers/[id] - Update a voucher
 * DELETE /api/vouchers/[id] - Delete a voucher (linked transactions are kept, unlinked)
 */

import { API_ERROR } from '@/constants/finance';
import { validateRequest } from '@/schemas/transaction';
import { UpdateVoucherSchema } from '@/schemas/voucher';
import { getUnlinkedSkydiveConsumptions } from '@/services/database/SkydiveRepository';
import { getTransactionsByVoucherId } from '@/services/database/TransactionRepository';
import { deleteVoucher, getVoucherById, updateVoucher } from '@/services/database/VoucherRepository';
import { notFound, parseIdParam, validationError, withApiHandler } from '@/utils/apiHandler';
import { eurosToCents } from '@/utils/money';

export const GET = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const voucherId = parseIdParam(id);
  if (typeof voucherId !== 'number') return voucherId;

  const voucher = await getVoucherById(voucherId);
  if (!voucher) return notFound(API_ERROR.NOT_FOUND.VOUCHER);

  const consumptions = await getTransactionsByVoucherId(voucherId);
  const unlinked = await getUnlinkedSkydiveConsumptions(voucherId);

  return {
    data: {
      voucher,
      consumptions,
      unlinkedConsumptions: unlinked?.transactionIds ?? [],
      reconcileActivityType: unlinked?.activityType ?? null,
    },
  };
}, 'GET /api/vouchers/[id]');

export const PUT = withApiHandler(async (request, { params }) => {
  const { id } = await params;
  const voucherId = parseIdParam(id);
  if (typeof voucherId !== 'number') return voucherId;

  const body = await request.json();
  const validation = validateRequest(UpdateVoucherSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const { totalAmount, ...rest } = validation.data;

  const updateData: Parameters<typeof updateVoucher>[1] = { ...rest };
  if (totalAmount !== undefined) updateData.totalAmountCents = eurosToCents(totalAmount);

  const voucher = await updateVoucher(voucherId, updateData);
  if (!voucher) return notFound(API_ERROR.NOT_FOUND.VOUCHER);

  return { data: voucher };
}, 'PUT /api/vouchers/[id]');

export const DELETE = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const voucherId = parseIdParam(id);
  if (typeof voucherId !== 'number') return voucherId;

  const deleted = await deleteVoucher(voucherId);
  if (!deleted) return notFound(API_ERROR.NOT_FOUND.VOUCHER);

  return { data: { deleted: true } };
}, 'DELETE /api/vouchers/[id]');
