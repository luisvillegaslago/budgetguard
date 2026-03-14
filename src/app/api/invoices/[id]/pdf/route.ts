/**
 * BudgetGuard Invoice PDF API
 * GET /api/invoices/[id]/pdf - Generate and download invoice PDF
 */

import { parseIdParam, withApiHandler } from '@/utils/apiHandler';
import { prepareInvoicePdf } from '@/utils/invoicePdf';

export const GET = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const invoiceId = parseIdParam(id);
  if (typeof invoiceId !== 'number') return invoiceId;

  const { pdfBuffer, fileName } = await prepareInvoicePdf(invoiceId);

  const { NextResponse } = await import('next/server');
  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(pdfBuffer.byteLength),
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  });
}, 'GET /api/invoices/[id]/pdf');
