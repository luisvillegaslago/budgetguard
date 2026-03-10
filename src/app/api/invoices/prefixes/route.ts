/**
 * BudgetGuard Invoice Prefixes API
 * GET /api/invoices/prefixes - List prefixes
 * POST /api/invoices/prefixes - Create a new prefix
 */

import { CreateInvoicePrefixSchema } from '@/schemas/invoice';
import { validateRequest } from '@/schemas/transaction';
import { createInvoicePrefix, getInvoicePrefixes } from '@/services/database/InvoiceRepository';
import { validationError, withApiHandler } from '@/utils/apiHandler';

export const GET = withApiHandler(async () => {
  const prefixes = await getInvoicePrefixes();
  return { data: prefixes, meta: { count: prefixes.length } };
}, 'GET /api/invoices/prefixes');

export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const validation = validateRequest(CreateInvoicePrefixSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const prefix = await createInvoicePrefix(validation.data);
  return { data: prefix, status: 201 };
}, 'POST /api/invoices/prefixes');
