/**
 * BudgetGuard Invoice Prefixes API - Single Resource
 * PUT /api/invoices/prefixes/[id] - Update a prefix (description, nextNumber)
 * DELETE /api/invoices/prefixes/[id] - Delete a prefix (409 if has invoices)
 */

import { UpdateInvoicePrefixSchema } from '@/schemas/invoice';
import { validateRequest } from '@/schemas/transaction';
import { ConflictError, deleteInvoicePrefix, updateInvoicePrefix } from '@/services/database/InvoiceRepository';
import { conflict, notFound, parseIdParam, validationError, withApiHandler } from '@/utils/apiHandler';

export const PUT = withApiHandler(async (request, { params }) => {
  const { id } = await params;
  const prefixId = parseIdParam(id);
  if (typeof prefixId !== 'number') return prefixId;

  const body = await request.json();
  const parsed = validateRequest(UpdateInvoicePrefixSchema, body);
  if (!parsed.success) return validationError(parsed.errors);

  const updated = await updateInvoicePrefix(prefixId, parsed.data);
  if (!updated) return notFound('Prefix not found');

  return { data: updated };
}, 'PUT /api/invoices/prefixes/[id]');

export const DELETE = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const prefixId = parseIdParam(id);
  if (typeof prefixId !== 'number') return prefixId;

  try {
    const deleted = await deleteInvoicePrefix(prefixId);
    if (!deleted) return notFound('Prefix not found');
    return { data: { deleted: true } };
  } catch (error) {
    if (error instanceof ConflictError) {
      return conflict(error.message);
    }
    throw error;
  }
}, 'DELETE /api/invoices/prefixes/[id]');
