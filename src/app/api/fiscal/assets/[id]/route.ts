/**
 * BudgetGuard Fixed Asset API - Single Resource
 * GET    /api/fiscal/assets/[id] - The asset plus its full year-by-year amortization schedule
 * PUT    /api/fiscal/assets/[id] - Update an asset (an omitted field keeps its stored value)
 * DELETE /api/fiscal/assets/[id] - Delete an asset (its purchase transaction is left untouched)
 */

import { API_ERROR, VALIDATION_KEY } from '@/constants/finance';
import { coefficientFitsGroup, UpdateFixedAssetSchema } from '@/schemas/fixed-asset';
import { validateRequest } from '@/schemas/transaction';
import { deleteFixedAsset, getFixedAssetById, updateFixedAsset } from '@/services/database/FixedAssetRepository';
import type { FixedAssetSchedule, FixedAssetUpdateInput } from '@/types/finance';
import { computeAmortizationSchedule } from '@/utils/amortization';
import { notFound, parseIdParam, validationError, withApiHandler } from '@/utils/apiHandler';
import { eurosToCents } from '@/utils/money';

export const GET = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const assetId = parseIdParam(id);
  if (typeof assetId !== 'number') return assetId;

  const asset = await getFixedAssetById(assetId);
  if (!asset) return notFound(API_ERROR.NOT_FOUND.FIXED_ASSET);

  // The schedule is never stored: it is derived here so it can never contradict its own asset
  const data: FixedAssetSchedule = { asset, years: computeAmortizationSchedule(asset) };
  return { data };
}, 'GET /api/fiscal/assets/[id]');

export const PUT = withApiHandler(async (request, { params }) => {
  const { id } = await params;
  const assetId = parseIdParam(id);
  if (typeof assetId !== 'number') return assetId;

  const body = await request.json();
  const validation = validateRequest(UpdateFixedAssetSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const current = await getFixedAssetById(assetId);
  if (!current) return notFound(API_ERROR.NOT_FOUND.FIXED_ASSET);

  const { baseAmount, inServiceDate, ...rest } = validation.data;

  // The schema's ERD cap only sees the payload, so `{ coefficientPercent: 60 }` reaches here
  // unchallenged even on a grupo 5 asset. Re-check it against the values the row will actually
  // hold: an over-fast rate is an over-deduction, the exact error this module exists to prevent.
  // A null group is an explicit clear (custom rate, uncapped); undefined just keeps the stored one.
  if (
    !coefficientFitsGroup({
      amortizationGroup: rest.amortizationGroup === undefined ? current.amortizationGroup : rest.amortizationGroup,
      coefficientPercent: rest.coefficientPercent ?? current.coefficientPercent,
    })
  ) {
    return validationError({ coefficientPercent: [VALIDATION_KEY.INVALID_AMORTIZATION_COEFFICIENT] });
  }

  // Only the two wire-shaped fields need converting; the rest already carry their domain type.
  // Undefined is left as undefined on purpose — the repository skips it and keeps the stored value.
  const updateData: FixedAssetUpdateInput = { ...rest };
  if (baseAmount !== undefined) updateData.baseCents = eurosToCents(baseAmount);
  if (inServiceDate !== undefined) updateData.inServiceDate = inServiceDate.toISOString().split('T')[0]!;

  const asset = await updateFixedAsset(assetId, updateData);
  if (!asset) return notFound(API_ERROR.NOT_FOUND.FIXED_ASSET);

  return { data: asset };
}, 'PUT /api/fiscal/assets/[id]');

export const DELETE = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const assetId = parseIdParam(id);
  if (typeof assetId !== 'number') return assetId;

  const deleted = await deleteFixedAsset(assetId);
  if (!deleted) return notFound(API_ERROR.NOT_FOUND.FIXED_ASSET);

  return { data: { deleted: true } };
}, 'DELETE /api/fiscal/assets/[id]');
