/**
 * BudgetGuard Asset Purchase Candidates API
 * GET /api/fiscal/assets/[id]/purchase-candidates - Movements that look like the purchase this
 * asset amortises, for an asset whose `TransactionID` is null.
 *
 * Read-only on purpose. Linking is an ordinary field update on the asset
 * (PUT /api/fiscal/assets/[id] with `{ transactionId }`), so there is no second door onto the same
 * column: what is offered here is a suggestion, and only the user turns one into a link.
 *
 * An asset that already has its purchase linked is not a problem to be fixed, so it yields no
 * candidates — the repository decides that, and the empty array is the whole answer.
 */

import { API_ERROR } from '@/constants/finance';
import { getAssetPurchaseCandidates, getFixedAssetById } from '@/services/database/FixedAssetRepository';
import { notFound, parseIdParam, withApiHandler } from '@/utils/apiHandler';

export const GET = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const assetId = parseIdParam(id);
  if (typeof assetId !== 'number') return assetId;

  // An id that belongs to nobody is a different answer from "this asset has nothing to fix", and
  // an empty array would hide the difference
  const asset = await getFixedAssetById(assetId);
  if (!asset) return notFound(API_ERROR.NOT_FOUND.FIXED_ASSET);

  const candidates = await getAssetPurchaseCandidates(assetId);
  return { data: candidates, meta: { count: candidates.length } };
}, 'GET /api/fiscal/assets/[id]/purchase-candidates');
