/**
 * BudgetGuard Invoice Finalize API
 * POST /api/invoices/[id]/finalize - Finalize draft invoice, generate PDF, save to fiscal documents
 */

import { NextResponse } from 'next/server';
import { finalizeInvoice } from '@/services/InvoiceFinalizeService';
import { parseIdParam, withApiHandler } from '@/utils/apiHandler';

export const POST = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const invoiceId = parseIdParam(id);
  if (typeof invoiceId !== 'number') return invoiceId;

  const { pdfBuffer, fileName } = await finalizeInvoice(invoiceId);

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(pdfBuffer.byteLength),
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
    },
  });
}, 'POST /api/invoices/[id]/finalize');
